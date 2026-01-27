# Cosmos Validator Monitor

A comprehensive monitoring and analytics platform for Cosmos-based blockchain networks. Track wallets, validator performance, governance proposals, and receive real-time Discord notifications for critical events.

## Features

### Wallet Management
- **Multi-Chain Support**: Monitor wallets across multiple Cosmos SDK chains
- **Real-Time Balance Tracking**: Automated syncing of available, staked, rewards, and commission balances
- **Transaction History**: Complete indexing of wallet and validator transactions with USD valuation
- **Price Tracking**: Historical price data with profit/loss analysis using CoinGecko integration

### Validator Monitoring
- **Uptime Tracking**: Monitor missed blocks with configurable thresholds and cooldown periods
- **Jail Detection**: Automatic alerts when validators are jailed or unjailed
- **Recovery Notifications**: Get notified when validator status improves
- **Consensus Address Management**: Automatic fetching and storage of consensus addresses

### Governance Tracking
- **Proposal Monitoring**: Track new proposals across all monitored chains
- **Vote Status**: Check your voting status on active proposals
- **Completion Alerts**: Receive notifications when proposals finish with final tally results
- **Multi-Chain Dashboard**: Unified view of all active governance across chains

### Discord Notifications
- **Transaction Alerts**: Get notified of incoming/outgoing transactions
- **Balance Changes**: Alerts when balance changes exceed configured thresholds
- **Validator Events**: Missed blocks, jailing, and recovery notifications
- **Governance Updates**: New proposals and voting results
- **Configuration Changes**: Confirmation when monitoring settings are updated

### Advanced Features
- **Smart Transaction Parsing**: Handles complex multi-message transactions including batch withdrawals
- **Lock Management**: Prevents race conditions with distributed lock system
- **Heartbeat System**: Detects and recovers from stuck sync processes
- **Dual Indexer Mode**: Supports both legacy query and modern events-based indexing
- **Historical Price Backfill**: Retroactively update transaction valuations with historical prices

## Technology Stack

- **Backend**: Node.js with Express and TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Blockchain**: CosmJS for Cosmos SDK integration
- **Scheduling**: Node-cron for automated tasks
- **Notifications**: Discord webhooks

## Installation

### Prerequisites
- Node.js 16+ and npm/yarn
- PostgreSQL database
- CoinGecko API key (optional, for price tracking)

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd cosmos-validator-monitor
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/validator_monitor"
PORT=3001
NODE_ENV=development

# Optional: CoinGecko API for better rate limits
COINGECKO_API_KEY=your-api-key

# Notification settings
DISCORD_BOT_NAME="AstroStake Dashboard"
DISCORD_BOT_AVATAR="https://your-logo-url.png"

# Monitoring thresholds
MISSED_BLOCKS_THRESHOLD=10
```

4. Initialize the database:
```bash
npx prisma generate
npx prisma db push
```

5. Start the application:
```bash
npm run dev
```

The server will start at `http://localhost:3001`

## Configuration

### Adding Chains

Chains are automatically seeded from `src/config.ts`. To add a new chain:

```typescript
{
  name: "ChainName",
  rpc: "https://rpc.chain.network",
  rest: "https://api.chain.network",
  denom: "utoken",
  decimals: 6,
  coingeckoId: "token-id" // Optional
}
```

### Adding Wallets

Use the web interface or API endpoint:

```bash
POST /api/wallets
{
  "address": "cosmos1...",
  "valAddress": "cosmosvaloper1...", // Optional for validators
  "withdrawalAddress": "cosmos1...", // Optional
  "label": "My Validator",
  "chainId": 1
}
```

### Configuring Notifications

1. Create a Discord webhook in your server settings
2. Navigate to the wallet monitoring page
3. Configure webhook URL and enable desired alert types:
   - Wallet Transactions
   - Balance Changes (with USD threshold)
   - Incoming Delegations
   - Missed Blocks Alerts
   - Governance Proposals

## API Documentation

### Core Endpoints

#### Dashboard
```
GET /api/dashboard
```
Returns portfolio summary and all wallets with categorization.

