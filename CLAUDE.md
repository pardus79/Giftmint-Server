# Giftmint Server Project Guide

## Project Overview
Giftmint Server is a private e-cash system for generating gift certificates. It uses elliptic curve-based blind signatures for secure and compact tokens. This is a standalone system not compatible with Cashu or other e-cash protocols, designed exclusively for use by a webstore to create and redeem gift certificates.

## ⚠️ IMPORTANT: Development Environment ⚠️

**DO NOT INSTALL OR RUN THIS PROJECT ON THIS MACHINE.**  
This is a development environment for code review only. The actual testing and deployment happens on another machine. Do not attempt to install dependencies, run the server, or execute npm commands.

**Git Workflow Notes:**
- When making changes, use `git commit` to save changes locally
- Do NOT use `git push` - the commits will be manually pushed to the remote repository
- Code changes should be tested on the separate testing environment before pushing

## Key Components

- **Cryptography**: Uses EC-based blind signatures (ecBlindSignature.js, ecKeyManager.js)
- **Token Format**: Compact tokens with custom prefixes, can be bundled for efficiency
- **API Endpoints**: Available under both `/token/` and `/ec/token/` paths
- **Database**: Uses SQLite with Knex.js for ORM

## Code Architecture

- `server.js` - Main server file, entry point
- `api/` - API routes and controllers
- `crypto/` - Cryptographic implementation
- `utils/` - Utility functions including token encoding/bundling
- `config/` - Configuration settings
- `db/` - Database connection and schema

## Common Commands

These are for reference only. DO NOT execute these on this machine:

```
# Server commands
npm start         # Start server
npm run dev       # Start with nodemon for development

# Development
npm test          # Run tests
npm run lint      # Lint code
```

## Notes for Development

1. All token operations use the EC implementation exclusively - RSA has been completely removed
2. EC signatures use the secp256k1 curve with Blind Diffie-Hellman Key Exchange (BDHKE)
3. Token bundling works with EC tokens and uses CBOR for compact representation
4. Custom token prefixes are supported throughout the codebase
5. Legacy functions in tokenController.js have been updated to use EC methods internally

## Recent Fixes (as of March 2025)

1. **Public Key Handling**:
   - Fixed public key formatting issues with proper hex encoding
   - Added support for comma-separated public key formats
   - Enhanced public key conversion between string and Buffer/Uint8Array

2. **Key Rotation**:
   - Fixed setTimeout overflow issues with large rotation intervals
   - Improved key rotation scheduling to prevent excessive key creation
   - Added proper cleanup of timer references to prevent memory leaks
   - Implemented smarter rotation that only rotates keys nearing expiration

3. **Token Bundling & CBOR Format**:
   - Fixed CBOR decoding to properly handle optimized binary format tokens
   - Added robust handling of binary data in token ID and signature fields
   - Enhanced error handling for token verification with multiple fallbacks
   - Improved compatibility between the compact CBOR encoding and token verification
   - Added diagnostic endpoints for troubleshooting token issues:
     - `/api/diagnostic/verify-token` - Test individual token verification
     - `/api/diagnostic/unbundle` - Diagnose bundle format issues
     - `/api/diagnostic/token-detail` - Detailed token analysis and format detection

4. **Type Conversion & Binary Data**:
   - Added comprehensive Uint8Array/Buffer conversion utilities
   - Fixed data type mismatches between Node.js Buffer and secp256k1 Uint8Array
   - Implemented proper normalization of binary IDs for database lookups
   - Enhanced binary data handling throughout the verification pipeline
   - Added format detection and automatic conversion between types

## Codebase-Specific Considerations

1. When making changes to cryptographic implementation, ensure the domain separator remains `Giftmint_`
2. TokenEncoder.js handles both individual tokens and bundles with prefix support
3. API endpoints are available under both `/token/` and `/ec/token/` paths for compatibility
4. Aliased function names exist in the controller for backward compatibility

## Troubleshooting Common Issues

1. **Token Creation Issues**:
   - Check ecKeyManager.js for key creation and rotation
   - Ensure public keys are properly formatted as hex strings
   - Verify data type consistency (Buffer vs Uint8Array)

2. **Token Verification Problems**:
   - For bundle issues, try verifying individual tokens first
   - Use `/api/diagnostic/token-detail` to identify token format and structure
   - For CBOR format issues, inspect binary data formats in logs
   - Check if token IDs are binary or string format and ensure proper handling
   - When in doubt, create and use individual tokens instead of bundles

3. **CBOR Format Compatibility**:
   - Binary IDs in CBOR tokens should now be properly handled
   - If verification still fails, check secret ID and signature formats in logs
   - Ensure CBOR token bundles are created with the correct options
   - Use token-detail endpoint to confirm proper token structure

4. **Key Rotation Errors**:
   - Look for excessive key creation in logs
   - Verify key expiration calculation
   - Check for timer overflow errors with long durations

## Security Notes

- This is a private mint implementation with no external connections
- No Bitcoin or Lightning integration
- Only the webstore should be able to create or redeem tokens
- No cross-mint transfers supported or allowed