'use strict';

/**
 * Token Verification Test
 * 
 * This script tests the token verification process with custom prefixes
 */

const tokenEncoder = require('../../utils/tokenEncoder');
const compactTokenEncoder = require('../../utils/compactTokenEncoder');
const config = require('../../config/config');

// Test token to verify
const testToken = "btcpinsoWF0gaJhaVBFyYNG_NuFVRi8FghOjAQCYXCGo2FhCGFzeEBhODBmZmExOTIwMmY2NGMwNDIzOTE0ZDM0Yjk1MGJkNzA3ZjI5YTZiMjE2NWY3NDU5ZWY1NWJkNjg3YjU1NzQ1YWNYQZJoPPBjeEU05krX-7NHmK8tB-uhmUftkNx5oUfpq5jFBhffl6nqMZvcurps80CcNevfzO_n9VcqcQQQ1cIzT4QBo2FhGCBhc3hAODE0MDMwNzg3ODI4MDhkMTY5NjUxYTIyN2FmNzNjYjE0OWE4MDAxZTdkMjY2YTc3MTc0Y2EwOWZmNTY4ZTBjNmFjWEFfxeoYhRB8o4WEa5RVOXGj9NRspxC6RYdKsnNY_BqkzDlnwi0vObR_psbBvBIfE_4GGAX5Ttl0iWiT5VQbBTQ7AaNhYRhAYXN4QDM4NjJkYzYxMjc3MjViZDk2NzQ0MDM4ODI1NjA4MGYwNjE0NGRlYjY3MTliYjVmNWZiYWJmOGIyZDYzMTMyOTBhY1hB0AGqGZtxx52U5cywjwA1P9k6AhXBCTwng84lXPqM7qQEJb2W6BTWhKHSdOCtYZ34uSgVdnmy8y9kPkB9gvcuTwGjYWEYgGFzeEAyZGYwNDY4M2RhOWY3ZDFkZWM4NzRkMTYyZDQzYzU2MDA4MDczMDM3NTNiYjA3NmVmZTdmNTA0OTZmNGU4ODM0YWNYQdjHjGRhm9kUVUoZrJA3IgmF7Sv8dQ3InvGf1H3eKSyfCHXsS5CGqWbCl2e0RPZwsAcytKv6kdEp81rrLjwi9Q4Bo2FhGQEAYXN4QGU5NzE0OTkxNjBkZTcyZDBkOTE0NzljODgwMjZiNzZkNzIzYjIyMTVlNzA1ODRhOWViMmJmMGFjMjAzOTQ4NTBhY1hBzI7ZHqCKaEaNJ4qUiFZqaK466RRaSAYrw9gh88ZnrlUx-TRRMsBO96kji7dJIwuCOcKnU3BOvkwmP817abDTxgCjYWEZAgBhc3hAZTYzYTYyNzMwZDRiYmU3NzFmNzYyMDJiZjk0ZGQ0ODZiODAwNzA3ZTNhMGI5NDhmZGUxYmJhYTBmOTQ2YTI2MGFjWEF1uQ4WWGw5wxZsM92c9_S3ulAs-aeKD9_wW6PaHBSaIF5gktHs1oW5zVh1gBuJyAPh9lb0t3fHTlrnLzjYRvoZAA";

// Verification test
console.log('===== Token Verification Test =====');
console.log(`Token starts with: ${testToken.substring(0, 30)}...`);
console.log(`Token length: ${testToken.length}`);
console.log('');

// Step 1: Try to unbundle the token
console.log('1. Attempting to unbundle the token:');

// Try standard unbundling
try {
  console.log('- Trying standard unbundler:');
  const unbundledStandard = tokenEncoder.unbundleTokens(testToken);
  console.log(`  Success! Unbundled ${unbundledStandard.length} tokens`);
} catch (standardError) {
  console.error(`  Failed standard unbundling: ${standardError.message}`);
}

// Try compact unbundling
try {
  console.log('- Trying compact unbundler:');
  const unbundledCompact = compactTokenEncoder.unbundleTokensCompact(testToken);
  console.log(`  Success! Unbundled ${unbundledCompact.length} tokens`);
  
  // Print the first token details
  if (unbundledCompact.length > 0) {
    console.log(`  First token: ${unbundledCompact[0].substring(0, 30)}...`);
    
    // Try to decode the first token
    try {
      const decodedToken = tokenEncoder.decodeToken(unbundledCompact[0]);
      console.log(`  Token details: keyId=${decodedToken.keyId.substring(0, 8)}, denomination=${decodedToken.denomination}`);
    } catch (decodeError) {
      console.error(`  Failed to decode token: ${decodeError.message}`);
    }
  }
} catch (compactError) {
  console.error(`  Failed compact unbundling: ${compactError.message}`);
}

// Step 2: Try to verify if token is valid (without actual database checks)
console.log('\n2. Examining token structure:');

if (testToken.startsWith('btcpins')) {
  console.log('- Token has correct "btcpins" prefix');
  
  // Try to remove prefix
  const withoutPrefix = testToken.substring('btcpins'.length);
  console.log(`- After prefix removal, starts with: ${withoutPrefix.substring(0, 20)}...`);
  
  try {
    // Try to decode as base64url and then CBOR
    const bundleBuffer = Buffer.from(withoutPrefix, 'base64url');
    console.log(`- Successfully decoded base64url, buffer length: ${bundleBuffer.length}`);
    
    const cbor = require('cbor');
    try {
      const decoded = cbor.decode(bundleBuffer);
      console.log('- Successfully decoded CBOR structure');
      console.log(`- Bundle structure: ${JSON.stringify(decoded).substring(0, 100)}...`);
    } catch (cborError) {
      console.error(`- CBOR decoding error: ${cborError.message}`);
    }
  } catch (base64Error) {
    console.error(`- Base64url decoding error: ${base64Error.message}`);
  }
} else {
  console.error(`- Token does not start with expected prefix "btcpins"`);
}

console.log('\n===== Test Complete =====');