'use strict';

/**
 * Token Format Detection Test
 * 
 * This script tests the token format detection logic to ensure different
 * formats are properly identified and handled.
 */

// Sample token parts for testing
const sampleTokens = {
  // Standard individual token (with underscore)
  standardIndividual: "btcpins_eyJpZCI6IjdiYjExNDZmMDE4Njc5M2UxNTk0NzhiZWRlMTQ4NzJiM2E5NzEyYjZhYWVjYmE4MGJiMmYzNjY1NmViNTc5ZmYiLCJrZXlJZCI6IjQ1Yzk4MzQ2ZmNkYjg1NTUxOGJjMTYwODRlOGMwNDAyIiwiZGVub21pbmF0aW9uIjo4LCJzZWNyZXQiOiJhODBmZmExOTIwMmY2NGMwNDIzOTE0ZDM0Yjk1MGJkNzA3ZjI5YTZiMjE2NWY3NDU5ZWY1NWJkNjg3YjU1NzQ1Iiwic2lnbmF0dXJlIjoiOTI2ODNjZjA2Mzc4NDUzNGU2NGFkN2ZiYjM0Nzk4YWYyZDA3ZWJhMTk5NDdlZDkwZGM3OWExNDdlOWFiOThjNTA2MTdkZjk3YTllYTMxOWJkY2JhYmE2Y2YzNDA5YzM1ZWJkZmNjZWZlN2Y1NTcyYTcxMDQxMGQ1YzIzMzRmODQwMSJ9",
  
  // Compact bundle (no underscore, starts with prefix+oWF)
  compactBundle: "btcpinsoWF0gaJhaVBFyYNG_NuFVRi8FghOjAQCYXCBo2FhAmFzeEBkZjUwYTRiMDcxNDY1M2JkMjFiMGZjNWMxNWYyMzU1MmY3NmE4YzdlMzZhMDc3YmY0ZmIyMDhmMWQ1OWNjNWY3YWNYQZ6SbLw5_3iUFF5orsCFjdNYN8YyEHJm3G1t6eFtHYT0Y6QV2tS9jTfQM6PcwrHk4bOq_nNvN9OiIXbTkrL1tmYB",
  
  // Standard bundle (no underscore, starts with prefix+oWZ)
  standardBundle: "btcpinsoWZ0b2tlbnOheCAxMjM0NTY3ODkwYWJjZGVmMTIzNDU2Nzg5MGFiY2RlZoOjYWQZA"
};

// Run the tests
console.log('===== Token Format Detection Test =====\n');

// Test 1: Test regex patterns for format detection
function testFormatDetection(token, name) {
  console.log(`Testing format detection for: ${name}`);
  console.log(`Token: ${token.substring(0, 40)}...`);
  
  // Check if this looks like a compact bundle format (starts with prefix followed by CBOR data)
  const isCompactFormat = token.match(/^[a-zA-Z0-9]+oWF/);
  // Check if this looks like a standard bundle format (starts with prefix followed by base64)
  const isStandardFormat = token.match(/^[a-zA-Z0-9]+oWZ/);
  // Check if this looks like an individual token (contains underscore)
  const isIndividualToken = token.includes('_');
  
  console.log(`Results:`);
  console.log(`- Compact bundle: ${isCompactFormat ? '✅ DETECTED' : '❌ NOT DETECTED'}`);
  console.log(`- Standard bundle: ${isStandardFormat ? '✅ DETECTED' : '❌ NOT DETECTED'}`);
  console.log(`- Individual token: ${isIndividualToken ? '✅ DETECTED' : '❌ NOT DETECTED'}`);
  
  // Determine format based on detection (with priority)
  let detectedFormat = '';
  if (isCompactFormat) {
    // Compact format has highest priority
    detectedFormat = 'COMPACT BUNDLE';
  } else if (isStandardFormat) {
    // Standard bundle format has second priority
    detectedFormat = 'STANDARD BUNDLE';
  } else if (isIndividualToken) {
    // Individual token detection has lowest priority
    detectedFormat = 'INDIVIDUAL TOKEN';
  } else {
    detectedFormat = 'UNKNOWN FORMAT';
  }
  
  // Check for edge case: token starts with prefix + underscore and then has valid base64
  const startsWithPrefixUnderscore = token.match(/^[a-zA-Z0-9]+_[A-Za-z0-9+/=_-]+$/);
  if (startsWithPrefixUnderscore) {
    console.log('Note: This token matches the individual token pattern precisely');
  }
  
  console.log(`Conclusion: Token is ${detectedFormat}`);
  console.log('');
  
  return { isCompactFormat, isStandardFormat, isIndividualToken, detectedFormat };
}

// Test each token type
const results = {};
for (const [name, token] of Object.entries(sampleTokens)) {
  results[name] = testFormatDetection(token, name);
}

// Verify test results match expected
console.log('===== Test Results =====');
let allTestsPassed = true;

// Expected results
const expected = {
  standardIndividual: 'INDIVIDUAL TOKEN',
  compactBundle: 'COMPACT BUNDLE',
  standardBundle: 'STANDARD BUNDLE'
};

for (const [name, result] of Object.entries(results)) {
  const expectedFormat = expected[name];
  const actualFormat = result.detectedFormat;
  const testPassed = expectedFormat === actualFormat;
  
  if (!testPassed) {
    allTestsPassed = false;
  }
  
  console.log(`${testPassed ? '✅ PASS' : '❌ FAIL'}: ${name}`);
  console.log(`  Expected: ${expectedFormat}, Got: ${actualFormat}`);
}

console.log(`\nOverall result: ${allTestsPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
console.log('===== Test Complete =====');