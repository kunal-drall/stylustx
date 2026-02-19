import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { RelayerService } from './services/relayer';
import { logger } from './utils/logger';
import { validateMetaTxRequest, validateBatchRequest } from './middleware/validation';

// Load environment variables
dotenv.config();

// Configuration
const PORT = process.env.PORT || 3001;
const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS!;
const RPC_URL = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const RELAYER_PRIVATE_KEY = process.env.RELAYER_PRIVATE_KEY!;
const CHAIN_ID = parseInt(process.env.CHAIN_ID || '421614');

// Validate required environment variables
if (!PAYMASTER_ADDRESS || !RELAYER_PRIVATE_KEY) {
  logger.error('Missing required environment variables: PAYMASTER_ADDRESS, RELAYER_PRIVATE_KEY');
  process.exit(1);
}

// Initialize relayer service
const relayerService = new RelayerService({
  paymasterAddress: PAYMASTER_ADDRESS,
  rpcUrl: RPC_URL,
  relayerPrivateKey: RELAYER_PRIVATE_KEY,
  chainId: CHAIN_ID,
});

// Create Express app
const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: 'Too many requests, please try again later' },
});
app.use(limiter);

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    relayer: relayerService.getRelayerAddress(),
    paymaster: PAYMASTER_ADDRESS,
    chainId: CHAIN_ID,
  });
});

// Get relayer info
app.get('/info', async (req: Request, res: Response) => {
  try {
    const info = await relayerService.getInfo();
    res.json(info);
  } catch (error: any) {
    logger.error('Failed to get relayer info:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get nonce for a user
app.get('/nonce/:address', async (req: Request, res: Response) => {
  try {
    const nonce = await relayerService.getNonce(req.params.address);
    res.json({ address: req.params.address, nonce: nonce.toString() });
  } catch (error: any) {
    logger.error('Failed to get nonce:', error);
    res.status(500).json({ error: error.message });
  }
});

// Submit a meta-transaction
app.post('/relay', validateMetaTxRequest, async (req: Request, res: Response) => {
  try {
    const result = await relayerService.relay(req.body);

    if (result.success) {
      logger.info(`Transaction relayed: ${result.txHash}`);
      res.json(result);
    } else {
      logger.warn(`Transaction failed: ${result.error}`);
      res.status(400).json(result);
    }
  } catch (error: any) {
    logger.error('Relay error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Submit a batch of meta-transactions
app.post('/relay/batch', validateBatchRequest, async (req: Request, res: Response) => {
  try {
    const result = await relayerService.relayBatch(req.body.transactions);

    if (result.success) {
      logger.info(`Batch relayed: ${result.txHash}`);
      res.json(result);
    } else {
      logger.warn(`Batch failed: ${result.error}`);
      res.status(400).json(result);
    }
  } catch (error: any) {
    logger.error('Batch relay error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get transaction status
app.get('/status/:txHash', async (req: Request, res: Response) => {
  try {
    const status = await relayerService.getTransactionStatus(req.params.txHash);
    res.json(status);
  } catch (error: any) {
    logger.error('Failed to get transaction status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get policy status for a user
app.get('/policy/:address', async (req: Request, res: Response) => {
  try {
    const gasLimit = req.query.gasLimit ? BigInt(req.query.gasLimit as string) : 0n;
    const status = await relayerService.getPolicyStatus(req.params.address, gasLimit);
    res.json(status);
  } catch (error: any) {
    logger.error('Failed to get policy status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  logger.info(`StylusTx Relayer running on port ${PORT}`);
  logger.info(`Paymaster: ${PAYMASTER_ADDRESS}`);
  logger.info(`Chain ID: ${CHAIN_ID}`);
  logger.info(`Relayer: ${relayerService.getRelayerAddress()}`);
});

export default app;
