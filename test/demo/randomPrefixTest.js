'use strict';

/**
 * Random Prefix Test
 * 
 * This script tests token creation, verification, and bundling
 * with a randomly generated prefix.
 */

const tokenEncoder = require('../../utils/tokenEncoder');
const compactTokenEncoder = require('../../utils/compactTokenEncoder');
const config = require('../../config/config');
const crypto = require('crypto');

// Generate a random prefix of 5-10 characters
function generateRandomPrefix() {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const length = 5 + Math.floor(Math.random() * 6); // 5-10 characters
  let prefix = '';
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    prefix += charset[randomIndex];
  }
  
  return prefix;
}

// Create test token data
function createTestToken(denomination = 1000) {
  return {
    keyId: crypto.randomBytes(16).toString('hex'),
    denomination: denomination,
    secret: crypto.randomBytes(32).toString('hex'),
    signature: crypto.randomBytes(64).toString('hex')
  };
}

// Start the test
console.log('===== Random Prefix Test =====\n');

// Generate a random prefix
const randomPrefix = generateRandomPrefix();
console.log(`Generated random prefix: "${randomPrefix}"`);

// STEP 1: Create individual tokens with the random prefix
console.log('\n1. INDIVIDUAL TOKEN TEST');
const testToken = createTestToken();
testToken.prefix = randomPrefix;

// Encode the token with the random prefix
const encodedToken = tokenEncoder.encodeToken(testToken);
console.log(`Created token: ${encodedToken.substring(0, 40)}...`);
console.log(`Token starts with "${randomPrefix}_": ${encodedToken.startsWith(randomPrefix + '_')}`);

// Test decoding
try {
  const decodedToken = tokenEncoder.decodeToken(encodedToken);
  console.log(`✅ Successfully decoded individual token`);
  console.log(`Token properties: keyId=${decodedToken.keyId.substring(0, 8)}..., denomination=${decodedToken.denomination}`);
} catch (error) {
  console.error(`❌ ERROR: Failed to decode token: ${error.message}`);
}

// STEP 2: Create token bundle with the random prefix
console.log('\n2. TOKEN BUNDLE TEST');

// Create multiple tokens
const tokens = [];
for (let i = 0; i < 3; i++) {
  const token = tokenEncoder.encodeToken({
    ...createTestToken(Math.pow(2, i + 3)), // Different denominations: 8, 16, 32
    prefix: randomPrefix
  });
  tokens.push(token);
}

console.log(`Created ${tokens.length} individual tokens`);

// Bundle tokens with the random prefix
const bundle = compactTokenEncoder.bundleTokensCompact(tokens, randomPrefix);
console.log(`Created compact bundle: ${bundle.substring(0, 50)}...`);
console.log(`Bundle starts with "${randomPrefix}": ${bundle.startsWith(randomPrefix)}`);

// Unbundle the tokens
try {
  const unbundledTokens = compactTokenEncoder.unbundleTokensCompact(bundle);
  console.log(`✅ Successfully unbundled tokens (${unbundledTokens.length} tokens)`);
  
  // Verify the format of the first unbundled token
  if (unbundledTokens.length > 0) {
    const firstToken = unbundledTokens[0];
    console.log(`First unbundled token: ${firstToken.substring(0, 40)}...`);
    
    try {
      const decodedToken = tokenEncoder.decodeToken(firstToken);
      console.log(`✅ Successfully decoded first token from bundle`);
      console.log(`Token properties: keyId=${decodedToken.keyId.substring(0, 8)}..., denomination=${decodedToken.denomination}`);
    } catch (tokenError) {
      console.error(`❌ ERROR: Failed to decode token from bundle: ${tokenError.message}`);
    }
  }
} catch (error) {
  console.error(`❌ ERROR: Failed to unbundle tokens: ${error.message}`);
}

// STEP 3: Test the token format detection
console.log('\n3. TOKEN FORMAT DETECTION TEST');

// Test individual token detection
const isIndividualToken = encodedToken.includes('_');
console.log(`Individual token contains underscore: ${isIndividualToken}`);

// Test compact bundle detection
const isCompactBundle = bundle.match(/^[a-zA-Z0-9]+oWF/);
console.log(`Bundle matches compact format pattern: ${!!isCompactBundle}`);

// STEP 4: Summary
console.log('\n===== TEST SUMMARY =====');
const individualTokenSuccess = encodedToken.startsWith(randomPrefix + '_');
const bundleSuccess = bundle.startsWith(randomPrefix) && bundle.match(/^[a-zA-Z0-9]+oWF/);

console.log(`Individual token test: ${individualTokenSuccess ? '✅ PASSED' : '❌ FAILED'}`);
console.log(`Bundle test: ${bundleSuccess ? '✅ PASSED' : '❌ FAILED'}`);
console.log(`Overall result: ${individualTokenSuccess && bundleSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
console.log('\n===== Test Complete =====');