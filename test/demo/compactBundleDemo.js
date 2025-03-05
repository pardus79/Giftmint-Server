'use strict';

// This is a demonstration script that shows the compact token bundling process
// and compares it with the standard bundling approach

const config = require('../../config/config');
const keyManager = require('../../crypto/ecKeyManager');
const blindSignature = require('../../crypto/ecBlindSignature');
const tokenEncoder = require('../../utils/tokenEncoder');
const compactTokenEncoder = require('../../utils/compactTokenEncoder');
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
  console.log('\nStarting Compact Token Bundling Demonstration\n');
  
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
        
        tokens.push(token);
        createdAmount += denomInt;
      }
    }
    
    // Display sample of the individual tokens
    if (tokens.length > 0) {
      formatOutput('Sample Individual Token', 
        tokens[0].length > 100 
          ? `${tokens[0].substring(0, 100)}... (${tokens[0].length} chars)`
          : tokens[0]
      );
    }
    
    console.log(`Created ${tokens.length} tokens with a total value of ${createdAmount}`);
    
    // Compare bundling methods
    console.log('\nComparing bundling methods...');
    
    // Standard bundling
    console.log('Creating standard token bundle...');
    const standardBundle = tokenEncoder.bundleTokens(tokens);
    formatOutput('Standard Bundle', 
      standardBundle.length > 100 
        ? `${standardBundle.substring(0, 100)}... (${standardBundle.length} chars)`
        : standardBundle
    );
    
    // Compact bundling
    console.log('Creating compact token bundle...');
    const compactBundle = compactTokenEncoder.bundleTokensCompact(tokens);
    formatOutput('Compact Bundle', 
      compactBundle.length > 100 
        ? `${compactBundle.substring(0, 100)}... (${compactBundle.length} chars)`
        : compactBundle
    );
    
    // Size comparison
    const comparison = compactTokenEncoder.compareBundleSizes(tokens);
    formatOutput('Size Comparison', 
      `Standard bundle size: ${comparison.standardSize} characters\n` +
      `Compact bundle size: ${comparison.compactSize} characters\n` +
      `Size reduction: ${comparison.reduction} characters\n` +
      `Space saved: ${comparison.percentSaved}%`
    );
    
    // Verify that compact bundling works
    console.log('Verifying compact bundle...');
    const unbundledTokens = compactTokenEncoder.unbundleTokensCompact(compactBundle);
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
    
    if (verifiedAmount === createdAmount) {
      console.log('\n✅ VERIFICATION SUCCESSFUL: All tokens verified and total amount matches!');
    } else {
      console.log('\n❌ VERIFICATION FAILED: Amounts do not match!');
      console.log(`Expected: ${createdAmount}, Got: ${verifiedAmount}`);
    }
    
    await cleanupTestEnv();
  } catch (error) {
    console.error('Error in token bundling demo:', error.stack);
  }
};

// Run the demo
runDemo()
  .then(() => {
    console.log('\nCompact token bundling demonstration complete.\n');
    process.exit(0);
  })
  .catch(err => {
    console.error('Failed to run compact token bundling demo:', err);
    process.exit(1);
  });