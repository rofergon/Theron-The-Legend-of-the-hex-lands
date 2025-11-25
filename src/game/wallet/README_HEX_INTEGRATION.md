# Integración HEX Token - Conversión de Faith a Blockchain

## 🎯 Resumen

Esta integración permite convertir **Faith** (recurso in-game) en **HEX tokens** (token ERC20 en OneChain blockchain) mediante firma de wallet con **OneWallet**.

## 📁 Archivos Creados/Modificados

### Nuevos Archivos

1. **`src/config/contracts.ts`**
   - Configuración de IDs de contratos desplegados
   - Package ID, Treasury, Stats del HEX_TOKEN
   - Tasas de conversión (100 Faith = 1 HEX)

2. **`src/game/wallet/hexConversionService.ts`**
   - Servicio de conversión con firma de wallet
   - Función `convertFaithToHex()` que llama al contrato
   - Validación de Faith y conexión de wallet
   - Tracking de estados de transacción

### Archivos Modificados

1. **`src/game/game.ts`**
   - Método `convertAllFaithToToken1()` actualizado para usar blockchain
   - Integración con OneWallet para firma de transacciones
   - Manejo de estados (connecting, signing, executing, confirming)
   - Feedback visual en tiempo real

2. **`index.html`**
   - Modal actualizado con título "Convert Faith to HEX 🪙"
   - Mensaje informativo sobre firma de wallet
   - Mejoras en UX

3. **`src/style.css`**
   - Estilos para `.modal-info` (cuadro informativo)
   - Estados disabled para botones
   - Animaciones de hover mejoradas

## 🔧 Flujo de Conversión

```
1. Usuario hace clic en icono 🪙 (token1-pill) en header
   ↓
2. Se abre modal mostrando:
   - Faith disponible
   - Tasa de conversión (100 Faith → 1 HEX)
   - Botón "Convert all"
   ↓
3. Usuario hace clic en "Convert all"
   ↓
4. Sistema verifica si OneWallet está conectada
   - Si NO → Conecta automáticamente
   - Si SÍ → Continúa
   ↓
5. Construye transacción Move:
   - Llama a hex_token::mint_from_faith
   - Parámetros: TreasuryHolder, Stats, faith_amount, conversion_rate, recipient
   ↓
6. OneWallet pide firma al usuario
   - Modal muestra: "✍️ Por favor firma la transacción en tu OneWallet"
   ↓
7. Transacción se ejecuta en OneChain
   - Modal muestra: "⏳ Ejecutando transacción en OneChain..."
   ↓
8. Sistema espera confirmación
   - Modal muestra: "🔄 Confirmando..."
   ↓
9. Éxito:
   - Faith se resta del juego
   - HEX tokens se acuñan on-chain y llegan a la wallet
   - Notificación: "✅ ¡X HEX tokens recibidos!"
   - Modal se cierra automáticamente después de 2s
```

## 🎮 Cómo Usar

### Para Jugadores

1. **Acumula Faith** jugando (generada por devotos en templos)
2. **Haz clic en el icono 🪙** en el header (token1-pill)
3. **Conecta OneWallet** si aún no está conectada
4. **Haz clic en "Convert all"**
5. **Firma la transacción** en OneWallet cuando aparezca el popup
6. **Espera confirmación** (5-10 segundos)
7. **¡Listo!** Tus HEX tokens están en tu wallet

### Para Desarrolladores

#### Instalar Dependencias

```bash
npm install @mysten/sui
```

#### Configurar Contratos

Los IDs de contratos ya están configurados en `src/config/contracts.ts`:

```typescript
ONECHAIN_PACKAGE_ID = "0xee46771b757523af06d19cff029366b81b6716715bea7bb58d0d5013b0e5c73d"
HEX_TOKEN.TREASURY_HOLDER = "0xa48be070305d5a94144ec13ef71733cbdd9fb2fca1352b492d51a66db28f03d5"
HEX_TOKEN.ECONOMY_STATS = "0xf57368221c63529dd792b205f82294b25919e4ef306ba98c4f49a5589d961b3f"
```

