# Giftmint Mint Server

A Chaumian e-cash mint for the Giftmint WordPress plugin that allows store owners to issue and redeem gift certificates.

## Overview

The Giftmint Mint Server is a standalone server that implements Chaumian e-cash for use in gift certificates. It provides an API for creating, verifying, redeeming, and reminting tokens.

## Features

- **Token Creation**: Create new e-cash tokens with specified amounts and currencies
- **Token Verification**: Verify the authenticity and value of tokens
- **Token Redemption**: Redeem tokens (partially or fully) and get change tokens if needed
- **Token Reminting**: Replace tokens with new ones for enhanced security
- **Blind Signatures**: Uses Chaumian blind signatures for privacy and security
- **Key Rotation**: Automatic key rotation to enhance security
- **Database Storage**: Stores tokens and redemption records in a database
- **API Key Authentication**: Secures the API with key-based authentication

## Installation

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Copy the example environment file:
   ```
   cp .env.example .env
   ```
4. Edit the `.env` file with your configuration
5. Start the server:
   ```
   npm start
   ```

## Configuration

Configure the server by editing the `.env` file:

- **Server**: Port and host settings
- **Database**: Choose between SQLite, MySQL, or PostgreSQL
- **API Keys**: Set comma-separated API keys for authentication
- **Rate Limiting**: Configure request limits
- **Token Settings**: Configure token expiry and key rotation intervals
- **Logging**: Set log level and file path

## API Endpoints

### Create Token
- **URL**: `/api/v1/token/create`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "amount": 100,
    "currency": "USD",
    "batch_id": "optional-batch-id"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "token": "serialized-token-string"
  }
  ```

### Verify Token
- **URL**: `/api/v1/token/verify`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "token": "serialized-token-string"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "amount": "100",
    "currency": "USD",
    "value": "100"
  }
  ```

### Redeem Token
- **URL**: `/api/v1/token/redeem`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "token": "serialized-token-string",
    "amount": 50  // Optional for partial redemptions
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "amount": "50",
    "currency": "USD",
    "change_token": "serialized-change-token-string", // Only for partial redemptions
    "change_amount": "50" // Only for partial redemptions
  }
  ```

### Remint Token
- **URL**: `/api/v1/token/remint`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "token": "serialized-token-string"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "new_token": "serialized-new-token-string",
    "amount": "100",
    "currency": "USD"
  }
  ```

### Bulk Create Tokens
- **URL**: `/api/v1/token/bulk-create`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "amount": 50,
    "currency": "USD",
    "quantity": 10,
    "batch_id": "optional-batch-id"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "tokens": ["token1", "token2", ...],
    "batch_id": "batch-id",
    "amount": 50,
    "currency": "USD",
    "quantity": 10
  }
  ```

### Get Outstanding Value
- **URL**: `/api/v1/stats/outstanding`
- **Method**: `POST`
- **Body**:
  ```json
  {
    "batch_id": "optional-batch-id",
    "currency": "optional-currency"
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "value": 1000,
    "batch_id": "batch-id",
    "currency": "USD"
  }
  ```

## Security Considerations

- Keep your API keys secure
- Run the server behind HTTPS
- Regularly rotate keys (handled automatically by default)
- Consider using a reverse proxy like Nginx for additional security
- Back up your database regularly

## License

This project is licensed under the MIT License - see the LICENSE file for details.