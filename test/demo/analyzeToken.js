'use strict';

const token = 'btcpinsoWF0gaJhaVBFyYNG_NuFVRi8FghOjAQCYXCBo2FhAmFzeEA0YjcxN2UyMDgwN2ZlNWJiZTc1ODk5NGQyMTdiMjU2ODVlODJiMjk0MmMzNjI0YTg5NmZlOTI5MzkxMTI4OGVmYWNYQdnwLNYei_MVmvtn3AAQg8q-Geh1zk9q6L_v6FXjSBXcSWOLJDaaEVHVqe4uW-RMXBdIdvLvUsKem9VmMCQFn_MB-7NHmK8tB-uhmUftkNx5oUfpq5jFBhffl6nqMZvcurps80CcNevfzO_n9VcqcQQQ1cIzT4QBo2FhGCBhc3hAODE0MDMwNzg3ODI4MDhkMTY5NjUxYTIyN2FmNzNjYjE0OWE4MDAxZTdkMjY2YTc3MTc0Y2EwOWZmNTY4ZTBjNmFjWEFfxeoYhRB8o4WEa5RVOXGj9NRspxC6RYdKsnNY_BqkzDlnwi0vObR_psbBvBIfE_4GGAX5Ttl0iWiT5VQbBTQ7AaNhYRhAYXN4QDM4NjJkYzYxMjc3MjViZDk2NzQ0MDM4ODI1NjA4MGYwNjE0NGRlYjY3MTliYjVmNWZiYWJmOGIyZDYzMTMyOTBhY1hB0AGqGZtxx52U5cywjwA1P9k6AhXBCTwng84lXPqM7qQEJb2W6BTWhKHSdOCtYZ34uSgVdnmy8y9kPkB9gvcuTwGjYWEYgGFzeEAyZGYwNDY4M2RhOWY3ZDFkZWM4NzRkMTYyZDQzYzU2MDA4MDczMDM3NTNiYjA3NmVmZTdmNTA0OTZmNGU4ODM0YWNYQdjHjGRhm9kUVUoZrJA3IgmF7Sv8dQ3InvGf1H3eKSyfCHXsS5CGqWbCl2e0RPZwsAcytKv6kdEp81rrLjwi9Q4Bo2FhGQEAYXN4QGU5NzE0OTkxNjBkZTcyZDBkOTE0NzljODgwMjZiNzZkNzIzYjIyMTVlNzA1ODRhOWViMmJmMGFjMjAzOTQ4NTBhY1hBzI7ZHqCKaEaNJ4qUiFZqaK466RRaSAYrw9gh88ZnrlUx-TRRMsBO96kji7dJIwuCOcKnU3BOvkwmP817abDTxgCjYWEZAgBhc3hAZTYzYTYyNzMwZDRiYmU3NzFmNzYyMDJiZjk0ZGQ0ODZiODAwNzA3ZTNhMGI5NDhmZGUxYmJhYTBmOTQ2YTI2MGFjWEF1uQ4WWGw5wxZsM92c9_S3ulAs-aeKD9_wW6PaHBSaIF5gktHs1oW5zVh1gBuJyAPh9lb0t3fHTlrnLzjYRvoZAA';

// Basic pattern detection
console.log('Token starts with:', token.substring(0, 20));
console.log('Token contains underscore:', token.includes('_')); 
console.log('Token contains oWF pattern:', token.includes('oWF'));

// Position analysis
const underscorePos = token.indexOf('_');
const oWFPos = token.indexOf('oWF');
console.log('Position of underscore:', underscorePos);
console.log('Position of oWF pattern:', oWFPos);

// Our format detection logic
const isCompactFormat = token.match(/^[a-zA-Z0-9]+oWF/) !== null;
const isIndividualToken = token.includes('_');
console.log('Would be detected as compact format:', isCompactFormat);
console.log('Would be detected as individual token:', isIndividualToken);

// If both patterns are detected, there's a conflict in our logic
if (isCompactFormat && isIndividualToken) {
  console.log('ISSUE DETECTED: Token contains both compact format and individual token markers');
  console.log('Our current logic prioritizes compact format detection over individual token detection');
  console.log('This is likely causing the verification issue');
}

// Analyze the CBOR structure
console.log('\nToken structure details:');
const cborPattern = 'oWF0';
const cborCount = token.split(cborPattern).length - 1;
console.log(`- CBOR pattern "oWF0" appears ${cborCount} times`);

// Check for token pattern repetition (key indicator of a bundle with multiple tokens)
const tokenGroupPattern = 'o2Fh';
const tokenGroupCount = token.split(tokenGroupPattern).length - 1;
console.log(`- Token group pattern "o2Fh" appears ${tokenGroupCount} times`);

// This seems to be a key issue - the token contains multiple sections that look like tokens
if (tokenGroupCount > 1) {
  console.log('\nThis token appears to be a bundle containing multiple token entries');
  console.log('Each "o2Fh" marker likely indicates a separate token in the bundle');
  console.log('The system is correctly identifying this as a bundle, not an individual token');
}

// Special inspection: number type indicator (a common pattern in our CBOR tokens)
if (token.includes('GQE') || token.includes('GQI')) {
  console.log('\nFound denomination markers: GQE/GQI');
  console.log('These are typically used to indicate the denomination values (usually 1 and 2)');
  console.log('Confirming this is likely a valid token bundle that contains 2-value tokens');
}