const { AnchorProvider, Wallet } = require("@coral-xyz/anchor");
const { Keypair } = require("@solana/web3.js");

/**
 * Crée un wallet Anchor à partir d'un Keypair
 */
function makeWalletFromKeypair(kp) {
  /** @type {import('@coral-xyz/anchor').Wallet} */
  return {
    publicKey: kp.publicKey,
    signTransaction: async (tx) => { 
      tx.partialSign(kp); 
      return tx; 
    },
    signAllTransactions: async (txs) => { 
      txs.forEach(tx => tx.partialSign(kp)); 
      return txs; 
    }
  };
}

/**
 * Crée un provider Anchor avec un wallet
 */
function makeProvider(connection, keypair) {
  const wallet = makeWalletFromKeypair(keypair);
  return new AnchorProvider(connection, wallet, AnchorProvider.defaultOptions());
}

module.exports = { makeProvider, makeWalletFromKeypair };
