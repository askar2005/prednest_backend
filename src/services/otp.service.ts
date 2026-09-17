import crypto from 'crypto';

export function generateOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export function getOtpExpiry(): Date {
  return new Date(Date.now() + 15 * 60 * 1000);
}

export function isOtpExpired(expiry: Date | null | undefined): boolean {
  if (!expiry) return true;
  return new Date() > new Date(expiry);
}
