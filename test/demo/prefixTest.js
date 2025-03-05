'use strict';

/**
 * Token Prefix Test
 * 
 * This script tests the custom token prefix implementation
 * in both tokenEncoder and compactTokenEncoder.
 */

const tokenEncoder = require('../../utils/tokenEncoder');
const compactTokenEncoder = require('../../utils/compactTokenEncoder');
const config = require('../../config/config');

// Set up simulated token data
const testToken = {
  keyId: '1234567890abcdef1234567890abcdef',
  denomination: 1000,
  secret: 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
  signature: '112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00'
};

// Test different prefixes
const prefixes = [
  config.token.prefix, // Default from config
  'btcpins',          // Custom prefix
  'TEST',             // Alternative prefix
];

// Run tests
console.log('===== Token Prefix Test =====');
console.log(`Default config prefix: ${config.token.prefix}`);
console.log('');

// Test individual token encoding with different prefixes
console.log('1. Testing individual token encoding:');
for (const prefix of prefixes) {
  const tokenWithPrefix = tokenEncoder.encodeToken({
    ...testToken,
    prefix: prefix
  });
  
  console.log(`\nPrefix: ${prefix}`);
  console.log(`Token: ${tokenWithPrefix.substring(0, 40)}...`);
  console.log(`Starts with ${prefix}_: ${tokenWithPrefix.startsWith(prefix + '_')}`);
  
  // Verify we can decode it
  try {
    const decoded = tokenEncoder.decodeToken(tokenWithPrefix);
    console.log(`Successfully decoded token with prefix ${prefix}`);
  } catch (error) {
    console.error(`ERROR: Failed to decode token with prefix ${prefix}: ${error.message}`);
  }
}

// Test token bundling with different prefixes
console.log('\n2. Testing token bundling with different prefixes:');

// Create multiple tokens
const tokens = [];
for (let i = 0; i < 3; i++) {
  // Use default prefix for individual tokens
  const token = tokenEncoder.encodeToken({
    ...testToken,
    denomination: testToken.denomination * (i + 1), // Different denominations
    secret: testToken.secret.replace(/00/, (i + 10).toString(16).padStart(2, '0')), // Different secrets
  });
  tokens.push(token);
}

for (const prefix of prefixes) {
  console.log(`\nPrefix: ${prefix}`);
  
  // Standard bundling
  const standardBundle = tokenEncoder.bundleTokens(tokens, prefix);
  console.log(`Standard Bundle: ${standardBundle.substring(0, 40)}...`);
  console.log(`Starts with ${prefix}: ${standardBundle.startsWith(prefix)}`);
  
  // Compact bundling
  const compactBundle = compactTokenEncoder.bundleTokensCompact(tokens, prefix);
  console.log(`Compact Bundle: ${compactBundle.substring(0, 40)}...`);
  console.log(`Starts with ${prefix}: ${compactBundle.startsWith(prefix)}`);
  
  // Verify we can unbundle them
  try {
    const standardUnbundled = tokenEncoder.unbundleTokens(standardBundle);
    console.log(`Successfully unbundled standard bundle with prefix ${prefix} (${standardUnbundled.length} tokens)`);
  } catch (error) {
    console.error(`ERROR: Failed to unbundle standard bundle with prefix ${prefix}: ${error.message}`);
  }
  
  try {
    const compactUnbundled = compactTokenEncoder.unbundleTokensCompact(compactBundle);
    console.log(`Successfully unbundled compact bundle with prefix ${prefix} (${compactUnbundled.length} tokens)`);
  } catch (error) {
    console.error(`ERROR: Failed to unbundle compact bundle with prefix ${prefix}: ${error.message}`);
  }
}

console.log('\n===== Test Complete =====');