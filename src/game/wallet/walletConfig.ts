/**
 * OneWallet Configuration for OneChain Blockchain
 * 
 * Integración oficial con OneWallet usando Wallet Standard
 * OneChain es una blockchain basada en Sui con su propio token OCT
 * 
 * Recursos:
 * - OneChain SDK: @onelabs/sui
 * - Wallet Standard: @mysten/wallet-standard
 * - Docs: https://docs.onelabs.cc/DevelopmentDocument
 */

import type { Wallet, WalletAccount } from '@mysten/wallet-standard';
import { findOneWallet, isOneWalletInstalled } from './onewalletDetector';
import { onechainClient, getOctBalance, formatAddress, type OneChainNetwork } from './onechainClient';

// Estado global de la wallet
let currentWallet: Wallet | null = null;
let currentAccount: WalletAccount | null = null;
let currentNetwork: OneChainNetwork = 'testnet';
let isConnected = false;

/**
 * Tipo de cuenta extendido con balance
 */
export interface OneWalletAccountInfo {
  name?: string;
  address: string;
  publicKey: Uint8Array;
  chains: readonly string[];
  features: readonly string[];
  balance?: number; // Balance en OCT
}

/**
 * Resultado de la conexión
 */
export interface ConnectionResult {
  success: boolean;
  account?: OneWalletAccountInfo;
  error?: string;
}

/**
 * Verifica si OneWallet está instalada
 */
export { isOneWalletInstalled };

/**
 * Obtiene la wallet actual (sin conectar)
 */
export function getWalletInstance(): Wallet | null {
  if (!currentWallet) {
    currentWallet = findOneWallet();
  }
  return currentWallet;
}

/**
 * Conecta con OneWallet usando el Wallet Standard
 * Este es el método principal para autenticar usuarios
 */
export async function connectOneWallet(): Promise<ConnectionResult> {
  try {
    // 1. Detectar OneWallet
    const wallet = getWalletInstance();
    
    if (!wallet) {
      return {
        success: false,
        error: 'OneWallet no está instalada. Instálala desde la Chrome Web Store.',
      };
    }

    // 2. Conectar usando standard:connect
    // Si ya hay cuentas autorizadas, no hace falta volver a pedir permiso
    if (wallet.accounts.length === 0) {
      const connectFeature = (wallet.features as any)['standard:connect'];
      
      if (!connectFeature) {
        return {
          success: false,
          error: 'OneWallet no soporta standard:connect',
        };
      }

      // Solicitar autorización al usuario
      await connectFeature.connect();
    }

    // 3. Obtener la primera cuenta autorizada
    const account = wallet.accounts[0];
    
    if (!account) {
      return {
        success: false,
        error: 'No hay cuentas autorizadas en OneWallet',
      };
    }

    // 4. Guardar estado
    currentWallet = wallet;
    currentAccount = account;
    isConnected = true;

    // 5. Obtener balance de OCT
    let balance: number | undefined;
    try {
      balance = await getOctBalance(account.address);
    } catch (error) {
      console.warn('⚠️ No se pudo obtener el balance:', error);
      balance = 0;
    }

    const accountInfo: OneWalletAccountInfo = {
      address: account.address,
      publicKey: new Uint8Array(account.publicKey),
      chains: account.chains,
      features: account.features,
      balance,
    };

    console.log('✅ Conectado a OneWallet:', formatAddress(account.address));
    
    return {
      success: true,
      account: accountInfo,
    };

  } catch (error: any) {
    console.error('❌ Error al conectar con OneWallet:', error);
    
    // Limpiar estado en caso de error
    currentWallet = null;
    currentAccount = null;
    isConnected = false;

    return {
      success: false,
      error: error?.message || 'Error desconocido al conectar',
    };
  }
}

/**
 * Desconecta la wallet (revoca autorización)
 */
