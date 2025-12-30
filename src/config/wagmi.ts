
import { createAppKit } from '@reown/appkit'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { baseSepolia } from '@reown/appkit/networks'

// Env vars might not be typed
export const projectId = import.meta.env.VITE_REOWN_PROJECT_ID

if (!projectId) {
    throw new Error('VITE_REOWN_PROJECT_ID is not set in .env file')
}

import type { AppKitNetwork } from '@reown/appkit/networks'

export const networks = [baseSepolia] as [AppKitNetwork, ...AppKitNetwork[]]

// Metadata for the app
const metadata = {
    name: 'Theron: Legends of the Hex Lands',
    description: 'A blockchain-powered strategy game',
    url: typeof window !== 'undefined' ? window.location.origin : 'https://theron.game',
    icons: ['/assets/Landing/Theron_game_logo.png']
}

export const wagmiAdapter = new WagmiAdapter({
    projectId,
    networks
})

export const config = wagmiAdapter.wagmiConfig

export const appKit = createAppKit({
    adapters: [wagmiAdapter],
    networks,
    projectId,
    metadata,
    // Featured wallets - MetaMask and Coinbase Wallet IDs from WalletConnect registry
    featuredWalletIds: [
        'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
        'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa', // Coinbase Wallet
    ],
    features: {
        analytics: true,
        // Prioritize wallet connections
        connectMethodsOrder: ['wallet', 'email', 'social']
    }
})
