"""
Script para normalizar texturas de village:
- Elimina fondo blanco
- Recorta espacio no usado
- Centra el contenido
- Normaliza el tamaño
"""

from PIL import Image
import os
import numpy as np

# Configuración
INPUT_DIR = "public/assets/Village_textures"
OUTPUT_DIR = "public/assets/Village_textures/normalized"
TARGET_SIZE = 512  # Tamaño del canvas final
BACKGROUND_THRESHOLD = 240  # Umbral para detectar fondo blanco (0-255)

def remove_white_background(img):
    """Convierte el fondo blanco a transparente"""
    # Convertir a RGBA si no lo está
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # Convertir a numpy array
    data = np.array(img)
    
    # Obtener canales RGB
    r, g, b, a = data[:,:,0], data[:,:,1], data[:,:,2], data[:,:,3]
    
    # Detectar píxeles blancos (o casi blancos)
    # Un píxel es "blanco" si todos sus canales RGB están por encima del umbral
    white_mask = (r > BACKGROUND_THRESHOLD) & (g > BACKGROUND_THRESHOLD) & (b > BACKGROUND_THRESHOLD)
    
    # Hacer transparentes los píxeles blancos
    data[white_mask, 3] = 0
    
    return Image.fromarray(data)

def get_content_bbox(img):
    """Obtiene el bounding box del contenido (sin transparencia)"""
    # Convertir a numpy array
    data = np.array(img)
    
    # Obtener el canal alpha
    alpha = data[:,:,3]
    
    # Encontrar píxeles no transparentes
    rows = np.any(alpha > 10, axis=1)
    cols = np.any(alpha > 10, axis=0)
    
    if not rows.any() or not cols.any():
        return None
    
    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]
    
    return (cmin, rmin, cmax + 1, rmax + 1)

def normalize_texture(input_path, output_path):
    """Normaliza una textura"""
    print(f"Procesando: {os.path.basename(input_path)}")
    
    # Cargar imagen
    img = Image.open(input_path)
    
    # Eliminar fondo blanco
    img = remove_white_background(img)
    
    # Obtener bounding box del contenido
    bbox = get_content_bbox(img)
    
    if bbox is None:
        print(f"  ⚠️  No se encontró contenido en la imagen")
        return
    
    # Recortar al contenido
    img_cropped = img.crop(bbox)
    
    # Calcular el tamaño para mantener proporciones
    width, height = img_cropped.size
    max_dim = max(width, height)
    
    # Calcular el tamaño escalado (dejando un margen)
    margin = 0.1  # 10% de margen
    scale = (TARGET_SIZE * (1 - margin)) / max_dim
    new_width = int(width * scale)
    new_height = int(height * scale)
    
    # Redimensionar manteniendo proporciones
    img_resized = img_cropped.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    # Crear canvas final con transparencia
    final_img = Image.new('RGBA', (TARGET_SIZE, TARGET_SIZE), (0, 0, 0, 0))
    
    # Calcular posición para centrar
    x = (TARGET_SIZE - new_width) // 2
    y = (TARGET_SIZE - new_height) // 2
    
    # Pegar la imagen centrada
    final_img.paste(img_resized, (x, y), img_resized)
    
    # Guardar
    final_img.save(output_path, 'PNG')
    print(f"  ✓ Guardado: {os.path.basename(output_path)} ({new_width}x{new_height} centrado en {TARGET_SIZE}x{TARGET_SIZE})")

def main():
    """Procesa todas las imágenes en el directorio"""
    # Crear directorio de salida si no existe
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Procesar cada imagen PNG en el directorio
    files = [f for f in os.listdir(INPUT_DIR) if f.lower().endswith('.png')]
    
    if not files:
        print("No se encontraron archivos PNG en el directorio")
        return
    
    print(f"Encontradas {len(files)} imágenes para procesar\n")
    
    for filename in files:
        input_path = os.path.join(INPUT_DIR, filename)
        output_path = os.path.join(OUTPUT_DIR, filename)
        
        try:
            normalize_texture(input_path, output_path)
        except Exception as e:
            print(f"  ✗ Error procesando {filename}: {e}")
    
    print(f"\n✓ Proceso completado. Imágenes guardadas en: {OUTPUT_DIR}")

if __name__ == "__main__":
    main()
