# Giftmint Cryptographic Implementation

This directory contains the cryptographic implementation used by the Giftmint e-cash server for generating gift certificates.

## Elliptic Curve Blind Signatures

The Giftmint server uses elliptic curve blind signatures for secure gift certificate creation:

- Uses `ecKeyManager.js` and `ecBlindSignature.js`
- Based on the Blind Diffie-Hellman Key Exchange (BDHKE) protocol
- Uses the secp256k1 curve
- Provides compact tokens with strong security properties
- Accessible via the `/token/...` API endpoints

## Private Mint Implementation

This is a private e-cash implementation exclusively for gift certificates in our webstore:

- **No external mint compatibility**: This implementation is NOT compatible with Cashu or other e-cash protocols
- **Closed system**: Only our webstore can create and redeem tokens
- **No external connections**: Not connected to Bitcoin or Lightning networks
- **Private use only**: Not designed for interoperability with other systems

## Advantages of EC Implementation

The implementation offers several advantages for gift certificate operations:

- **Compact token size**: EC-based tokens are significantly compact
- **Fast signature generation**: EC operations are computationally efficient
- **Modern cryptography**: Uses elliptic curve cryptography with strong security properties
- **Lower QR code complexity**: Shorter tokens mean simpler QR codes that are easier to scan

## Implementation Details

The implementation uses the secp256k1 elliptic curve and follows a Blind Diffie-Hellman Key Exchange (BDHKE) protocol:

1. The client generates a random secret and maps it to a point Y on the curve
2. The client generates a random blinding factor and computes a blinded message B_ = Y + rG
3. The server signs the blinded message with its private key k to get C_ = kB_
4. The client unblinds the signature by computing C = C_ - rK (where K is the server's public key)
5. The resulting token consists of the secret and the signature C

This provides excellent security properties with compact tokens, especially useful for gift certificates that need to be displayed in a limited space.

## Database Tables

The implementation uses these database tables:

- `ec_keysets`: Stores the different denominations for gift certificate values
- `ec_keys`: Stores the private and public keys used for signing
- `ec_token_stats`: Tracks token minting and redemption statistics
- `ec_redeemed_tokens`: Records which tokens have been redeemed to prevent double-spending

## API Endpoints

The implementation is accessible via these API endpoints:

- `/token/create`: Create new gift certificate tokens
- `/token/verify`: Verify gift certificate tokens
- `/token/redeem`: Redeem gift certificate tokens