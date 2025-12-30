
import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { baseSepolia } from '@reown/appkit/networks'
import { cookieStorage, createStorage } from 'wagmi'

// Env vars might not be typed
export const projectId = import.meta.env.VITE_PROJECT_ID || 'b56e18d47c72db2833830491d923761a' // Fallback to a placeholder if not set

if (!projectId) {
    throw new Error('Project ID is not defined')
}

import type { AppKitNetwork } from '@reown/appkit/networks'

export const networks = [baseSepolia] as [AppKitNetwork, ...AppKitNetwork[]]

export const wagmiAdapter = new WagmiAdapter({
    storage: createStorage({
        storage: cookieStorage
    }),
    ssr: true,
    projectId,
    networks
})

export const config = wagmiAdapter.wagmiConfig

export const appKit = createAppKit({
    adapters: [wagmiAdapter],
    networks,
    projectId,
    features: {
        analytics: true
    }
})
