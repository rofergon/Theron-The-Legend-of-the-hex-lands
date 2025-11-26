/**
 * HEX Token Conversion Service
 * 
 * Maneja la conversión de Faith a HEX mediante el contrato hex_token desplegado
 * Integra con OneWallet para firmar transacciones en OneChain
 * 
 * CORREGIDO según documentación oficial de OneChain:
 * - Usa tx.pure.u64() en lugar de serialización BCS manual
 * - Elimina complejidad innecesaria con objetos compartidos
 * - Simplifica manejo de chain IDs
 * - Usa gas estimation automático del SDK
 */

import { Transaction } from '@onelabs/sui/transactions';
import { onechainClient } from './onechainClient';
import { getCurrentAccount, isWalletConnected, getWalletInstance, connectOneWallet } from './walletConfig';
import { ONECHAIN_PACKAGE_ID, HEX_TOKEN, THERON_TOKEN, CONVERSION_RATES } from '../../config/contracts';

// Decimales del token HEX (9)
const HEX_DECIMALS = 9;
const HEX_MULT = BigInt(10 ** HEX_DECIMALS);

/**
 * Resultado de la conversión
 */
export interface ConversionResult {
  success: boolean;
  faithSpent?: number;
  hexReceived?: number;
  transactionDigest?: string;
  error?: string;
}

/**
 * Estado de la transacción
 */
export type TransactionStatus = 
  | 'idle'
  | 'connecting-wallet'
  | 'building-transaction'
  | 'signing'
  | 'executing'
  | 'confirming'
  | 'success'
  | 'error';

/**
 * Calcula cuánto HEX se recibirá por una cantidad de Faith
 */
export function calculateHexAmount(faithAmount: number): number {
  const faithInt = Math.max(0, Math.floor(faithAmount));
  const subunits = (BigInt(faithInt) * HEX_MULT) / BigInt(CONVERSION_RATES.FAITH_TO_HEX);
  return Number(subunits) / Number(HEX_MULT);
}

/**
 * Valida que la cantidad de Faith sea válida para conversión
 */
export function validateFaithAmount(faithAmount: number): { valid: boolean; error?: string } {
  if (faithAmount <= 0) {
    return { valid: false, error: 'No hay Faith disponible para convertir' };
  }
  
  if (faithAmount < CONVERSION_RATES.FAITH_TO_HEX) {
    return { 
      valid: false, 
      error: `Necesitas al menos ${CONVERSION_RATES.FAITH_TO_HEX} Faith para convertir` 
    };
  }
  
  return { valid: true };
}

/**
 * Convierte Faith a HEX llamando al contrato hex_token::mint_from_faith_public
 * 
 * Esta función sigue las mejores prácticas de OneChain:
 * - Usa PTBs (Programmable Transaction Blocks) correctamente
 * - Deja que el SDK maneje gas estimation automáticamente
 * - Usa tx.pure.u64() para valores puros (no serialización BCS manual)
 * - Los objetos compartidos se pasan simplemente con tx.object(id)
 * 
 * @param faithAmount - Cantidad de Faith a convertir
 * @param onStatusChange - Callback para actualizar el estado de la transacción
 * @returns Resultado de la conversión
 */
