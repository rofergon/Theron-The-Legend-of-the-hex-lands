/**
 * Script de Prueba para Transacciones con Objetos Compartidos
 * 
 * Verifica que la configuración de gas y transacciones funcione correctamente
 * para objetos compartidos en OneChain
 */

import { onechainClient } from './onechainClient';
import { getCurrentAccount, isWalletConnected } from './walletConfig';
import { ONECHAIN_PACKAGE_ID, HEX_TOKEN, CONVERSION_RATES } from '../../config/contracts';
import { Transaction } from '@onelabs/sui/transactions';

/**
 * Verifica la configuración de la red y wallet
 */
export async function verifyConfiguration(): Promise<{
  success: boolean;
  details: {
    walletConnected: boolean;
    address?: string;
    octBalance?: number;
    gasPrice?: string;
    treasuryHolder?: string;
    economyStats?: string;
  };
  errors: string[];
}> {
  const errors: string[] = [];
  const details: any = {
    walletConnected: false,
  };

  try {
    // 1. Verificar conexión de wallet
    console.log('🔍 1. Verificando conexión de wallet...');
    if (!isWalletConnected()) {
      errors.push('Wallet no conectada');
      return { success: false, details, errors };
    }
    
    details.walletConnected = true;
    const account = getCurrentAccount();
    if (!account?.address) {
      errors.push('No se pudo obtener la dirección de la wallet');
      return { success: false, details, errors };
    }
    
    details.address = account.address;
    console.log('✅ Wallet conectada:', details.address);

    // 2. Verificar balance de OCT
    console.log('💰 2. Verificando balance de OCT...');
    try {
      const balance = await onechainClient.getBalance({
        owner: account.address,
        coinType: '0x2::oct::OCT',
      });
      
      details.octBalance = Number(balance.totalBalance) / 1_000_000_000;
      console.log(`✅ Balance: ${details.octBalance} OCT`);
      
      if (details.octBalance < 0.1) {
        errors.push(`Balance insuficiente: ${details.octBalance} OCT (necesitas al menos 0.1 OCT)`);
      }
    } catch (error: any) {
      errors.push(`Error obteniendo balance: ${error.message}`);
    }

    // 3. Verificar precio de gas de referencia
    console.log('⛽ 3. Verificando precio de gas...');
    try {
      const gasPrice = await onechainClient.getReferenceGasPrice();
      details.gasPrice = gasPrice.toString();
      console.log(`✅ Precio de gas de referencia: ${gasPrice}`);
    } catch (error: any) {
      errors.push(`Error obteniendo precio de gas: ${error.message}`);
    }

    // 4. Verificar que los objetos compartidos existen
    console.log('🔧 4. Verificando objetos compartidos del contrato...');
    
    // Verificar TreasuryCapHolder
    try {
      const treasuryObj = await onechainClient.getObject({
        id: HEX_TOKEN.TREASURY_HOLDER,
        options: { showContent: true, showOwner: true },
      });
      
      if (treasuryObj.data) {
        details.treasuryHolder = 'OK';
        console.log('✅ TreasuryCapHolder encontrado');
        console.log('   Owner:', treasuryObj.data.owner);
      } else {
        errors.push('TreasuryCapHolder no encontrado');
      }
    } catch (error: any) {
      errors.push(`Error verificando TreasuryCapHolder: ${error.message}`);
    }

    // Verificar EconomyStats
    try {
      const statsObj = await onechainClient.getObject({
        id: HEX_TOKEN.ECONOMY_STATS,
        options: { showContent: true, showOwner: true },
      });
      
      if (statsObj.data) {
        details.economyStats = 'OK';
        console.log('✅ EconomyStats encontrado');
        console.log('   Owner:', statsObj.data.owner);
      } else {
        errors.push('EconomyStats no encontrado');
      }
    } catch (error: any) {
      errors.push(`Error verificando EconomyStats: ${error.message}`);
    }

    // 5. Construir transacción de prueba (sin ejecutar)
    console.log('📝 5. Construyendo transacción de prueba...');
    try {
      const tx = new Transaction();
      tx.setSender(account.address);
      
      const gasPrice = await onechainClient.getReferenceGasPrice();
      tx.setGasPrice(gasPrice);
      tx.setGasBudget(50_000_000);
      
      tx.moveCall({
        target: `${ONECHAIN_PACKAGE_ID}::${HEX_TOKEN.MODULE}::mint_from_faith_public`,
        arguments: [
          tx.object(HEX_TOKEN.TREASURY_HOLDER),
          tx.object(HEX_TOKEN.ECONOMY_STATS),
          tx.pure.u64(100),
          tx.pure.u64(CONVERSION_RATES.FAITH_TO_HEX),
        ],
      });
      
      console.log('✅ Transacción construida correctamente');
      
      // Hacer dry-run para verificar
      console.log('🧪 Ejecutando dry-run...');
      const dryRunResult = await onechainClient.dryRunTransactionBlock({
        transactionBlock: await tx.build({ client: onechainClient }),
      });
      
      if (dryRunResult.effects.status.status === 'success') {
        console.log('✅ Dry-run exitoso - La transacción es válida');
      } else {
        errors.push(`Dry-run falló: ${dryRunResult.effects.status.error || 'Error desconocido'}`);
      }
    } catch (error: any) {
      errors.push(`Error en construcción de transacción: ${error.message}`);
    }

    return {
      success: errors.length === 0,
      details,
      errors,
    };
  } catch (error: any) {
    errors.push(`Error general: ${error.message}`);
    return {
      success: false,
      details,
      errors,
    };
  }
}

/**
 * Ejecuta todas las verificaciones y muestra un reporte
 */
export async function runDiagnostics() {
  console.log('='.repeat(60));
  console.log('🔬 DIAGNÓSTICO DE TRANSACCIONES CON OBJETOS COMPARTIDOS');
  console.log('='.repeat(60));
  console.log('');

  const result = await verifyConfiguration();

  console.log('');
  console.log('='.repeat(60));
  console.log('📊 RESUMEN');
  console.log('='.repeat(60));
  console.log('');
  console.log('Detalles:');
  console.log(JSON.stringify(result.details, null, 2));
  console.log('');

  if (result.success) {
    console.log('✅ TODAS LAS VERIFICACIONES PASARON');
    console.log('La configuración está lista para ejecutar transacciones');
  } else {
    console.log('❌ SE ENCONTRARON PROBLEMAS:');
    result.errors.forEach((error, index) => {
      console.log(`   ${index + 1}. ${error}`);
    });
  }
  
  console.log('');
  console.log('='.repeat(60));

  return result;
}

// Si se ejecuta directamente
if (require.main === module) {
  runDiagnostics().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('❌ Error fatal:', error);
    process.exit(1);
  });
}
