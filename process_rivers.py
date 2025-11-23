"""
Script para procesar la imagen de ríos
"""

from extract_hex_tiles import extract_hex_tiles
import os
import subprocess

possible_paths = [
    'public/assets/textures/Rivers2.png',
    'public/assets/textures/Rivers.png',
    'Rivers.png',
    'public/assets/Rivers.png',
]

print("🌊 Procesando hexágonos de ríos...\n")

found = False
for path in possible_paths:
    if os.path.exists(path):
        print(f"✅ Archivo encontrado: {path}\n")
        result = extract_hex_tiles(
            path, 
            output_dir='public/assets/extracted_river_hexes', 
            prefix='river_hex_Rivers'
        )
        found = True
        print(f"\n✨ Se extrajeron {len(result)} hexágonos de ríos")
        
        # Limpiar automáticamente
        print("\n🧹 Limpiando hexágonos...")
        subprocess.run(['python', 'clean_hex_tiles.py', 'public/assets/extracted_river_hexes'])
        break

if not found:
    print("❌ No se encontró la imagen de ríos.")
    print("\nPor favor:")
    print("1. Asegúrate de que Rivers.png esté en: public/assets/textures/")
    print("2. Ejecuta: python process_rivers.py")
