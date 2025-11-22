/**
 * OneWallet Detector - Wallet Standard Implementation
 * 
 * Detecta y maneja la conexión con OneWallet usando el estándar oficial
 * de wallets compatible con Sui/OneChain
 */

import { getWallets } from '@mysten/wallet-standard';
import type { Wallet } from '@mysten/wallet-standard';

/**
 * Busca OneWallet entre las wallets disponibles en el navegador
 * que cumplen con el Wallet Standard
 * 
 * @returns La instancia de OneWallet o null si no está instalada
 */
export function findOneWallet(): Wallet | null {
  const wallets = getWallets().get(); // Lista de wallets compatibles con Wallet Standard
  
  // Debug: ver qué wallets están disponibles
  if (wallets.length > 0) {
    console.log('Wallets detectadas:', wallets.map(w => w.name));
  }
  
  // Buscar OneWallet por nombre (ajustar según el nombre real en runtime)
  const oneWallet = wallets.find((w) =>
    w.name.toLowerCase().includes('onewallet') ||
    w.name.toLowerCase().includes('one wallet') ||
    w.name.toLowerCase().includes('onechain')
  );
  
  if (oneWallet) {
    console.log('✅ OneWallet detectada:', oneWallet.name, oneWallet.version);
  } else {
    console.warn('⚠️ OneWallet no detectada. Wallets disponibles:', wallets.map(w => w.name));
  }
  
  return oneWallet ?? null;
}

/**
 * Verifica si OneWallet está instalada en el navegador
 */
export function isOneWalletInstalled(): boolean {
  return findOneWallet() !== null;
}

/**
 * Obtiene la lista completa de wallets compatibles con Wallet Standard
 * Útil para debugging o mostrar opciones al usuario
 */
export function getAllWallets(): readonly Wallet[] {
  return getWallets().get();
}