#### Llamar al Servicio

```typescript
import { convertFaithToHex } from './wallet/hexConversionService';

const result = await convertFaithToHex(
  faithAmount, 
  (status, message) => {
    // Actualizar UI con el estado
    console.log(status, message);
  }
);

if (result.success) {
  console.log(`Convertidos ${result.hexReceived} HEX`);
  console.log(`TX: ${result.transactionDigest}`);
}
```

## 🔍 Debugging

### Verificar Estado de Wallet

```typescript
import { isWalletConnected, getCurrentAccount } from './wallet/walletConfig';

if (isWalletConnected()) {
  const account = getCurrentAccount();
  console.log('Cuenta conectada:', account?.address);
}
```

### Ver Balance de HEX

```typescript
import { getHexBalance } from './wallet/hexConversionService';

const balance = await getHexBalance(address);
console.log('Balance HEX:', balance);
```

### Ver Estadísticas del Contrato

```typescript
import { getHexEconomyStats } from './wallet/hexConversionService';

const stats = await getHexEconomyStats();
console.log('Total acuñado:', stats?.totalMinted);
console.log('Total quemado:', stats?.totalBurned);
console.log('Circulante:', stats?.circulatingSupply);
```

## 📊 Contrato Move

### Función Principal: `mint_from_faith`

```move
public entry fun mint_from_faith(
    holder: &mut TreasuryCapHolder,
    stats: &mut EconomyStats,
    faith_amount: u64,
    conversion_rate: u64,
    recipient: address,
    ctx: &mut TxContext
)
```

**Parámetros:**
- `holder`: Objeto compartido que contiene el TreasuryCap
- `stats`: Objeto compartido con estadísticas de economía
- `faith_amount`: Cantidad de Faith a convertir
- `conversion_rate`: Tasa (100 = 100 Faith por 1 HEX)
- `recipient`: Dirección que recibirá los HEX tokens

**Eventos Emitidos:**
```move
public struct FaithConverted has copy, drop {
    player: address,
    faith_amount: u64,
    hex_minted: u64,
}
```

## 🚨 Manejo de Errores

### Errores Comunes

1. **"Wallet no conectada"**
   - Solución: Instalar OneWallet extension
   - El código intenta conectar automáticamente

2. **"No hay Faith disponible"**
   - Solución: Acumular Faith jugando (templos + devotos)

3. **"Necesitas al menos 100 Faith"**
   - Solución: La conversión requiere mínimo 100 Faith

4. **"La transacción falló"**
   - Posibles causas:
     - Cuenta no autorizada como minter
     - Objetos compartidos incorrectos
     - Red no disponible

### Logs de Consola

```
✅ Connected to OneWallet: 0xc8e2...88ae
🏗️ Building transaction...
✍️ Waiting for signature...
⏳ Executing on OneChain...
🔄 Confirming...
✅ Success! TX: 0xabcd1234...
```

## 🔐 Seguridad

- ✅ Solo el backend autorizado puede mintear HEX
- ✅ Usuario debe firmar cada transacción
- ✅ Validación de Faith antes de conversión
- ✅ Transacciones registradas on-chain
- ✅ Eventos auditables (FaithConverted)

## 🌐 Links Útiles

- **OneChain Explorer:** https://onescan.cc/testnet
- **Package ID:** https://onescan.cc/testnet/object/0xee46771b757523af06d19cff029366b81b6716715bea7bb58d0d5013b0e5c73d
- **OneWallet:** https://wallet.onelab.cc/

## 📝 Próximos Pasos

- [ ] Integrar THERON token (conversión HEX → THERON)
- [ ] Sistema de compra de Lands NFT con THERON
- [ ] Marketplace de items con THERON
- [ ] Visualizar balance de HEX/THERON en header
- [ ] Historial de transacciones on-chain
