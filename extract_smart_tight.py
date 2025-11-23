"""
Script MEJORADO para extraer iconos con recorte EXACTO (sin espacio extra).
Usa detección inteligente para encontrar los bordes, pero guarda cada icono
en su tamaño real mínimo.
"""

from PIL import Image
import numpy as np
import os

def extract_smart_tight(input_path, output_dir, icon_names, min_width=50, merge_gap=20, padding=2):
    print(f"\n📦 Extracción INTELIGENTE + RECORTE EXACTO: {os.path.basename(input_path)}")
    
    os.makedirs(output_dir, exist_ok=True)
    
    img = Image.open(input_path).convert('RGBA')
    width, height = img.size
    data = np.array(img)
    
    # Proyección en X para detectar columnas con contenido
    alpha = data[:,:,3]
    x_projection = np.sum(alpha, axis=0)
    has_content = x_projection > 100  # Threshold de ruido vertical
    
    # Encontrar transiciones
    diff = np.diff(has_content.astype(int))
    starts = np.where(diff == 1)[0] + 1
    ends = np.where(diff == -1)[0] + 1
    
    if has_content[0]: starts = np.insert(starts, 0, 0)
    if has_content[-1]: ends = np.append(ends, width)
    
    # Crear lista de secciones
    sections = list(zip(starts, ends))
    
    # 1. Filtrar ruido
    valid_sections = [s for s in sections if (s[1] - s[0]) > min_width]
    
    # 2. Unir secciones cercanas
    merged_sections = []
    if valid_sections:
        curr_start, curr_end = valid_sections[0]
        for i in range(1, len(valid_sections)):
            next_start, next_end = valid_sections[i]
            if next_start - curr_end < merge_gap:
                curr_end = next_end
            else:
                merged_sections.append((curr_start, curr_end))
                curr_start, curr_end = next_start, next_end
        merged_sections.append((curr_start, curr_end))
    
    print(f"   Iconos detectados: {len(merged_sections)}")
    
    extracted_files = []
    
    for i, (x1, x2) in enumerate(merged_sections):
        if i >= len(icon_names): break
        
        name = icon_names[i]
        
        # Extraer sección vertical completa
        section = data[:, x1:x2]
        section_img = Image.fromarray(section, 'RGBA')
        
        # Recortar al contenido exacto (bbox)
        bbox = section_img.getbbox()
        
        if bbox:
            cropped = section_img.crop(bbox)
            
            # Agregar padding mínimo si se solicita
            if padding > 0:
                final_w = cropped.width + (padding * 2)
                final_h = cropped.height + (padding * 2)
                final_img = Image.new('RGBA', (final_w, final_h), (0, 0, 0, 0))
                final_img.paste(cropped, (padding, padding))
            else:
                final_img = cropped
            
            output_path = os.path.join(output_dir, f"{name}.png")
            final_img.save(output_path, 'PNG', optimize=False, compress_level=1)
            extracted_files.append(output_path)
            
            print(f"   ✅ {name}: {final_img.width}x{final_img.height} px")
        else:
            print(f"   ⚠️ {name}: Vacío")

    return extracted_files

def main():
    print("=" * 70)
    print("✂️  EXTRACTOR SMART TIGHT (SIN ESPACIO EXTRA)")
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
        extract_smart_tight(input_path, output_dir, icon_names)
        print("\n✨ ¡Proceso completado!")
    except Exception as e:
        print(f"\n❌ Error: {e}")

if __name__ == "__main__":
    main()
