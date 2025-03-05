# Giftmint Server Project Guide

## Project Overview
Giftmint Server is a private e-cash system for generating gift certificates. It uses elliptic curve-based blind signatures for secure and compact tokens. This is a standalone system not compatible with Cashu or other e-cash protocols, designed exclusively for use by a webstore to create and redeem gift certificates.

## ⚠️ IMPORTANT: Development Environment ⚠️

**DO NOT INSTALL OR RUN THIS PROJECT ON THIS MACHINE.**  
This is a development environment for code review only. The actual testing and deployment happens on another machine. Do not attempt to install dependencies, run the server, or execute npm commands.

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

## Codebase-Specific Considerations

1. When making changes to cryptographic implementation, ensure the domain separator remains `Giftmint_`
2. TokenEncoder.js handles both individual tokens and bundles with prefix support
3. API endpoints are available under both `/token/` and `/ec/token/` paths for compatibility
4. Aliased function names exist in the controller for backward compatibility

## Security Notes

- This is a private mint implementation with no external connections
- No Bitcoin or Lightning integration
- Only the webstore should be able to create or redeem tokens
- No cross-mint transfers supported or allowed