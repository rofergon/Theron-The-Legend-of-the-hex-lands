/**
 * Script de prueba para verificar la corrección de la interacción con HEX token
 * 
 * Este script valida que:
 * 1. La transacción se construye correctamente
 * 2. Los argumentos son del tipo correcto
 * 3. No hay errores de compilación
 */

import { Transaction } from '@onelabs/sui/transactions';
import { ONECHAIN_PACKAGE_ID, HEX_TOKEN, CONVERSION_RATES } from '../../config/contracts';

/**
 * Crea una transacción de ejemplo para verificar la sintaxis
 */
export function createTestTransaction(
  senderAddress: string,
  faithAmount: number
): Transaction {
  console.log('🧪 Creando transacción de prueba...');
  console.log('   Sender:', senderAddress);
  console.log('   Faith:', faithAmount);
  console.log('   Rate:', CONVERSION_RATES.FAITH_TO_HEX);
  
  const tx = new Transaction();
  
  // Establecer sender (requerido para shared objects)
  tx.setSender(senderAddress);
  
  // Construir el moveCall con la sintaxis correcta
  tx.moveCall({
    target: `${ONECHAIN_PACKAGE_ID}::${HEX_TOKEN.MODULE}::mint_from_faith_public`,
    arguments: [
      // holder: &mut TreasuryCapHolder (shared object)
      tx.object(HEX_TOKEN.TREASURY_HOLDER),
      
      // stats: &mut EconomyStats (shared object)  
      tx.object(HEX_TOKEN.ECONOMY_STATS),
      
      // faith_amount: u64 (pure value)
      // ✅ CORRECTO: usar tx.pure.u64() que maneja serialización BCS automáticamente
      tx.pure.u64(faithAmount),
      
      // conversion_rate: u64 (pure value)
      tx.pure.u64(CONVERSION_RATES.FAITH_TO_HEX),
      
      // ctx: &mut TxContext <- El sistema lo inyecta automáticamente
    ],
  });
  
  console.log('✅ Transacción creada correctamente');
  
  return tx;
}

/**
 * Valida que la transacción tenga la estructura correcta
 */
export function validateTransaction(tx: Transaction): boolean {
  try {
    // Verificar que la transacción tenga un sender
    // @ts-ignore - acceso interno para testing
    if (!tx.blockData?.sender) {
      console.error('❌ La transacción no tiene sender');
      return false;
    }
    
    // Verificar que tenga comandos
    // @ts-ignore - acceso interno para testing
    if (!tx.blockData?.transactions || tx.blockData.transactions.length === 0) {
      console.error('❌ La transacción no tiene comandos');
      return false;
    }
    
    console.log('✅ Transacción validada correctamente');
    console.log('   Comandos:', tx.blockData.transactions.length);
    
    return true;
  } catch (error) {
    console.error('❌ Error validando transacción:', error);
    return false;
  }
}

/**
 * Ejecuta pruebas de validación
 */
export function runValidationTests(): void {
  console.log('='.repeat(60));
  console.log('🧪 PRUEBAS DE VALIDACIÓN - HEX TOKEN TRANSACTION');
  console.log('='.repeat(60));
  console.log('');
  
  // Test 1: Crear transacción básica
  console.log('📋 Test 1: Crear transacción básica');
  try {
    const tx = createTestTransaction(
      '0x0000000000000000000000000000000000000000000000000000000000000001',
      100
    );
    
    if (validateTransaction(tx)) {
      console.log('✅ Test 1: PASSED');
    } else {
      console.log('❌ Test 1: FAILED - Validación falló');
    }
  } catch (error: any) {
    console.log('❌ Test 1: FAILED -', error.message);
  }
  
  console.log('');
  
  // Test 2: Verificar tipos de argumentos
  console.log('📋 Test 2: Verificar tipos de argumentos');
  try {
    const tx = new Transaction();
    tx.setSender('0x0000000000000000000000000000000000000000000000000000000000000001');
    
    // Verificar que tx.pure.u64 existe y es una función
    if (typeof tx.pure.u64 !== 'function') {
      throw new Error('tx.pure.u64 no es una función');
    }
    
    // Verificar que tx.object es una función
    if (typeof tx.object !== 'function') {
      throw new Error('tx.object no es una función');
    }
    
    console.log('✅ Test 2: PASSED - Tipos correctos');
  } catch (error: any) {
    console.log('❌ Test 2: FAILED -', error.message);
  }
  
  console.log('');
  
  // Test 3: Verificar constantes del contrato
  console.log('📋 Test 3: Verificar constantes del contrato');
  try {
    if (!ONECHAIN_PACKAGE_ID) {
      throw new Error('ONECHAIN_PACKAGE_ID no definido');
    }
    if (!HEX_TOKEN.MODULE) {
      throw new Error('HEX_TOKEN.MODULE no definido');
    }
    if (!HEX_TOKEN.TREASURY_HOLDER) {
      throw new Error('HEX_TOKEN.TREASURY_HOLDER no definido');
    }
    if (!HEX_TOKEN.ECONOMY_STATS) {
      throw new Error('HEX_TOKEN.ECONOMY_STATS no definido');
    }
    if (!CONVERSION_RATES.FAITH_TO_HEX) {
      throw new Error('CONVERSION_RATES.FAITH_TO_HEX no definido');
    }
    
    console.log('✅ Test 3: PASSED - Constantes definidas');
    console.log('   Package:', ONECHAIN_PACKAGE_ID);
    console.log('   Module:', HEX_TOKEN.MODULE);
    console.log('   Rate:', CONVERSION_RATES.FAITH_TO_HEX);
  } catch (error: any) {
    console.log('❌ Test 3: FAILED -', error.message);
  }
  
  console.log('');
  console.log('='.repeat(60));
  console.log('🏁 PRUEBAS COMPLETADAS');
  console.log('='.repeat(60));
}

// Ejecutar pruebas si se corre directamente
if (require.main === module) {
  runValidationTests();
}
