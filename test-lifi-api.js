#!/usr/bin/env node

const axios = require('axios');
require('dotenv').config();

async function testLifiApi() {
  console.log('🔑 Test de la clé API Li.Fi...');
  console.log('📋 Configuration:');
  console.log(`  - LIFI_API_KEY: ${process.env.LIFI_API_KEY ? '✅ Définie' : '❌ Non définie'}`);
  console.log(`  - Valeur: ${process.env.LIFI_API_KEY ? process.env.LIFI_API_KEY.substring(0, 10) + '...' : 'N/A'}`);
  console.log('');

  if (!process.env.LIFI_API_KEY || process.env.LIFI_API_KEY === 'your_lifi_api_key') {
    console.log('❌ Erreur: LIFI_API_KEY non définie ou valeur par défaut');
    console.log('💡 Ajoutez votre vraie clé API dans le fichier .env');
    return;
  }

  try {
    console.log('🌐 Test de connectivité Li.Fi...');
    
    const response = await axios.get('https://li.quest/v1/keys/test', {
      headers: {
        'x-lifi-api-key': process.env.LIFI_API_KEY
      },
      timeout: 10000
    });

    console.log('✅ Succès !');
    console.log('📊 Réponse:', response.data);
    console.log('🔑 Clé API valide et fonctionnelle');

  } catch (error) {
    console.log('❌ Erreur lors du test:');
    
    if (error.response) {
      console.log(`  - Status: ${error.response.status}`);
      console.log(`  - Message: ${error.response.data?.message || error.response.statusText}`);
      
      if (error.response.status === 401) {
        console.log('🔑 Clé API invalide ou expirée');
      } else if (error.response.status === 403) {
        console.log('🚫 Accès refusé - vérifiez les permissions de votre clé');
      } else if (error.response.status === 429) {
        console.log('⏰ Rate limit atteint - attendez avant de réessayer');
      }
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.log('🌐 Erreur de connectivité réseau');
    } else {
      console.log(`  - Erreur: ${error.message}`);
    }
  }
}

testLifiApi().catch(console.error);