export async function convertFaithToHex(
  faithAmount: number,
  onStatusChange?: (status: TransactionStatus, message?: string) => void
): Promise<ConversionResult> {
  try {
    // Validar Faith
    const validation = validateFaithAmount(faithAmount);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error,
      };
    }

    // Verificar que la wallet esté conectada
    onStatusChange?.('connecting-wallet', 'Verificando conexión de wallet...');
    if (!isWalletConnected()) {
      return {
        success: false,
        error: 'Wallet no conectada. Por favor, conecta tu OneWallet primero.',
      };
    }

    const account = getCurrentAccount();
    if (!account || !account.address) {
      return {
        success: false,
        error: 'No se pudo obtener la cuenta de la wallet.',
      };
    }

    // CRÍTICO: Verificar que la wallet esté en Testnet
    console.log('🔍 Verificando red de la wallet...');
    console.log('   Cuenta:', account.address);
    console.log('   Chains disponibles:', account.chains);
    
    // Verificar que NO esté en mainnet
    const currentChain = account.chains?.[0] || '';
    if (currentChain.toLowerCase().includes('mainnet')) {
      console.error('❌ ERROR: Wallet está en MAINNET');
      return {
        success: false,
        error: '⚠️ ERROR DE RED CRÍTICO\n\nOneWallet está conectada a MAINNET pero el contrato está desplegado en TESTNET.\n\nDEBES CAMBIAR A TESTNET:\n\n1. Abre la extensión OneWallet\n2. Haz clic en el selector de red (parte superior)\n3. Selecciona "Testnet" (NO Mainnet)\n4. Recarga completamente esta página (Ctrl+R o F5)\n5. Intenta de nuevo\n\n⚠️ NO intentes transacciones en Mainnet con contratos de Testnet.',
      };
    }
    
    // Intentar obtener balance en Testnet para verificar conexión
    try {
      const testnetBalance = await onechainClient.getBalance({
        owner: account.address,
        coinType: '0x2::oct::OCT',
      });
      
      const octBalance = Number(testnetBalance.totalBalance) / 1_000_000_000;
      console.log('✅ Conexión a Testnet verificada');
      console.log('   Balance en Testnet:', octBalance, 'OCT');
      
      if (octBalance < 0.1) {
        return {
          success: false,
          error: `Balance insuficiente en Testnet: ${octBalance.toFixed(4)} OCT. Necesitas al menos 0.1 OCT.\n\n⚠️ IMPORTANTE: Asegúrate de que OneWallet esté conectada a TESTNET, no a Mainnet.\n\nPara cambiar de red en OneWallet:\n1. Abre OneWallet\n2. Haz clic en el selector de red (arriba)\n3. Selecciona "Testnet"\n4. Recarga la página`,
        };
      }
    } catch (error: any) {
      console.error('❌ Error verificando red:', error);
      return {
        success: false,
        error: `No se pudo conectar a OneChain Testnet. \n\n⚠️ IMPORTANTE: Verifica que OneWallet esté conectada a TESTNET, no a Mainnet.\n\nPara cambiar de red en OneWallet:\n1. Abre OneWallet\n2. Haz clic en el selector de red (arriba)\n3. Selecciona "Testnet"\n4. Recarga la página\n\nError técnico: ${error.message}`,
      };
    }

    // Calcular HEX a recibir
    const hexAmount = calculateHexAmount(faithAmount);
    
    // Construir transacción
    onStatusChange?.('building-transaction', `Preparando conversión de ${faithAmount} Faith a ${hexAmount} HEX...`);
    
    console.log('📞 Construyendo transacción para conversión de Faith a HEX...');
    console.log('   Package:', ONECHAIN_PACKAGE_ID);
    console.log('   Module:', HEX_TOKEN.MODULE);
    console.log('   Function: mint_from_faith_public');
    console.log('   Faith amount:', faithAmount);
    console.log('   Conversion rate:', CONVERSION_RATES.FAITH_TO_HEX);
    console.log('   Expected HEX:', hexAmount);
    
    // Crear la transacción usando PTB (Programmable Transaction Block)
    const tx = new Transaction();
    
    // Configurar sender primero (requerido para objetos compartidos)
    tx.setSender(account.address);
    
    // IMPORTANTE: Según la documentación de OneChain, para valores puros (u64)
    // se debe usar tx.pure() directamente, que maneja la serialización BCS automáticamente
    // NO necesitamos serializar manualmente con bcs.u64().serialize()
    tx.moveCall({
      target: `${ONECHAIN_PACKAGE_ID}::${HEX_TOKEN.MODULE}::mint_from_faith_public`,
      arguments: [
        // holder: &mut TreasuryCapHolder (shared object)
        tx.object(HEX_TOKEN.TREASURY_HOLDER),
        
        // stats: &mut EconomyStats (shared object)  
        tx.object(HEX_TOKEN.ECONOMY_STATS),
        
        // faith_amount: u64 (en subunidades: Faith * 10^decimales)
        // tx.pure() maneja automáticamente la serialización BCS según el tipo
        tx.pure.u64(BigInt(Math.max(0, Math.floor(faithAmount))) * HEX_MULT),
        
        // conversion_rate: u64 (pure value)
        tx.pure.u64(CONVERSION_RATES.FAITH_TO_HEX),
        
        // ctx: &mut TxContext <- El sistema lo inyecta automáticamente, NO se pasa
      ],
    });
    
    console.log('✅ Transacción PTB construida correctamente');

    // CRÍTICO: Construir la transacción con el cliente ANTES de enviar a la wallet
    // Esto resuelve los "UnresolvedObject" a objetos completos
    console.log('🔧 Resolviendo objetos compartidos...');
    
    try {
      // Build resuelve los objetos y prepara la transacción
      await tx.build({ client: onechainClient });
      console.log('✅ Objetos compartidos resueltos correctamente');
    } catch (error: any) {
      console.error('❌ Error construyendo transacción:', error);
      return {
        success: false,
        error: `Error preparando transacción: ${error.message}`,
      };
    }

    // Firmar y ejecutar transacción usando Wallet Standard
    onStatusChange?.('signing', 'Esperando firma de la wallet...');
    
    // Obtener wallet del sistema
    const wallet = getWalletInstance();
    
    if (!wallet) {
      return {
        success: false,
        error: 'OneWallet no está disponible',
      };
    }

    // Verificar que la wallet soporta la feature necesaria
    const signAndExecuteFeature = wallet.features['sui:signAndExecuteTransactionBlock'] as any;
    
    if (!signAndExecuteFeature) {
      return {
        success: false,
        error: 'La wallet no soporta signAndExecuteTransactionBlock',
      };
    }

    console.log('📝 Enviando PTB a OneWallet para firma y ejecución...');
    
    // CRÍTICO: Determinar el chain ID correcto
    // La wallet DEBE estar en testnet para que funcione
    let chainId = account.chains?.[0] || 'sui:testnet';
    
    // Verificar si la wallet está en mainnet (ERROR!)
    if (chainId.toLowerCase().includes('mainnet')) {
      console.error('❌ WALLET EN MAINNET - Debe estar en TESTNET');
      return {
        success: false,
        error: '⚠️ ERROR DE RED\n\nOneWallet está conectada a MAINNET pero el contrato está en TESTNET.\n\nSOLUCIÓN:\n1. Abre OneWallet\n2. Haz clic en el selector de red (arriba)\n3. Selecciona "Testnet" (NO Mainnet)\n4. Recarga esta página\n5. Intenta de nuevo',
      };
    }
    
    // Forzar testnet si no está claro
    if (!chainId.toLowerCase().includes('testnet')) {
      chainId = 'sui:testnet';
      console.log('⚠️ Chain ID no claro, forzando testnet');
    }
    
    console.log('🔗 Chain ID:', chainId);
    
    try {
      onStatusChange?.('executing', 'Ejecutando transacción en OneChain...');
      
      // Enviar la transacción
      // El SDK/Wallet maneja automáticamente:
      // - Gas coin selection y merging
      // - Gas budget estimation
      // - Gas price
      const result = await signAndExecuteFeature.signAndExecuteTransactionBlock({
        transactionBlock: tx,
        account: account,
        chain: chainId,
        options: {
          showEffects: true,
          showEvents: true,
          showObjectChanges: true,
        },
      });
      
      console.log('✅ Transacción firmada y enviada');
      console.log('   Digest:', result.digest);

      if (!result || !result.digest) {
        return {
          success: false,
          error: 'La transacción no retornó un digest válido',
        };
      }

      // Esperar confirmación
      onStatusChange?.('confirming', 'Esperando confirmación en blockchain...');
      
      const txResponse = await onechainClient.waitForTransaction({
        digest: result.digest,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      // Verificar resultado
      if (txResponse.effects?.status?.status !== 'success') {
        const errorMsg = txResponse.effects?.status?.error || 'Error desconocido';
        console.error('❌ Transacción fallida:', errorMsg);
        
        return {
          success: false,
          error: `La transacción falló en blockchain:\n${errorMsg}`,
        };
      }

      console.log('🎉 Transacción confirmada exitosamente');
      console.log('   Eventos:', txResponse.events?.length || 0);
      
      onStatusChange?.('success', `¡Conversión exitosa! ${hexAmount} HEX recibidos`);

      return {
        success: true,
        faithSpent: faithAmount,
        hexReceived: hexAmount,
        transactionDigest: result.digest,
      };
      
    } catch (error: any) {
      console.error('❌ Error ejecutando transacción:', error);
      
      // Analizar el tipo de error
      const errorMsg = error?.message || String(error);
      
      // Error de red o chain ID
      if (errorMsg.includes('chain') || errorMsg.includes('network') || errorMsg.includes('endpoint')) {
        return {
          success: false,
          error: `Error de conexión: ${errorMsg}\n\n⚠️ VERIFICA LA RED:\n1. Abre OneWallet\n2. Selecciona "Testnet"\n3. Recarga esta página`,
        };
      }
      
      // Error de gas
      if (errorMsg.includes('gas') || errorMsg.includes('insufficient')) {
        return {
          success: false,
          error: `Gas insuficiente: ${errorMsg}\n\nNecesitas al menos 0.05 OCT en tu wallet.`,
        };
      }
      
      // Error de objeto
      if (errorMsg.includes('object') || errorMsg.includes('version') || errorMsg.includes('not found')) {
        return {
          success: false,
          error: `Error con objetos del contrato: ${errorMsg}\n\nEs posible que el contrato no esté desplegado en Testnet.`,
        };
      }
      
      // Usuario canceló
      if (errorMsg.includes('rejected') || errorMsg.includes('denied') || errorMsg.includes('cancelled')) {
        return {
          success: false,
          error: 'Transacción cancelada por el usuario',
        };
      }
      
      // Error genérico
      return {
        success: false,
        error: `Error al ejecutar transacción: ${errorMsg}`,
      };
    }
  } catch (error: any) {
    console.error('❌ Error general en convertFaithToHex:', error);
    return {
      success: false,
      error: error.message || 'Error al convertir Faith a HEX',
    };
  }
}

