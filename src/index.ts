import { startBot } from './bot.js';

startBot().catch((error: unknown) => {
  console.error('CryptoPulse Pro failed to start:', error);
  process.exitCode = 1;
});
