# Giftmint API Guide

This document provides detailed information about the Giftmint Server API endpoints, request formats, and responses.

## Authentication

All API requests require an API key to be included in the `X-API-Key` header:

```
X-API-Key: your-api-key
```

## Content Types

- All requests with a body should use the `application/json` content type.
- All responses will be in JSON format with the `application/json` content type.

## Endpoints

### Token Creation

#### Create a Single Token

```
POST /api/v1/token/create
```

Request:
```json
{
  "amount": 1024
}
```

Response:
```json
{
  "success": true,
  "amount": 1000,
  "token": "GM_eyJpZCI6IjEyMzQ1Njc4OTAiLCJrZXlJZCI6ImFiY2RlZiIsImRlbm9taW5hdGlvbiI6MTAwMCwic2VjcmV0IjoiNGVmNWZkYzczY2Y2NjM1MmNjYjVlMTJjNGI1YzM2YWEiLCJzaWduYXR1cmUiOiIxMjM0NTY3ODkwYWJjZGVmIn0="
}
```

#### Create Multiple Tokens

```
POST /api/v1/token/bulk-create
```

Request:
```json
{
  "amounts": [512, 1024, 2048]
}
```

Response:
```json
{
  "success": true,
  "count": 3,
  "totalAmount": 3584,
  "tokens": [
    "GM_eyJpZCI6IjEyMzQ1Njc4OTAiLCJrZXlJZCI6ImFiY2RlZiIsImRlbm9taW5hdGlvbiI6NTAwLCJzZWNyZXQiOiI0ZWY1ZmRjNzNjZjY2MzUyY2NiNWUxMmM0YjVjMzZhYSIsInNpZ25hdHVyZSI6IjEyMzQ1Njc4OTBhYmNkZWYifQ==",
    "GM_eyJpZCI6IjIzNDU2Nzg5MDEiLCJrZXlJZCI6ImFiY2RlZiIsImRlbm9taW5hdGlvbiI6MTAwMCwic2VjcmV0IjoiNWVmNWZkYzczY2Y2NjM1MmNjYjVlMTJjNGI1YzM2YWEiLCJzaWduYXR1cmUiOiIyMzQ1Njc4OTAxYWJjZGVmIn0==",
    "GM_eyJpZCI6IjM0NTY3ODkwMTIiLCJrZXlJZCI6ImFiY2RlZiIsImRlbm9taW5hdGlvbiI6MjUwMCwic2VjcmV0IjoiNmVmNWZkYzczY2Y2NjM1MmNjYjVlMTJjNGI1YzM2YWEiLCJzaWduYXR1cmUiOiIzNDU2Nzg5MDEyYWJjZGVmIn0=="
  ]
}
```

### Token Verification

#### Verify a Token

```
POST /api/v1/token/verify
```

Request:
```json
{
  "token": "GM_eyJpZCI6IjEyMzQ1Njc4OTAiLCJrZXlJZCI6ImFiY2RlZiIsImRlbm9taW5hdGlvbiI6MTAwMCwic2VjcmV0IjoiNGVmNWZkYzczY2Y2NjM1MmNjYjVlMTJjNGI1YzM2YWEiLCJzaWduYXR1cmUiOiIxMjM0NTY3ODkwYWJjZGVmIn0="
}
```

Response:
```json
{
  "valid": true,
  "bundled": false,
  "count": 1,
  "totalAmount": 1000,
  "results": [
    {
      "valid": true,
      "denomination": 1000,
      "token": "GM_eyJpZCI6IjEyMzQ1Njc4OTAiLCJrZXlJZCI6ImFiY2RlZiIsImRlbm9taW5hdGlvbiI6MTAwMCwic2VjcmV0IjoiNGVmNWZkYzczY2Y2NjM1MmNjYjVlMTJjNGI1YzM2YWEiLCJzaWduYXR1cmUiOiIxMjM0NTY3ODkwYWJjZGVmIn0="
    }
  ]
}
```

### Token Redemption

#### Redeem a Token

```
POST /api/v1/token/redeem
```

Request:
```json
{
  "token": "GM_eyJpZCI6IjEyMzQ1Njc4OTAiLCJrZXlJZCI6ImFiY2RlZiIsImRlbm9taW5hdGlvbiI6MTAwMCwic2VjcmV0IjoiNGVmNWZkYzczY2Y2NjM1MmNjYjVlMTJjNGI1YzM2YWEiLCJzaWduYXR1cmUiOiIxMjM0NTY3ODkwYWJjZGVmIn0="
}
```

