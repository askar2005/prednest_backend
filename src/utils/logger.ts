export const logger = {
  info: (message: string) => console.log(`[INFO] ${message}`),
  error: (error: unknown) => console.error('[ERROR]', error),
};
