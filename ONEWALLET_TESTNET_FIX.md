# OneWallet Testnet Connection Fix

## 🔍 Problema Detectado

El error `UnresolvedObject` y la falta de firma de transacciones se debe a que **OneWallet está conectada a MAINNET** pero el contrato está desplegado en **TESTNET**.

### Logs del Problema:
```
Chains disponibles: ['sui:testnet', 'sui:mainnet']  ← Wallet soporta ambas
Chains de la cuenta: ['sui:mainnet']                ← Usuario está en MAINNET ❌
```

## 🎯 Causa Raíz

Según el **Wallet Standard** de Sui:

1. **Las cuentas se autorizan por chain**: Cuando el usuario hace `connect()`, la wallet autoriza la cuenta **solo para la chain actualmente activa**.

2. **La autorización persiste**: Si conectaste OneWallet cuando estaba en mainnet, la cuenta queda autorizada solo para mainnet.

3. **El chain ID importa**: Cuando enviamos la transacción con `signAndExecuteTransactionBlock`, el chain ID debe coincidir con la red donde está el contrato.

## ✅ Soluciones Implementadas

### 1. Validación Temprana de Red (walletConfig.ts)

#### **Antes del Connect:**
```typescript
// Verificar que la wallet soporte testnet
if (!wallet.chains.includes('sui:testnet')) {
  return { error: 'OneWallet no está configurada para Testnet' };
}
```

#### **Durante el Connect:**
```typescript
// Intentar especificar testnet explícitamente
try {
  await connectFeature.connect({ chains: ['sui:testnet'] });
} catch {
  // Fallback: connect sin parámetros si no lo soporta
  await connectFeature.connect();
}
```

#### **Después del Connect:**
```typescript
// Verificar que la cuenta esté autorizada en testnet
if (!account.chains.includes('sui:testnet')) {
  return { 
    error: 'Cuenta autorizada solo en ' + account.chains.join(', ') +
           '\n\nSOLUCIÓN: Cambia a Testnet en OneWallet y reconecta'
  };
}
```

### 2. Detección de Cambios de Red

Agregado listener para eventos de cambio:
```typescript
wallet.features['standard:events'].on('change', (event) => {
  if (event.chains) {
    alert('RED CAMBIADA - Recarga la página');
  }
});
```

### 3. Resolución de Objetos (hexConversionService.ts)

```typescript
// Construir PTB
tx.moveCall({ ... });

// CRÍTICO: Resolver objetos antes de enviar a wallet
await tx.build({ client: onechainClient });

// Ahora sí enviar a wallet para firma
await wallet.signAndExecuteTransactionBlock({ ... });
```

### 4. Triple Validación de Chain ID

1. **Al conectar**: Verifica `wallet.chains` incluye testnet
2. **Después de conectar**: Verifica `account.chains` incluye testnet  
3. **Antes de transacción**: Verifica `chainId` no contiene 'mainnet'

## 📋 Instrucciones para el Usuario

### Paso 1: Cambiar OneWallet a Testnet

1. Abre la **extensión OneWallet** en tu navegador
2. Mira en la **parte superior** de la extensión
3. Verás el selector de red (probablemente dice "Mainnet" 🔴)
4. **Haz clic** en el selector de red
5. Selecciona **"Testnet"** ✅ (NO Mainnet)

### Paso 2: Reconectar la Wallet

6. Vuelve a la página del juego
7. Si ya estabas conectado, **desconecta** primero
8. **Recarga la página completa** (Ctrl+R o F5)
9. Haz clic en **"Connect Wallet"** de nuevo
10. Autoriza la conexión cuando OneWallet lo solicite

### Paso 3: Verificar

En la consola deberías ver:
```
Chains soportadas por wallet: ['sui:testnet', 'sui:mainnet']
Cuenta obtenida: 0x6b54...
Chains de la cuenta: ['sui:testnet']  ← ✅ CORRECTO
```

### Paso 4: Probar Conversión

11. Intenta convertir Faith a HEX de nuevo
12. Ahora deberías ver el **popup de firma de OneWallet**
13. La transacción se ejecutará en testnet

