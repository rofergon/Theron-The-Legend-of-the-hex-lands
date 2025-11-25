# 🧪 Guía de Pruebas - Corrección HEX Token

## Pre-requisitos

### 1. OneWallet Instalada
```
✓ Extensión instalada en el navegador
✓ Cuenta creada
✓ Conectada a TESTNET (no Mainnet)
```

### 2. Balance Mínimo
```
✓ Al menos 0.05 OCT en Testnet
```

Para obtener OCT de prueba:
```bash
# Solicitar tokens del faucet de Testnet
curl --location --request POST 'https://faucet-testnet.onelabs.cc/v1/gas' \
--header 'Content-Type: application/json' \
--data-raw '{
    "FixedAmountRequest": {
        "recipient": "<TU_DIRECCION_AQUI>"
    }
}'
```

## Pasos de Prueba

### Paso 1: Verificar Compilación ✅
```bash
# En la raíz del proyecto
npm run build

# O si usas TypeScript directamente
tsc --noEmit
```

**Resultado esperado**:
```
✓ No errores de compilación
✓ No warnings sobre 'bcs' o 'NETWORK_CONFIG'
```

### Paso 2: Ejecutar Validación de Sintaxis 🧪
```bash
# Ejecutar el script de validación
cd src/game/wallet
node -r ts-node/register testHexTokenFix.ts
```

**Resultado esperado**:
```
🧪 PRUEBAS DE VALIDACIÓN - HEX TOKEN TRANSACTION
================================================================

📋 Test 1: Crear transacción básica
✅ Test 1: PASSED

📋 Test 2: Verificar tipos de argumentos
✅ Test 2: PASSED - Tipos correctos

📋 Test 3: Verificar constantes del contrato
✅ Test 3: PASSED - Constantes definidas

🏁 PRUEBAS COMPLETADAS
```

### Paso 3: Iniciar Aplicación 🚀
```bash
# En la raíz del proyecto
npm run dev
```

### Paso 4: Probar en el Navegador 🌐

1. **Abrir la aplicación** en `http://localhost:5173` (o el puerto que uses)

2. **Conectar OneWallet**:
   - Clic en botón "Conectar Wallet"
   - Seleccionar OneWallet
   - Aprobar conexión

3. **Verificar Red**:
   - OneWallet debe mostrar **"Testnet"** en la parte superior
   - Si dice "Mainnet", cambiar a Testnet

4. **Verificar Balance**:
   - Debe mostrar tu balance de OCT
   - Debe ser >= 0.05 OCT

5. **Intentar Conversión**:
   - Ingresar cantidad de Faith (ej: 100)
   - Clic en "Convertir a HEX"
   - Esperar popup de OneWallet

### Paso 5: Verificar en OneWallet 👁️

El popup de OneWallet debe mostrar:

```
┌─────────────────────────────────────┐
│ OneWallet - Confirmar Transacción  │
├─────────────────────────────────────┤
│ Red: Testnet                        │
│                                     │
│ Tipo: Move Call                     │
│ Función:                            │
│   mint_from_faith_public            │
│                                     │
│ Gas Estimado: ~0.01-0.02 OCT       │
│                                     │
│ [ Rechazar ]  [ Aprobar ]          │
└─────────────────────────────────────┘
```

**Verificar**:
- ✅ Red es "Testnet"
- ✅ Gas es razonable (~0.01-0.02 OCT, NO 0.1)
- ✅ Función es "mint_from_faith_public"

### Paso 6: Aprobar y Verificar ✅

1. **Clic en "Aprobar"** en OneWallet

2. **Esperar confirmación** (5-10 segundos)

3. **Verificar resultado en consola del navegador**:
   ```javascript
   ✅ Transacción firmada y enviada
      Digest: 0x...
   🎉 Transacción confirmada exitosamente
      Eventos: 1
   ```

4. **Verificar en la UI**:
   - Mensaje de éxito
   - Balance de HEX actualizado
   - Faith deducido

## 🔍 Debugging

### Si la transacción falla...

#### Error: "Chain not supported" o "Network mismatch"
**Solución**:
1. Abrir OneWallet
2. Cambiar a **Testnet**
3. Recargar la página
4. Intentar de nuevo

#### Error: "Insufficient gas"
**Solución**:
1. Verificar balance: debe ser >= 0.05 OCT
2. Solicitar tokens del faucet (comando arriba)
3. Esperar 1-2 minutos
4. Intentar de nuevo

#### Error: "Object not found" o "Object version mismatch"
**Posible causa**: Contrato no desplegado en Testnet
**Solución**:
1. Verificar que `ONECHAIN_PACKAGE_ID` en `contracts.ts` sea correcto
2. Verificar que `HEX_TOKEN.TREASURY_HOLDER` y `ECONOMY_STATS` existan:
   ```bash
   # Verificar objeto TreasuryHolder
   curl -X POST https://rpc-testnet.onelabs.cc:443 \
   -H "Content-Type: application/json" \
   -d '{"jsonrpc":"2.0","id":1,"method":"sui_getObject","params":["<TREASURY_HOLDER_ID>",{"showContent":true}]}'
   ```

#### Error: "Type mismatch" o "Argument error"
**Esto NO debería ocurrir con el código corregido**
- Los tipos ahora son correctos con `tx.pure.u64()`
- Si ocurre, revisar que CONVERSION_RATES.FAITH_TO_HEX sea un número

## 📊 Verificar en OneChain Explorer

Después de una transacción exitosa:

1. **Copiar el digest** de la transacción
2. **Abrir**: https://testnet.suivision.xyz/
3. **Pegar** el digest en el buscador
4. **Verificar**:
   - Status: Success ✅
   - Events: FaithConverted
   - Gas Used: ~0.01-0.02 OCT
   - Object Changes: Coin<HEX_TOKEN> creado

## 📝 Checklist de Verificación

```
Preparación:
□ OneWallet instalada
□ Conectada a Testnet
□ Balance >= 0.05 OCT

Código:
□ No errores de compilación
□ Tests de validación pasan
□ Aplicación inicia sin errores

Transacción:
□ Preview correcto en OneWallet
□ Gas razonable (~0.01-0.02 OCT)
□ Red es Testnet
□ Aprobación exitosa

Resultado:
□ Transacción confirmada
□ Evento FaithConverted emitido
□ Balance HEX actualizado
□ Faith deducido correctamente
□ No errores en consola

Verificación Final:
□ Transacción visible en explorer
□ Status: Success
□ Gas usado correcto
□ Objetos creados correctamente
```

## 🎯 Resultado Esperado Final

```
=================================================
✅ CONVERSIÓN EXITOSA
=================================================
Faith gastado:     100
HEX recibido:      1  (asumiendo rate 100:1)
Gas usado:         0.0123 OCT
Transaction:       0x1234...abcd
Status:            Success ✅
Tiempo:            ~5-10 segundos
=================================================
```

## 🆘 Soporte

Si después de seguir estos pasos aún hay problemas:

1. **Revisar consola** del navegador (F12)
2. **Revisar logs** de la aplicación
3. **Compartir**:
   - Screenshot del error
   - Digest de la transacción (si existe)
   - Logs de la consola
   - Red actual de OneWallet

---
**Última actualización**: 25 de noviembre de 2025  
**Versión**: Post-corrección según docs OneChain
