# 🎮 Theron Game Contracts - OneChain Testnet

Smart contracts for the Theron game written in Move, deployed on OneChain Testnet.

## 📦 Included Contracts

- **hex_token.move** - Weak and inflationary token (HEX) for daily economy
- **theron_token.move** - Premium token with limited supply (1M THERON)
- **land_nft.move** - Land NFTs with 6 biomes and 4 rarity levels
- **store.move** - Marketplace to purchase lands and chests with THERON

## ✅ Current Status

**CONTRACTS DEPLOYED ON ONECHAIN TESTNET**

- **Package ID**: `0xee46771b757523af06d19cff029366b81b6716715bea7bb58d0d5013b0e5c73d`
- **Network**: OneChain Testnet
- **RPC**: https://rpc-testnet.onelabs.cc:443
- **Explorer**: https://onescan.cc/testnet/object/0xee46771b757523af06d19cff029366b81b6716715bea7bb58d0d5013b0e5c73d

See `DEPLOYMENT_SUCCESS.md` for all object IDs and integration examples.

---

## 🚀 How to Deploy (If you need to redeploy)

### Prerequisites

1. **WSL Ubuntu** installed (to compile on Windows)
2. **Sui CLI** installed in WSL
3. **Wallet with funds** on OneChain Testnet (minimum 0.1 OCT)
4. **Node.js 18+** installed

### Step 1: Compile Contracts in WSL

Open WSL and run:

```bash
# Go to project directory
cd /mnt/c/Users/YOUR_USER/carpeta\ con\ juan/Deploy_Contracst

# Compile Move contracts
sui move build
```

This will generate the `build/` directory with compiled modules.

### Step 2: Configure Environment Variables

Create a `.env` file with your private key:

```env
ONECHAIN_PRIVATE_KEY=suiprivkey1...
```

**⚠️ IMPORTANT**: 
- Never share your `.env` or upload it to Git
- The `.env` file is already in `.gitignore`

### Step 3: Deploy with Node.js

In PowerShell:

```powershell
# Go to directory
cd "c:\Users\YOUR_USER\carpeta con juan\Deploy_Contracst"

# Install dependencies (first time only)
npm install

# Run deployment
npm run deploy
```

### What does the deployment script do?

The `deploy-sdk.mjs` script automatically executes:

1. ✅ Verifies that contracts are compiled
2. 📦 Reads compiled modules from `build/theron_game_contracts/bytecode-modules.json`
3. 🔑 Loads your wallet from `.env`
4. 🚀 Deploys contracts to OneChain Testnet
5. 💾 Saves all IDs in `.env`
6. 📋 Shows complete summary with:
   - Package ID
   - Treasury IDs (HEX, THERON)
   - Stats IDs
   - MintCap and Registry IDs (Land NFT)
   - StoreConfig ID
   - Explorer link

### Expected Result

```
╔═══════════════════════════════════════════════════════╗
║           ✅ CONTRACTS DEPLOYED ✅                     ║
╚═══════════════════════════════════════════════════════╝

📦 Package ID: 0x...

🎯 Created objects:
   - HEX Treasury: 0x...
   - THERON Treasury: 0x...
   - Land MintCap: 0x...
   - Store Config: 0x...
   [...]

🌐 Explorer: https://onescan.cc/testnet/object/0x...
```

---

## 📁 Project Structure

```
Deploy_Contracst/
├── sources/              # ← Move source code
│   ├── hex_token.move
│   ├── theron_token.move
│   ├── land_nft.move
│   └── store.move
├── build/               # ← Compiled contracts (auto-generated)
├── deploy-sdk.mjs       # ← Deployment script
├── package.json         # ← npm configuration
├── .env                 # ← Your private key (DO NOT UPLOAD TO GIT)
├── .gitignore           # ← Protects .env
├── Move.toml            # ← Move project config
├── DEPLOYMENT_SUCCESS.md # ← Full deployment info
└── INTEGRATION.md       # ← Frontend integration examples
```

---

## 🔧 Troubleshooting

### ❌ Error: "Cannot find build directory"

**Solution**: Compile contracts first in WSL:
```bash
cd /mnt/c/Users/YOUR_USER/carpeta\ con\ juan/Deploy_Contracst
sui move build
```

### ❌ Error: "Insufficient gas"

**Solution**: Your wallet needs more OCT. Check your balance:
```powershell
npm run balance
```

If you need funds, request them from the OneChain Testnet faucet.

### ❌ Error: "Network error" or "Connection refused"

**Solution**: Verify that the OneChain RPC is available:
```
https://rpc-testnet.onelabs.cc:443
```

Try pinging or check in the explorer if the network is active.

### ❌ Error: "Invalid private key"

**Solution**: Verify that your `.env` has the correct format:
```env
ONECHAIN_PRIVATE_KEY=suiprivkey1qzr...
```

---

## 📚 Additional Documentation

- **DEPLOYMENT_SUCCESS.md** - Complete details of current deployment with all IDs
- **INTEGRATION.md** - Integration examples with TypeScript frontend
- `.env` - Environment variables with contract IDs (generated after deployment)

---

## 🌐 Useful Resources

- [OneChain Documentation](https://docs.onechain.io)
- [OneScan Explorer](https://onescan.cc/testnet)
- [Sui Move Book](https://move-language.github.io/move/)

---

**Developed for Theron Game 🎮**
