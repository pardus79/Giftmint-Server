# Compact Token Bundling

This document describes the compact token bundling feature implemented in the Giftmint Server.

## Overview

The compact token bundling feature provides a space-efficient way to encode and bundle tokens. It uses techniques inspired by the Cashu v4 token format to reduce the size of bundled tokens by approximately 30-35%. As of the latest update, compact token bundling is the only supported format in the system.

## Custom Prefixes

The compact token bundling system supports custom prefixes for tokens and bundles. The prefix can be specified in three ways:

1. Via the `TOKEN_PREFIX` environment variable in `.env`
2. Via the `custom_prefix` parameter in API requests (e.g., `/api/v1/token/create`)
3. Programmatically via the `customPrefix` parameter in the bundling functions

Any alphanumeric prefix is supported, including:
- Single characters (e.g., "a")
- Mixed case (e.g., "BtcPins")
- Numbers (e.g., "123abc")
- Long prefixes (up to 26+ characters tested)

Token bundles will keep their custom prefix throughout the system, and all verification/redemption endpoints can handle tokens with different prefixes.

## Implementation Details

The implementation is in `/utils/compactTokenEncoder.js` and includes the following key features:

1. **CBOR Binary Format**: Uses CBOR (Concise Binary Object Representation) for efficient binary encoding
2. **Single-character Field Names**: Uses short field names (`a` for amount, `s` for secret, etc.)
3. **Binary Encoding for Hex Strings**: Encodes signatures and IDs as binary data instead of hex strings
4. **Efficient Token Grouping**: Groups tokens by key ID to avoid redundancy

## Usage

Compact bundling is the only supported format in the tokenController. The system automatically detects and handles compact bundles and individual tokens.

### Key Functions

- `bundleTokensCompact(tokens, customPrefix)`: Bundles an array of tokens into a compact format with optional custom prefix
- `unbundleTokensCompact(bundle)`: Unbundles a compact token bundle into individual tokens
- `detectTokenFormat(token)`: Internally used to identify token format (compact bundle or individual token)

### Token Format Detection

The system uses the following characteristics to determine token format:

1. **Compact bundle format**: Tokens starting with an alphanumeric prefix followed by the CBOR pattern marker `oWF`
2. **Individual token format**: Tokens containing an underscore separator between the prefix and the data

This format detection enables the system to automatically handle different token types without explicit format specification.

## Size Comparison

In typical usage scenarios:
- Legacy bundle size: ~2500 characters
- Compact bundle size: ~1700 characters
- Space saved: ~30-35%

This reduction is particularly valuable for:
- QR code embedding (smaller QR codes are more reliable to scan)
- Mobile data usage (reduced bandwidth consumption)
- Network efficiency (faster token transmission)
- Storage optimization (more tokens can be stored in the same space)

## Testing

A comprehensive test suite is available for the compact token encoder:

```bash
# Run compact token encoder tests
npm test -- test/unit/compactTokenEncoder.test.js

# Run a demonstration with detailed output
node test/demo/compactBundleDemo.js

# Test with different token prefixes
node test/demo/prefixTestSimple.js

# Test with random token prefixes
node test/demo/randomPrefixTest.js
```

## Known Issues

There is a known issue with token unbundling under certain conditions that causes the error "Additional info not implemented: 28/30". This error has been observed in both test environments and on the server when processing certain token formats. This will be addressed in a future update.

## Future Improvements

Potential areas for further optimization:
- Additional field name shortening
- More efficient binary encoding for specific data types
- Integration with other compression techniques
- Improved error handling for malformed tokens
- Prefix validation to prevent potential issues with special characters
- Structured token bundle version tracking for future format changes