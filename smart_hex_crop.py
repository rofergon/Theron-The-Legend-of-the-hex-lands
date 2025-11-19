import numpy as np
from PIL import Image
import math

def create_hex_distance_field(width, height):
    """
    Crea un mapa de distancia donde cada píxel tiene un valor representando 
    qué tan lejos está del centro en 'unidades hexagonales'.
    0 = centro, 1 = borde del hexágono de radio 'size'
    """
    # Crear grid de coordenadas centrado
    y, x = np.indices((height, width))
    x = x - width / 2
    y = y - height / 2
    
    # Ajustar coordenadas para hexágono "Pointy Top" (puntas arriba/abajo)
    # La fórmula de distancia hexagonal (Chebyshev rotada)
    # q = (sqrt(3)/3 * x - 1/3 * y)
    # r = (2/3 * y)
    # dist = max(|q|, |r|, |q+r|)
    
    # Nota: Las imágenes pueden estar escaladas, así que normalizamos
    # Asumimos que el hexágono llena el canvas verticalmente o horizontalmente
    
    # Constantes para Pointy Top
    sqrt3 = math.sqrt(3)
    
    # Coordenadas axiales (q, r)
    # Ajustamos la escala para que los valores sean consistentes con píxeles
    # Usamos una escala base arbitraria, luego normalizaremos
    
    # Fórmula directa para distancia al borde de un hexágono pointy-top
    # d = max(abs(x)*sqrt(3)/2 + abs(y)/2, abs(y))
    # Esta fórmula da la distancia perpendicular a los lados
    
    d = np.maximum(np.abs(x) * (sqrt3/2) + np.abs(y) * 0.5, np.abs(y))
    
    return d

def smart_hex_crop(input_path, output_path, thickness_factor=0.85, smoothing=2.0):
    """
    Recorta el frame usando geometría hexagonal perfecta.
    thickness_factor: Qué porcentaje del ancho original mantener (0.0 a 1.0)
    smoothing: Píxeles de suavizado (anti-aliasing)
    """
    img = Image.open(input_path).convert('RGBA')
    width, height = img.size
    data = np.array(img)
    
    # 1. Calcular campo de distancia
    dist_field = create_hex_distance_field(width, height)
    
    # 2. Analizar la imagen actual para encontrar los límites actuales
    # Usamos el canal alpha para detectar dónde hay imagen ahora
    alpha = data[:,:,3]
    existing_pixels = alpha > 20
    
    if not np.any(existing_pixels):
        print(f"Advertencia: Imagen vacía {input_path}")
        return

    # Encontrar la distancia máxima y mínima donde existen píxeles actualmente
    masked_dist = dist_field[existing_pixels]
    current_outer_dist = np.percentile(masked_dist, 98) # Borde exterior actual
    current_inner_dist = np.percentile(masked_dist, 2)  # Borde interior actual
    
    print(f"Geometría detectada: Inner={current_inner_dist:.1f}, Outer={current_outer_dist:.1f}")
    
    # 3. Calcular nuevos límites para hacer el marco más fino
    # Mantenemos el centro del marco actual, pero reducimos su ancho
    current_thickness = current_outer_dist - current_inner_dist
    target_thickness = current_thickness * thickness_factor
    
    # Centrar el nuevo grosor en el medio del grosor anterior
    # O mejor: Mantener el borde exterior (para que conecten) y subir el interior?
    # El usuario dijo "disminuir el grosor... no su tamaño".
    # Generalmente esto significa hacer el agujero más grande (subir inner) 
    # y quizás reducir un pelín el outer para que no se solapen.
    
    # Estrategia: Reducir grosor recortando de AMBOS lados para centrarlo mejor
    # pero priorizando mantener el tamaño exterior aproximado.
    
    shrink_amount = (current_thickness - target_thickness) / 2
    
    new_outer_dist = current_outer_dist - (shrink_amount * 0.5) # Recortar un poco de fuera
    new_inner_dist = current_inner_dist + (shrink_amount * 1.5) # Recortar más de dentro
    
    print(f"Nuevos límites: Inner={new_inner_dist:.1f}, Outer={new_outer_dist:.1f}")
    
    # 4. Generar la nueva máscara Alpha con suavizado (Anti-aliasing)
    # Alpha = 1.0 dentro del rango [new_inner, new_outer], 0.0 fuera
    # Usamos smoothstep o interpolación lineal para los bordes
    
    new_alpha = np.zeros_like(dist_field)
    
    # Borde exterior (suavizado)
    # 255 * (1 - clamp((dist - (outer - smooth)) / smooth))
    outer_alpha = np.clip((new_outer_dist - dist_field) / smoothing, 0, 1)
    
    # Borde interior (suavizado)
    # 255 * clamp((dist - inner) / smooth)
    inner_alpha = np.clip((dist_field - new_inner_dist) / smoothing, 0, 1)
    
    # Combinar
    mask_f = outer_alpha * inner_alpha
    new_alpha_channel = (mask_f * 255).astype(np.uint8)
    
    # 5. Aplicar al canal alpha original
    # Mantenemos el color original, reemplazamos el alpha
    # (Opcional: multiplicar por el alpha original para no revelar cosas ocultas, 
    # pero queremos "limpiar" bordes sucios, así que mejor usar nuestra máscara pura 
    # donde la imagen original tenga contenido)
    
    final_alpha = np.minimum(data[:,:,3], new_alpha_channel)
    data[:,:,3] = final_alpha
    
    # Guardar
    result = Image.fromarray(data, 'RGBA')
    result.save(output_path)
    print(f"✓ Procesado con geometría perfecta: {output_path.split('/')[-1]}")

# Ejecutar
frames = [
    'public/assets/hex_frames_textures/hex_frame_clouds.png',
    'public/assets/hex_frames_textures/hex_frame_stone.png',
    'public/assets/hex_frames_textures/hex_frame_vines.png',
    'public/assets/hex_frames_textures/hex_frame_wood.png'
]

print("Iniciando recorte geométrico de alta calidad...\n")
for f in frames:
    try:
        # thickness_factor=0.6 hará el marco un 40% más fino que el original
        smart_hex_crop(f, f, thickness_factor=0.6, smoothing=1.5)
    except Exception as e:
        print(f"Error en {f}: {e}")
