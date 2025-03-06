'use strict';

/**
 * Simple Prefix Test
 * 
 * This script tests that the token encoders properly 
 * handle custom prefixes, including random ones.
 */

const tokenEncoder = require('../../utils/tokenEncoder');
const config = require('../../config/config');

// Start the test
console.log('===== Simple Prefix Test =====\n');

// Sample token data
const testToken = {
  keyId: '1234567890abcdef1234567890abcdef',
  denomination: 1000,
  secret: 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
  signature: '112233445566778899aabbccddeeff00112233445566778899aabbccddeeff00'
};

// List of prefixes to test
const prefixesToTest = [
  config.token.prefix,           // Default from config
  'btcpins',                     // Specific request
  'GM',                          // Original default
  'satoshi',                     // Another specific request
  'a',                           // Single character
  'abcdefghijklmnopqrstuvwxyz',  // Very long
  'Prefix123',                   // Mixed case with numbers
  'X1Y2',                        // Mixed case and numbers
  '123abc',                      // Starting with numbers
  Math.random().toString(36).substring(2, 10)  // Random
];

// Test all prefixes
let allTestsPassed = true;

for (const prefix of prefixesToTest) {
  console.log(`\nTesting prefix: "${prefix}"`);
  
  try {
    // Create token with custom prefix
    const token = tokenEncoder.encodeToken({
      ...testToken,
      prefix: prefix
    });
    
    // Verify it has the correct prefix
    const hasCorrectPrefix = token.startsWith(`${prefix}_`);
    console.log(`Token starts with ${prefix}_: ${hasCorrectPrefix}`);
    
    // Try to decode it
    try {
      const decodedToken = tokenEncoder.decodeToken(token);
      console.log(`✅ PASS: Successfully encoded and decoded token with prefix "${prefix}"`);
    } catch (decodeError) {
      console.error(`❌ FAIL: Failed to decode token with prefix "${prefix}": ${decodeError.message}`);
      allTestsPassed = false;
    }
  } catch (encodeError) {
    console.error(`❌ FAIL: Failed to encode token with prefix "${prefix}": ${encodeError.message}`);
    allTestsPassed = false;
  }
}

// Final summary
console.log('\n===== TEST SUMMARY =====');
console.log(`Overall result: ${allTestsPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
console.log('\n===== Test Complete =====');