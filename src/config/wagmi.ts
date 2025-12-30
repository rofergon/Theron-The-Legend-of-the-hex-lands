
import { createAppKit } from '@reown/appkit'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { baseSepolia } from '@reown/appkit/networks'
import { cookieStorage, createStorage } from 'wagmi'

// Env vars might not be typed
export const projectId = import.meta.env.VITE_REOWN_PROJECT_ID

if (!projectId) {
    throw new Error('VITE_REOWN_PROJECT_ID is not set in .env file')
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
