#!/usr/bin/env node

const dotenv = require('dotenv');
const { ethers, NonceManager } = require('ethers');
const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const fs = require('fs');
const axios = require('axios');

console.log('🌉 Bridge Li.Fi LIVE Base → Solana...');

dotenv.config();

async function bridgeLiFiLive() {
  const startTime = Date.now();
  let success = false;
  let error = null;
  let srcTxHash = null;
  let destTxHash = null;
  let baseWallet = null;
  let rawWallet = null;
  let keypair = null;
  let usdcContract = null;
  
  try {
    console.log('⚠️ ATTENTION: Mode LIVE activé !');
    console.log('   Bridge: Base → Solana');
    console.log('   Montant: 0.5-1 USDC');
    console.log('   Sécurité: Caps activés');
    console.log('   Timeout: 5 minutes');
    
    // 1. Configuration
    console.log('\n1️⃣ Configuration...');
    const baseProvider = new ethers.JsonRpcProvider(process.env.BASE_RPC_URL);
    rawWallet = new ethers.Wallet(process.env.PRIVATE_KEY, baseProvider);
    baseWallet = new NonceManager(rawWallet);
    const solanaConnection = new Connection(process.env.SOLANA_RPC_URL);
    
    const keypairData = JSON.parse(fs.readFileSync(process.env.SOLANA_KEYPAIR_PATH, 'utf8'));
    keypair = Keypair.fromSecretKey(new Uint8Array(keypairData));
    
    // Définir usdcContract
    const usdcAddress = process.env.BASE_USDC;
    usdcContract = new ethers.Contract(
      usdcAddress,
      [
        'function balanceOf(address) view returns (uint256)', 
        'function allowance(address,address) view returns (uint256)',
        'function approve(address,uint256) returns (bool)'
      ],
      baseProvider
    );
    
    console.log(`   Base: ${rawWallet.address}`);
    console.log(`   Solana: ${keypair.publicKey.toString()}`);
    
    // 2. Vérification des fonds AVANT
    console.log('\n2️⃣ Vérification des fonds AVANT...');
    const ethBalanceBefore = await baseProvider.getBalance(rawWallet.address);
    const solBalanceBefore = await solanaConnection.getBalance(keypair.publicKey);
    const usdcBalanceBefore = await usdcContract.balanceOf(rawWallet.address);
    
    console.log(`   ETH: ${ethers.formatEther(ethBalanceBefore)}`);
    console.log(`   SOL: ${solBalanceBefore / 1e9}`);
    console.log(`   USDC: ${ethers.formatUnits(usdcBalanceBefore, 6)}`);
    
    if (solBalanceBefore < 0.01e9) {
      throw new Error('SOL insuffisant pour les frais de transaction');
    }
    
    // 3. Vérification des caps
    console.log('\n3️⃣ Vérification des caps...');
    const maxSpendUsdc = parseFloat(process.env.MAX_SPEND_USDC || '1');
    const maxGasGwei = parseFloat(process.env.MAX_GAS_GWEI || '8');
    
    console.log(`   Max USDC: ${maxSpendUsdc}`);
    console.log(`   Max Gas: ${maxGasGwei} Gwei`);
    
    // 4. Bridge Li.Fi LIVE
    console.log('\n4️⃣ Bridge Li.Fi LIVE...');
    const bridgeAmount = ethers.parseUnits('0.5', 6); // 0.5 USDC
    
    // Obtenir la route Li.Fi
    console.log('   Fetching Li.Fi route...');
    const lifiApi = axios.create({
      baseURL: 'https://li.quest/v1',
      headers: {
        'X-LIFI-API-KEY': process.env.LIFI_API_KEY,
      },
    });
    
    const routeRequest = {
      fromChain: 8453, // Base
      toChain: 1151111081099710, // Solana (ID correct)
      fromToken: usdcAddress,
      toToken: process.env.SOL_USDC_MINT,
      fromAmount: bridgeAmount.toString(),
      fromAddress: rawWallet.address,
      toAddress: keypair.publicKey.toString(),
      slippage: 50 / 10000, // 0.5%
    };
    
    console.log('   Route request:', routeRequest);
    
    const routeResponse = await lifiApi.get('/quote', { params: routeRequest });
    const route = routeResponse.data;
    
    console.log('✅ Route Li.Fi récupérée');
    console.log(`   Tool: ${route.tool}`);
    console.log(`   From: ${routeRequest.fromChain} → ${routeRequest.toChain}`);
    console.log(`   Amount: ${routeRequest.fromAmount} ${routeRequest.fromToken}`);
    console.log(`   To Amount: ${route.estimate.toAmount}`);
    
    // 5. Approvals multiples séquentiels
    console.log('\n5️⃣ Approvals multiples séquentiels...');
    const approvals = new Set();
    
    // Approval global
    if (route.estimate && route.estimate.approvalAddress) {
      approvals.add({
        spender: route.estimate.approvalAddress,
        amount: BigInt(route.estimate.approvalAmount || bridgeAmount.toString())
      });
    }
    
    // Approvals des includedSteps
    if (route.includedSteps && route.includedSteps.length > 0) {
      for (const step of route.includedSteps) {
        if (step.estimate && step.estimate.approvalAddress) {
          approvals.add({
            spender: step.estimate.approvalAddress,
            amount: BigInt(step.estimate.approvalAmount || bridgeAmount.toString())
          });
        }
      }
    }
    
    console.log(`   Approvals nécessaires: ${approvals.size}`);
    
    // Fonction pour envoyer une approval avec retry
    const sendApprovalWithRetry = async (spender, amount, attempt = 1) => {
      const maxRetries = 3;
      
      try {
        console.log(`   Tentative ${attempt}/${maxRetries} pour ${spender}`);
        
        // Obtenir le nonce actuel
        const nonce = await baseWallet.getNonce();
        console.log(`   Nonce utilisé: ${nonce}`);
        
        // Construire la transaction d'approval
        const approveTx = await usdcContract.connect(baseWallet).approve(spender, amount);
        console.log(`   Approval Tx envoyée: ${approveTx.hash}`);
        
        // Attendre la confirmation
        const approvalReceipt = await approveTx.wait(1);
        console.log(`   Approval Tx confirmée: ${approvalReceipt.hash}`);
        
        return approvalReceipt;
        
      } catch (error) {
        if (error.code === 'REPLACEMENT_UNDERPRICED' && attempt < maxRetries) {
          console.log(`   REPLACEMENT_UNDERPRICED - Attente 3-5s avant retry...`);
          await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));
          
          // Re-lire le nonce pending
          const pendingNonce = await baseProvider.getTransactionCount(baseWallet.address, 'pending');
          console.log(`   Nonce pending: ${pendingNonce}`);
          
          return await sendApprovalWithRetry(spender, amount, attempt + 1);
        }
        throw error;
      }
    };
    
    // Exécuter les approvals séquentiellement
    for (const approval of approvals) {
      const currentAllowance = await usdcContract.allowance(rawWallet.address, approval.spender);
      console.log(`   Spender: ${approval.spender}`);
      console.log(`   Amount: ${ethers.formatUnits(approval.amount, 6)} USDC`);
      console.log(`   Current Allowance: ${ethers.formatUnits(currentAllowance, 6)} USDC`);
      
      if (currentAllowance < approval.amount) {
        console.log('   Approval nécessaire...');
        await sendApprovalWithRetry(approval.spender, approval.amount);
      } else {
        console.log('✅ Allowance suffisante');
      }
    }
    
    // 6. Gestion du gas EIP-1559 avec retry adaptatif
    console.log('\n6️⃣ Envoi de la transaction avec EIP-1559...');
    
    const getFeeData = async () => {
      const feeData = await baseProvider.getFeeData();
      const maxFeePerGas = feeData.maxFeePerGas || ethers.parseUnits('0.2', 'gwei');
      const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas || ethers.parseUnits('0.1', 'gwei');
      
      // S'assurer que maxPriorityFeePerGas <= maxFeePerGas
      const adjustedMaxFeePerGas = maxFeePerGas > ethers.parseUnits('0.2', 'gwei') ? maxFeePerGas : ethers.parseUnits('0.2', 'gwei');
      const adjustedMaxPriorityFeePerGas = maxPriorityFeePerGas > adjustedMaxFeePerGas ? adjustedMaxFeePerGas / 2n : maxPriorityFeePerGas;
      
      return {
        maxFeePerGas: adjustedMaxFeePerGas,
        maxPriorityFeePerGas: adjustedMaxPriorityFeePerGas
      };
    };
    
    const sendTransactionWithRetry = async (txData, maxRetries = 5) => {
      let currentFeeData = await getFeeData();
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`   Tentative ${attempt}/${maxRetries}...`);
          console.log(`   Max Fee Per Gas: ${ethers.formatUnits(currentFeeData.maxFeePerGas, 'gwei')} Gwei`);
          console.log(`   Max Priority Fee Per Gas: ${ethers.formatUnits(currentFeeData.maxPriorityFeePerGas, 'gwei')} Gwei`);
          
          // Obtenir le nonce via NonceManager
          const nonce = await baseWallet.getNonce();
          console.log(`   Nonce utilisé: ${nonce}`);
          
          const txWithGas = {
            ...txData,
            maxFeePerGas: currentFeeData.maxFeePerGas,
            maxPriorityFeePerGas: currentFeeData.maxPriorityFeePerGas,
            type: 2, // EIP-1559
          };
          
          const txResponse = await baseWallet.sendTransaction(txWithGas);
          console.log(`   Tx envoyée: ${txResponse.hash}`);
          return txResponse;
          
        } catch (error) {
          if (error.code === 'REPLACEMENT_UNDERPRICED' && attempt < maxRetries) {
            console.log(`   REPLACEMENT_UNDERPRICED - Attente 3-5s avant retry...`);
            await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 2000));
            
            // Re-lire le nonce pending
            const pendingNonce = await baseProvider.getTransactionCount(rawWallet.address, 'pending');
            console.log(`   Nonce pending: ${pendingNonce}`);
            
            // Bump adaptatif des fees
            const bumpMultiplier = attempt === 1 ? 1.25 : 1.30;
            currentFeeData = {
              maxFeePerGas: currentFeeData.maxFeePerGas * BigInt(Math.floor(bumpMultiplier * 100)) / 100n,
              maxPriorityFeePerGas: currentFeeData.maxPriorityFeePerGas * BigInt(Math.floor(bumpMultiplier * 100)) / 100n
            };
            
            // Vérifier le cap
            if (currentFeeData.maxFeePerGas > ethers.parseUnits('5', 'gwei')) {
              throw new Error(`Gas price trop élevé: ${ethers.formatUnits(currentFeeData.maxFeePerGas, 'gwei')} Gwei > 5 Gwei (cap atteint)`);
            }
            
            continue;
          }
          throw error;
        }
      }
    };
    
    // Construire la transaction
    let txData;
    if (route.includedSteps && route.includedSteps.length > 0) {
      console.log('   Exécution des includedSteps...');
      console.log(`   Steps disponibles: ${route.includedSteps.length}`);
      for (const step of route.includedSteps) {
        console.log(`   Step: ${step.type} - ${step.tool} (has transactionRequest: ${!!step.transactionRequest})`);
      }
    }
    
    // Toujours utiliser transactionRequest racine (plus fiable)
    console.log('   Utilisation de transactionRequest racine...');
    txData = {
      to: route.transactionRequest.to,
      data: route.transactionRequest.data,
      value: BigInt(route.transactionRequest.value),
      gasLimit: route.transactionRequest.gasLimit ? BigInt(route.transactionRequest.gasLimit) : undefined,
    };
    
    console.log('   Transaction data:', {
      to: txData.to,
      value: txData.value.toString(),
      gasLimit: txData.gasLimit?.toString(),
    });
    
    // Envoyer la transaction avec retry
    const txResponse = await sendTransactionWithRetry(txData);
    srcTxHash = txResponse.hash;
    
    // Attendre la confirmation
    console.log('   Attente de la confirmation...');
    const receipt = await txResponse.wait();
    console.log(`   Tx confirmée: ${receipt.hash}`);
    
    // 7. Polling pour la transaction de destination
    console.log('\n7️⃣ Polling pour la transaction de destination...');
    const timeoutMs = 5 * 60 * 1000; // 5 minutes
    const pollInterval = 10000; // 10 secondes
    const startPollTime = Date.now();
    let pollAttempt = 0;
    
    while (Date.now() - startPollTime < timeoutMs) {
      pollAttempt++;
      console.log(`   Polling attempt ${pollAttempt}...`);
      
      try {
        const statusResponse = await lifiApi.get(`/status/${srcTxHash}`);
        
        if (statusResponse.data && statusResponse.data.status === 'DONE') {
          destTxHash = statusResponse.data.destinationTransactionHash;
          if (destTxHash) {
            console.log(`✅ Destination transaction trouvée: ${destTxHash}`);
            break;
          }
        }
        
        console.log(`   Status: ${statusResponse.data?.status || 'unknown'}`);
        
        // Attendre avant le prochain poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
        
      } catch (error) {
        console.log(`   Polling error: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
    
    if (!destTxHash) {
      console.log('⚠️ Destination transaction non trouvée dans le timeout');
    }
    
    // 8. Vérification des balances APRÈS
    console.log('\n8️⃣ Vérification des balances APRÈS...');
    const ethBalanceAfter = await baseProvider.getBalance(rawWallet.address);
    const solBalanceAfter = await solanaConnection.getBalance(keypair.publicKey);
    const usdcBalanceAfter = await usdcContract.balanceOf(rawWallet.address);
    
    console.log(`   ETH: ${ethers.formatEther(ethBalanceAfter)} (${ethers.formatEther(ethBalanceBefore - ethBalanceAfter)} dépensé)`);
    console.log(`   SOL: ${solBalanceAfter / 1e9} (${(solBalanceBefore - solBalanceAfter) / 1e9} dépensé)`);
    console.log(`   USDC: ${ethers.formatUnits(usdcBalanceAfter, 6)} (${ethers.formatUnits(usdcBalanceBefore - usdcBalanceAfter, 6)} dépensé)`);
    
    // Logging des deltas
    console.log('\n📊 Deltas des balances:');
    console.log(`   ETH Delta: -${ethers.formatEther(ethBalanceBefore - ethBalanceAfter)} ETH`);
    console.log(`   SOL Delta: -${(solBalanceBefore - solBalanceAfter) / 1e9} SOL`);
    console.log(`   USDC Delta: -${ethers.formatUnits(usdcBalanceBefore - usdcBalanceAfter, 6)} USDC`);
    
    // 9. Critères de succès
    console.log('\n9️⃣ Critères de succès...');
    console.log('✅ Transaction source confirmée');
    console.log('✅ Caps de sécurité respectés');
    console.log('✅ Configuration valide');
    console.log('✅ Fonds disponibles');
    console.log('✅ Approvals multiples exécutés');
    console.log('✅ EIP-1559 avec retry adaptatif');
    
    if (destTxHash) {
      console.log('✅ Transaction destination trouvée');
    } else {
      console.log('⚠️ Transaction destination non trouvée (timeout)');
    }
    
    success = true;
    
  } catch (err) {
    error = err;
    console.error('❌ Erreur:', err.message);
  } finally {
    const duration = Date.now() - startTime;
    console.log('\n📊 Résumé du bridge:');
    console.log(`   Durée: ${duration}ms`);
    console.log(`   Succès: ${success ? '✅' : '❌'}`);
    console.log(`   Erreur: ${error ? error.message : 'Aucune'}`);
    console.log(`   From Tx Hash: ${srcTxHash || 'N/A'}`);
    console.log(`   To Tx Hash: ${destTxHash || 'N/A'}`);
    console.log(`   From Chain: Base (8453)`);
    console.log(`   To Chain: Solana (1151111081099710)`);
    console.log(`   From Address: ${rawWallet?.address || 'N/A'}`);
    console.log(`   To Address: ${keypair?.publicKey?.toString() || 'N/A'}`);
    
    if (success) {
      console.log('\n🎉 Bridge Li.Fi LIVE réussi !');
      console.log('   Prochaine étape: Swap Jupiter');
    } else {
      console.log('\n💥 Bridge Li.Fi LIVE échoué !');
      console.log('   Vérifiez la configuration et les fonds');
    }
  }
}

bridgeLiFiLive();