## 🔧 Detalles Técnicos

### ¿Por qué `UnresolvedObject`?

Los objetos compartidos en Sui necesitan dos cosas:
1. **Object ID**: `0x5a39...` (lo teníamos)
2. **Version**: Número de secuencia actual del objeto (faltaba)

Para obtener la version, OneChain SDK necesita hacer una query al RPC:
```typescript
// ANTES (incorrecto):
tx.object(HEX_TOKEN.TREASURY_HOLDER)
// Genera: { UnresolvedObject: { objectId: "0x5a39..." } }

// Necesitamos llamar:
await tx.build({ client })
// Genera: { SharedObject: { objectId: "0x5a39...", initialSharedVersion: "123", mutable: true } }
```

### ¿Por qué la red importa?

Los objetos en **testnet** tienen IDs diferentes a **mainnet**:
- Testnet TreasuryHolder: `0x5a39aaa300943133...` ✅
- Mainnet: Ese ID **no existe** ❌

Si envías una transacción a mainnet con IDs de testnet:
- El RPC de mainnet no puede resolver los objetos
- La transacción falla silenciosamente
- La wallet no puede mostrar preview de la transacción

## 📊 Flujo Corregido

```
Usuario conecta wallet
    ↓
walletConfig.ts verifica wallet.chains incluye 'sui:testnet'
    ↓
Llama connect({ chains: ['sui:testnet'] })
    ↓
walletConfig.ts verifica account.chains incluye 'sui:testnet'
    ↓
Usuario hace conversión Faith→HEX
    ↓
hexConversionService.ts verifica account.chains NO incluye 'mainnet'
    ↓
Construye PTB con tx.object() para objetos compartidos
    ↓
Llama await tx.build({ client: onechainClient })
    ↓
Objetos resuelven a { SharedObject: {...} }
    ↓
Verifica chainId no contiene 'mainnet'
    ↓
Envía a wallet.signAndExecuteTransactionBlock({ chain: 'sui:testnet' })
    ↓
✅ Popup de firma aparece
    ↓
Usuario firma
    ↓
✅ Transacción se ejecuta en testnet
```

## 🎯 Resultado Esperado

### ANTES (con error):
```json
{
  "inputs": [
    { "UnresolvedObject": { "objectId": "0x5a39..." } },  ❌
    { "UnresolvedObject": { "objectId": "0x9f3a..." } },  ❌
    ...
  ]
}
Chain ID: sui:mainnet  ❌
→ Wallet no muestra popup de firma
```

### DESPUÉS (corregido):
```json
{
  "inputs": [
    { "SharedObject": { 
        "objectId": "0x5a39...",
        "initialSharedVersion": "12345",
        "mutable": true
      }
    },  ✅
    { "SharedObject": { 
        "objectId": "0x9f3a...",
        "initialSharedVersion": "67890",
        "mutable": true
      }
    },  ✅
    ...
  ]
}
Chain ID: sui:testnet  ✅
→ Wallet muestra popup de firma ✅
→ Usuario firma ✅
→ Transacción se ejecuta ✅
```

## 📚 Referencias

- [Sui Wallet Standard](https://docs.sui.io/standards/wallet-standard)
- [OneChain Developer Guide](https://docs.onelabs.cc/)
- [Wallet Standard - Chain Authorization](https://github.com/wallet-standard/wallet-standard/)

## ⚠️ Advertencias

1. **NUNCA** mezcles contratos de testnet con wallets en mainnet
2. **SIEMPRE** verifica `account.chains` después de conectar
3. **SIEMPRE** llama `tx.build()` antes de enviar a wallet
4. **NUNCA** asumas que `wallet.chains` = `account.chains`
5. El usuario puede tener la wallet en mainnet pero autorizar testnet (o viceversa)

---

**Status**: ✅ Implementado y listo para testing
**Fecha**: 2025-11-25
**Archivos modificados**: 
- `walletConfig.ts` (validación de chains)
- `hexConversionService.ts` (resolución de objetos + validación)
