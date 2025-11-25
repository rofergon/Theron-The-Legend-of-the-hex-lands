import { SuiClient } from '@mysten/sui/client';

console.log('💰 Verificando balance de la wallet...\n');

const address = '0x6b54aaa94f352d81ebe3296abaeb3659b3380d507fff064faef89fd6a13fc19e';

const client = new SuiClient({
  url: 'https://rpc-testnet.onelabs.cc:443'
});

try {
  console.log(`📍 Dirección: ${address}\n`);
  
  // Obtener balance de OCT
  const octBalance = await client.getBalance({
    owner: address,
    coinType: '0x2::oct::OCT'
  });
  
  console.log('💎 Balance OCT (OneChain Testnet):');
  console.log(`   Total: ${Number(octBalance.totalBalance) / 1_000_000_000} OCT`);
  console.log(`   Coins: ${octBalance.coinObjectCount}`);
  
  // Obtener todos los objetos
  console.log('\n📦 Objetos en la wallet:');
  const objects = await client.getOwnedObjects({
    owner: address,
    options: {
      showType: true,
      showContent: true,
    }
  });
  
  console.log(`   Total objetos: ${objects.data.length}\n`);
  
  if (objects.data.length > 0) {
    console.log('📋 Detalle de objetos:');
    objects.data.forEach((obj, idx) => {
      const type = obj.data?.type || 'Unknown';
      console.log(`   ${idx + 1}. ${obj.data?.objectId}`);
      console.log(`      Tipo: ${type}`);
    });
  }
  
  console.log(`\n🔗 Ver en explorador:`);
  console.log(`   https://onescan.cc/testnet/address/${address}\n`);
  
  if (Number(octBalance.totalBalance) < 100_000_000) {
    console.log('⚠️  Balance bajo. Necesitas más OCT para transacciones.');
    console.log('💡 Solicita tokens del faucet en unos minutos cuando se reinicie el límite.\n');
  } else {
    console.log('✅ Balance suficiente para realizar transacciones.\n');
  }
  
} catch (error) {
  console.error('❌ Error al verificar balance:', error.message);
  process.exit(1);
}
