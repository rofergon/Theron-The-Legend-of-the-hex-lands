/**
 * OneWallet Configuration for OneChain Blockchain
 *
 * Official integration with OneWallet using Wallet Standard
 * OneChain is a Sui-based blockchain with its own OCT token
 *
 * Resources:
 * - OneChain SDK: @onelabs/sui
 * - Wallet Standard: @mysten/wallet-standard
 * - Docs: https://docs.onelabs.cc/DevelopmentDocument
 */

import type { Wallet, WalletAccount } from '@mysten/wallet-standard';
import { findOneWallet, isOneWalletInstalled, diagnoseOneWallet } from './onewalletDetector';
import { onechainClient, getOctBalance, formatAddress, type OneChainNetwork } from './onechainClient';

// Global wallet state
let currentWallet: Wallet | null = null;
let currentAccount: WalletAccount | null = null;
let currentNetwork: OneChainNetwork = 'testnet';
let isConnected = false;

/**
 * Account type extended with balance
 */
export interface OneWalletAccountInfo {
  name?: string;
  address: string;
  publicKey: Uint8Array;
  chains: readonly string[];
  features: readonly string[];
  balance?: number; // Balance in OCT
}

/**
 * Connection result
 */
export interface ConnectionResult {
  success: boolean;
  account?: OneWalletAccountInfo;
  error?: string;
}

/**
 * Checks if OneWallet is installed
 */
export { isOneWalletInstalled, diagnoseOneWallet };

// Ejecutar diagnóstico al cargar (solo en desarrollo)
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  setTimeout(() => diagnoseOneWallet(), 1000);
}

/**
 * Gets the current wallet instance (not connected)
 */
export function getWalletInstance(): Wallet | null {
  if (!currentWallet) {
    currentWallet = findOneWallet();
  }
  return currentWallet;
}

/**
 * Connects to OneWallet using Wallet Standard
 * This is the main method to authenticate users
 */
export async function connectOneWallet(): Promise<ConnectionResult> {
  try {
    console.log('🔌 Intentando conectar OneWallet...');
    
    // 1. Detect OneWallet
    const wallet = getWalletInstance();
    
    if (!wallet) {
      return {
        success: false,
        error: 'OneWallet no está instalada o no se detectó correctamente.\n\n' +
               'Por favor:\n' +
               '1. Instala OneWallet desde https://wallet.onelab.cc/\n' +
               '2. Reinicia el navegador\n' +
               '3. Recarga esta página',
      };
    }

    console.log('✅ OneWallet detectada:', wallet.name);
    console.log('📡 Chains soportadas por wallet:', wallet.chains);

    // CRÍTICO: Verificar que la wallet soporte testnet
    if (!wallet.chains.includes('sui:testnet')) {
      return {
        success: false,
        error: '⚠️ OneWallet no está configurada para Testnet.\n\n' +
               'DEBES CAMBIAR A TESTNET:\n' +
               '1. Abre OneWallet\n' +
               '2. Haz clic en el selector de red (arriba)\n' +
               '3. Selecciona "Testnet" (NO Mainnet)\n' +
               '4. Recarga esta página',
      };
    }

    // 2. Get connect feature
    const connectFeature = wallet.features['standard:connect'] as any;
    
    if (!connectFeature) {
      return {
        success: false,
        error: 'OneWallet no soporta standard:connect',
      };
    }

    // 3. Connect if no accounts authorized
    if (wallet.accounts.length === 0) {
      console.log('🔐 Solicitando autorización al usuario...');
      
      // Intentar especificar testnet en el connect
      // Algunos wallets aceptan chains en el connect, otros solo usan la chain activa
      try {
        await connectFeature.connect({ chains: ['sui:testnet'] });
      } catch (error) {
        // Si no acepta el parámetro chains, intentar sin él
        console.log('⚠️ Connect con chains falló, intentando sin parámetros');
        await connectFeature.connect();
      }
    } else {
      console.log('✅ Ya hay cuentas autorizadas');
    }

    // 4. Get the first account
    const account = wallet.accounts[0];
    
    if (!account) {
      return {
        success: false,
        error: 'No hay cuentas autorizadas en OneWallet',
      };
    }

    console.log('📋 Cuenta obtenida:', account.address);
    console.log('📡 Chains de la cuenta:', account.chains);
    
    // CRÍTICO: Verificar que la cuenta esté autorizada en testnet
    if (!account.chains.includes('sui:testnet')) {
      return {
        success: false,
        error: '⚠️ ERROR: Cuenta autorizada solo en ' + account.chains.join(', ') + '\n\n' +
               'Tu OneWallet está en MAINNET pero el contrato está en TESTNET.\n\n' +
               'SOLUCIÓN:\n' +
               '1. Abre OneWallet\n' +
               '2. Haz clic en el selector de red (parte superior)\n' +
               '3. Selecciona "Testnet" (NO Mainnet)\n' +
               '4. IMPORTANTE: Desconecta y vuelve a conectar la wallet en esta página\n' +
               '5. Recarga la página si es necesario\n\n' +
               '⚠️ NO uses Mainnet con contratos de Testnet.',
      };
    }

    // 5. Save state
    currentWallet = wallet;
    currentAccount = account;
    isConnected = true;

    // 6. Get OCT balance
    let balance: number | undefined;
    try {
      balance = await getOctBalance(account.address);
    } catch (error) {
      console.warn('⚠️ Could not get balance:', error);
      balance = 0;
    }

    const accountInfo: OneWalletAccountInfo = {
      address: account.address,
      publicKey: new Uint8Array(account.publicKey),
      chains: account.chains,
      features: account.features,
      balance,
    };

    console.log('✅ Connected to OneWallet:', formatAddress(account.address));
    
    // 7. Suscribirse a eventos de cambio de red
    const eventsFeature = wallet.features['standard:events'] as any;
    if (eventsFeature && eventsFeature.on) {
      eventsFeature.on('change', (event: any) => {
        console.log('🔄 Wallet event:', event);
        
        // Si cambió la chain, alertar al usuario
        if (event.chains && event.chains.length > 0) {
          console.log('⚠️ Red cambiada:', event.chains);
          alert('⚠️ CAMBIO DE RED DETECTADO\n\nOneWallet cambió de red.\nRecarga la página para actualizar la conexión.');
        }
        
        // Si cambió la cuenta, alertar
        if (event.accounts && event.accounts.length > 0) {
          console.log('⚠️ Cuenta cambiada:', event.accounts);
          alert('⚠️ CAMBIO DE CUENTA DETECTADO\n\nOneWallet cambió de cuenta.\nRecarga la página para actualizar la conexión.');
        }
      });
      console.log('✅ Suscrito a eventos de wallet');
    }
    
    return {
      success: true,
      account: accountInfo,
    };

  } catch (error: any) {
    console.error('❌ Error connecting to OneWallet:', error);
    
    // Clear state in case of error
    currentWallet = null;
    currentAccount = null;
    isConnected = false;

    return {
      success: false,
      error: error?.message || 'Unknown error while connecting',
    };
  }
}

