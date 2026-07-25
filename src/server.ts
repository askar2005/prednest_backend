import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

app.listen(env.PORT, () => {
  logger.info(`PrepNest backend running on port ${env.PORT}`);
});
