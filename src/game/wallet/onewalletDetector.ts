/**
 * OneWallet Detector - Wallet Standard Implementation for OneChain
 *
 * Detects and manages connection with OneWallet using the Wallet Standard
 * OneWallet uses the standard interface with custom OneChain features
 */

import { getWallets } from '@mysten/wallet-standard';
import type { Wallet } from '@mysten/wallet-standard';

/**
 * Searches for OneWallet among wallets using Wallet Standard
 * OneWallet para OneChain se registra en el Wallet Standard
 *
 * @returns The OneWallet instance or null if not installed
 */
export function findOneWallet(): Wallet | null {
  const wallets = getWallets().get();
  
  if (wallets.length > 0) {
    console.log('🔍 Wallets detected:', wallets.map(w => w.name));
  }
  
  // Buscar OneWallet que soporte Sui (necesario para OneChain)
  // OneWallet se registra múltiples veces para diferentes chains (iota, aptos, sui)
  // Necesitamos la versión que tiene features de Sui
  const oneWalletSui = wallets.find((w) =>
    (w.name.toLowerCase().includes('onewallet') || w.name.toLowerCase().includes('one wallet')) &&
    w.chains.some(chain => chain.includes('sui')) &&
    Object.keys(w.features).some(feature => feature.startsWith('sui:'))
  );
  
  if (oneWalletSui) {
    console.log('✅ OneWallet detected (Sui/OneChain):', oneWalletSui.name, oneWalletSui.version);
    console.log('  Chains:', oneWalletSui.chains);
    console.log('  Features:', Object.keys(oneWalletSui.features));
    return oneWalletSui;
  }
  
  console.warn('⚠️ OneWallet not detected with Sui support.');
  console.warn('Please install OneWallet from: https://wallet.onelab.cc/');
  console.warn('After installing, refresh the page.');
  
  return null;
}

/**
 * Checks if OneWallet is installed in the browser
 */
export function isOneWalletInstalled(): boolean {
  return findOneWallet() !== null;
}

/**
 * Diagnóstico de OneWallet - Útil para debugging
 */
export function diagnoseOneWallet(): void {
  console.group('🔍 OneWallet Diagnostic');
  
  // 1. Verificar Wallet Standard
  const wallets = getWallets().get();
  console.log('Wallets via Wallet Standard:', wallets.length);
  if (wallets.length > 0) {
    console.log('Wallet names:', wallets.map(w => w.name));
    wallets.forEach(w => {
      console.log(`  - ${w.name} v${w.version}`);
      console.log(`    Accounts:`, w.accounts.length);
      console.log(`    Features:`, Object.keys(w.features));
    });
  }
  
  // 2. Buscar OneWallet específicamente (con soporte Sui)
  const oneWallet = findOneWallet();
  if (oneWallet) {
    console.log('✅ OneWallet FOUND (Sui/OneChain compatible)');
    console.log('  Name:', oneWallet.name);
    console.log('  Version:', oneWallet.version);
    console.log('  Accounts:', oneWallet.accounts.length);
    console.log('  Features:', Object.keys(oneWallet.features));
    console.log('  Chains:', oneWallet.chains);
  } else {
    console.log('❌ OneWallet NOT FOUND with Sui support');
    console.log('Make sure OneWallet is installed and supports OneChain/Sui');
    console.log('Install from: https://wallet.onelab.cc/');
  }
  
  console.groupEnd();
}


