import cron from 'node-cron';
import { dailyChallengeService } from './daily-challenge.service.js';
import { logger } from '../utils/logger.js';

let task: ReturnType<typeof cron.schedule> | null = null;

export function startScheduler() {
  const run = async () => {
    try {
      const result = await dailyChallengeService.runScheduler();
      logger.info(`[Scheduler] Daily challenge auto-publish complete: published=${result.published}, queue=${result.queue}`);
    } catch (err) {
      logger.error(err);
    }
  };

  run();

  task = cron.schedule('0 0 * * *', () => {
    run();
  });

  task.start();
  logger.info('[Scheduler] Daily challenge auto-publisher started (cron "0 0 * * *")');
}

export function stopScheduler() {
  if (task) {
    task.stop();
    task = null;
  }
}