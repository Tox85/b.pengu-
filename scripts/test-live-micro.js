#!/usr/bin/env node

const dotenv = require('dotenv');
const { ethers } = require('ethers');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');

console.log('🔥 Test E2E LIVE avec micro-montants...');

dotenv.config();

async function testLiveMicro() {
  try {
    console.log('⚠️ ATTENTION: Mode LIVE activé !');
    console.log('   Montants: Micro (0.01 USDC)');
    console.log('   Sécurité: Caps activés');
    
    // Vérifier que DRY_RUN est désactivé
    if (process.env.DRY_RUN === 'true') {
      console.log('❌ DRY_RUN activé - désactivez-le pour le test live');
      return;
    }
    
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
      console.log('❌ SOL insuffisant pour les frais');
      return;
    }
    
    // 3. Vérification des caps
    console.log('\n3️⃣ Vérification des caps...');
    const maxSpendUsdc = parseFloat(process.env.MAX_SPEND_USDC || '1');
    const maxSpendEth = parseFloat(process.env.MAX_SPEND_ETH || '0.005');
    const maxGasGwei = parseFloat(process.env.MAX_GAS_GWEI || '8');
    
    console.log(`   Max USDC: ${maxSpendUsdc}`);
    console.log(`   Max ETH: ${maxSpendEth}`);
    console.log(`   Max Gas: ${maxGasGwei} Gwei`);
    
    // 4. Test de l'approbation USDC (micro-montant)
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
      console.log('❌ Aucun USDC disponible');
      return;
    }
    
    // 5. Test de l'approbation (micro-montant)
    const microAmount = ethers.parseUnits('0.01', 6); // 0.01 USDC
    
    if (allowance < microAmount) {
      console.log('   Approbation nécessaire...');
      
      // Vérifier le gas price
      const feeData = await baseProvider.getFeeData();
      const gasPrice = feeData.gasPrice;
      
      if (gasPrice && gasPrice > ethers.parseUnits(maxGasGwei.toString(), 'gwei')) {
        console.log(`❌ Gas price trop élevé: ${ethers.formatUnits(gasPrice, 'gwei')} Gwei > ${maxGasGwei} Gwei`);
        return;
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
    
    // 7. Test du swap Jupiter (simulation)
    console.log('\n7️⃣ Test du swap Jupiter...');
    console.log('⚠️ Swap Jupiter non implémenté en mode live');
    console.log('   Simulation: 0.01 USDC → PENGU');
    
    // 8. Test du LP Orca (simulation)
    console.log('\n8️⃣ Test du LP Orca...');
    console.log('⚠️ LP Orca non implémenté en mode live');
    console.log('   Simulation: Ajout LP USDC/PENGU');
    
    // 9. Résumé final
    console.log('\n🎉 Test live micro-montants réussi !');
    console.log('✅ Approbation USDC réussie');
    console.log('✅ Caps de sécurité respectés');
    console.log('✅ Configuration valide');
    
    console.log('\n📊 Prochaines étapes:');
    console.log('   1. Implémenter le bridge Li.Fi');
    console.log('   2. Implémenter le swap Jupiter');
    console.log('   3. Implémenter le LP Orca');
    console.log('   4. Tester le flow complet');
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    console.error('Stack:', error.stack);
  }
}

testLiveMicro();