#### Wallets
```
GET /api/chains - List all supported chains
POST /api/wallets - Add new wallet
PATCH /api/wallet/:id - Update wallet settings
DELETE /api/wallet/:id - Remove wallet
```

#### Transactions
```
GET /api/wallet/:id/transactions?category=wallet&limit=50
GET /api/transaction/:hash - Get transaction details
GET /api/transaction/:hash/raw - Get raw blockchain data
```

#### Validator Monitoring
```
GET /api/wallet/:id/validator-status - Current validator status
GET /api/wallet/:id/fetch-consensus - Fetch consensus address
POST /api/wallet/:id/check-validator - Trigger manual check
```

#### Governance
```
GET /api/governance/all - All active proposals across chains
```

#### Webhook Configuration
```
GET /api/wallet/:id/webhook - Get current settings
POST /api/wallet/:id/webhook - Update notification settings
POST /api/wallet/:id/webhook/test - Send test notification
```

#### Maintenance
```
POST /api/sync - Trigger manual sync
POST /api/wallet/:id/resync - Full wallet resync
POST /api/wallet/:id/reparse - Reparse transactions
POST /api/reparse-all - Reparse all wallets
POST /api/backfill-prices - Update historical prices
```

### Response Format

All API responses follow this structure:

```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": {
    // Response payload
  },
  "metadata": {
    // Additional context
  }
}
```

Error responses:
```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE"
  }
}
```

## Automated Tasks

The system runs several background jobs:

- **Wallet Sync** (every 5 minutes): Updates balances and indexes new transactions
- **Price Updates** (every 10 minutes): Fetches current token prices from CoinGecko
- **Validator Monitoring** (every 3 minutes): Checks uptime and governance proposals

## Advanced Usage

### Transaction Parsing

The system intelligently parses various Cosmos SDK transaction types:

- Standard transfers (Send, MultiSend)
- Staking operations (Delegate, Undelegate, Redelegate)
- Rewards (WithdrawDelegatorReward, WithdrawValidatorCommission)
- Batch transactions (combined withdrawals)
- Governance (Vote, SubmitProposal)
- IBC transfers
- Authz executions

### Historical Price Analysis

Enable price tracking to see profit/loss analysis:

```bash
POST /api/wallet/:id/backfill-prices
```

This will:
1. Fetch historical prices for all transactions
2. Calculate USD value at transaction time
3. Compare with current value for P&L analysis

### Lock Management

The system uses distributed locks to prevent:
- Concurrent wallet syncs
- Race conditions during deletion
- Duplicate reparse operations

Locks automatically timeout after 5 minutes and can be manually released via the lock manager.

### Heartbeat System

Prevents stuck syncs with automatic detection and recovery:
- Updates heartbeat every query completion
- Detects stale syncs (>10 minutes without heartbeat)
- Auto-releases locks and resets sync status

## Troubleshooting

### Sync Issues

If a wallet is stuck syncing:
```bash
POST /api/wallet/:id/resync
```

### Missing Transactions

Chain indexing modes vary. The system automatically tries:
1. Legacy query parameter mode
2. Modern events parameter mode

If transactions are still missing, check:
- RPC/REST endpoint health: `GET /api/test-rpc/:chainId`
- Chain indexing settings (some chains require specific configurations)

### Price Data Missing

Ensure:
- Chain has valid `coingeckoId` in config
- CoinGecko API is accessible
- Run manual backfill: `POST /api/backfill-prices`

### Webhook Not Working

1. Test the webhook: `POST /api/wallet/:id/webhook/test`
2. Verify Discord webhook URL is correct
3. Check that notification types are enabled
4. Review application logs for errors

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch
3. Write tests for new features
4. Ensure code passes linting
5. Submit a pull request

## License

MIT License - See LICENSE file for details

## Support

For issues and feature requests, please use the GitHub issue tracker.

## Acknowledgments

Built with:
- [CosmJS](https://github.com/cosmos/cosmjs) - Cosmos SDK JavaScript library
- [Prisma](https://www.prisma.io/) - Next-generation ORM
- [Express](https://expressjs.com/) - Web framework
- [CoinGecko API](https://www.coingecko.com/en/api) - Cryptocurrency price data