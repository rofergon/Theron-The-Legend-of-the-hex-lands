"""
Script MEJORADO para analizar la distribución horizontal.
Filtra ruido (secciones pequeñas) y une secciones cercanas.
"""

from PIL import Image
import numpy as np
import os

def analyze_and_extract_smart(input_path, output_dir, icon_names, min_width=50, merge_gap=20, padding=2):
    print(f"\n📦 Analizando distribución INTELIGENTE: {os.path.basename(input_path)}")
    
    os.makedirs(output_dir, exist_ok=True)
    
    img = Image.open(input_path).convert('RGBA')
    width, height = img.size
    data = np.array(img)
    
    # Proyección en X
    alpha = data[:,:,3]
    x_projection = np.sum(alpha, axis=0)
    has_content = x_projection > 100  # Threshold de ruido vertical
    
    # Encontrar transiciones
    diff = np.diff(has_content.astype(int))
    starts = np.where(diff == 1)[0] + 1
    ends = np.where(diff == -1)[0] + 1
    
    if has_content[0]: starts = np.insert(starts, 0, 0)
    if has_content[-1]: ends = np.append(ends, width)
    
    # Crear lista de secciones (start, end)
    sections = list(zip(starts, ends))
    print(f"   Secciones crudas detectadas: {len(sections)}")
    
    # 1. Filtrar secciones muy pequeñas (ruido)
    valid_sections = [s for s in sections if (s[1] - s[0]) > min_width]
    print(f"   Secciones válidas (> {min_width}px): {len(valid_sections)}")
    
    # 2. Unir secciones cercanas
    merged_sections = []
    if valid_sections:
        curr_start, curr_end = valid_sections[0]
        
        for i in range(1, len(valid_sections)):
            next_start, next_end = valid_sections[i]
            
            if next_start - curr_end < merge_gap:
                # Unir
                curr_end = next_end
            else:
                # Guardar y empezar nueva
                merged_sections.append((curr_start, curr_end))
                curr_start, curr_end = next_start, next_end
        
        merged_sections.append((curr_start, curr_end))
    
    print(f"   Secciones finales (unidas): {len(merged_sections)}")
    
    # Verificar cantidad
    if len(merged_sections) != len(icon_names):
        print(f"   ⚠️ ADVERTENCIA: Se encontraron {len(merged_sections)} iconos, se esperaban {len(icon_names)}")
    
    # Extraer y calcular máximos
    crops = []
    max_w = 0
    max_h = 0
    
    for i, (x1, x2) in enumerate(merged_sections):
        if i >= len(icon_names): break
        
        # Extraer
        section = data[:, x1:x2]
        section_img = Image.fromarray(section, 'RGBA')
        bbox = section_img.getbbox()
        
        if bbox:
            cropped = section_img.crop(bbox)
            crops.append(cropped)
            max_w = max(max_w, cropped.width)
            max_h = max(max_h, cropped.height)
            
            name = icon_names[i]
            print(f"   🔹 {name}: X[{x1}-{x2}] ({x2-x1}px) -> Final: {cropped.width}x{cropped.height}")
        else:
            crops.append(None)

    # Tamaño unificado
    final_w = max_w + (padding * 2)
    final_h = max_h + (padding * 2)
    print(f"\n📏 Tamaño unificado final: {final_w}x{final_h}")
    
    extracted_files = []
    
    # Guardar
    for i, cropped in enumerate(crops):
        if cropped is None: continue
        
        name = icon_names[i]
        final_img = Image.new('RGBA', (final_w, final_h), (0, 0, 0, 0))
        
        x_pos = (final_w - cropped.width) // 2
        y_pos = (final_h - cropped.height) // 2
        
        final_img.paste(cropped, (x_pos, y_pos))
        
        output_path = os.path.join(output_dir, f"{name}.png")
        final_img.save(output_path, 'PNG', optimize=False, compress_level=1)
        extracted_files.append(output_path)
        print(f"   ✅ Guardado: {name}.png")

    return extracted_files

def main():
    print("=" * 70)
    print("🧠 EXTRACTOR INTELIGENTE")
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
        analyze_and_extract_smart(input_path, output_dir, icon_names)
        print("\n✨ ¡Proceso completado!")
    except Exception as e:
        print(f"\n❌ Error: {e}")

if __name__ == "__main__":
    main()
