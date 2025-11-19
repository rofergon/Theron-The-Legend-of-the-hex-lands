from PIL import Image
import numpy as np
from scipy import ndimage

def thin_frame(input_path, output_path, erosion_iterations=2):
    """
    Reduce el grosor del marco aplicando erosión a los píxeles del borde
    """
    # Cargar la imagen
    img = Image.open(input_path).convert('RGBA')
    data = np.array(img)
    
    # Separar los canales
    a = data[:,:,3]
    
    # Crear una máscara de los píxeles opacos (el marco)
    mask = a > 128
    
    # Aplicar erosión para adelgazar el marco
    eroded_mask = mask.copy()
    for _ in range(erosion_iterations):
        eroded_mask = ndimage.binary_erosion(eroded_mask)
    
    # Crear la nueva imagen con el marco más delgado
    new_data = data.copy()
    # Donde la máscara original tenía píxeles pero la erosionada no, hacer transparente
    pixels_to_remove = mask & ~eroded_mask
    new_data[pixels_to_remove, 3] = 0  # Hacer transparente
    
    # Guardar
    result = Image.fromarray(new_data, 'RGBA')
    result.save(output_path)
    print(f"✓ Procesado: {input_path.split('/')[-1]}")

# Lista de todos los frames a procesar
frames = [
    'public/assets/hex_frames_textures/hex_frame_clouds.png',
    'public/assets/hex_frames_textures/hex_frame_stone.png',
    'public/assets/hex_frames_textures/hex_frame_vines.png',
    'public/assets/hex_frames_textures/hex_frame_wood.png'
]

print("Adelgazando todos los marcos...\n")

for frame_path in frames:
    try:
        thin_frame(
            frame_path,
            frame_path,
            erosion_iterations=2  # 2 iteraciones para hacerlos más delgados
        )
    except Exception as e:
        print(f"Error procesando {frame_path}: {e}")

print("\n¡Todos los marcos adelgazados exitosamente!")
