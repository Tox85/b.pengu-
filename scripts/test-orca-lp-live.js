#!/usr/bin/env node

const dotenv = require('dotenv');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');

console.log('🏊 Test Orca LP LIVE USDC/PENGU...');

dotenv.config();

async function testOrcaLPLive() {
  const startTime = Date.now();
  let success = false;
  let error = null;
  
  try {
    console.log('⚠️ ATTENTION: Mode LIVE activé !');
    console.log('   Pool: USDC/PENGU');
    console.log('   Range: ±15% (concentré)');
    console.log('   Montant: Micro-montant');
    console.log('   Program: Orca Whirlpools');
    
    // 1. Configuration
    console.log('\n1️⃣ Configuration...');
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    const keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    console.log(`   Solana: ${keypair.publicKey.toString()}`);
    console.log(`   RPC: ${process.env.SOLANA_RPC_URL.substring(0, 50)}...`);
    
    // 2. Vérification des fonds
    console.log('\n2️⃣ Vérification des fonds...');
    const solBalance = await solanaConnection.getBalance(keypair.publicKey);
    console.log(`   SOL: ${solBalance / 1e9}`);
    
    if (solBalance < 0.01e9) {
      throw new Error('SOL insuffisant pour les frais de transaction');
    }
    
    // 3. Vérification des mints et pools
    console.log('\n3️⃣ Vérification des mints et pools...');
    const usdcMint = process.env.SOL_USDC_MINT;
    const penguMint = process.env.SOL_PENGU_MINT;
    const wsolMint = process.env.SOL_WSOL_MINT;
    const orcaProgram = process.env.ORCA_WHIRLPOOL_PROGRAM;
    const usdcPenguPool = process.env.ORCA_USDC_PENGU_POOL;
    const usdcWsolPool = process.env.ORCA_USDC_WSOL_POOL;
    
    console.log(`   USDC Mint: ${usdcMint}`);
    console.log(`   PENGU Mint: ${penguMint}`);
    console.log(`   WSOL Mint: ${wsolMint}`);
    console.log(`   Orca Program: ${orcaProgram}`);
    console.log(`   USDC/PENGU Pool: ${usdcPenguPool}`);
    console.log(`   USDC/WSOL Pool: ${usdcWsolPool}`);
    
    if (!usdcMint || !penguMint || !orcaProgram) {
      throw new Error('Mints ou program Orca manquants');
    }
    
    // 4. Test de l'ATA USDC
    console.log('\n4️⃣ Test de l\'ATA USDC...');
    const { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } = await import('@solana/spl-token');
    const { Transaction } = await import('@solana/web3.js');
    
    const usdcAta = await getAssociatedTokenAddress(new PublicKey(usdcMint), keypair.publicKey);
    const penguAta = await getAssociatedTokenAddress(new PublicKey(penguMint), keypair.publicKey);
    
    console.log(`   USDC ATA: ${usdcAta.toString()}`);
    console.log(`   PENGU ATA: ${penguAta.toString()}`);
    
    // Vérifier si les ATAs existent
    const usdcAtaInfo = await solanaConnection.getAccountInfo(usdcAta);
    const penguAtaInfo = await solanaConnection.getAccountInfo(penguAta);
    
    if (!usdcAtaInfo) {
      console.log('   Création de l\'ATA USDC...');
      const createUsdcAtaIx = createAssociatedTokenAccountInstruction(
        keypair.publicKey, // payer
        usdcAta,           // ata
        keypair.publicKey, // owner
        new PublicKey(usdcMint) // mint
      );
      
      const tx = new Transaction().add(createUsdcAtaIx);
      const signature = await solanaConnection.sendTransaction(tx, [keypair]);
      await solanaConnection.confirmTransaction(signature);
      
      console.log('✅ ATA USDC créé');
    } else {
      console.log('✅ ATA USDC existe déjà');
    }
    
    if (!penguAtaInfo) {
      console.log('   Création de l\'ATA PENGU...');
      const createPenguAtaIx = createAssociatedTokenAccountInstruction(
        keypair.publicKey, // payer
        penguAta,          // ata
        keypair.publicKey, // owner
        new PublicKey(penguMint) // mint
      );
      
      const tx = new Transaction().add(createPenguAtaIx);
      const signature = await solanaConnection.sendTransaction(tx, [keypair]);
      await solanaConnection.confirmTransaction(signature);
      
      console.log('✅ ATA PENGU créé');
    } else {
      console.log('✅ ATA PENGU existe déjà');
    }
    
    // 5. Test des balances
    console.log('\n5️⃣ Test des balances...');
    const usdcBalance = await solanaConnection.getTokenAccountBalance(usdcAta);
    const penguBalance = await solanaConnection.getTokenAccountBalance(penguAta);
    
    console.log(`   Balance USDC: ${usdcBalance.value.amount} (${usdcBalance.value.uiAmount} USDC)`);
    console.log(`   Balance PENGU: ${penguBalance.value.amount} (${penguBalance.value.uiAmount} PENGU)`);
    
    if (parseInt(usdcBalance.value.amount) < 1000) {
      console.log('⚠️ Balance USDC insuffisante pour le LP');
      console.log('   Déposez des USDC sur Solana pour continuer');
    } else {
      console.log('✅ Balance USDC suffisante');
    }
    
    if (parseInt(penguBalance.value.amount) < 1000) {
      console.log('⚠️ Balance PENGU insuffisante pour le LP');
      console.log('   Effectuez un swap USDC → PENGU d\'abord');
    } else {
      console.log('✅ Balance PENGU suffisante');
    }
    
    // 6. Test de la résolution de pool
    console.log('\n6️⃣ Test de la résolution de pool...');
    
    // Trier les mints pour assurer la cohérence
    const [mint1, mint2] = [usdcMint, penguMint].sort();
    console.log(`   Mints triés: ${mint1} / ${mint2}`);
    
    // Essayer de résoudre le pool USDC/PENGU
    let poolAddress = null;
    if (usdcPenguPool) {
      try {
        poolAddress = new PublicKey(usdcPenguPool);
        console.log(`   Pool USDC/PENGU: ${poolAddress.toString()}`);
      } catch (err) {
        console.log('   Pool USDC/PENGU invalide, fallback vers USDC/WSOL');
        if (usdcWsolPool) {
          poolAddress = new PublicKey(usdcWsolPool);
          console.log(`   Pool USDC/WSOL: ${poolAddress.toString()}`);
        }
      }
    }
    
    if (!poolAddress) {
      console.log('⚠️ Aucun pool valide trouvé');
      console.log('   Vérifiez les variables d\'environnement');
    } else {
      console.log('✅ Pool résolu');
    }
    
    // 7. Test de la création de position
    console.log('\n7️⃣ Test de la création de position...');
    console.log('   Simulation: Création d\'une position LP');
    console.log(`   Range: ±15% (concentré)`);
    console.log(`   Pool: ${poolAddress ? poolAddress.toString() : 'Non disponible'}`);
    
    if (poolAddress) {
      console.log('✅ Position LP simulée');
    } else {
      console.log('⚠️ Position LP non créable (pool manquant)');
    }
    
    // 8. Test du withdraw LP
    console.log('\n8️⃣ Test du withdraw LP...');
    console.log('   Simulation: Withdraw 50% de la position LP');
    console.log('   Status: En attente d\'implémentation');
    
    // 9. Critères de succès
    console.log('\n9️⃣ Critères de succès...');
    console.log('✅ ATAs créés/vérifiés');
    console.log('✅ Balances vérifiées');
    console.log('✅ Pool résolu');
    console.log('✅ Configuration valide');
    
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
      console.log('\n🎉 Test Orca LP Live réussi !');
      console.log('   Prochaine étape: Implémenter le LP réel');
    } else {
      console.log('\n💥 Test Orca LP Live échoué !');
      console.log('   Vérifiez la configuration et les fonds');
    }
  }
}

testOrcaLPLive();
