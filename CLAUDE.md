# Claude Memory for Giftmint Server

This file stores frequently used commands and information about the codebase.

## Common Commands

### Development

```bash
# Start development server with auto-restart
npm run dev

# Run linting
npm run lint

# Run all tests
npm test

# Run specific test file
npm test -- test/api/tokenController.test.js

# Run specific test directory
npm test -- test/unit

# Run tests with coverage report
npm test -- --coverage
```

### Database Management

```bash
# Force database migration
npx knex migrate:latest

# Rollback migration
npx knex migrate:rollback

# Run database seeds
npx knex seed:run
```

### Deployment

```bash
# Build for production
npm run build

# Start production server
npm start

# Install production dependencies only
npm ci --only=production
```

## Project Structure

- `api/` - API routes and controllers
- `crypto/` - Cryptographic implementations
- `db/` - Database connection and models
- `utils/` - Utility functions
- `docs/` - Documentation
- `config/` - Configuration management

## Coding Conventions

- Use camelCase for variables and functions
- Use PascalCase for classes
- Use snake_case for database fields
- Prefix private functions with underscore
- Always include JSDoc comments for functions
- Use async/await for asynchronous code
- Always validate inputs in controllers

## Important Notes

- Token IDs are generated as SHA-256 hashes of their secrets
- Always check if a token has been redeemed before accepting it
- Key rotation happens automatically based on configuration
- Token bundles use CBOR encoding for compact representation
- Compact token bundling provides ~30% size reduction and is enabled by default
- Binary data should be normalized using the provided utility functions

## Configuration Options

Key configuration options in `.env`:

- `TOKEN_PREFIX`: The prefix for encoded tokens (default: "GM")
- `KEY_ROTATION_DAYS`: How frequently keys should be rotated
- `DENOMINATIONS`: Available token denominations
- `MAX_BUNDLE_SIZE`: Maximum number of tokens in a bundle
- `API_KEYS`: Comma-separated list of valid API keys

## API Authentication

All API endpoints require an API key in the `X-API-Key` header except the health check endpoint.