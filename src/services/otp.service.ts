export function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function getOtpExpiry(): Date {
  return new Date(Date.now() + 5 * 60 * 1000);
}

export function isOtpExpired(expiry: Date | null | undefined): boolean {
  if (!expiry) return true;
  return new Date() > expiry;
}
