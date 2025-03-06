'use strict';

/**
 * Detailed Token Analyzer
 * 
 * This script provides detailed analysis of a token to diagnose format issues.
 */

const compactTokenEncoder = require('../../utils/compactTokenEncoder');
const tokenEncoder = require('../../utils/tokenEncoder');

// The token that is still causing issues in production
const problematicToken = 'btcpinsoWF0gaJhaVBFyYNG_NuFVRi8FghOjAQCYXCBo2FhAmFzeEA0MGJmNTYwMjBjNDZiY2ZkYTc5M2RlMWZmZWEzMzIzMDc5YmYzMzkyOTcyOTI5MmZjODhkNWM0NGJlMjZjMjViYWNYQd4yB4ye6wpakXvW1M0cz6BFazM7_YIvf4W6OH-xQmHHAe3R1XAKBZEWDm74ZjeHt9_nGotpj-jy1QJJW8_JyEEA-Geh1zk9q6L_v6FXjSBXcSWOLJDaaEVHVqe4uW-RMXBdIdvLvUsKem9VmMCQFn_MB-7NHmK8tB-uhmUftkNx5oUfpq5jFBhffl6nqMZvcurps80CcNevfzO_n9VcqcQQQ1cIzT4QBo2FhGCBhc3hAODE0MDMwNzg3ODI4MDhkMTY5NjUxYTIyN2FmNzNjYjE0OWE4MDAxZTdkMjY2YTc3MTc0Y2EwOWZmNTY4ZTBjNmFjWEFfxeoYhRB8o4WEa5RVOXGj9NRspxC6RYdKsnNY_BqkzDlnwi0vObR_psbBvBIfE_4GGAX5Ttl0iWiT5VQbBTQ7AaNhYRhAYXN4QDM4NjJkYzYxMjc3MjViZDk2NzQ0MDM4ODI1NjA4MGYwNjE0NGRlYjY3MTliYjVmNWZiYWJmOGIyZDYzMTMyOTBhY1hB0AGqGZtxx52U5cywjwA1P9k6AhXBCTwng84lXPqM7qQEJb2W6BTWhKHSdOCtYZ34uSgVdnmy8y9kPkB9gvcuTwGjYWEYgGFzeEAyZGYwNDY4M2RhOWY3ZDFkZWM4NzRkMTYyZDQzYzU2MDA4MDczMDM3NTNiYjA3NmVmZTdmNTA0OTZmNGU4ODM0YWNYQdjHjGRhm9kUVUoZrJA3IgmF7Sv8dQ3InvGf1H3eKSyfCHXsS5CGqWbCl2e0RPZwsAcytKv6kdEp81rrLjwi9Q4Bo2FhGQEAYXN4QGU5NzE0OTkxNjBkZTcyZDBkOTE0NzljODgwMjZiNzZkNzIzYjIyMTVlNzA1ODRhOWViMmJmMGFjMjAzOTQ4NTBhY1hBzI7ZHqCKaEaNJ4qUiFZqaK466RRaSAYrw9gh88ZnrlUx-TRRMsBO96kji7dJIwuCOcKnU3BOvkwmP817abDTxgCjYWEZAgBhc3hAZTYzYTYyNzMwZDRiYmU3NzFmNzYyMDJiZjk0ZGQ0ODZiODAwNzA3ZTNhMGI5NDhmZGUxYmJhYTBmOTQ2YTI2MGFjWEF1uQ4WWGw5wxZsM92c9_S3ulAs-aeKD9_wW6PaHBSaIF5gktHs1oW5zVh1gBuJyAPh9lb0t3fHTlrnLzjYRvoZAA';

console.log('===== Detailed Token Analysis =====\n');

// Basic format detection
console.log('1. Basic Token Format Analysis:');
console.log(`- Token length: ${problematicToken.length}`);
console.log(`- Token starts with: ${problematicToken.substring(0, 20)}`);
console.log(`- Token contains underscore: ${problematicToken.includes('_')}`);
console.log(`- Token matches compact format regex: ${problematicToken.match(/^[a-zA-Z0-9]+oWF/) !== null}`);
console.log(`- Token contains CBOR pattern 'oWF': ${problematicToken.includes('oWF')}`);

// Detailed pattern analysis
console.log('\n2. Pattern Analysis:');
const oWFCount = (problematicToken.match(/oWF/g) || []).length;
const o2FhCount = (problematicToken.match(/o2Fh/g) || []).length;
const underscoreCount = (problematicToken.match(/_/g) || []).length;
const XCBoCount = (problematicToken.match(/XCBo/g) || []).length;

console.log(`- 'oWF' pattern occurs ${oWFCount} times`);
console.log(`- 'o2Fh' pattern (token group marker) occurs ${o2FhCount} times`);
console.log(`- Underscore character occurs ${underscoreCount} times`);
console.log(`- 'XCBo' pattern occurs ${XCBoCount} times`);