Response:
```json
{
  "success": true,
  "bundled": false,
  "count": 1,
  "totalAmount": 1000,
  "results": [
    {
      "redeemed": true,
      "denomination": 1000,
      "token": "GM_eyJpZCI6IjEyMzQ1Njc4OTAiLCJrZXlJZCI6ImFiY2RlZiIsImRlbm9taW5hdGlvbiI6MTAwMCwic2VjcmV0IjoiNGVmNWZkYzczY2Y2NjM1MmNjYjVlMTJjNGI1YzM2YWEiLCJzaWduYXR1cmUiOiIxMjM0NTY3ODkwYWJjZGVmIn0="
    }
  ]
}
```

#### Remint a Token

```
POST /api/v1/token/remint
```

Request:
```json
{
  "token": "GM_eyJpZCI6IjEyMzQ1Njc4OTAiLCJrZXlJZCI6ImFiY2RlZiIsImRlbm9taW5hdGlvbiI6MTAwMCwic2VjcmV0IjoiNGVmNWZkYzczY2Y2NjM1MmNjYjVlMTJjNGI1YzM2YWEiLCJzaWduYXR1cmUiOiIxMjM0NTY3ODkwYWJjZGVmIn0="
}
```

Response:
```json
{
  "success": true,
  "amount": 1000,
  "token": "GM_eyJpZCI6IjQ1Njc4OTAxMjMiLCJrZXlJZCI6ImJjZGVmZyIsImRlbm9taW5hdGlvbiI6MTAwMCwic2VjcmV0IjoiN2VmNWZkYzczY2Y2NjM1MmNjYjVlMTJjNGI1YzM2YWEiLCJzaWduYXR1cmUiOiI0NTY3ODkwMTIzYmNkZWZnIn0="
}
```

#### Split a Token

```
POST /api/v1/token/split
```

Request:
```json
{
  "token": "GM_eyJpZCI6IjEyMzQ1Njc4OTAiLCJrZXlJZCI6ImFiY2RlZiIsImRlbm9taW5hdGlvbiI6MTAwMCwic2VjcmV0IjoiNGVmNWZkYzczY2Y2NjM1MmNjYjVlMTJjNGI1YzM2YWEiLCJzaWduYXR1cmUiOiIxMjM0NTY3ODkwYWJjZGVmIn0=",
  "amounts": [300, 500]
}
```

Response:
```json
{
  "success": true,
  "originalAmount": 1000,
  "splitAmount": 800,
  "changeAmount": 200,
  "tokens": [
    "GM_eyJpZCI6IjU2Nzg5MDEyMzQiLCJrZXlJZCI6ImNkZWZnaCIsImRlbm9taW5hdGlvbiI6MzAwLCJzZWNyZXQiOiI4ZWY1ZmRjNzNjZjY2MzUyY2NiNWUxMmM0YjVjMzZhYSIsInNpZ25hdHVyZSI6IjU2Nzg5MDEyMzRjZGVmZ2gifQ==",
    "GM_eyJpZCI6IjY3ODkwMTIzNDUiLCJrZXlJZCI6ImNkZWZnaCIsImRlbm9taW5hdGlvbiI6NTAwLCJzZWNyZXQiOiI5ZWY1ZmRjNzNjZjY2MzUyY2NiNWUxMmM0YjVjMzZhYSIsInNpZ25hdHVyZSI6IjY3ODkwMTIzNDVjZGVmZ2gifQ==",
    "GM_eyJpZCI6Ijc4OTAxMjM0NTYiLCJrZXlJZCI6ImNkZWZnaCIsImRlbm9taW5hdGlvbiI6MjAwLCJzZWNyZXQiOiIwZWY1ZmRjNzNjZjY2MzUyY2NiNWUxMmM0YjVjMzZhYSIsInNpZ25hdHVyZSI6Ijc4OTAxMjM0NTZjZGVmZ2gifQ=="
  ]
}
```

### Administrative Endpoints

#### List Available Denominations

```
GET /api/v1/denomination/list
```

Response:
```json
{
  "denominations": [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576]
}
```

#### Get Outstanding Token Stats

```
GET /api/v1/stats/outstanding
```

Response:
```json
{
  "stats": [
    {
      "denomination": 1,
      "minted_count": 100,
      "redeemed_count": 50
    },
    {
      "denomination": 5,
      "minted_count": 50,
      "redeemed_count": 20
    },
    // ... etc.
  ]
}
```

