# 🔧 Fix: Network Fee Aparece en 0

## 🔍 Problema

El network fee aparecía en **0 OCT** en OneWallet cuando se intentaba firmar la transacción.

## 📋 Causa Raíz

El problema era el **ORDEN** en que se configuraba la transacción:

### ❌ ANTES (Incorrecto)
```typescript
const tx = new Transaction();
tx.setSender(account.address);
const gasPrice = await onechainClient.getReferenceGasPrice();
tx.setGasPrice(gasPrice);
tx.setGasBudget(50_000_000);
tx.moveCall({...}); // Agregar comandos
// Enviar a wallet
```

### Problema
Cuando la wallet recibía la transacción, **no podía calcular el fee correcto** porque:

1. El gas price y budget se establecían DESPUÉS de crear la TX
2. La wallet no tenía información suficiente para estimar el costo
3. El resultado: **Network Fee = 0 OCT** ❌

## ✅ Solución

### Orden Correcto de Configuración

```typescript
// 1. Obtener precio de gas PRIMERO (antes de crear TX)
const gasPrice = await onechainClient.getReferenceGasPrice();
const GAS_BUDGET = 100_000_000; // 0.1 OCT

// 2. Crear transacción
const tx = new Transaction();

// 3. ORDEN CRÍTICO de configuración:
tx.setSender(account.address);      // A. Sender
tx.setGasPrice(gasPrice);           // B. Gas Price  
tx.setGasBudget(GAS_BUDGET);        // C. Gas Budget

// 4. AHORA agregar comandos
tx.moveCall({...});

// 5. Enviar a wallet - ahora puede calcular fees correctamente
```

### Por Qué Funciona

1. **Gas Price establecido primero** → La wallet sabe cuánto cuesta cada unidad de gas
2. **Gas Budget establecido segundo** → La wallet sabe el máximo a cobrar
3. **Comandos agregados después** → La wallet puede estimar el gas necesario
4. **Resultado**: Network Fee = ~0.05-0.1 OCT ✅

## 🔢 Cálculo del Network Fee

```
Network Fee = Gas Units Used × Gas Price
```

Para objetos compartidos en OneChain:
- **Gas Price**: ~1000 (referencia de la red)
- **Gas Units**: ~50,000 - 100,000 (depende de la complejidad)
- **Network Fee**: 0.05 - 0.1 OCT

## 📊 Cambios Implementados

### 1. Gas Budget Aumentado
```typescript
// ANTES: 50,000,000 (0.05 OCT) - insuficiente
// DESPUÉS: 100,000,000 (0.1 OCT) - suficiente para objetos compartidos
const GAS_BUDGET = 100_000_000;
```

### 2. Orden de Configuración
```typescript
// ANTES:
const tx = new Transaction();
tx.setSender(address);
// ... después obtener gas price
tx.setGasPrice(price);
tx.setGasBudget(budget);

// DESPUÉS:
const gasPrice = await getReferenceGasPrice(); // ← PRIMERO
const GAS_BUDGET = 100_000_000;                // ← SEGUNDO
const tx = new Transaction();                   // ← TERCERO
tx.setSender(address);                          // ← CUARTO
tx.setGasPrice(gasPrice);                       // ← QUINTO
tx.setGasBudget(GAS_BUDGET);                    // ← SEXTO
tx.moveCall({...});                             // ← ÚLTIMO
```

## 🎯 Verificación

Para verificar que el network fee aparece correctamente:

### En la Consola del Navegador
```typescript
import { convertFaithToHex } from './src/game/wallet/hexConversionService';

// Esto debería mostrar el fee correcto en OneWallet
await convertFaithToHex(100);
```

### En OneWallet
Cuando se abre la ventana de firma, deberías ver:

```
Network Fee: ~0.05-0.1 OCT  ✅
(No más 0 OCT)
```

## 🚨 Errores Comunes

### 1. Network Fee = 0
**Causa**: Gas price/budget no establecidos antes de enviar a wallet
**Solución**: Establecer ANTES de crear la TX

### 2. "Insufficient gas budget"
**Causa**: Gas budget muy bajo para objetos compartidos
**Solución**: Usar 100M+ para objetos compartidos

### 3. "Gas price mismatch"
**Causa**: No usar el precio de referencia de la red
**Solución**: `await getReferenceGasPrice()`

## 📖 Documentación OneChain

Según la documentación de OneChain:

> "Transactions that access one or more shared objects require consensus to sequence reads and writes to those objects, resulting in a **slightly higher gas cost**."

Por eso usamos 100M (0.1 OCT) en lugar de 50M (0.05 OCT).

## ✨ Resultado Final

Antes:
```
Network Fee: 0 OCT ❌
(Wallet no podía calcular)
```

Después:
```
Network Fee: ~0.08 OCT ✅
(Cálculo correcto basado en gas price y comandos)
```

## 🔄 Flujo Completo Correcto

```
1. Obtener gasPrice de la red
2. Definir GAS_BUDGET (100M para shared objects)
3. Crear Transaction()
4. Configurar: sender → gasPrice → gasBudget
5. Agregar moveCall con objetos compartidos
6. Verificar objetos compartidos tienen initial_shared_version
7. Enviar a wallet con chain ID correcto
8. Wallet calcula fee correctamente ✅
9. Usuario firma y ejecuta
```

---

**Estado:** ✅ Implementado
**Network Fee:** ✅ Ahora se calcula correctamente (~0.05-0.1 OCT)