/**
 * Disconnects the wallet
 */
export async function disconnectOneWallet(): Promise<void> {
  if (!currentWallet) {
    return;
  }

  try {
    const disconnectFeature = (currentWallet.features as any)['standard:disconnect'];
    
    if (disconnectFeature) {
      await disconnectFeature.disconnect();
      console.log('✅ Disconnected from OneWallet');
    }
  } catch (error) {
    console.error('❌ Error disconnecting:', error);
  } finally {
    // Always clear state
    currentWallet = null;
    currentAccount = null;
    isConnected = false;
  }
}

/**
 * Gets the currently connected account
 */
export function getCurrentAccount(): WalletAccount | null {
  return currentAccount;
}

/**
 * Gets full account info with updated balance
 */
export async function getCurrentAccountInfo(): Promise<OneWalletAccountInfo | null> {
  if (!currentAccount || !currentAccount.address) {
    return null;
  }

  try {
    const balance = await getOctBalance(currentAccount.address);
    
    return {
      address: currentAccount.address,
      publicKey: new Uint8Array(0),
      chains: ['sui:testnet'],
      features: ['signAndExecuteTransactionBlock'],
      balance,
    };
  } catch (error) {
    console.error('❌ Error getting account info:', error);
    return null;
  }
}

/**
 * Checks if a wallet is connected
 */
export function isWalletConnected(): boolean {
  return isConnected && currentAccount !== null;
}

/**
 * Gets the current network
 */
export function getCurrentNetwork(): OneChainNetwork {
  return currentNetwork;
}

/**
 * Changes the current network (local only, user must change it in the extension)
 */
export function setNetwork(network: OneChainNetwork): void {
  currentNetwork = network;
  console.log(`🌐 Network changed to: ${network}`);
}

/**
 * Gets the balance of the current account
 */
export async function getBalance(): Promise<number> {
  if (!currentAccount) {
    throw new Error('No account connected');
  }

  return await getOctBalance(currentAccount.address);
}

/**
 * Signs a message with the current account (not implemented for OneWallet native)
 */
export async function signMessage(message: string): Promise<any> {
  if (!isWalletConnected() || !currentWallet) {
    throw new Error('No wallet connected');
  }

  throw new Error('Message signing not implemented for OneWallet native API');
}

/**
 * Hook to listen for account changes
 * Simplified for OneWallet using Wallet Standard events
 */
export function onAccountChanged(
  callback: (account: WalletAccount | null) => void
): () => void {
  const checkInterval = setInterval(async () => {
    if (!isConnected || !currentWallet) {
      return;
    }

    try {
      // Check if accounts changed
      const currentAccounts = currentWallet.accounts;
      
      if (currentAccounts.length === 0) {
        // User disconnected
        currentAccount = null;
        isConnected = false;
        callback(null);
        return;
      }

      const newAccount = currentAccounts[0];
      
      if (newAccount && newAccount.address !== currentAccount?.address) {
        // User switched account
        currentAccount = newAccount;
        callback(newAccount);
      }
    } catch (error) {
      console.error('Error checking for account changes:', error);
    }
  }, 2000);

  // Function to stop polling
  return () => clearInterval(checkInterval);
}

// Compatibility functions with previous code
export function openWalletModal() {
  if (!isOneWalletInstalled()) {
    alert(
      'OneWallet is not installed.\n\n' +
      'Please install the extension from:\n' +
      'https://chrome.google.com/webstore/detail/harmony-one-wallet/fnnegphlobjdpkhecapkijjdkgcjhkib'
    );
    return;
  }
  connectOneWallet().catch(console.error);
}

export function closeWalletModal() {
  disconnectOneWallet().catch(console.error);
}

export function openNetworkModal() {
  alert(
    'To change network, open the OneWallet extension\n' +
    'and select the desired network (Mainnet, Testnet or Localnet)'
  );
}
