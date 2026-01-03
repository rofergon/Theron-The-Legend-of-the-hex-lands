import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('╔═══════════════════════════════════════════════════════╗');
console.log('║   Desplegando Contratos a OneChain Testnet           ║');
console.log('╚═══════════════════════════════════════════════════════╝\n');

// 1. Verificar que exista la carpeta build
console.log('[1/3] Leyendo módulos compilados...\n');
const buildDir = path.join(__dirname, 'build', 'theron_game_contracts', 'bytecode_modules');
const moduleFiles = ['hex_token.mv', 'land_nft.mv', 'store.mv', 'theron_token.mv'];

let modules;
try {
    modules = moduleFiles.map(file => {
        const modulePath = path.join(buildDir, file);
        const bytes = readFileSync(modulePath);
        console.log(`   ✓ ${file} (${bytes.length} bytes)`);
        return Array.from(bytes);
    });
    console.log(`\n✅ ${modules.length} módulos listos\n`);
} catch (error) {
    console.error('❌ Error leyendo módulos:', error.message);
    console.error('\nEjecuta primero en WSL:');
    console.error('  export PATH=/usr/bin:/bin:/home/saritu/.cargo/bin:$PATH');
    console.error('  cd /mnt/c/Users/sebas/carpeta\\ con\\ juan/smart-contracts');
    console.error('  sui move build\n');
    process.exit(1);
}

// 2. Preparar dependencias
console.log('[2/3] Preparando despliegue...\n');
const dependencies = ['0x1', '0x2']; // MoveStdlib, Sui
console.log(`   Dependencias: ${dependencies.join(', ')}\n`);

// 3. Cargar wallet
console.log('[3/3] Desplegando a OneChain Testnet...\n');
const walletData = JSON.parse(readFileSync('wallet-info.json', 'utf8'));

console.log(`   Address: ${walletData.address}`);

// La private key está en formato bech32
// Necesitamos usar el método correcto de @mysten/sui
const privateKeyBech32 = walletData.privateKey;
const keypair = Ed25519Keypair.fromSecretKey(privateKeyBech32);

// Cliente OneChain
const client = new SuiClient({
    url: 'https://rpc-testnet.onelabs.cc:443'
});

// Crear transacción de publicación
const tx = new Transaction();
tx.setSender(walletData.address);

const [upgradeCap] = tx.publish({
    modules,
    dependencies,
});

tx.transferObjects([upgradeCap], walletData.address);

// Ejecutar transacción
console.log('   Enviando transacción...');
try {
    // Primero obtener los coins OCT disponibles
    const coins = await client.getCoins({
        owner: walletData.address,
        coinType: '0x2::oct::OCT'
    });

    if (coins.data.length === 0) {
        throw new Error('No se encontraron coins OCT. Verifica el balance en https://onescan.cc');
    }

    console.log(`   Gas coins disponibles: ${coins.data.length}`);
    console.log(`   Usando coin: ${coins.data[0].coinObjectId}`);

    // Usar el primer coin como gas
    tx.setGasPayment([{
        objectId: coins.data[0].coinObjectId,
        version: coins.data[0].version,
        digest: coins.data[0].digest
    }]);

    const result = await client.signAndExecuteTransaction({
        transaction: tx,
        signer: keypair,
        options: {
            showEffects: true,
            showObjectChanges: true,
        },
    });

    console.log('\n╔═══════════════════════════════════════════════════════╗');
    console.log('║           ✅ CONTRATOS DESPLEGADOS ✅                  ║');
    console.log('╚═══════════════════════════════════════════════════════╝\n');

    // Extraer Package ID
    const packageId = result.objectChanges?.find(
        (a) => a.type === 'published'
    )?.packageId;

    console.log(`📦 Package ID: ${packageId}\n`);
    console.log('🎯 Objetos creados:');
    result.objectChanges?.filter(o => o.type === 'created').forEach(obj => {
        console.log(`   - ${obj.objectId} (${obj.objectType})`);
    });

    console.log(`\n🔗 Ver en explorador:`);
    console.log(`   https://onescan.cc/testnet/tx/${result.digest}\n`);

    // Guardar deployment info
    const deploymentInfo = {
        packageId,
        digest: result.digest,
        timestamp: new Date().toISOString(),
        objectChanges: result.objectChanges,
    };

    writeFileSync('deployment-info.json', JSON.stringify(deploymentInfo, null, 2));
    console.log('💾 Info guardada en deployment-info.json\n');

} catch (error) {
    console.error('\n❌ Error al desplegar:', error.message);
    if (error.cause) {
        console.error('Causa:', error.cause);
    }
    process.exit(1);
}
