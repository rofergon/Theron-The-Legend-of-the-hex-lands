import numpy as np
from PIL import Image
import math
from scipy import ndimage

def create_hex_distance_field(width, height):
    """
    Crea un mapa de distancia hexagonal.
    """
    y, x = np.indices((height, width))
    x = x - width / 2
    y = y - height / 2
    sqrt3 = math.sqrt(3)
    # Distancia hexagonal (pointy top)
    d = np.maximum(np.abs(x) * (sqrt3/2) + np.abs(y) * 0.5, np.abs(y))
    return d

def squash_hex_frame(input_path, output_path, compression_factor=0.6):
    """
    Comprime el grosor del marco sin recortar, escalando la textura radialmente.
    compression_factor: 0.5 = mitad de grosor, 1.0 = mismo grosor
    """
    print(f"Procesando {input_path}...")
    img = Image.open(input_path).convert('RGBA')
    width, height = img.size
    data = np.array(img)
    
    # 1. Mapa de distancia
    dist_field = create_hex_distance_field(width, height)
    
    # 2. Detectar límites actuales del marco
    alpha = data[:,:,3]
    mask = alpha > 20
    
    if not np.any(mask):
        print("  Imagen vacía, saltando.")
        return

    masked_dist = dist_field[mask]
    src_inner = np.percentile(masked_dist, 1)
    src_outer = np.percentile(masked_dist, 99)
    src_thickness = src_outer - src_inner
    src_center = (src_inner + src_outer) / 2
    
    print(f"  Original: Inner={src_inner:.1f}, Outer={src_outer:.1f}, Thickness={src_thickness:.1f}")
    
    # 3. Definir nuevos límites (más finos)
    tgt_thickness = src_thickness * compression_factor
    tgt_inner = src_center - tgt_thickness / 2
    tgt_outer = src_center + tgt_thickness / 2
    
    print(f"  Objetivo: Inner={tgt_inner:.1f}, Outer={tgt_outer:.1f}, Thickness={tgt_thickness:.1f}")
    
    # 4. Crear mapeo de coordenadas (Warping)
    # Para cada píxel (y, x) en la imagen destino:
    # - Calcular su distancia 'd'
    # - Si d está en [tgt_inner, tgt_outer]:
    #   - Calcular posición relativa 't' = (d - tgt_inner) / tgt_thickness
    #   - Calcular distancia original 'd_src' = src_inner + t * src_thickness
    #   - Factor de escala 's' = d_src / d
    #   - Coordenada origen (src_y, src_x) = center + (pixel - center) * s
    
    # Generar grid de coordenadas
    y_indices, x_indices = np.indices((height, width))
    center_y, center_x = height / 2, width / 2
    
    # Coordenadas relativas al centro
    rel_y = y_indices - center_y
    rel_x = x_indices - center_x
    
    # Distancias actuales
    d = dist_field
    
    # Máscara de dónde queremos dibujar el nuevo marco
    # Agregamos un pequeño margen para anti-aliasing
    target_mask = (d >= tgt_inner - 1) & (d <= tgt_outer + 1)
    
    # Inicializar arrays de coordenadas fuente (mapeo identidad por defecto)
    map_y = y_indices.astype(np.float32)
    map_x = x_indices.astype(np.float32)
    
    # Calcular el mapeo solo donde es necesario (vectorizado)
    # Evitar división por cero
    valid_d = d[target_mask]
    valid_d[valid_d == 0] = 0.001
    
    # Posición normalizada en el nuevo marco (0..1)
    t = (valid_d - tgt_inner) / tgt_thickness
    
    # Distancia correspondiente en el marco original
    d_src = src_inner + t * src_thickness
    
    # Factor de escala radial
    scale = d_src / valid_d
    
    # Aplicar escala a las coordenadas relativas
    src_rel_y = rel_y[target_mask] * scale
    src_rel_x = rel_x[target_mask] * scale
    
    # Convertir a coordenadas absolutas
    map_y[target_mask] = center_y + src_rel_y
    map_x[target_mask] = center_x + src_rel_x
    
    # 5. Remuestrear la imagen (Interpolación Bicúbica para calidad)
    new_data = np.zeros_like(data)
    
    for channel in range(4):
        new_data[:,:,channel] = ndimage.map_coordinates(
            data[:,:,channel], 
            [map_y, map_x], 
            order=3, # Bicúbico
            mode='constant', 
            cval=0
        )
        
    # 6. Limpiar bordes (Anti-aliasing suave en alpha)
    # Recalcular alpha basado en la distancia para bordes perfectos
    final_alpha = new_data[:,:,3].astype(float)
    
    # Suavizado de bordes geométricos
    edge_softness = 1.5
    alpha_factor = np.clip((d - tgt_inner) / edge_softness, 0, 1) * \
                   np.clip((tgt_outer - d) / edge_softness, 0, 1)
    
    final_alpha = final_alpha * alpha_factor
    new_data[:,:,3] = final_alpha.astype(np.uint8)

    # Guardar
    Image.fromarray(new_data).save(output_path)
    print(f"✓ Guardado: {output_path}")

# Ejecutar
frames = [
    'public/assets/hex_frames_textures/hex_frame_clouds.png',
    'public/assets/hex_frames_textures/hex_frame_stone.png',
    'public/assets/hex_frames_textures/hex_frame_vines.png',
    'public/assets/hex_frames_textures/hex_frame_wood.png'
]

print("Iniciando compresión de textura (Squash)...\n")
for f in frames:
    try:
        # compression_factor=0.5 significa reducir el grosor a la mitad
        # pero manteniendo TODA la textura comprimida
        squash_hex_frame(f, f, compression_factor=0.5)
    except Exception as e:
        print(f"Error en {f}: {e}")
        import traceback
        traceback.print_exc()
