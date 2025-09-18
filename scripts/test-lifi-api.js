#!/usr/bin/env node

const dotenv = require('dotenv');
const axios = require('axios');

console.log('🔍 Test API Li.Fi...');

dotenv.config();

async function testLiFiAPI() {
  try {
    const lifiApi = axios.create({
      baseURL: 'https://li.quest/v1',
      headers: {
        'X-LIFI-API-KEY': process.env.LIFI_API_KEY,
      },
    });
    
    console.log('1️⃣ Test de l\'API Li.Fi...');
    console.log(`   API Key: ${process.env.LIFI_API_KEY.substring(0, 20)}...`);
    
    // Test avec un montant plus petit
    const routeRequest = {
      fromChain: 8453, // Base
      toChain: 1151111081099710, // Solana (ID correct)
      fromToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC Base
      toToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC Solana
      fromAmount: '100000', // 0.1 USDC
      fromAddress: '0x6D9dBe056A00b2CD3156dA90f8589E504F4a33D4',
      toAddress: 'DXnHR9bo6TLwb95xQixLJExU69G584qCRuencMRdLfgE', // Adresse Solana
      slippage: 0.01 // 1%
    };
    
    console.log('   Route request:', routeRequest);
    
    const response = await lifiApi.get('/quote', { params: routeRequest });
    
    console.log('✅ Route récupérée');
    console.log(`   Steps: ${response.data.steps?.length || 0}`);
    console.log(`   From: ${routeRequest.fromChain} → ${routeRequest.toChain}`);
    console.log(`   Amount: ${routeRequest.fromAmount} ${routeRequest.fromToken}`);
    
    // Log de la réponse complète pour debug
    console.log('\n📋 Réponse complète:');
    console.log(JSON.stringify(response.data, null, 2));
    
    if (response.data.steps && response.data.steps.length > 0) {
      const firstStep = response.data.steps[0];
      console.log(`   First step: ${firstStep.type} - ${firstStep.tool}`);
      console.log(`   To: ${firstStep.transactionRequest.to}`);
      console.log(`   Value: ${firstStep.transactionRequest.value}`);
    }
    
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    }
  }
}

testLiFiAPI();
