import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { signToken } from './token.service.js';
import { generateOtp, getOtpExpiry, isOtpExpired } from './otp.service.js';
import { sendVerificationOtp, sendResetOtp } from './email.service.js';

type AdminSignupInput = { fullName: string; email: string; password: string };

// Emails are normalized (trim + lowercase) so whitespace/case never causes a
// false "user not found" 401 for an otherwise correct address.
function normalizeEmail(email: string): string {
  return String(email ?? '').trim().toLowerCase();
}

const adminSelect = { id: true, fullName: true, email: true, role: true, isVerified: true, createdAt: true };

export const adminAuthService = {
  async signup(input: AdminSignupInput) {
    const email = normalizeEmail(input.email);
    const existing = await prisma.admin.findUnique({ where: { email } });
    if (existing) throw new AppError('Email is already registered', 409);
    const otp = generateOtp();
    const otpExpiry = getOtpExpiry();
    await sendVerificationOtp(input.fullName, email, otp);
    const passwordHash = await bcrypt.hash(input.password, 12);
    const admin = await prisma.admin.create({
      data: { fullName: input.fullName, email, passwordHash, role: 'ADMIN', otp, otpExpiry, isVerified: false },
      select: adminSelect,
    });
    return { message: 'Admin account created. Please verify your email.', email: admin.email };
  },

  async verifyEmail(email: string, otp: string) {
    const admin = await prisma.admin.findUnique({ where: { email: normalizeEmail(email) } });
    if (!admin) throw new AppError('Admin not found', 404);
    if (admin.isVerified) return { message: 'Email already verified.' };
    if (!admin.otp || !admin.otpExpiry) throw new AppError('No OTP found. Request a new one.', 400);
    if (isOtpExpired(admin.otpExpiry)) throw new AppError('OTP has expired. Request a new one.', 400);
    if (admin.otp !== otp) throw new AppError('Invalid OTP', 400);
    await prisma.admin.update({ where: { id: admin.id }, data: { otp: null, otpExpiry: null, isVerified: true } });
    const token = signToken(admin.id, 'ADMIN');
    return { admin: { id: admin.id, fullName: admin.fullName, email: admin.email, role: 'ADMIN', isVerified: true, createdAt: admin.createdAt }, token };
  },

  async login(email: string, password: string) {
    const admin = await prisma.admin.findUnique({ where: { email: normalizeEmail(email) } });
    if (!admin) throw new AppError('Invalid credentials', 401);
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) throw new AppError('Invalid credentials', 401);
    if (!admin.isVerified) {
      const otp = generateOtp();
      const otpExpiry = getOtpExpiry();
      await prisma.admin.update({ where: { id: admin.id }, data: { otp, otpExpiry } });
      await sendVerificationOtp(admin.fullName, admin.email, otp);
      throw new AppError('Please verify your email first. A new OTP has been sent.', 403);
    }
    const now = new Date();
    await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: now } });
    const token = signToken(admin.id, 'ADMIN');
    return { admin: { id: admin.id, fullName: admin.fullName, email: admin.email, role: 'ADMIN', lastLoginAt: now, createdAt: admin.createdAt }, token };
  },

  async forgotPassword(email: string) {
    const admin = await prisma.admin.findUnique({ where: { email: normalizeEmail(email) } });
    if (!admin) return { message: 'If the email exists, a reset code has been sent.' };
    const otp = generateOtp();
    const otpExpiry = getOtpExpiry();
    await prisma.admin.update({ where: { id: admin.id }, data: { resetOtp: otp, resetOtpExpiry: otpExpiry } });
    await sendResetOtp(admin.fullName, admin.email, otp);
    return { message: 'If the email exists, a reset code has been sent.' };
  },

  async verifyResetOtp(email: string, otp: string) {
    const admin = await prisma.admin.findUnique({ where: { email: normalizeEmail(email) } });
    if (!admin) throw new AppError('Admin not found', 404);
    if (!admin.resetOtp || !admin.resetOtpExpiry) throw new AppError('No reset code found.', 400);
    if (isOtpExpired(admin.resetOtpExpiry)) throw new AppError('Reset code has expired.', 400);
    if (admin.resetOtp !== otp) throw new AppError('Invalid reset code', 400);
    return { message: 'OTP verified. You can now reset your password.' };
  },

  async resetPassword(email: string, otp: string, newPassword: string) {
    const admin = await prisma.admin.findUnique({ where: { email: normalizeEmail(email) } });
    if (!admin) throw new AppError('Admin not found', 404);
    if (!admin.resetOtp || !admin.resetOtpExpiry) throw new AppError('No reset code found.', 400);
    if (isOtpExpired(admin.resetOtpExpiry)) throw new AppError('Reset code has expired.', 400);
    if (admin.resetOtp !== otp) throw new AppError('Invalid reset code', 400);
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.admin.update({
      where: { id: admin.id },
      data: { passwordHash, resetOtp: null, resetOtpExpiry: null },
    });
    return { message: 'Password has been reset successfully.' };
  },

  async getMe(adminId: string) {
    const admin = await prisma.admin.findUnique({ where: { id: adminId }, select: adminSelect });
    if (!admin) throw new AppError('Admin not found', 404);
    return admin;
  },

  async resendOtp(email: string) {
    const admin = await prisma.admin.findUnique({ where: { email: normalizeEmail(email) } });
    if (!admin) throw new AppError('Admin not found', 404);
    const otp = generateOtp();
    const otpExpiry = getOtpExpiry();
    await prisma.admin.update({ where: { id: admin.id }, data: { otp, otpExpiry } });
    await sendVerificationOtp(admin.fullName, admin.email, otp);
    return { message: 'A new OTP has been sent to your email.' };
  },
};
