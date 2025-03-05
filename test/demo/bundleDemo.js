'use strict';

// This is a demonstration script that shows the token bundling process
// with detailed output at each step

const config = require('../../config/config');
const keyManager = require('../../crypto/ecKeyManager');
const blindSignature = require('../../crypto/ecBlindSignature');
const tokenEncoder = require('../../utils/tokenEncoder');
const changeMaker = require('../../utils/changeMaker');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');

// Create directory for test keys
const setupTestEnv = async () => {
  const testKeyDir = path.join(__dirname, '../../test-keys');
  try {
    await fs.mkdir(testKeyDir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }

  // Override config to use test directory
  config.crypto.keyStoragePath = testKeyDir;
};

// Clean up test environment
const cleanupTestEnv = async () => {
  // No cleanup needed for this demo
};

// Get a formatted string for outputs
const formatOutput = (title, data) => {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`${title}:`);
  console.log(`${'='.repeat(80)}\n`);
  console.log(data);
  console.log('\n');
};

// Run the demo
const runDemo = async () => {
  console.log('\nStarting Token Bundling Demonstration\n');
  
  try {
    // Setup
    await setupTestEnv();

    // Create a simple in-memory DB mock for the keyManager
    const dbMock = {
      storeKey: async (key) => key,
      getKeyById: async () => null,
      getActiveKeys: async () => [],
      deactivateKey: async () => true,
      init: async () => true,
      beginTransaction: async () => true,
      commitTransaction: async () => true,
      rollbackTransaction: async () => true
    };
    
    // Mock the database in keyManager
    keyManager._db = dbMock;
    
    // Generate a key for signing
    console.log('Generating key pair for testing...');
    const activeKey = await keyManager.generateKeyPair();
    activeKey.id = crypto.randomBytes(8).toString('hex');
    activeKey.active = true;
    activeKey.expiresAt = new Date(Date.now() + 86400000); // 1 day from now
    
    console.log(`Generated key with ID: ${activeKey.id}`);
    
    // Generate a random amount between 1000 and 5000
    const totalAmount = Math.floor(Math.random() * 4000) + 1000;
    console.log(`\nCreating tokens for a total amount of: ${totalAmount}`);
    
    // Get optimal denomination combination
    const denomCombination = changeMaker.getOptimalCombination(totalAmount, config.denominations);
    formatOutput('Denomination Combination', JSON.stringify(denomCombination, null, 2));
    
    // Create tokens for each denomination
    const tokens = [];
    let createdAmount = 0;
    
    console.log('Creating individual tokens...');
    for (const [denomination, count] of Object.entries(denomCombination)) {
      const denomInt = parseInt(denomination, 10);
      console.log(`Creating ${count} token(s) of denomination ${denomInt}...`);
      
      for (let i = 0; i < count; i++) {
        // Generate random secret
        const secret = crypto.randomBytes(32);
        
        // Create blinded message
        const { blindedMessage, blindingFactor } = blindSignature.blind(secret, activeKey.publicKey);
        
        // Sign with private key
        const blindSig = await blindSignature.sign(blindedMessage, activeKey.privateKey);
        
        // Unblind signature
        const unblindedSignature = blindSignature.unblind(blindSig, blindingFactor, activeKey.publicKey);
        
        // Create token
        const token = tokenEncoder.encodeToken({
          keyId: activeKey.id,
          denomination: denomInt,
          secret: secret.toString('hex'),
          signature: unblindedSignature.toString('hex')
        });
        
        tokens.push({
          token,
          denomination: denomInt,
          secret
        });
        
        createdAmount += denomInt;
      }
    }
    
    // Display sample of the individual tokens
    if (tokens.length > 0) {
      formatOutput('Sample Individual Token (Base64/URL encoded)', 
        tokens[0].token.length > 100 
          ? `${tokens[0].token.substring(0, 100)}... (${tokens[0].token.length} chars)`
          : tokens[0].token
      );
    }
    
    // Display token count and created amount
    console.log(`Created ${tokens.length} tokens with a total value of ${createdAmount}`);
    
    // Bundle the tokens
    console.log('\nBundling all tokens...');
    const tokenStrings = tokens.map(t => t.token);
    const bundledToken = tokenEncoder.bundleTokens(tokenStrings);
    
    // Display the bundled token
    formatOutput('Bundled Token String', 
      bundledToken.length > 100 
        ? `${bundledToken.substring(0, 100)}... (${bundledToken.length} chars)`
        : bundledToken
    );
    
    // Verify the bundled token
    console.log('Verifying the bundled token...');
    
    // Unbundle the tokens
    const unbundledTokens = tokenEncoder.unbundleTokens(bundledToken);
    console.log(`Successfully unbundled ${unbundledTokens.length} tokens.`);
    
    // Verify each token and calculate total
    console.log('\nVerifying each token in the bundle:');
    console.log('-'.repeat(50));
    let verifiedAmount = 0;
    
    for (let i = 0; i < unbundledTokens.length; i++) {
      const token = unbundledTokens[i];
      const decodedToken = tokenEncoder.decodeToken(token);
      
      // Verify signature
      const isValid = blindSignature.verify(
        Buffer.from(decodedToken.secret, 'hex'),
        Buffer.from(decodedToken.signature, 'hex'),
        activeKey.publicKey
      );
      
      if (isValid) {
        verifiedAmount += decodedToken.denomination;
        console.log(`Token ${i+1}: ✓ Valid, Denomination: ${decodedToken.denomination}`);
      } else {
        console.log(`Token ${i+1}: ✗ INVALID, Denomination: ${decodedToken.denomination}`);
      }
    }
    
    console.log('-'.repeat(50));
    console.log(`Total verified amount: ${verifiedAmount}`);
    
    if (verifiedAmount === totalAmount) {
      console.log('\n✅ VERIFICATION SUCCESSFUL: All tokens verified and total amount matches!');
    } else {
      console.log('\n❌ VERIFICATION FAILED: Amounts do not match!');
      console.log(`Expected: ${totalAmount}, Got: ${verifiedAmount}`);
    }
    
    await cleanupTestEnv();
  } catch (error) {
    console.error('Error in token bundling demo:', error.stack);
  }
};

// Run the demo
runDemo()
  .then(() => {
    console.log('\nToken bundling demonstration complete.\n');
    process.exit(0);
  })
  .catch(err => {
    console.error('Failed to run token bundling demo:', err);
    process.exit(1);
  });