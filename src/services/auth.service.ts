import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { signToken } from './token.service.js';
import { generateOtp, getOtpExpiry, isOtpExpired } from './otp.service.js';
import { sendVerificationOtp, sendResetOtp } from './email.service.js';

type SignupInput = { fullName: string; email: string; password: string };
type LoginInput = { email: string; password: string };

// Emails are normalized (trim + lowercase) everywhere so whitespace or case
// never causes a "user not found" 401 for what is visually the same address.
function normalizeEmail(email: string): string {
  return String(email ?? '').trim().toLowerCase();
}

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export const authService = {
  async signup(input: SignupInput) {
    const email = normalizeEmail(input.email);
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError('Email is already registered', 409);
    const otp = generateOtp();
    const otpExpiry = getOtpExpiry();
    await sendVerificationOtp(input.fullName, email, otp);
    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({
      data: { name: input.fullName, email, passwordHash, role: 'USER', otp, otpExpiry, isVerified: false },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    return { message: 'Account created. Please verify your email.', userId: user.id, email: user.email };
  },

  async verifyEmail(email: string, otp: string) {
    const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    if (!user) throw new AppError('User not found', 404);
    if (user.isVerified) return { message: 'Email already verified.' };
    if (!user.otp || !user.otpExpiry) throw new AppError('No OTP found. Request a new one.', 400);
    if (isOtpExpired(user.otpExpiry)) throw new AppError('OTP has expired. Request a new one.', 400);
    if (user.otp !== otp) throw new AppError('Invalid OTP', 400);
    await prisma.user.update({ where: { id: user.id }, data: { otp: null, otpExpiry: null, isVerified: true } });
    const token = signToken(user.id, user.role);
    return { message: 'Email verified successfully.', token };
  },

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({ where: { email: normalizeEmail(input.email) } });
    if (!user) throw new AppError('Invalid credentials', 401);
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) throw new AppError('Invalid credentials', 401);
    if (!user.isVerified) {
      const otp = generateOtp();
      const otpExpiry = getOtpExpiry();
      await prisma.user.update({ where: { id: user.id }, data: { otp, otpExpiry } });
      await sendVerificationOtp(user.name, user.email, otp);
      throw new AppError('Please verify your email first. A new OTP has been sent.', 403);
    }
    const token = signToken(user.id, user.role);
    return { user: { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt }, token };
  },

  async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    if (!user) return { message: 'If the email exists, a reset code has been sent.' };
    const otp = generateOtp();
    const otpExpiry = getOtpExpiry();
    await prisma.user.update({ where: { id: user.id }, data: { resetOtp: otp, resetOtpExpiry: otpExpiry } });
    await sendResetOtp(user.name, user.email, otp);
    return { message: 'If the email exists, a reset code has been sent.' };
  },

  async verifyResetOtp(email: string, otp: string) {
    const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    if (!user) throw new AppError('User not found', 404);
    if (!user.resetOtp || !user.resetOtpExpiry) throw new AppError('No reset code found. Request a new one.', 400);
    if (isOtpExpired(user.resetOtpExpiry)) throw new AppError('Reset code has expired. Request a new one.', 400);
    if (user.resetOtp !== otp) throw new AppError('Invalid reset code', 400);
    return { message: 'OTP verified. You can now reset your password.' };
  },

  async resetPassword(email: string, otp: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    if (!user) throw new AppError('User not found', 404);
    if (!user.resetOtp || !user.resetOtpExpiry) throw new AppError('No reset code found. Request a new one.', 400);
    if (isOtpExpired(user.resetOtpExpiry)) throw new AppError('Reset code has expired.', 400);
    if (user.resetOtp !== otp) throw new AppError('Invalid reset code', 400);
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetOtp: null, resetOtpExpiry: null },
    });
    return { message: 'Password has been reset successfully.' };
  },

  async updateProfile(userId: string, data: { name?: string }) {
    if (data.name) {
      await prisma.user.update({ where: { id: userId }, data: { name: data.name } });
    }
    return this.getMe(userId);
  },

  async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);
    if (!(await verifyPassword(oldPassword, user.passwordHash))) {
      throw new AppError('Current password is incorrect', 400);
    }
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    return { message: 'Password changed successfully.' };
  },

  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, isVerified: true, createdAt: true },
    });
    if (!user) throw new AppError('User not found', 404);
    return user;
  },

  async resendOtp(email: string) {
    const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } });
    if (!user) throw new AppError('User not found', 404);
    const otp = generateOtp();
    const otpExpiry = getOtpExpiry();
    await prisma.user.update({ where: { id: user.id }, data: { otp, otpExpiry } });
    await sendVerificationOtp(user.name, user.email, otp);
    return { message: 'A new OTP has been sent to your email.' };
  },
};