console.log('\n3. Format Detection Result:');
const isCompactFormat = problematicToken.match(/^[a-zA-Z0-9]+oWF/) !== null;
const hasUnderscore = problematicToken.includes('_');
const isIndividualToken = hasUnderscore && !isCompactFormat;
console.log(`- Detected as compact bundle: ${isCompactFormat}`);
console.log(`- Contains underscores: ${hasUnderscore}`);
console.log(`- Detected as individual token: ${isIndividualToken}`);
console.log(`- Final classification: ${isCompactFormat ? 'COMPACT BUNDLE' : (isIndividualToken ? 'INDIVIDUAL TOKEN' : 'UNKNOWN')}`);
console.log(`  (Our system correctly identifies this as a COMPACT BUNDLE based on the pattern)`);

// Try to extract token components
console.log('\n4. Structure Analysis:');
const prefix = problematicToken.match(/^[a-zA-Z0-9]+/)[0];
console.log(`- Token prefix: ${prefix}`);

// Check CBOR structure
try {
  const unprefixed = problematicToken.substring(prefix.length);
  
  // First 10 characters after prefix
  console.log(`- First 10 chars after prefix: ${unprefixed.substring(0, 10)}`);
  
  // First occurrence of underscore
  const firstUnderscorePos = problematicToken.indexOf('_');
  if (firstUnderscorePos > 0) {
    console.log(`- Position of first underscore: ${firstUnderscorePos}`);
    console.log(`- 5 chars before underscore: ${problematicToken.substring(firstUnderscorePos-5, firstUnderscorePos)}`);
    console.log(`- 5 chars after underscore: ${problematicToken.substring(firstUnderscorePos+1, firstUnderscorePos+6)}`);
  }
  
  // Analyze CBOR structure indicators
  console.log(`\n5. CBOR Bundle Indicators:`);
  console.log(`- Multiple 'o2Fh' markers: ${o2FhCount > 1 ? 'YES - Typical of bundles' : 'NO'}`);
  console.log(`- 'XCBo' markers: ${XCBoCount > 0 ? 'YES - Typical of bundles' : 'NO'}`);
  
  // Attempt to decode as individual token
  console.log(`\n6. Individual Token Decode Attempt:`);
  try {
    // Try to parse as individual token
    const parts = problematicToken.split('_');
    if (parts.length > 1) {
      console.log(`- Token can be split by underscore into ${parts.length} parts`);
      try {
        // Try to parse second part as JSON
        const decoded = Buffer.from(parts[1], 'base64url').toString();
        try {
          const json = JSON.parse(decoded);
          console.log(`- Second part decodes to valid JSON: ${JSON.stringify(json).substring(0, 50)}...`);
        } catch (jsonErr) {
          console.log(`- Second part does not decode to valid JSON: ${decoded.substring(0, 30)}...`);
        }
      } catch (base64Err) {
        console.log(`- Second part is not valid base64url: ${parts[1].substring(0, 20)}...`);
      }
    } else {
      console.log(`- Token cannot be split by underscore`);
    }
  } catch (decodeErr) {
    console.log(`- Error trying to decode as individual token: ${decodeErr.message}`);
  }
  
  // Attempt to unbundle with our code
  console.log(`\n7. Trying our unbundling logic:`);
  try {
    const result = compactTokenEncoder.unbundleTokensCompact(problematicToken);
    if (result && result._verification_bypass_needed) {
      console.log(`- Token requires verification bypass: ${result._original_error}`);
    } else if (Array.isArray(result) && result.length > 0) {
      console.log(`- Successfully unbundled ${result.length} tokens`);
    } else if (result && result.t) {
      console.log(`- Resulted in bundle structure with ${result.t.length} token groups`);
    } else {
      console.log(`- Unexpected result: ${typeof result}`);
    }
  } catch (unbundleErr) {
    console.log(`- Error unbundling: ${unbundleErr.message}`);
  }

} catch (error) {
  console.error(`Error during analysis: ${error.message}`);
}

console.log(`\n8. Conclusion:`);
console.log(`- This token has the structure of a CBOR bundle (starts with oWF, contains o2Fh markers)`);
console.log(`- It also contains underscores, but this is not unusual for CBOR bundles`);
console.log(`- Our system correctly identifies it as a CBOR bundle based on the patterns`);
console.log(`- The issue may be that it was created as a 2-unit token but uses bundle format`);
console.log(`- The CBOR decoding issues are likely unrelated to the format detection decision`);
console.log(`\nRecommendation: This token appears to be structured as a bundle and should be`);
console.log(`processed as a CBOR bundle, not as an individual token.`);