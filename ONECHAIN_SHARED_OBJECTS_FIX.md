# Fix: Transacciones con Objetos Compartidos en OneChain

## 🔍 Problema Identificado

La transacción de conversión Faith → HEX no se podía firmar debido a problemas con el manejo de **objetos compartidos** (shared objects) en OneChain.

### Causa Raíz

El contrato `hex_token.move` utiliza dos objetos compartidos:

```move
public struct TreasuryCapHolder has key { ... }
public struct EconomyStats has key { ... }
```

Ambos objetos se comparten en el `init`:
```move
transfer::share_object(holder);
transfer::share_object(stats);
```

La función `mint_from_faith_public` accede a estos objetos con referencias mutables:
```move
public entry fun mint_from_faith_public(
    holder: &mut TreasuryCapHolder,  // ← SHARED OBJECT
    stats: &mut EconomyStats,         // ← SHARED OBJECT
    faith_amount: u64,
    conversion_rate: u64,
    ctx: &mut TxContext
)
```

## 📚 Según la Documentación de OneChain

> "Transactions that access one or more shared objects **require consensus** to sequence reads and writes to those objects, resulting in a **slightly higher gas cost** and increased latency."

### Requisitos para Objetos Compartidos

1. **Gas Budget Mayor**: Las transacciones con objetos compartidos cuestan más gas
2. **Gas Price Correcto**: Debe usar el precio de referencia de la red
3. **Sender Explícito**: El `sender` debe establecerse antes de construir la transacción
4. **No Pre-serializar**: La wallet debe manejar la serialización

## ✅ Solución Implementada

### 1. Gas Budget Aumentado

```typescript
// Antes: No se establecía gas budget (usaba default muy bajo)
// Después:
const GAS_BUDGET = 50_000_000; // 0.05 OCT
tx.setGasBudget(GAS_BUDGET);
```

### 2. Gas Price Explícito

```typescript
// Obtener el precio de referencia de la red
const gasPrice = await onechainClient.getReferenceGasPrice();
tx.setGasPrice(gasPrice);
```

### 3. Sender Establecido Correctamente

```typescript
// Crítico para objetos compartidos
tx.setSender(account.address);
```

### 4. Eliminación de Configuración Manual de Gas Coins

```typescript
// ❌ ANTES: Configuración manual que causaba conflictos
const coins = await onechainClient.getCoins({...});
tx.setGasPayment(gasCoins);
tx.setGasOwner(account.address);

// ✅ DESPUÉS: Dejar que la wallet maneje el gas automáticamente
// La wallet selecciona las monedas de gas correctamente
```

### 5. No Pre-serializar la Transacción

```typescript
// ❌ ANTES: Pre-serialización que causaba problemas
const txBytes = await tx.build({ client: onechainClient });

// ✅ DESPUÉS: Pasar la transacción directamente
const result = await signAndExecuteFeature.signAndExecuteTransactionBlock({
  transactionBlock: tx,  // ← Sin serializar
  account: account,
  chain: NETWORK_CONFIG.CHAIN_ID,
  options: {
    showEffects: true,
    showEvents: true,
    showObjectChanges: true,
  },
});
```

## 🎯 Cambios en `hexConversionService.ts`

### Cambios Clave

1. **Gas Budget**: 50 millones de unidades (0.05 OCT)
2. **Gas Price**: Obtenido de `getReferenceGasPrice()`
3. **Gas Payment**: Automático (manejado por la wallet)
4. **Serialización**: Eliminada (la wallet lo hace)

### Flujo Correcto

```
1. Construir Transaction()
2. Establecer sender → tx.setSender(address)
3. Obtener gas price → getReferenceGasPrice()
4. Establecer gas price → tx.setGasPrice(price)
5. Establecer gas budget → tx.setGasBudget(50_000_000)
6. Agregar moveCall con objetos compartidos
7. Pasar TX directamente a wallet (SIN serializar)
8. Wallet firma y ejecuta
```

## 🔐 Objetos Compartidos vs Objetos Propios

### Objetos Propios (Owned)
- ✅ Transacciones rápidas (no consenso)
- ✅ Gas bajo
- ❌ Solo el dueño puede usarlos

### Objetos Compartidos (Shared)
- ✅ Múltiples usuarios pueden acceder
- ✅ Coordinación automática
- ❌ Requieren consenso (más lento)
- ❌ Gas más alto

## 📋 Verificación

Para verificar que la transacción funciona:

```typescript
// 1. Verificar saldo de OCT
const balance = await getOctBalance(address);
console.log('Balance:', balance);

// 2. Verificar precio de gas
const gasPrice = await onechainClient.getReferenceGasPrice();
console.log('Gas Price:', gasPrice);

// 3. Ejecutar conversión
const result = await convertFaithToHex(100);
console.log('Result:', result);
```

## 🚨 Errores Comunes Evitados

1. **"Insufficient gas budget"** → Gas budget muy bajo para objetos compartidos
2. **"Invalid gas payment"** → Configuración manual incorrecta
3. **"Transaction serialization error"** → Pre-serialización innecesaria
4. **"Sender not set"** → Sender no establecido antes de build
5. **"Gas price mismatch"** → Precio de gas incorrecto

## 📖 Referencias

- [OneChain Developer Guide - Shared vs Owned Objects](https://docs.onechain.com/)
- [OneChain SDK - Transaction Building](https://sdk.onechain.com/)
- [Sui/OneChain - Shared Objects](https://docs.sui.io/concepts/object-ownership/shared)

## ✨ Resultado

La transacción ahora se puede firmar y ejecutar correctamente con OneWallet, respetando todos los requisitos de OneChain para objetos compartidos.
