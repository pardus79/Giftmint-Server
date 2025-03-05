# Compact Token Bundling

This document describes the compact token bundling feature implemented in the Giftmint Server.

## Overview

The compact token bundling feature provides a more space-efficient way to encode and bundle tokens. It uses techniques inspired by the Cashu v4 token format to reduce the size of bundled tokens by approximately 30%.

## Implementation Details

The implementation is in `/utils/compactTokenEncoder.js` and includes the following key features:

1. **CBOR Binary Format**: Uses CBOR (Concise Binary Object Representation) for efficient binary encoding
2. **Single-character Field Names**: Uses short field names (`a` for amount, `s` for secret, etc.)
3. **Binary Encoding for Hex Strings**: Encodes signatures and IDs as binary data instead of hex strings
4. **Efficient Token Grouping**: Groups tokens by key ID to avoid redundancy

## Usage

Compact bundling is enabled by default in the tokenController. The controller can detect and handle both standard and compact bundles automatically.

### Key Functions

- `bundleTokensCompact(tokens)`: Bundles an array of tokens into a compact format
- `unbundleTokensCompact(bundle)`: Unbundles a compact token bundle into individual tokens
- `compareBundleSizes(tokens)`: Compares sizes between standard and compact bundling

### Configuration

The `useCompactEncoding` flag in `api/tokenController.js` can be used to enable or disable compact encoding:

```javascript
// Use compact encoding by default for better space efficiency
const useCompactEncoding = true;
```

## Size Comparison

In typical usage scenarios:
- Standard bundle size: ~2500 characters
- Compact bundle size: ~1700 characters
- Space saved: ~30-35%

This reduction is particularly valuable for:
- QR code embedding
- Mobile data usage
- Network bandwidth optimization

## Testing

A comprehensive test suite is available for the compact token encoder:

```bash
# Run compact token encoder tests
npm test -- test/unit/compactTokenEncoder.test.js

# Run a demonstration with detailed output
node test/demo/compactBundleDemo.js
```

## Compatibility

The tokenController automatically handles both standard and compact bundles for backward compatibility. When verifying or redeeming tokens, it will try to decode using both formats.

## Future Improvements

Potential areas for further optimization:
- Additional field name shortening
- More efficient binary encoding for specific data types
- Integration with other compression techniques