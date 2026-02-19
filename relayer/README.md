# StylusTx Relayer

Backend relayer service for StylusTx gasless transactions.

## Overview

The relayer service receives signed meta-transactions from users and submits them to the blockchain. It pays the gas fees on behalf of users, enabling truly gasless transactions.

## Features

- Single and batch transaction relay
- Rate limiting (100 requests/minute)
- Request validation
- Transaction status tracking
- Policy status checking
- Health monitoring

## API Endpoints

### `GET /health`
Health check endpoint.

### `GET /info`
Get relayer information (address, balance, paymaster status).

### `GET /nonce/:address`
Get the current nonce for a user address.

### `POST /relay`
Submit a signed meta-transaction.

**Request Body:**
```json
{
  "from": "0x...",
  "to": "0x...",
  "value": "0",
  "data": "0x...",
  "nonce": "0",
  "deadline": "1234567890",
  "v": 28,
  "r": "0x...",
  "s": "0x..."
}
```

### `POST /relay/batch`
Submit multiple signed meta-transactions atomically.

**Request Body:**
```json
{
  "transactions": [
    { "from": "...", "to": "...", ... },
    { "from": "...", "to": "...", ... }
  ]
}
```

### `GET /status/:txHash`
Get transaction status (pending, confirmed, failed).

### `GET /policy/:address`
Get gas sponsorship policy status for a user.

## Setup

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Configure environment variables:
   - `PAYMASTER_ADDRESS`: Deployed paymaster contract
   - `RELAYER_PRIVATE_KEY`: Wallet private key (with ETH for gas)

3. Install dependencies:
   ```bash
   npm install
   ```

4. Run development server:
   ```bash
   npm run dev
   ```

5. Build for production:
   ```bash
   npm run build
   npm start
   ```

## Security Considerations

- Never use mainnet private keys in development
- Use environment variables for sensitive data
- Deploy behind HTTPS in production
- Consider additional rate limiting per user
- Monitor relayer wallet balance

## Production Deployment

1. Use a process manager (PM2, systemd)
2. Configure HTTPS reverse proxy (nginx)
3. Set up log aggregation
4. Monitor wallet balance alerts
5. Implement hot wallet rotation