/**
 * Obtiene el balance de HEX tokens de una dirección
 */
export async function getHexBalance(address: string): Promise<number> {
  try {
    const balance = await onechainClient.getBalance({
      owner: address,
      coinType: HEX_TOKEN.TYPE,
    });
    
    // Convertir de unidades más pequeñas a HEX (9 decimales)
    return Number(balance.totalBalance) / 1_000_000_000;
  } catch (error) {
    console.error('❌ Error obteniendo balance de HEX:', error);
    return 0;
  }
}

/**
 * Obtiene el balance de THERON tokens de una dirección
 */
export async function getTheronBalance(address: string): Promise<number> {
  try {
    const balance = await onechainClient.getBalance({
      owner: address,
      coinType: THERON_TOKEN.TYPE,
    });
    return Number(balance.totalBalance) / 1_000_000_000;
  } catch (error) {
    console.error('❌ Error obteniendo balance de THERON:', error);
    return 0;
  }
}

/**
 * Obtiene ambos balances on-chain (HEX y THERON) para mostrar en UI
 */
export async function getOnChainBalances(address: string): Promise<{
  hex: number;
  theron: number;
}> {
  const [hex, theron] = await Promise.all([
    getHexBalance(address),
    getTheronBalance(address),
  ]);
  console.log('💰 Balances on-chain:', { address, hex, theron });
  return { hex, theron };
}

