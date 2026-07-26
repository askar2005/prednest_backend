import { dailyChallengeService } from './daily-challenge.service.js';
import { logger } from '../utils/logger.js';

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startScheduler() {
  const run = async () => {
    try {
      await dailyChallengeService.runScheduler();
      logger.info('[Scheduler] Daily challenge auto-publish check complete');
    } catch (err) {
      logger.error(err);
    }
  };

  run();
  const msUntilMidnight = new Date().setHours(24, 0, 0, 0) - Date.now();
  setTimeout(() => {
    run();
    intervalId = setInterval(run, 24 * 60 * 60 * 1000);
  }, Math.min(msUntilMidnight, 60 * 60 * 1000));

  logger.info('[Scheduler] Daily challenge auto-publisher started');
}

export function stopScheduler() {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
}