### Diagnostic Endpoints

#### Detailed Token Verification

```
POST /api/v1/diagnostic/verify-token
```

Request:
```json
{
  "token": "GM_eyJpZCI6IjEyMzQ1Njc4OTAiLCJrZXlJZCI6ImFiY2RlZiIsImRlbm9taW5hdGlvbiI6MTAwMCwic2VjcmV0IjoiNGVmNWZkYzczY2Y2NjM1MmNjYjVlMTJjNGI1YzM2YWEiLCJzaWduYXR1cmUiOiIxMjM0NTY3ODkwYWJjZGVmIn0="
}
```

Response:
```json
{
  "valid": true,
  "redeemed": false,
  "signatureValid": true,
  "details": {
    "id": "123456789",
    "keyId": "abcdef",
    "denomination": 1000,
    "secretLength": 64,
    "signatureLength": 130
  }
}
```

#### Unbundle Token Bundle

```
POST /api/v1/diagnostic/unbundle
```

Request:
```json
{
  "token": "AG1pbnRzgXhPpYNkZW5vbWluYXRpb26FAmlkeCxhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5emFiY2RlZmdoaWprbG1ub3BmcHVibGljS2V5eEErRUlVeXAzdnYrM0RFRC9EL3NVTGhiWnk4ODBZRnNUS2ZIdFZEY2UwakQ4Q0k5WnRLRUFMV0ZRenJyVTlVRWY="
}
```

Response:
```json
{
  "bundled": true,
  "count": 3,
  "tokens": [
    {
      "valid": true,
      "id": "123456789",
      "keyId": "abcdef",
      "denomination": 100
    },
    {
      "valid": true,
      "id": "234567890",
      "keyId": "abcdef",
      "denomination": 500
    },
    {
      "valid": true,
      "id": "345678901",
      "keyId": "abcdef",
      "denomination": 1000
    }
  ]
}
```

#### Token Detail Analysis

```
POST /api/v1/diagnostic/token-detail
```

Request:
```json
{
  "token": "GM_eyJpZCI6IjEyMzQ1Njc4OTAiLCJrZXlJZCI6ImFiY2RlZiIsImRlbm9taW5hdGlvbiI6MTAwMCwic2VjcmV0IjoiNGVmNWZkYzczY2Y2NjM1MmNjYjVlMTJjNGI1YzM2YWEiLCJzaWduYXR1cmUiOiIxMjM0NTY3ODkwYWJjZGVmIn0="
}
```

Response:
```json
{
  "formatInfo": {
    "length": 174,
    "startsWith": "GM_eyJpZCI6I",
    "containsSpecialChars": false
  },
  "isJson": false,
  "isCbor": false,
  "isToken": true,
  "isBundle": false,
  "tokenInfo": {
    "id": "123456789",
    "keyId": "abcdef",
    "denomination": 1000,
    "secretLength": 64,
    "signatureLength": 130
  },
  "bundleInfo": null
}
```

## Error Handling

All errors follow a standard format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message"
  }
}
```

Common error codes:

- `INVALID_REQUEST`: The request format is invalid
- `MISSING_TOKEN`: No token was provided
- `INVALID_TOKEN`: The token is invalid
- `ALREADY_REDEEMED`: The token has already been redeemed
- `INVALID_AMOUNT`: The requested value is invalid (not a positive integer)
- `INSUFFICIENT_VALUE`: The token value is insufficient for the requested operation
- `SERVER_ERROR`: An internal server error occurred

## Token Bundling

Tokens can be bundled together to reduce the data size when handling multiple tokens. The bundle format uses CBOR encoding for compact representation. Bundled tokens are automatically handled by all API endpoints that accept tokens.

## Denominations

Giftmint uses power-of-2 denominations (1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072, 262144, 524288, 1048576) to represent any value efficiently. Any positive integer value can be represented as a combination of these power-of-2 units (following the binary number system).

When creating or spending tokens, the system uses a greedy approach, always using the largest possible denominations first. This approach is currency agnostic, allowing the tokens to work with any underlying value system.

## Binary Data Handling

Tokens contain binary data encoded as strings. The following formats are supported:

- Hex strings (e.g., "4ef5fdc73cf66352ccb5e12c4b5c36aa")
- Base64 strings
- Base64URL strings

## Integration with External Systems

This API is designed to be easily integrated with any external system. For example:

1. Install a client library that can make API requests
2. Configure the client with your API key
3. Use the client to interact with the API endpoints
4. Handle the responses to use token information in your application