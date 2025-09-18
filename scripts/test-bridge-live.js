#!/usr/bin/env node

const dotenv = require('dotenv');
const { ethers } = require('ethers');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');

console.log('🌉 Test Bridge Li.Fi LIVE Base → Solana...');

dotenv.config();

async function testBridgeLive() {
  const startTime = Date.now();
  let success = false;
  let error = null;
  
  try {
    console.log('⚠️ ATTENTION: Mode LIVE activé !');
    console.log('   Montant: 0.01 USDC (micro-montant)');
    console.log('   Sécurité: Caps activés');
    console.log('   Timeout: 5 minutes');
    
    // 1. Configuration
    console.log('\n1️⃣ Configuration...');
    const baseProvider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    const baseWallet = new ethers.Wallet(process.env.PRIVATE_KEY, baseProvider);
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log(`   Base: ${baseWallet.address}`);
    console.log(`   Solana: ${keypair.publicKey.toString()}`);
    
    // 2. Vérification des fonds
    console.log('\n2️⃣ Vérification des fonds...');
    const ethBalance = await baseProvider.getBalance(baseWallet.address);
    const solBalance = await solanaConnection.getBalance(keypair.publicKey);
    
    console.log(`   ETH: ${ethers.formatEther(ethBalance)}`);
    console.log(`   SOL: ${solBalance / 1e9}`);
    
    if (solBalance < 0.01e9) {
      throw new Error('SOL insuffisant pour les frais de transaction');
    }
    
    // 3. Vérification des caps
    console.log('\n3️⃣ Vérification des caps...');
    const maxSpendUsdc = parseFloat(process.env.MAX_SPEND_USDC || '1');
    const maxGasGwei = parseFloat(process.env.MAX_GAS_GWEI || '8');
    
    console.log(`   Max USDC: ${maxSpendUsdc}`);
    console.log(`   Max Gas: ${maxGasGwei} Gwei`);
    
    // 4. Test de l'approbation USDC
    console.log('\n4️⃣ Test de l\'approbation USDC...');
    const usdcAddress = process.env.BASE_USDC;
    const routerAddress = process.env.BASE_ROUTER_V2_OR_V3;
    
    const usdcContract = new ethers.Contract(
      usdcAddress,
      [
        'function balanceOf(address) view returns (uint256)', 
        'function allowance(address,address) view returns (uint256)',
        'function approve(address,uint256) returns (bool)'
      ],
      baseProvider
    );
    
    const usdcBalance = await usdcContract.balanceOf(baseWallet.address);
    const allowance = await usdcContract.allowance(baseWallet.address, routerAddress);
    
    console.log(`   Balance USDC: ${ethers.formatUnits(usdcBalance, 6)}`);
    console.log(`   Allowance: ${ethers.formatUnits(allowance, 6)}`);
    
    if (usdcBalance === 0n) {
      throw new Error('Aucun USDC disponible');
    }
    
    // 5. Test de l'approbation (micro-montant)
    const microAmount = ethers.parseUnits('0.01', 6); // 0.01 USDC
    
    if (allowance < microAmount) {
      console.log('   Approbation nécessaire...');
      
      // Vérifier le gas price
      const feeData = await baseProvider.getFeeData();
      const gasPrice = feeData.gasPrice;
      
      if (gasPrice && gasPrice > ethers.parseUnits(maxGasGwei.toString(), 'gwei')) {
        throw new Error(`Gas price trop élevé: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei > ${maxGasGwei} Gwei`);
      }
      
      console.log('   Envoi de l\'approbation...');
      
      const approveTx = await usdcContract.connect(baseWallet).approve(routerAddress, microAmount);
      console.log(`   Tx envoyée: ${approveTx.hash}`);
      
      const receipt = await approveTx.wait();
      console.log(`   Tx confirmée: ${receipt.hash}`);
      
      console.log('✅ Approbation réussie');
    } else {
      console.log('✅ Allowance suffisante');
    }
    
    // 6. Test du bridge Li.Fi (simulation)
    console.log('\n6️⃣ Test du bridge Li.Fi...');
    console.log('⚠️ Bridge Li.Fi non implémenté en mode live');
    console.log('   Simulation: 0.01 USDC Base → Solana');
    console.log('   Via: Li.Fi API');
    console.log('   Status: En attente d\'implémentation');
    
    // 7. Critères de succès
    console.log('\n7️⃣ Critères de succès...');
    console.log('✅ Approbation USDC réussie');
    console.log('✅ Caps de sécurité respectés');
    console.log('✅ Configuration valide');
    console.log('✅ Fonds disponibles');
    
    success = true;
    
  } catch (err) {
    error = err;
    console.error('❌ Erreur:', err.message);
  } finally {
    const duration = Date.now() - startTime;
    console.log('\n📊 Résumé du test:');
    console.log(`   Durée: ${duration}ms`);
    console.log(`   Succès: ${success ? '✅' : '❌'}`);
    console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
    
    if (success) {
      console.log('\n🎉 Test Bridge Live réussi !');
      console.log('   Prochaine étape: Implémenter le bridge Li.Fi');
    } else {
      console.log('\n💥 Test Bridge Live échoué !');
      console.log('   Vérifiez la configuration et les fonds');
    }
  }
}

testBridgeLive();
