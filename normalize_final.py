from PIL import Image
import os

files = [
    'public/assets/hex_frames_textures/hex_frame_clouds.png',
    'public/assets/hex_frames_textures/hex_frame_stone.png',
    'public/assets/hex_frames_textures/hex_frame_vines.png',
    'public/assets/hex_frames_textures/hex_frame_wood.png'
]

print("Normalizando imágenes (eliminando espacio vacío)...")

for f in files:
    try:
        img = Image.open(f)
        # Obtener la caja delimitadora del contenido no transparente
        bbox = img.convert('RGBA').getbbox()
        
        if bbox:
            # Recortar
            cropped = img.crop(bbox)
            cropped.save(f)
            print(f"✓ {os.path.basename(f)}: {img.size} -> {cropped.size}")
        else:
            print(f"⚠ {os.path.basename(f)} parece estar vacía.")
            
    except Exception as e:
        print(f"Error en {f}: {e}")

print("\n¡Imágenes normalizadas!")