export async function disconnectOneWallet(): Promise<void> {
  if (!currentWallet) {
    return;
  }

  try {
    const disconnectFeature = (currentWallet.features as any)['standard:disconnect'];
    
    if (disconnectFeature) {
      await disconnectFeature.disconnect();
      console.log('✅ Desconectado de OneWallet');
    } else {
      console.warn('⚠️ OneWallet no soporta standard:disconnect');
    }
  } catch (error) {
    console.error('❌ Error al desconectar:', error);
  } finally {
    // Limpiar estado siempre
    currentWallet = null;
    currentAccount = null;
    isConnected = false;
  }
}

/**
 * Obtiene la cuenta actual conectada
 */
export function getCurrentAccount(): WalletAccount | null {
  return currentAccount;
}

/**
 * Obtiene información completa de la cuenta con balance actualizado
 */
export async function getCurrentAccountInfo(): Promise<OneWalletAccountInfo | null> {
  if (!currentAccount) {
    return null;
  }

  try {
    const balance = await getOctBalance(currentAccount.address);
    
    return {
      address: currentAccount.address,
      publicKey: new Uint8Array(currentAccount.publicKey),
      chains: currentAccount.chains,
      features: currentAccount.features,
      balance,
    };
  } catch (error) {
    console.error('❌ Error al obtener info de cuenta:', error);
    return null;
  }
}

/**
 * Verifica si hay una wallet conectada
 */
export function isWalletConnected(): boolean {
  return isConnected && currentAccount !== null;
}

/**
 * Obtiene la red actual
 */
export function getCurrentNetwork(): OneChainNetwork {
  return currentNetwork;
}

/**
 * Cambia la red actual (solo local, el usuario debe cambiarla en la extensión)
 */
export function setNetwork(network: OneChainNetwork): void {
  currentNetwork = network;
  console.log(`🌐 Red cambiada a: ${network}`);
}

/**
 * Obtiene el balance de la cuenta actual
 */
export async function getBalance(): Promise<number> {
  if (!currentAccount) {
    throw new Error('No hay cuenta conectada');
  }

  return await getOctBalance(currentAccount.address);
}

/**
 * Firma un mensaje con la cuenta actual
 * Usa la característica standard:signMessage del Wallet Standard
 */
export async function signMessage(message: string): Promise<any> {
  if (!isWalletConnected() || !currentWallet) {
    throw new Error('No hay billetera conectada');
  }

  try {
    const signFeature = (currentWallet.features as any)['standard:signMessage'];
    
    if (!signFeature) {
      throw new Error('OneWallet no soporta firma de mensajes');
    }

    const encoder = new TextEncoder();
    const messageBytes = encoder.encode(message);

    const signature = await signFeature.signMessage({
      message: messageBytes,
      account: currentAccount!,
    });

    return signature;
  } catch (error) {
    console.error('❌ Error al firmar mensaje:', error);
    throw error;
  }
}

/**
 * Hook para escuchar cambios de cuenta
 * Polling cada 2 segundos para detectar cambios
 */
export function onAccountChanged(
  callback: (account: WalletAccount | null) => void
): () => void {
  const checkInterval = setInterval(async () => {
    if (!isConnected || !currentWallet) {
      return;
    }

    try {
      // Verificar si la cuenta sigue siendo la misma
      const accounts = currentWallet.accounts;
      
      if (accounts.length === 0) {
        // Usuario desconectó desde la extensión
        currentAccount = null;
        isConnected = false;
        callback(null);
        return;
      }

      const newAccount = accounts[0];
      
      if (newAccount && newAccount.address !== currentAccount?.address) {
        // Usuario cambió de cuenta
        currentAccount = newAccount;
        callback(newAccount);
      }
    } catch (error) {
      console.error('Error al verificar cambios de cuenta:', error);
    }
  }, 2000);

  // Función para detener el polling
  return () => clearInterval(checkInterval);
}

// Funciones de compatibilidad con el código anterior
export function openWalletModal() {
  if (!isOneWalletInstalled()) {
    alert(
      'OneWallet no está instalado.\n\n' +
      'Por favor instala la extensión desde:\n' +
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
    'Para cambiar de red, abre la extensión OneWallet\n' +
    'y selecciona la red deseada (Mainnet, Testnet o Localnet)'
  );
}
