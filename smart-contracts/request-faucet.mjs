console.log('🚰 Solicitando tokens OCT del faucet de OneChain Testnet...\n');

const recipient = '0x6b54aaa94f352d81ebe3296abaeb3659b3380d507fff064faef89fd6a13fc19e';
const faucetUrl = 'https://faucet-testnet.onelabs.cc/v1/gas';

try {
  console.log(`📍 Dirección: ${recipient}`);
  console.log(`🌐 Network: testnet`);
  console.log(`🚰 Faucet: ${faucetUrl}\n`);
  console.log('⏳ Enviando solicitud al faucet...');
  
  const response = await fetch(faucetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      FixedAmountRequest: {
        recipient: recipient,
      }
    })
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.message || result.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  console.log('\n✅ ¡Tokens recibidos exitosamente!');
  console.log(`\n📦 Detalles:`);
  console.log(JSON.stringify(result, null, 2));
  
  console.log(`\n🔗 Verifica tu balance en:`);
  console.log(`   https://onescan.cc/testnet/address/${recipient}\n`);
  
} catch (error) {
  console.error('\n❌ Error al solicitar tokens del faucet:', error.message);
  
  if (error.message.includes('rate limit') || error.message.includes('Too many')) {
    console.error('\n⚠️  Has excedido el límite de solicitudes.');
    console.error('   Espera unos minutos e intenta nuevamente.\n');
  } else {
    console.error('\n💡 Posibles soluciones:');
    console.error('   1. Verifica que la dirección sea válida');
    console.error('   2. Intenta nuevamente en unos minutos');
    console.error('   3. Verifica tu conexión a internet\n');
  }
  
  process.exit(1);
}
