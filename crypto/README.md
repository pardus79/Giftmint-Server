# Giftmint Cryptography Module

This module implements the cryptographic primitives needed for the Giftmint token system. It's based on the principles of blind signatures and implements Blind Diffie-Hellman Key Exchange (BDHKE) using the secp256k1 elliptic curve.

## Key Components

### `ecKeyManager.js`

This module handles EC key pair generation, management, and rotation:

- Generates keys for signing tokens
- Handles key rotation based on a configurable schedule
- Maintains a database of active and expired keys
- Implements backup storage for keys
- Provides methods to access keys by ID

### `ecBlindSignature.js`

Implements the blind signature cryptography:

- `blind(secret, pubKey)`: Blinds a secret value using the signer's public key
- `sign(blindedMessage, privKey)`: Signs a blinded message with the signer's private key
- `unblind(blindSignature, blindingFactor, pubKey)`: Unblinds the signature
- `verify(secret, unblindedSignature, pubKey)`: Verifies an unblinded signature

## Cryptographic Workflow

The BDHKE-based protocol works as follows:

1. **Key Generation**:
   - The mint generates a key pair (sk, pk) where sk is the private key and pk is the public key
   - The public key pk is made available to clients

2. **Token Creation (Blinding)**:
   - Client generates a random secret s
   - Client generates a random blinding factor r
   - Client creates a blinded message: m = Hash(s) || (r·G) (where G is the generator point)
   - Client sends the blinded message m to the mint

3. **Signing (by Mint)**:
   - Mint signs the blinded message with its private key: σ' = Sign(sk, Hash(m))
   - Mint returns the blind signature σ' to the client

4. **Unblinding**:
   - Client unblinds the signature using its blinding factor: σ = Unblind(σ', r)
   - The resulting token consists of (s, σ)

5. **Verification**:
   - Anyone with the mint's public key can verify the signature: Verify(pk, Hash(s), σ)
   - If valid, the token is authentic and can be redeemed

## Security Considerations

- **Key Management**: Private keys are stored securely and rotated regularly
- **Blinding**: Ensures that the mint cannot link the signing request to the final token
- **Verification**: Prevents double-spending by tracking redeemed tokens in the database
- **Randomness**: Uses cryptographically secure random number generation
- **Standards Compliance**: Uses industry-standard secp256k1 curve

## Dependencies

- Node.js Crypto module
- secp256k1 library

## Key Rotation and Expiry

Keys are automatically rotated based on the configuration settings:
- `keyRotationDays`: How frequently new keys are created
- `keyRetentionDays`: How long expired keys are kept for verification purposes

## Error Handling

The module includes comprehensive error handling for:
- Invalid keys
- Expired keys
- Malformed signatures
- Failed verification