"""
Script para extraer iconos horizontales de b9cf08eb-0fcb-48bc-bf99-e3bab32ad160.png
Separa 4 iconos dispuestos horizontalmente y elimina TODO el espacio no usado.
"""

from PIL import Image
import numpy as np
import os

def extract_horizontal_icons(input_path, output_dir, icon_names, padding=2):
    """
    Extrae iconos de una tira horizontal.
    
    Args:
        input_path: Ruta de la imagen de entrada
        output_dir: Directorio de salida
        icon_names: Lista de nombres para cada icono (orden: izquierda a derecha)
        padding: Padding mínimo alrededor del icono (default: 2px)
    """
    print(f"\n📦 Procesando: {os.path.basename(input_path)}")
    
    # Crear directorio de salida si no existe
    os.makedirs(output_dir, exist_ok=True)
    
    # Cargar imagen
    img = Image.open(input_path).convert('RGBA')
    width, height = img.size
    data = np.array(img, dtype=np.uint8)
    
    # Configuración para tira horizontal de 4 iconos
    cols = 4
    rows = 1
    
    print(f"   Dimensiones: {width}x{height}")
    print(f"   Cuadrícula: {cols}x{rows} (Horizontal)")
    print(f"   Padding: {padding}px\n")
    
    tile_width = width // cols
    tile_height = height // rows
    
    extracted_files = []
    
    # Extraer cada celda (solo iteramos columnas ya que es 1 fila)
    for col in range(cols):
        if col >= len(icon_names):
            break
            
        # Calcular región
        x1 = col * tile_width
        y1 = 0
        x2 = x1 + tile_width
        y2 = tile_height
        
        # Extraer región
        tile_data = data[y1:y2, x1:x2].copy()
        
        # Crear imagen del tile
        tile_img = Image.fromarray(tile_data, 'RGBA')
        
        # Recortar espacio vacío (auto-crop) basado en alpha
        bbox = tile_img.getbbox()
        
        if bbox:
            # Recortar EXACTAMENTE al contenido
            cropped_img = tile_img.crop(bbox)
            
            # Solo agregar el padding mínimo especificado
            if padding > 0:
                padded_img = Image.new('RGBA', 
                                       (cropped_img.width + padding * 2, 
                                        cropped_img.height + padding * 2), 
                                       (0, 0, 0, 0))
                padded_img.paste(cropped_img, (padding, padding))
                final_img = padded_img
            else:
                final_img = cropped_img
            
            # Generar nombre de archivo
            icon_name = icon_names[col]
            output_filename = f"{icon_name}.png"
            output_path = os.path.join(output_dir, output_filename)
            
            # Guardar con máxima calidad
            final_img.save(output_path, 'PNG', optimize=False, compress_level=1)
            extracted_files.append(output_path)
            
            original_size = f"{tile_width}x{tile_height}"
            final_size = f"{final_img.width}x{final_img.height}"
            
            print(f"   ✅ {icon_name}")
            print(f"      {original_size} → {final_size}")
        else:
            print(f"   ⏭️  Icono {col + 1}: vacío, omitiendo")
    
    return extracted_files


def main():
    print("=" * 70)
    print("🏗️  EXTRACTOR DE ICONOS HORIZONTALES")
    print("=" * 70)
    
    # Definir la imagen y los nombres de los iconos
    input_path = 'public/assets/textures/b9cf08eb-0fcb-48bc-bf99-e3bab32ad160.png'
    output_dir = 'extracted_icons'
    
    # Nombres de los iconos en orden (izquierda a derecha)
    icon_names = [
        'construction_site',  # Edificioenconstruiccion (usando nombre en inglés para consistencia)
        'wheat',             # trigo
        'tree_1',            # arbol1
        'tree_2'             # arbol2
    ]
    
    try:
        extracted = extract_horizontal_icons(
            input_path,
            output_dir,
            icon_names,
            padding=2
        )
        
        print("\n" + "=" * 70)
        print(f"✨ ¡Proceso completado!")
        print(f"   Total de iconos extraídos: {len(extracted)}")
        print(f"   Guardados en: {output_dir}/")
        print("=" * 70)
        
        # Listar archivos generados
        if extracted:
            print("\n📁 Iconos generados:")
            for file_path in extracted:
                print(f"   - {file_path}")
                
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
