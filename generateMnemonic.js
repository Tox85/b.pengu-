const bip39 = require('bip39');

// 256 bits = 24 mots ; 128 bits = 12 mots
const strength = 256;

(async () => {
  const mnemonic = await bip39.generateMnemonic(strength);
  console.log(mnemonic);
})();
