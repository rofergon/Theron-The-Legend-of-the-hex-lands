/**
 * OneChain Client Configuration
 *
 * Client to interact with the OneChain blockchain (Sui-based)
 * Handles balance queries, transactions, and network status
 */

import { getFullnodeUrl, SuiClient } from '@onelabs/sui/client';
import { MIST_PER_SUI } from '@onelabs/sui/utils';

/**
 * Available network types in OneChain
 */
export type OneChainNetwork = 'mainnet' | 'testnet' | 'devnet' | 'localnet';

/**
 * Client configured for OneChain Testnet by default
 * Uses the official OneChain SDK (@onelabs/sui)
 */
export const onechainClient = new SuiClient({
  url: getFullnodeUrl('testnet'), // Change as needed for the hackathon
});

/**
 * Creates a OneChain client for a specific network
 */
export function createOneChainClient(network: OneChainNetwork = 'testnet'): SuiClient {
  return new SuiClient({
    url: getFullnodeUrl(network),
  });
}

/**
 * Converts from MIST (smallest unit) to OCT (main token)
 * In OneChain, as in Sui, 1 OCT = 10^9 MIST
 *
 * @param totalBalance - Balance in MIST (string or bigint)
 * @returns Balance in OCT as a decimal number
 */
export function mistToOct(totalBalance: string | bigint): number {
  const n = typeof totalBalance === 'string' ? BigInt(totalBalance) : totalBalance;
  return Number(n) / Number(MIST_PER_SUI);
}

/**
 * Converts from OCT to MIST for sending transactions
 *
 * @param octAmount - Amount in OCT
 * @returns Amount in MIST as bigint
 */
export function octToMist(octAmount: number): bigint {
  return BigInt(Math.floor(octAmount * Number(MIST_PER_SUI)));
}

/**
 * Gets the OCT balance of an address
 *
 * @param address - Address in Sui/OneChain format
 * @param client - Optional client (uses default if not provided)
 * @returns Balance in OCT
 */
export async function getOctBalance(
  address: string,
  client: SuiClient = onechainClient
): Promise<number> {
  try {
    const balance = await client.getBalance({
      owner: address,
    });
    
    return mistToOct(balance.totalBalance);
  } catch (error) {
    console.error('❌ Error getting balance:', error);
    throw error;
  }
}

/**
 * Gets full balance information (includes locked balance)
 */
export async function getDetailedBalance(
  address: string,
  client: SuiClient = onechainClient
) {
  try {
    const balance = await client.getBalance({
      owner: address,
    });
    
    return {
      total: mistToOct(balance.totalBalance),
      totalMist: balance.totalBalance,
      coinType: balance.coinType,
      coinObjectCount: balance.coinObjectCount,
    };
  } catch (error) {
    console.error('❌ Error getting detailed balance:', error);
    throw error;
  }
}

/**
 * Formats a OneChain/Sui address for display
 * (shows first 6 and last 4 characters)
 */
export function formatAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
