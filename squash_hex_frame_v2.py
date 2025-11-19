import numpy as np
from PIL import Image
import math
from scipy import ndimage

def create_hex_distance_field_pointy(width, height):
    """
    Crea un mapa de distancia para hexágono POINTY TOP (Puntas arriba/abajo).
    """
    y, x = np.indices((height, width))
    # Centrar coordenadas
    x = x - width / 2
    y = y - height / 2
    
    sqrt3 = math.sqrt(3)
    
    # Fórmula para Pointy Top (intercambiando X e Y de la fórmula Flat Top)
    # d = max(|y| * sqrt(3)/2 + |x|/2, |x|)
    # Esto asegura que las puntas estén en el eje Y
    d = np.maximum(np.abs(y) * (sqrt3/2) + np.abs(x) * 0.5, np.abs(x))
    
    return d

def squash_hex_frame_v2(input_path, output_path, compression_factor=0.5):
    print(f"Procesando {input_path} (Modo Pointy Top)...")
    img = Image.open(input_path).convert('RGBA')
    width, height = img.size
    data = np.array(img)
    
    # 1. Mapa de distancia CORRECTO (Pointy Top)
    dist_field = create_hex_distance_field_pointy(width, height)
    
    # 2. Detectar límites actuales
    alpha = data[:,:,3]
    mask = alpha > 20
    
    if not np.any(mask):
        print("  Imagen vacía.")
        return

    masked_dist = dist_field[mask]
    
    # Usamos percentiles más extremos para capturar todo
    src_inner = np.percentile(masked_dist, 0.5)
    src_outer = np.percentile(masked_dist, 99.5)
    src_thickness = src_outer - src_inner
    src_center = (src_inner + src_outer) / 2
    
    print(f"  Geometría: Inner={src_inner:.1f}, Outer={src_outer:.1f}, Grosor={src_thickness:.1f}")
    
    # 3. Definir nuevos límites (más finos)
    tgt_thickness = src_thickness * compression_factor
    tgt_inner = src_center - tgt_thickness / 2
    tgt_outer = src_center + tgt_thickness / 2
    
    # 4. Warping (Mapeo de coordenadas)
    y_indices, x_indices = np.indices((height, width))
    center_y, center_x = height / 2, width / 2
    rel_y = y_indices - center_y
    rel_x = x_indices - center_x
    
    d = dist_field
    
    # Máscara de destino (donde pintaremos el nuevo marco)
    target_mask = (d >= tgt_inner - 2) & (d <= tgt_outer + 2)
    
    map_y = y_indices.astype(np.float32)
    map_x = x_indices.astype(np.float32)
    
    valid_d = d[target_mask]
    valid_d[valid_d == 0] = 0.001
    
    # t va de 0 a 1 a través del nuevo grosor
    t = (valid_d - tgt_inner) / tgt_thickness
    
    # Mapeamos t al grosor original (0 a 1 -> src_inner a src_outer)
    # Clave: clamp t para no leer fuera de la textura original
    t_clamped = np.clip(t, 0, 1)
    
    d_src = src_inner + t_clamped * src_thickness
    
    # Factor de escala
    scale = d_src / valid_d
    
    src_rel_y = rel_y[target_mask] * scale
    src_rel_x = rel_x[target_mask] * scale
    
    map_y[target_mask] = center_y + src_rel_y
    map_x[target_mask] = center_x + src_rel_x
    
    # 5. Remuestreo Bicúbico
    new_data = np.zeros_like(data)
    for channel in range(4):
        new_data[:,:,channel] = ndimage.map_coordinates(
            data[:,:,channel], 
            [map_y, map_x], 
            order=3,
            mode='constant', 
            cval=0
        )
        
    # 6. Restaurar Alpha inteligente
    # Usamos la máscara geométrica para definir la opacidad, 
    # pero multiplicada por la opacidad muestreada para mantener detalles de transparencia interna si los hay
    
    # Suavizado de bordes
    edge_softness = 1.5
    geo_alpha = np.clip((d - tgt_inner) / edge_softness, 0, 1) * \
                np.clip((tgt_outer - d) / edge_softness, 0, 1)
    
    # Combinar alpha muestreado con alpha geométrico
    sampled_alpha = new_data[:,:,3].astype(float) / 255.0
    final_alpha = sampled_alpha * geo_alpha * 255.0
    
    new_data[:,:,3] = final_alpha.astype(np.uint8)

    Image.fromarray(new_data).save(output_path)
    print(f"✓ Guardado: {output_path}")

# Ejecutar
frames = [
    'public/assets/hex_frames_textures/hex_frame_clouds.png',
    'public/assets/hex_frames_textures/hex_frame_stone.png',
    'public/assets/hex_frames_textures/hex_frame_vines.png',
    'public/assets/hex_frames_textures/hex_frame_wood.png'
]

print("Iniciando compresión Pointy Top corregida...\n")
for f in frames:
    try:
        # Factor 0.5 = reducir grosor a la mitad
        squash_hex_frame_v2(f, f, compression_factor=0.5)
    except Exception as e:
        print(f"Error en {f}: {e}")
