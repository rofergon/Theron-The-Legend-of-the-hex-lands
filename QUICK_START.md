# 🚀 Quick Start - Conversión Faith a HEX

## Para empezar a usar la integración

### 1. Instalar OneWallet
- Descarga e instala la extensión OneWallet: https://wallet.onelab.cc/
- Crea una cuenta o importa una existente
- Asegúrate de tener OCT en tu wallet (para gas)

### 2. Iniciar el juego
```bash
npm run dev
```

### 3. Probar la conversión

1. **Acumula Faith en el juego:**
   - Construye templos
   - Asigna devotos (panel de Professions)
   - Espera a tener al menos 100 Faith

2. **Convertir Faith a HEX:**
   - Haz clic en el icono 🪙 en el header
   - Verifica que muestre tu Faith
   - Haz clic en "Convert all"
   - Conecta OneWallet (si es primera vez)
   - Firma la transacción en OneWallet
   - Espera confirmación (5-10 seg)
   - ¡Listo! Tus HEX tokens están en tu wallet

3. **Verificar tokens:**
   - Abre OneWallet
   - Ve a la pestaña "Tokens"
   - Busca HEX en la lista

## 🔍 Verificar en Blockchain

**Ver transacción en Explorer:**
```
https://onescan.cc/testnet/tx/[TRANSACTION_DIGEST]
```

**Ver tu wallet:**
```
https://onescan.cc/testnet/address/[YOUR_ADDRESS]
```

**Ver el contrato:**
```
https://onescan.cc/testnet/object/0xee46771b757523af06d19cff029366b81b6716715bea7bb58d0d5013b0e5c73d
```

## 🛠️ Debugging

**Ver logs en consola:**
```javascript
// Abrir DevTools (F12)
// Buscar en consola:
✅ Connected to OneWallet: 0xc8e2...
🏗️ Building transaction...
✍️ Waiting for signature...
⏳ Executing on OneChain...
🔄 Confirming...
✅ Success! TX: 0xabcd...
```

## 📊 Verificar Balance de HEX

**En la consola del navegador:**
```javascript
import { getHexBalance } from './src/game/wallet/hexConversionService';

const balance = await getHexBalance('TU_ADDRESS');
console.log('Balance HEX:', balance);
```

## ⚠️ Solución de Problemas

**Si no aparece el modal:**
- Verifica que el icono 🪙 esté visible en el header
- Comprueba que el juego haya iniciado correctamente

**Si OneWallet no se conecta:**
- Verifica que la extensión esté instalada
- Refresca la página
- Desbloquea OneWallet

**Si la transacción falla:**
- Verifica que tengas OCT para gas
- Comprueba tu conexión a internet
- Intenta de nuevo

## 📝 Archivos Importantes

- **Configuración:** `src/config/contracts.ts`
- **Servicio:** `src/game/wallet/hexConversionService.ts`
- **Lógica del juego:** `src/game/game.ts` (método `convertAllFaithToToken1`)
- **UI:** `index.html` (modal de conversión)

## 🎯 Siguiente Paso

Una vez que hayas convertido Faith a HEX:
1. Acumula 100,000 HEX
2. Conviértelos a 1 THERON
3. Usa THERON para comprar Lands NFT

---

**¿Preguntas?** Revisa la documentación completa en:
- `src/game/wallet/README_HEX_INTEGRATION.md` (técnica)
- `docs/guia-conversion-faith-hex.md` (usuario)
- `INTEGRATION_COMPLETE.md` (resumen)
