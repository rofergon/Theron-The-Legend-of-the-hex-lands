"""
Script para extraer iconos horizontales asegurando que todos tengan EL MISMO TAMAÑO FINAL.
Calcula el tamaño máximo necesario y centra todos los iconos en ese canvas común.
"""

from PIL import Image
import numpy as np
import os

def extract_horizontal_uniform(input_path, output_dir, icon_names, padding=2):
    """
    Extrae iconos de una tira horizontal y los normaliza al mismo tamaño.
    
    Args:
        input_path: Ruta de la imagen de entrada
        output_dir: Directorio de salida
        icon_names: Lista de nombres para cada icono
        padding: Padding alrededor del contenido
    """
    print(f"\n📦 Procesando: {os.path.basename(input_path)}")
    
    # Crear directorio de salida
    os.makedirs(output_dir, exist_ok=True)
    
    # Cargar imagen
    img = Image.open(input_path).convert('RGBA')
    width, height = img.size
    data = np.array(img, dtype=np.uint8)
    
    # Configuración
    cols = 4
    rows = 1
    tile_width = width // cols
    tile_height = height // rows
    
    print(f"   Dimensiones originales: {width}x{height}")
    print(f"   Celda individual: {tile_width}x{tile_height}")
    
    # Paso 1: Extraer recortes y calcular tamaño máximo
    crops = []
    max_w = 0
    max_h = 0
    
    print("\n🔍 Analizando dimensiones óptimas...")
    
    for col in range(cols):
        if col >= len(icon_names):
            break
            
        # Extraer celda
        x1 = col * tile_width
        y1 = 0
        x2 = x1 + tile_width
        y2 = tile_height
        
        tile_data = data[y1:y2, x1:x2].copy()
        tile_img = Image.fromarray(tile_data, 'RGBA')
        
        # Obtener bbox
        bbox = tile_img.getbbox()
        
        if bbox:
            cropped = tile_img.crop(bbox)
            crops.append(cropped)
            
            # Actualizar máximos
            max_w = max(max_w, cropped.width)
            max_h = max(max_h, cropped.height)
            
            print(f"   - {icon_names[col]}: {cropped.width}x{cropped.height}")
        else:
            crops.append(None)
            print(f"   - {icon_names[col]}: Vacío")
            
    # Calcular tamaño final con padding
    final_w = max_w + (padding * 2)
    final_h = max_h + (padding * 2)
    
    print(f"\n📏 Tamaño unificado final: {final_w}x{final_h} (incluye {padding}px padding)")
    
    extracted_files = []
    
    # Paso 2: Generar imágenes centradas
    for i, cropped in enumerate(crops):
        if cropped is None:
            continue
            
        icon_name = icon_names[i]
        
        # Crear canvas transparente del tamaño unificado
        final_img = Image.new('RGBA', (final_w, final_h), (0, 0, 0, 0))
        
        # Calcular posición centrada
        x_pos = (final_w - cropped.width) // 2
        y_pos = (final_h - cropped.height) // 2
        
        # Pegar
        final_img.paste(cropped, (x_pos, y_pos))
        
        # Guardar
        output_filename = f"{icon_name}.png"
        output_path = os.path.join(output_dir, output_filename)
        final_img.save(output_path, 'PNG', optimize=False, compress_level=1)
        extracted_files.append(output_path)
        
        print(f"   ✅ Guardado: {output_filename}")

    return extracted_files

def main():
    print("=" * 70)
    print("📏 EXTRACTOR DE ICONOS - TAMAÑO UNIFICADO")
    print("=" * 70)
    
    input_path = 'public/assets/textures/b9cf08eb-0fcb-48bc-bf99-e3bab32ad160.png'
    output_dir = 'extracted_icons'
    
    icon_names = [
        'construction_site',
        'wheat',
        'tree_1',
        'tree_2'
    ]
    
    try:
        extract_horizontal_uniform(input_path, output_dir, icon_names)
        print("\n✨ ¡Proceso completado!")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")

if __name__ == "__main__":
    main()
