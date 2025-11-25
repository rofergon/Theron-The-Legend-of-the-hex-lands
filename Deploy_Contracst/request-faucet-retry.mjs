const recipient = '0x6b54aaa94f352d81ebe3296abaeb3659b3380d507fff064faef89fd6a13fc19e';
const faucetUrl = 'https://faucet-testnet.onelabs.cc/v1/gas';
const maxRetries = 5;
const delaySeconds = 60;

console.log('🚰 Solicitando tokens OCT del faucet de OneChain Testnet...\n');
console.log(`📍 Dirección: ${recipient}`);
console.log(`🚰 Faucet: ${faucetUrl}`);
console.log(`🔄 Intentos máximos: ${maxRetries}`);
console.log(`⏱️  Espera entre intentos: ${delaySeconds}s\n`);

async function sleep(seconds) {
  console.log(`⏳ Esperando ${seconds} segundos antes del próximo intento...`);
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r   ${i}s restantes...`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  console.log('\r   ✓ Listo para reintentar           \n');
}

async function requestTokens(attempt = 1) {
  try {
    console.log(`🔄 Intento ${attempt}/${maxRetries}...`);
    
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
      throw new Error(result.message || result.error || `HTTP ${response.status}`);
    }

    console.log('\n✅ ¡Tokens recibidos exitosamente!');
    console.log(`\n📦 Detalles:`);
    console.log(JSON.stringify(result, null, 2));
    console.log(`\n🔗 Verifica tu balance en:`);
    console.log(`   https://onescan.cc/testnet/address/${recipient}\n`);
    
    return true;
    
  } catch (error) {
    console.error(`❌ Intento ${attempt} falló: ${error.message}`);
    
    if (error.message.includes('rate limit') || error.message.includes('Too many requests')) {
      if (attempt < maxRetries) {
        console.log(`\n⚠️  Límite de tasa alcanzado.`);
        await sleep(delaySeconds);
        return requestTokens(attempt + 1);
      } else {
        console.error(`\n❌ Todos los intentos fallaron.`);
        console.error(`\n💡 Opciones:`);
        console.error(`   1. Espera ${delaySeconds} minutos y ejecuta el script nuevamente`);
        console.error(`   2. Solicita tokens manualmente en: https://faucet-testnet.onelabs.cc`);
        console.error(`   3. Usa otra wallet si tienes disponible\n`);
        return false;
      }
    } else {
      console.error(`\n❌ Error desconocido: ${error.message}\n`);
      return false;
    }
  }
}

const success = await requestTokens();
process.exit(success ? 0 : 1);
