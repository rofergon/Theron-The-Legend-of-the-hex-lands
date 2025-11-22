# OneWallet Integration - OneChain Blockchain

This module handles the integration with **OneWallet** to interact with **OneChain**, a Sui-based blockchain with its own OCT token.

## 🔗 What are OneChain and OneWallet?

**OneChain** is a high-performance blockchain based on Sui architecture, with its native token **OCT**.

**OneWallet** is the official browser extension to interact with OneChain, compatible with the **Wallet Standard**.

## 📚 Official Documentation

- **OneChain Docs**: https://docs.onelabs.cc/DevelopmentDocument
- **OneChain TypeScript SDK**: `@onelabs/sui`
- **Wallet Standard**: `@mysten/wallet-standard`

## 📦 OneWallet Installation

1. Download the OneWallet extension for your browser
2. Create a new wallet or import an existing one
3. Switch to **Testnet** in the extension for development

## 🌐 Available OneChain Networks

### Testnet (Recommended for development)
- **Network**: testnet
- **Token**: OCT
- **SDK**: `getFullnodeUrl('testnet')`

### Mainnet (Production)
- **Network**: mainnet  
- **Token**: OCT
- **SDK**: `getFullnodeUrl('mainnet')`

### Devnet (Development)
- **Network**: devnet
- **Token**: OCT
- **SDK**: `getFullnodeUrl('devnet')`

## 🚀 Usage in the Game

### Connect Wallet

```typescript
import { 
  connectOneWallet, 
  isOneWalletInstalled 
} from './walletConfig';

// Check if OneWallet is installed
if (!isOneWalletInstalled()) {
  console.error('OneWallet is not installed');
  return;
}

// Connect using Wallet Standard
const result = await connectOneWallet();

if (result.success && result.account) {
  console.log('Connected:', result.account.address);
  console.log('Balance:', result.account.balance, 'OCT');
} else {
  console.error('Error:', result.error);
}
```

### Disconnect

```typescript
import { disconnectOneWallet } from './walletConfig';

await disconnectOneWallet();
```

### Check Connection Status

```typescript
import { 
  isWalletConnected, 
  getCurrentAccount,
  getCurrentAccountInfo 
} from './walletConfig';

if (isWalletConnected()) {
  const account = getCurrentAccount();
  console.log('Address:', account?.address);
  
  // Get complete info with updated balance
  const info = await getCurrentAccountInfo();
  console.log('Current balance:', info?.balance, 'OCT');
}
```

### Get Balance

```typescript
import { getBalance } from './walletConfig';

const balance = await getBalance();
console.log(`Balance: ${balance} OCT`);
```

### Sign Messages

```typescript
import { signMessage } from './walletConfig';

try {
  const signature = await signMessage('Message to sign');
  console.log('Signature:', signature);
} catch (error) {
  console.error('User rejected the signature');
}
```

### Listen to Account Changes

```typescript
import { onAccountChanged } from './walletConfig';

const unsubscribe = onAccountChanged((account) => {
  if (account) {
    console.log('Account changed:', account.address);
  } else {
    console.log('Session closed');
  }
});

// Stop listening
unsubscribe();
```

## 🎮 Game Integration

The wallet button in the HUD allows:
- **Connect/Disconnect** OneWallet
- View the connected **address** (abbreviated format)
- View the **OCT balance** in the tooltip

## 🏗️ Code Architecture

### `onewalletDetector.ts`
Detects OneWallet using the **Wallet Standard**:
- `findOneWallet()` - Searches for the wallet among available ones
- `isOneWalletInstalled()` - Checks if it's installed
- `getAllWallets()` - Lists all compatible wallets

### `onechainClient.ts`
Client to interact with the blockchain:
- `SuiClient` - Client configured for testnet
- `mistToOct()` / `octToMist()` - Unit conversion
- `getOctBalance()` - Gets balance of an address
- `formatAddress()` - Formats addresses for display

### `walletConfig.ts`
Main API for the application:
- `connectOneWallet()` - Connects using standard:connect
- `disconnectOneWallet()` - Disconnects using standard:disconnect
- `getCurrentAccountInfo()` - Complete info with balance
- `signMessage()` - Signs using standard:signMessage
- `onAccountChanged()` - Polling to detect changes

## 🔧 Differences with Previous Systems

This implementation uses **OneChain** (based on Sui), not Harmony:

1. **SDK**: `@onelabs/sui` instead of @harmony-js
2. **Wallet Standard**: Official implementation with `@mysten/wallet-standard`
3. **Address format**: Sui addresses (long hex hash)
4. **Units**: MIST → OCT (1 OCT = 10^9 MIST)
5. **Connection**: `standard:connect` from Wallet Standard
6. **Signature**: `standard:signMessage` from Wallet Standard
7. **Client**: `SuiClient` from @onelabs/sui

## 📚 Additional Resources

- **OneChain Docs**: https://docs.onelabs.cc/DevelopmentDocument
- **OneChain TypeScript SDK**: Docs en npm `@onelabs/sui`
- **Wallet Standard**: https://github.com/wallet-standard/wallet-standard
- **Sui Docs**: https://docs.sui.io (arquitectura base)

## ⚠️ Important Notes

1. **OneWallet** must be installed and configured in the browser
2. **Testnet** is the recommended network for development
3. The extension must be on the same network as your client
4. Network changes must be done manually in OneWallet
5. Balance is queried directly from the node using `SuiClient`

## 🐛 Troubleshooting

### Error: "OneWallet is not installed"
- Verify that the extension is installed and enabled
- Reload the page after installing
- Make sure you're using a compatible browser (Chrome, Brave, Edge)

### Error: "OneWallet does not support standard:connect"
- Update OneWallet to the latest version
- Verify that the extension is compatible with Wallet Standard
- Check OneChain documentation for the correct extension

### Balance not showing
- Make sure you're on the correct network (testnet)
- Verify that the address is valid
- Check the console for network errors
- The wallet must have funds on that network

### Connection error
- OneWallet must be unlocked (enter your PIN if necessary)
- Accept the OneWallet authorization popup
- Reload the page if the popup doesn't appear
- Verify that no other dApps are blocking the connection

### TypeScript Types
If you see type errors related to Wallet Standard:
```bash
npm install --save-dev @mysten/wallet-standard
```

## 🔐 Security

- **Never** share your mnemonic phrase or private key
- **Verify** the site URL before connecting your wallet
- **Testnet** first: always test on testnet before mainnet
- **Review** transactions before signing them
- **Disconnect** your wallet when not in use

## 🚀 Next Steps

To implement transactions on OneChain:

1. Import `Transaction` from `@onelabs/sui/transactions`
2. Build the transaction with SDK methods
3. Use `standard:signAndExecuteTransaction` from Wallet Standard
4. Process the transaction result

Basic example:
```typescript
import { Transaction } from '@onelabs/sui/transactions';

// Build transaction
const tx = new Transaction();
tx.transferObjects([...], address);

// Sign and execute
const signFeature = (wallet.features as any)['standard:signAndExecuteTransaction'];
const result = await signFeature.signAndExecuteTransaction({
  transaction: tx,
  account: currentAccount,
});
```

Consult the official OneChain documentation for more details on transactions.