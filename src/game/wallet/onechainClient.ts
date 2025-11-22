/**
 * OneChain Client Configuration
 * 
 * Cliente para interactuar con la blockchain OneChain (basada en Sui)
 * Maneja consultas de balance, transacciones y estado de la red
 */

import { getFullnodeUrl, SuiClient } from '@onelabs/sui/client';
import { MIST_PER_SUI } from '@onelabs/sui/utils';

/**
 * Tipos de red disponibles en OneChain
 */
export type OneChainNetwork = 'mainnet' | 'testnet' | 'devnet' | 'localnet';

/**
 * Cliente configurado para OneChain Testnet por defecto
 * Usa el SDK oficial de OneChain (@onelabs/sui)
 */
export const onechainClient = new SuiClient({
  url: getFullnodeUrl('testnet'), // Cambiar según necesidades del hackathon
});

/**
 * Crea un cliente OneChain para una red específica
 */
export function createOneChainClient(network: OneChainNetwork = 'testnet'): SuiClient {
  return new SuiClient({
    url: getFullnodeUrl(network),
  });
}

/**
 * Convierte de MIST (unidad mínima) a OCT (token principal)
 * En OneChain, al igual que Sui, 1 OCT = 10^9 MIST
 * 
 * @param totalBalance - Balance en MIST (string o bigint)
 * @returns Balance en OCT como número decimal
 */
export function mistToOct(totalBalance: string | bigint): number {
  const n = typeof totalBalance === 'string' ? BigInt(totalBalance) : totalBalance;
  return Number(n) / Number(MIST_PER_SUI);
}

/**
 * Convierte de OCT a MIST para enviar transacciones
 * 
 * @param octAmount - Cantidad en OCT
 * @returns Cantidad en MIST como bigint
 */
export function octToMist(octAmount: number): bigint {
  return BigInt(Math.floor(octAmount * Number(MIST_PER_SUI)));
}

/**
 * Obtiene el balance de OCT de una dirección
 * 
 * @param address - Dirección en formato Sui/OneChain
 * @param client - Cliente opcional (usa el por defecto si no se proporciona)
 * @returns Balance en OCT
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
    console.error('❌ Error al obtener balance:', error);
    throw error;
  }
}

/**
 * Obtiene información completa del balance (incluye balance bloqueado)
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
    console.error('❌ Error al obtener balance detallado:', error);
    throw error;
  }
}

/**
 * Formatea una dirección de OneChain/Sui para mostrar
 * (muestra primeros 6 y últimos 4 caracteres)
 */
export function formatAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