export interface BurnResult {
  success: boolean;
  burned?: number;
  transactionDigest?: string;
  error?: string;
}

/**
 * Obtiene las estadísticas del contrato HEX
 */
export async function getHexEconomyStats(): Promise<{
  totalMinted: number;
  totalBurned: number;
  faithConverted: number;
  circulatingSupply: number;
} | null> {
  try {
    const statsObject = await onechainClient.getObject({
      id: HEX_TOKEN.ECONOMY_STATS,
      options: {
        showContent: true,
      },
    });

    if (!statsObject.data || !statsObject.data.content || statsObject.data.content.dataType !== 'moveObject') {
      return null;
    }

    const fields = (statsObject.data.content as any).fields;
    
    return {
      totalMinted: Number(fields.total_minted) / 1_000_000_000,
      totalBurned: Number(fields.total_burned) / 1_000_000_000,
      faithConverted: Number(fields.faith_converted),
      circulatingSupply: (Number(fields.total_minted) - Number(fields.total_burned)) / 1_000_000_000,
    };
  } catch (error) {
    console.error('❌ Error obteniendo estadísticas de HEX:', error);
    return null;
  }
}

/**
 * Quema 20 HEX para bendecir a los guerreros (boost defensivo al atacar la aldea)
 */
export async function burnHexForRaidBlessing(
  onStatusChange?: (status: TransactionStatus, message?: string) => void,
): Promise<BurnResult> {
  try {
    const required = 20n * HEX_MULT;
    onStatusChange?.('building-transaction', 'Comprobando balance de HEX (20 requeridos)...');

    if (!isWalletConnected()) {
      onStatusChange?.('connecting-wallet', 'Conectando OneWallet...');
      const connection = await connectOneWallet();
      if (!connection.success) {
        return { success: false, error: connection.error ?? 'No se pudo conectar OneWallet.' };
      }
    }

    const account = getCurrentAccount() ?? getWalletInstance()?.accounts?.[0] ?? null;
    if (!account || !account.address) {
      return { success: false, error: 'No se encontró la cuenta activa en OneWallet.' };
    }

    const coins = await onechainClient.getCoins({
      owner: account.address,
      coinType: HEX_TOKEN.TYPE,
      limit: 50,
    });

    const totalBalance = coins.data.reduce((acc, c) => acc + BigInt(c.balance), 0n);
    if (totalBalance < required) {
      const human = Number(totalBalance) / Number(HEX_MULT);
      return { success: false, error: `Necesitas al menos 20 HEX para la bendición. Balance detectado: ${human.toFixed(2)} HEX.` };
    }

    const tx = new Transaction();
    tx.setSender(account.address);

    // Tomar la primera coin como base y fusionar el resto para asegurar 20 HEX disponibles
    const [base, ...rest] = coins.data;
    if (!base) {
      return { success: false, error: 'No se encontraron monedas HEX en la wallet.' };
    }

    const baseRef = tx.object(base.coinObjectId);
    if (rest.length > 0) {
      tx.mergeCoins(
        baseRef,
        rest.map((c) => tx.object(c.coinObjectId)),
      );
    }

    // Separar exactamente 20 HEX en subunidades (decimales 9)
    const [burnCoin] = tx.splitCoins(baseRef, [tx.pure.u64(required)]);
    tx.moveCall({
      target: `${ONECHAIN_PACKAGE_ID}::${HEX_TOKEN.MODULE}::burn_tokens`,
      arguments: [
        tx.object(HEX_TOKEN.TREASURY_HOLDER),
        tx.object(HEX_TOKEN.ECONOMY_STATS),
        burnCoin,
        // reason: vector<u8>
        tx.pure.string("raid_blessing"),
      ],
    });

    await tx.build({ client: onechainClient });

    const wallet = getWalletInstance();
    const signAndExecuteFeature = wallet?.features['sui:signAndExecuteTransactionBlock'] as any;
    if (!signAndExecuteFeature) {
      return { success: false, error: 'La wallet no soporta signAndExecuteTransactionBlock' };
    }

    let chainId = account.chains?.[0] || 'sui:testnet';
    if (chainId.toLowerCase().includes('mainnet')) {
      return { success: false, error: 'Cambia OneWallet a Testnet para quemar HEX.' };
    }
    if (!chainId.toLowerCase().includes('testnet')) {
      chainId = 'sui:testnet';
    }

    onStatusChange?.('signing', 'Firma la quema de 20 HEX para bendecir guerreros...');
    const result = await signAndExecuteFeature.signAndExecuteTransactionBlock({
      transactionBlock: tx,
      account,
      chain: chainId,
      options: { showEffects: true },
    });

    if (!result?.digest) {
      return { success: false, error: 'La transacción no devolvió digest.' };
    }

    onStatusChange?.('confirming', 'Confirmando quema en OneChain...');
    const confirmed = await onechainClient.waitForTransaction({
      digest: result.digest,
      options: { showEffects: true },
    });

    if (confirmed.effects?.status?.status !== 'success') {
      return {
        success: false,
        error: confirmed.effects?.status?.error || 'La quema de HEX falló en la cadena.',
      };
    }

    onStatusChange?.('success', 'HEX quemado, bendición aplicada.');
    return {
      success: true,
      burned: 20,
      transactionDigest: result.digest,
    };
  } catch (error: any) {
    console.error('❌ Error quemando HEX:', error);
    return { success: false, error: error?.message || 'Error al quemar HEX.' };
  }
}
