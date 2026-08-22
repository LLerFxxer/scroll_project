export const logger = {
  info: (...args: unknown[]) => console.log('[TransShot]', ...args),
  warn: (...args: unknown[]) => console.warn('[TransShot]', ...args),
  error: (...args: unknown[]) => console.error('[TransShot]', ...args)
}
