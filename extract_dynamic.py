"""
Script para analizar la distribución horizontal de una imagen y detectar
automáticamente los límites de los iconos basándose en el canal alpha.
"""

from PIL import Image
import numpy as np
import os

def analyze_and_extract(input_path, output_dir, icon_names, padding=2):
    print(f"\n📦 Analizando distribución: {os.path.basename(input_path)}")
    
    # Crear directorio
    os.makedirs(output_dir, exist_ok=True)
    
    # Cargar imagen
    img = Image.open(input_path).convert('RGBA')
    width, height = img.size
    data = np.array(img)
    
    # Obtener canal alpha
    alpha = data[:,:,3]
    
    # Proyectar alpha en el eje X (suma vertical)
    # Si una columna es vacía, la suma será 0
    x_projection = np.sum(alpha, axis=0)
    
    # Encontrar columnas con contenido (suma > 0)
    has_content = x_projection > 0
    
    # Encontrar transiciones (donde empieza y termina el contenido)
    # diff será 1 donde empieza contenido, -1 donde termina
    diff = np.diff(has_content.astype(int))
    
    starts = np.where(diff == 1)[0] + 1
    ends = np.where(diff == -1)[0] + 1
    
    # Manejar caso donde empieza en el pixel 0
    if has_content[0]:
        starts = np.insert(starts, 0, 0)
    
    # Manejar caso donde termina en el último pixel
    if has_content[-1]:
        ends = np.append(ends, width)
        
    print(f"   Dimensiones: {width}x{height}")
    print(f"   Secciones detectadas: {len(starts)}")
    
    if len(starts) != len(icon_names):
        print(f"   ⚠️ ADVERTENCIA: Se detectaron {len(starts)} secciones pero se esperaban {len(icon_names)} iconos.")
        print("   Intentando asignar nombres en orden...")
    
    crops = []
    max_w = 0
    max_h = 0
    
    # Extraer cada sección detectada
    for i in range(len(starts)):
        if i >= len(icon_names):
            break
            
        x1 = starts[i]
        x2 = ends[i]
        
        # Extraer toda la altura de esa sección horizontal
        section = data[:, x1:x2]
        
        # Ahora recortar verticalmente (bbox real)
        section_img = Image.fromarray(section, 'RGBA')
        bbox = section_img.getbbox()
        
        if bbox:
            cropped = section_img.crop(bbox)
            crops.append(cropped)
            
            max_w = max(max_w, cropped.width)
            max_h = max(max_h, cropped.height)
            
            icon_name = icon_names[i]
            print(f"   🔹 {icon_name}: Detectado en X[{x1}-{x2}] (Ancho: {x2-x1}px) -> Recorte final: {cropped.width}x{cropped.height}")
        else:
            crops.append(None)
            print(f"   🔸 Sección {i+1}: Vacía")

    # Calcular tamaño unificado
    final_w = max_w + (padding * 2)
    final_h = max_h + (padding * 2)
    
    print(f"\n📏 Tamaño unificado final: {final_w}x{final_h}")
    
    extracted_files = []
    
    # Guardar imágenes centradas
    for i, cropped in enumerate(crops):
        if cropped is None:
            continue
            
        icon_name = icon_names[i]
        
        final_img = Image.new('RGBA', (final_w, final_h), (0, 0, 0, 0))
        
        x_pos = (final_w - cropped.width) // 2
        y_pos = (final_h - cropped.height) // 2
        
        final_img.paste(cropped, (x_pos, y_pos))
        
        output_filename = f"{icon_name}.png"
        output_path = os.path.join(output_dir, output_filename)
        final_img.save(output_path, 'PNG', optimize=False, compress_level=1)
        extracted_files.append(output_path)
        
        print(f"   ✅ Guardado: {output_filename}")
        
    return extracted_files

def main():
    print("=" * 70)
    print("🔍 ANALIZADOR DE DISTRIBUCIÓN DINÁMICA")
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
        analyze_and_extract(input_path, output_dir, icon_names)
        print("\n✨ ¡Proceso completado!")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")

if __name__ == "__main__":
    main()
