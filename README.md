# Giftmint Server

A private e-cash server system using elliptic curve-based blind signatures.

## Overview

Giftmint is a server system that enables the creation, verification, and redemption of cryptographically-secure digital tokens. The system uses elliptic curve-based blind signatures (similar to Cashu v4) to create secure and compact tokens.

Key features:
- EC-based blind signatures using the secp256k1 curve
- Secure token creation and verification
- Support for token bundling with CBOR format
- Robust error handling for various token formats
- API endpoints for token creation, verification, and redemption
- SQLite database for tracking redeemed tokens
- Support for key rotation and management
- Currency agnostic with power-of-2 denominations

## Requirements

- Node.js 18.0.0 or later
- npm 8.0.0 or later
- SQLite3

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/giftmint-server.git
   cd giftmint-server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment:
   ```bash
   cp .env.example .env
   ```
   
   Edit the `.env` file with your desired configuration.

4. Start the server:
   ```bash
   npm start
   ```

For development with auto-reload:
```bash
npm run dev
```

## Architecture

The Giftmint Server has the following components:

- **API Layer**: Express.js REST API endpoints
- **Cryptography**: Blind signature implementation
- **Database**: SQLite with Knex.js ORM
- **Token Handling**: Token encoding, bundling, and verification
- **Key Management**: Key generation, rotation, and storage

## API Endpoints

### Token Creation

- `POST /api/v1/token/create`: Create a single token
- `POST /api/v1/token/bulk-create`: Create multiple tokens

### Token Verification

- `POST /api/v1/token/verify`: Verify token(s)

### Token Redemption

- `POST /api/v1/token/redeem`: Redeem token(s)
- `POST /api/v1/token/remint`: Exchange tokens without redemption
- `POST /api/v1/token/split`: Split token into smaller denominations

### Administrative

- `GET /api/v1/denomination/list`: List available denominations
- `GET /api/v1/stats/outstanding`: Get outstanding token value

### Diagnostic Endpoints

- `POST /api/v1/diagnostic/verify-token`: Detailed token verification
- `POST /api/v1/diagnostic/unbundle`: Analyze token bundle structure
- `POST /api/v1/diagnostic/token-detail`: Detailed token format analysis

## Authentication

API endpoints are protected with API key authentication. Add your API key to the request headers:

```
X-API-Key: your-api-key
```

API keys are defined in the `.env` file.

## Configuration

See the `.env.example` file for available configuration options. Key settings include:

- `PORT`: Server port (default: 3500)
- `API_KEYS`: Comma-separated list of valid API keys
- `KEY_ROTATION_DAYS`: How frequently keys should be rotated
- `TOKEN_PREFIX`: Prefix for tokens (default: GM)

## Denominations

Giftmint uses power-of-2 denominations (1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576) to represent any value efficiently. These denominations go up to the next power of 2 beyond 1,000,000 (which is 2^20 = 1,048,576).

When creating or spending tokens, the system uses a greedy approach, always using the largest possible denominations first. Any positive integer value can be represented as a combination of these power-of-2 units (following the binary number system). This approach is currency agnostic, allowing the tokens to work with any underlying value system.

## Documentation

- [API Guide](docs/api_guide.md): Detailed API documentation
- [Deployment Guide](docs/deployment.md): Instructions for deploying in production
- [Crypto Documentation](crypto/README.md): Details of the blind signature implementation

## Development

### Running Tests

```bash
npm test
```

### Linting

```bash
npm run lint
```

## Production Deployment

For production deployment instructions, see the [Deployment Guide](docs/deployment.md).

## Security

The Giftmint Server implements several security measures:

- Blind signatures ensure that the mint cannot link tokens to creation requests
- API key authentication for all endpoints
- Database tracking to prevent double-spending
- Regular key rotation
- Secure token format

## License

This is free and unencumbered software released into the public domain. See the [Unlicense](LICENSE) for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.