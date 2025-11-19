import { createAppKit } from '@reown/appkit';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { baseSepolia } from '@reown/appkit/networks';

// Configuración de Base Sepolia Testnet
// Chain ID: 84532
// RPC: https://sepolia.base.org
// Explorer: https://sepolia-explorer.base.org

// 1. Obtén tu Project ID en https://dashboard.reown.com
const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || 'YOUR_PROJECT_ID';

// 2. Configura las redes (Base Sepolia Testnet)
export const networks = [baseSepolia];

// 3. Configurar el adaptador Wagmi
const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks
});

// 4. Configurar los metadatos de la aplicación
const metadata = {
  name: 'Sanabria Tribe',
  description: 'Strategy game with blockchain integration',
  url: 'https://yourdomain.com', // Reemplaza con tu dominio
  icons: ['https://yourdomain.com/icon.png'] // Reemplaza con tu ícono
};

// 5. Crear el modal de AppKit
export const modal = createAppKit({
  adapters: [wagmiAdapter],
  networks: [baseSepolia],
  metadata,
  projectId,
  features: {
    analytics: true, // Opcional - habilita análisis
    email: false, // Opcional - habilita login con email
    socials: false // Opcional - habilita login con redes sociales
  }
});

// 6. Exportar la configuración de wagmi para interacciones con contratos
export const wagmiConfig = wagmiAdapter.wagmiConfig;

// 7. Funciones helper para el juego
export function openWalletModal() {
  modal.open();
}

export function openNetworkModal() {
  modal.open({ view: 'Networks' });
}

export function closeWalletModal() {
  modal.close();
}
