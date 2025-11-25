# Correcciones en la Interacción con el Contrato HEX Token

## Fecha
25 de noviembre de 2025

## Problemas Identificados

Después de revisar la documentación oficial de OneChain y el código actual, se identificaron los siguientes problemas:

### 1. Serialización BCS Incorrecta
**Problema**: El código estaba usando `bcs.u64().serialize(value).toBytes()` para serializar valores u64.

**Solución**: Según la documentación de OneChain, para valores puros se debe usar `tx.pure.u64(value)` directamente, que maneja la serialización BCS automáticamente.

```typescript
// ❌ ANTES (Incorrecto)
tx.pure(bcs.u64().serialize(faithAmount).toBytes())

// ✅ DESPUÉS (Correcto según docs)
tx.pure.u64(faithAmount)
```

### 2. Manejo Innecesario de Objetos Compartidos
**Problema**: El código intentaba obtener y manejar manualmente el `initial_shared_version` de los objetos compartidos antes de construir la transacción.

**Solución**: Según la documentación, para objetos compartidos solo se necesita pasar el ObjectID con `tx.object(id)`. El SDK resuelve automáticamente las versiones.

```typescript
// ❌ ANTES (Complejidad innecesaria)
// Obtener objetos con options: { showOwner: true, showContent: true }
// Verificar que tengan initial_shared_version
// Pasar información extra a moveCall

// ✅ DESPUÉS (Simplificado)
tx.object(HEX_TOKEN.TREASURY_HOLDER)  // El SDK resuelve el objeto automáticamente
tx.object(HEX_TOKEN.ECONOMY_STATS)
```

### 3. Gas Budget Excesivo
**Problema**: Se estaba estableciendo manualmente un gas budget de 100_000_000 (0.1 OCT), que es excesivo.

**Solución**: Dejar que el SDK maneje el gas budget automáticamente mediante dry-run. Solo se establece el `sender` y los comandos del PTB.

```typescript
// ❌ ANTES
tx.setGasPrice(gasPrice);
tx.setGasBudget(100_000_000);  // Demasiado alto

// ✅ DESPUÉS
tx.setSender(account.address);  // Solo establecer sender
// El SDK maneja gas price y budget automáticamente
```

### 4. Múltiples Intentos de Chain ID
**Problema**: El código intentaba con múltiples chain IDs en un loop complejo, incluyendo intentos con bytes serializados.

**Solución**: Simplificar a un solo intento con el chain ID principal del account. Si falla, proporcionar un mensaje de error claro.

```typescript
// ❌ ANTES
const chainIdsToTry = [
  ...account.chains,
  NETWORK_CONFIG.CHAIN_ID_ONECHAIN,
  NETWORK_CONFIG.CHAIN_ID_ALT,
  // ... múltiples variantes
];
for (const chainId of chainIdsToTry) {
  try { /* ... */ }
  catch { 
    // Reintentar con bytes base64
    // Continuar con siguiente chain ID
  }
}

// ✅ DESPUÉS
const chainId = account.chains?.[0] || 'sui:testnet';
try {
  await signAndExecuteFeature.signAndExecuteTransactionBlock({
    transactionBlock: tx,
    account: account,
    chain: chainId,
    // ...
  });
} catch (error) {
  // Analizar error y dar mensaje claro
}
```

## Cambios Realizados

### Archivo: `src/game/wallet/hexConversionService.ts`

1. **Removido import innecesario**:
   ```typescript
   - import { bcs } from '@onelabs/sui/bcs';
   ```

2. **Removido import de NETWORK_CONFIG**:
   ```typescript
   - import { ONECHAIN_PACKAGE_ID, HEX_TOKEN, CONVERSION_RATES, NETWORK_CONFIG } from '../../config/contracts';
   + import { ONECHAIN_PACKAGE_ID, HEX_TOKEN, CONVERSION_RATES } from '../../config/contracts';
   ```

3. **Simplificada construcción del PTB**:
   - Eliminada lógica compleja de obtención de objetos compartidos
   - Eliminada configuración manual de gas price y budget
   - Usar `tx.pure.u64()` directamente para valores u64

4. **Simplificado manejo de firma y ejecución**:
   - Un solo intento con chain ID principal
   - Eliminado loop de múltiples chain IDs
   - Eliminados intentos con bytes serializados
   - Mejorados mensajes de error para casos comunes

5. **Actualizada documentación**:
   - Agregadas notas sobre las correcciones según docs de OneChain
   - Mejorados comentarios inline explicando el por qué de cada decisión

## Referencias de Documentación OneChain

### Building Programmable Transaction Blocks
La documentación especifica claramente:

> **For pure values**: the `tx.pure(value, type?)` function is used to construct an input for a non-object input.

Y proporciona ejemplos usando `tx.pure()` directamente sin serialización manual.

### Shared Objects
> For objects: the `tx.object(objectId)` function is used to construct an input that contains an object reference.

No se requiere manejo manual de versiones para objetos compartidos.

### Gas Configuration
> By default, the gas budget is automatically derived by executing a dry-run of the PTB beforehand.

El SDK maneja automáticamente:
- Gas price (usa reference gas price)
- Gas budget (via dry-run)
- Gas coin selection y merging

### PTB Construcción
```typescript
const tx = new Transaction();
tx.setSender(account.address);  // Solo esto es necesario para shared objects
tx.moveCall({
  target: '...',
  arguments: [
    tx.object(objectId),      // Para objetos
    tx.pure.u64(value),       // Para valores u64
  ],
});
```

## Resultado Esperado

Con estos cambios, la interacción con el contrato HEX token ahora:

1. ✅ Sigue las mejores prácticas de OneChain
2. ✅ Es más simple y mantenible
3. ✅ Tiene mejor manejo de errores
4. ✅ Deja que el SDK maneje la complejidad automáticamente
5. ✅ Reduce el gas budget a lo estrictamente necesario
6. ✅ Proporciona mensajes de error más claros

## Pruebas Recomendadas

1. Conectar OneWallet a Testnet
2. Asegurar balance mínimo de 0.05 OCT
3. Intentar conversión de Faith a HEX
4. Verificar que:
   - La transacción se construye correctamente
   - El wallet muestra el preview correcto
   - La transacción se ejecuta exitosamente
   - Los eventos se emiten correctamente
   - El balance de HEX se actualiza

## Notas Adicionales

- El archivo original se respaldó en `hexConversionService.ts.bak`
- Los cambios son compatibles con el resto del código
- No se requieren cambios en otros archivos
- La firma de la función `mint_from_faith_public` en Move no cambió
