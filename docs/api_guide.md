# Giftmint API Guide

## Authentication
All API requests require an API key provided in the `X-API-Key` header.

Example:
```
X-API-Key: your_api_key_here
```

## Endpoints

### Create Token

**Endpoint**: `POST /api/v1/token/create`

Creates new tokens with specified parameters.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `total_amount` | Number | Yes* | Total amount in satoshis to create tokens for. The system will automatically break this into tokens of available denominations. |
| `denomination_value` | Number | Yes* | Value of a single token in satoshis. Must match an existing denomination. |
| `custom_prefix` | String | No | Custom prefix for the token. |

\* Either `total_amount` OR `denomination_value` is required, not both.

**Example for arbitrary amount**:
```bash
curl -X POST https://your-mint.com/api/v1/token/create \
    -H "Content-Type: application/json" \
    -H "X-API-Key: your_api_key_here" \
    -d '{"total_amount": 1000, "custom_prefix": "custom"}'
```

**Example for specific denomination**:
```bash
curl -X POST https://your-mint.com/api/v1/token/create \
    -H "Content-Type: application/json" \
    -H "X-API-Key: your_api_key_here" \
    -d '{"denomination_value": 128, "custom_prefix": "custom"}'
```

**Response**:
```json
{
  "success": true,
  "tokens": [
    "token_string_1",
    "token_string_2"
  ],
  "bundle": "btcpinsbundle-eyJ2IjoxLCJ0b2tlbnMiOlsidG9rZW5fc3RyaW5nXzEiLCJ0b2tlbl9zdHJpbmdfMiJdLCJjb3VudCI6MiwiY3JlYXRlZCI6MTUwMDAwMDAwMDAwMH0",
  "denomination_info": [
    {"id": "123", "value": 128, "currency": "SATS", "description": "128 Satoshis"},
    {"id": "456", "value": 64, "currency": "SATS", "description": "64 Satoshis"}
  ],
  "total_amount": 1000,
  "token_count": 2
}
```

When using `total_amount`, a `bundle` property is also returned that contains all tokens bundled into a single string for easier sharing. Users can paste the entire bundle string and it will be recognized as multiple tokens.

The bundle format is space-efficient and follows a similar approach to Cashu's token bundling. It uses abbreviated key names and optimized serialization to keep the token size as small as possible for easy sharing.

### List Denominations

**Endpoint**: `GET /api/v1/token/denominations`

Lists all available token denominations.

**Example**:
```bash
curl -X GET https://your-mint.com/api/v1/token/denominations \
    -H "X-API-Key: your_api_key_here"
```

**Response**:
```json
{
  "success": true,
  "denominations": [
    {"value": 1, "currency": "SATS", "is_active": true},
    {"value": 2, "currency": "SATS", "is_active": true},
    {"value": 4, "currency": "SATS", "is_active": true},
    {"value": 8, "currency": "SATS", "is_active": true},
    {"value": 16, "currency": "SATS", "is_active": true},
    {"value": 32, "currency": "SATS", "is_active": true},
    {"value": 64, "currency": "SATS", "is_active": true},
    {"value": 128, "currency": "SATS", "is_active": true},
    {"value": 256, "currency": "SATS", "is_active": true},
    {"value": 512, "currency": "SATS", "is_active": true},
    {"value": 1024, "currency": "SATS", "is_active": true},
    {"value": 2048, "currency": "SATS", "is_active": true},
    {"value": 4096, "currency": "SATS", "is_active": true},
    {"value": 8192, "currency": "SATS", "is_active": true},
    {"value": 16384, "currency": "SATS", "is_active": true},
    {"value": 32768, "currency": "SATS", "is_active": true},
    {"value": 65536, "currency": "SATS", "is_active": true},
    {"value": 131072, "currency": "SATS", "is_active": true},
    {"value": 262144, "currency": "SATS", "is_active": true},
    {"value": 524288, "currency": "SATS", "is_active": true},
    {"value": 1048576, "currency": "SATS", "is_active": true}
  ]
}
```

### Redeem Token

**Endpoint**: `POST /api/v1/token/redeem`

Redeems a token and returns its value.

**Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `token` | String | Yes | The token string to redeem. |

**Example**:
```bash
curl -X POST https://your-mint.com/api/v1/token/redeem \
    -H "Content-Type: application/json" \
    -H "X-API-Key: your_api_key_here" \
    -d '{"token": "your_token_string_here"}'
```

**Response**:
```json
{
  "success": true,
  "value": 1000,
  "currency": "SATS"
}
```

## Common Errors

| Error | Description |
|-------|-------------|
| `No active denomination found for value X SATS` | The system doesn't have the specified denomination. Use `total_amount` instead of `denomination_value` for arbitrary amounts. |
| `Invalid token format` | The token string is malformed or damaged. |
| `Token has already been redeemed` | The token has already been used and cannot be redeemed again. |
| `Invalid API key` | The provided API key is not valid or has expired. |