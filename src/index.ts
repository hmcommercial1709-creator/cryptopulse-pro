import { startBot } from './bot.js';
import { startWebServer } from './web.js';

startWebServer();

startBot().catch((error: unknown) => {
  console.error('CryptoPulse Pro failed to start:', error);
  process.exitCode = 1;
});
