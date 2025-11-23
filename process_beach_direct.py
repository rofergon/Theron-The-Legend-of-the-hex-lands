"""
Script para procesar directamente la imagen de playa adjunta
"""

from extract_hex_tiles import extract_hex_tiles
import os

# La imagen debe estar guardada primero
# Buscar la imagen en ubicaciones posibles
possible_paths = [
    'Beach_variants.png',
    'beach_variants.png',
    'public/assets/textures/Beach_variants.png',
    'public/assets/Beach.png',
]

print("🏖️  Procesando hexágonos de playa...\n")

# Intentar con cada ruta posible
found = False
for path in possible_paths:
    if os.path.exists(path):
        print(f"✅ Archivo encontrado: {path}\n")
        result = extract_hex_tiles(
            path, 
            output_dir='public/assets/extracted_beach_hexes', 
            prefix='beach_hex_Beach'
        )
        found = True
        print(f"\n✨ Se extrajeron {len(result)} hexágonos de playa")
        break

if not found:
    print("❌ No se encontró la imagen de playa.")
    print("\nPor favor:")
    print("1. Guarda la imagen adjunta como: Beach_variants.png")
    print("2. Colócala en la raíz del proyecto")
    print("3. Ejecuta este script nuevamente")
