# 🔧 Corrección: Integración OneWallet Nativa

## ❌ Problema Identificado

OneWallet **NO** usa el Wallet Standard de Sui como se asumió inicialmente. En su lugar, OneWallet se inyecta como un objeto global `window.onewallet` con su propia API.

### Síntomas
- Modal muestra "No se pudo conectar la wallet"
- No se dispara el popup de firma
- A pesar de que OneWallet está conectada (visible en Manage Dapps)

## ✅ Solución Implementada

Se reescribió la integración para usar la **API nativa de OneWallet** en lugar del Wallet Standard.

---

## 📝 Cambios Realizados

### 1. `onewalletDetector.ts` - Detección Actualizada

**Antes:**
```typescript
// Buscaba en getWallets() del Wallet Standard
const wallets = getWallets().get();
const oneWallet = wallets.find(w => w.name.includes('onewallet'));
```

**Ahora:**
```typescript
// Busca primero en window.onewallet (API nativa)
if (typeof window !== 'undefined' && (window as any).onewallet) {
  return (window as any).onewallet;
}
```

**Nueva Interfaz:**
```typescript
export interface OneWalletAPI {
  isConnected: () => Promise<boolean>;
  connect: () => Promise<{ address: string }>;
  getAccounts: () => Promise<string[]>;
  signAndExecuteTransactionBlock: (params: any) => Promise<any>;
  disconnect: () => Promise<void>;
  on: (event: string, callback: Function) => void;
  off: (event: string, callback: Function) => void;
}
```

---

### 2. `walletConfig.ts` - Conexión Nativa

**Método `connectOneWallet()` Actualizado:**

```typescript
export async function connectOneWallet(): Promise<ConnectionResult> {
  const wallet = getWalletInstance(); // Obtiene window.onewallet
  
  // 1. Verificar si ya está conectada
  const alreadyConnected = await wallet.isConnected();
  
  // 2. Si no, solicitar conexión
  if (!alreadyConnected) {
    const connectResult = await wallet.connect();
    console.log('✅ Usuario autorizó:', connectResult);
  }
  
  // 3. Obtener cuentas
  const accounts = await wallet.getAccounts();
  const address = accounts[0];
  
  // 4. Guardar estado
  currentAccount = { address };
  isConnected = true;
  
  return { success: true, account: {...} };
}
```

**Logs de Depuración Añadidos:**
- `🔌 Intentando conectar OneWallet...`
- `✅ OneWallet detectada, verificando conexión...`
- `🔐 Solicitando conexión al usuario...`
- `📋 Cuentas obtenidas: [...]`

---

### 3. `hexConversionService.ts` - Firma de Transacciones

**Antes:**
```typescript
const signFeature = wallet.features['sui:signAndExecuteTransactionBlock'];
const result = await signFeature.signAndExecuteTransactionBlock({
  transactionBlock: tx,
  account: account,
  chain: 'sui:testnet',
  ...
});
```

**Ahora:**
```typescript
const wallet = (window as any).onewallet;

const result = await wallet.signAndExecuteTransactionBlock({
  transactionBlock: tx,  // Transaction object directamente
  options: {
    showEffects: true,
    showEvents: true,
  },
});
```

**Simplificación:**
- No se necesita serializar el Transaction a bytes
- No se especifica `account` ni `chain`
- OneWallet maneja todo internamente

---

## 🧪 Cómo Probar

### 1. Verificar OneWallet en Consola

Abre DevTools y ejecuta:
```javascript
console.log(window.onewallet);
```

**Debería mostrar:**
```
{
  isConnected: ƒ(),
  connect: ƒ(),
  getAccounts: ƒ(),
  signAndExecuteTransactionBlock: ƒ(),
  ...
}
```

### 2. Verificar Conexión

```javascript
await window.onewallet.isConnected();
// true si está conectada

await window.onewallet.getAccounts();
// ['0xc8e262bc...', ...]
```

### 3. Probar Conversión

1. Acumula Faith en el juego
2. Haz clic en 🪙 en el header
3. Observa los logs en consola:
   ```
   🔌 Intentando conectar OneWallet...
   ✅ OneWallet detectada, verificando conexión...
   ✅ Ya estaba conectada
   📋 Cuentas obtenidas: ['0x...']
   ✅ Connected to OneWallet: 0xc8e2...88ae
   ```

4. Haz clic en "Convert all"
5. **IMPORTANTE:** Ahora debería aparecer el popup de OneWallet pidiendo firma

---

## 🔍 Debugging

### Si OneWallet no se detecta

**Verificar instalación:**
```javascript
console.log('OneWallet instalada?', !!window.onewallet);
```

**Si es `false`:**
- Reinstalar OneWallet
- Refrescar la página
- Verificar que la extensión esté habilitada

### Si la firma no se dispara

**Verificar en consola los logs:**
```
🔌 Intentando conectar OneWallet...
✅ OneWallet detectada, verificando conexión...
🔐 Solicitando conexión al usuario...  ← Aquí debería aparecer popup
```

**Verificar método de firma:**
```javascript
console.log(typeof window.onewallet.signAndExecuteTransactionBlock);
// Debería ser 'function'
```

### Si la transacción falla

**Verificar IDs de contratos:**
```typescript
// En src/config/contracts.ts
ONECHAIN_PACKAGE_ID = "0xee46771b..."
HEX_TOKEN.TREASURY_HOLDER = "0xa48be070..."
HEX_TOKEN.ECONOMY_STATS = "0xf57368221c..."
```

**Verificar en OneChain Explorer:**
https://onescan.cc/testnet/object/{OBJECT_ID}

---

## 📊 Diferencias Clave: OneWallet vs Wallet Standard

| Aspecto | Wallet Standard (Sui) | OneWallet Nativo |
|---------|----------------------|------------------|
| **Detección** | `getWallets().get()` | `window.onewallet` |
| **Conexión** | `wallet.features['standard:connect'].connect()` | `await onewallet.connect()` |
| **Cuentas** | `wallet.accounts[0]` | `await onewallet.getAccounts()` |
| **Firma TX** | `signFeature.signAndExecuteTransactionBlock()` | `onewallet.signAndExecuteTransactionBlock()` |
| **Desconexión** | `wallet.features['standard:disconnect'].disconnect()` | `await onewallet.disconnect()` |

---

## ✅ Estado Actual

- ✅ Detección de OneWallet corregida
- ✅ Conexión usando API nativa
- ✅ Firma de transacciones actualizada
- ✅ Logs de depuración añadidos
- ✅ Compilación sin errores

---

## 🎯 Próximos Pasos

1. **Probar en navegador** con OneWallet instalada
2. **Verificar popup de firma** aparece correctamente
3. **Confirmar transacción** se ejecuta en blockchain
4. **Validar HEX tokens** llegan a la wallet

---

## 💡 Notas Importantes

### OneWallet Require OCT para Gas

Asegúrate de tener OCT en tu wallet:
```
Testnet Faucet: https://faucet.onelabs.cc/
```

### Network Configuration

OneWallet debe estar en **OneChain Testnet**:
- Abre OneWallet
- Ve a Settings → Network
- Selecciona "Testnet"

### Manage Dapps

La conexión aparecerá en "Manage Dapps" como:
- **http://localhost:5173** (en desarrollo)
- Con estado "Connected"

---

## 🔗 Referencias

- **OneWallet:** https://wallet.onelab.cc/
- **OneChain Docs:** https://docs.onelabs.cc/
- **OneChain Explorer:** https://onescan.cc/testnet

---

**Fecha:** 2025-11-25  
**Corrección:** Integración nativa OneWallet  
**Estado:** ✅ Listo para pruebas
