import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { signToken } from './token.service.js';
import { generateOtp, getOtpExpiry, isOtpExpired } from './otp.service.js';
import { sendVerificationOtp, sendResetOtp } from './email.service.js';

type AdminSignupInput = { fullName: string; email: string; password: string };

const adminSelect = { id: true, fullName: true, email: true, role: true, isVerified: true, createdAt: true };

function log(context: string, ...args: unknown[]) {
  console.log(`[ADMIN-AUTH] [${context}]`, ...args);
}

export const adminAuthService = {
  async signup(input: AdminSignupInput) {
    log('signup', 'Checking for existing email:', input.email.toLowerCase());
    const existing = await prisma.admin.findUnique({ where: { email: input.email.toLowerCase() } });
    if (existing) throw new AppError('Email is already registered', 409);
    const otp = generateOtp();
    const otpExpiry = getOtpExpiry();
    log('signup', 'OTP generated:', otp, 'expires:', otpExpiry);
    log('signup', 'Sending verification email BEFORE creating admin...');
    await sendVerificationOtp(input.fullName, input.email.toLowerCase(), otp);
    log('signup', 'Verification email sent successfully, now creating admin...');
    const passwordHash = await bcrypt.hash(input.password, 12);
    const admin = await prisma.admin.create({
      data: { fullName: input.fullName, email: input.email.toLowerCase(), passwordHash, role: 'ADMIN', otp, otpExpiry, isVerified: false },
      select: adminSelect,
    });
    log('signup', 'Admin created:', admin.id);
    return { message: 'Admin account created. Please verify your email.', email: admin.email };
  },

  async verifyEmail(email: string, otp: string) {
    log('verifyEmail', 'Looking up admin:', email.toLowerCase());
    const admin = await prisma.admin.findUnique({ where: { email: email.toLowerCase() } });
    if (!admin) throw new AppError('Admin not found', 404);
    log('verifyEmail', 'Admin found, stored OTP:', admin.otp, 'provided OTP:', otp);
    if (admin.isVerified) return { message: 'Email already verified.' };
    if (!admin.otp || !admin.otpExpiry) throw new AppError('No OTP found. Request a new one.', 400);
    if (isOtpExpired(admin.otpExpiry)) throw new AppError('OTP has expired. Request a new one.', 400);
    if (admin.otp !== otp) throw new AppError('Invalid OTP', 400);
    log('verifyEmail', 'OTP valid, marking admin as verified');
    await prisma.admin.update({ where: { id: admin.id }, data: { otp: null, otpExpiry: null, isVerified: true } });
    const token = signToken(admin.id, 'ADMIN');
    log('verifyEmail', 'JWT generated, email verified');
    return { admin: { id: admin.id, fullName: admin.fullName, email: admin.email, role: 'ADMIN', isVerified: true, createdAt: admin.createdAt }, token };
  },

  async login(email: string, password: string) {
    log('login', 'Login attempt:', email.toLowerCase());
    const admin = await prisma.admin.findUnique({ where: { email: email.toLowerCase() } });
    if (!admin) throw new AppError('Invalid credentials', 401);
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) throw new AppError('Invalid credentials', 401);
    if (!admin.isVerified) {
      log('login', 'Admin not verified, sending new OTP');
      const otp = generateOtp();
      const otpExpiry = getOtpExpiry();
      await prisma.admin.update({ where: { id: admin.id }, data: { otp, otpExpiry } });
      await sendVerificationOtp(admin.fullName, admin.email, otp);
      throw new AppError('Please verify your email first. A new OTP has been sent.', 403);
    }
    log('login', 'Login successful for:', admin.email);
    const now = new Date();
    await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: now } });
    const token = signToken(admin.id, 'ADMIN');
    return { admin: { id: admin.id, fullName: admin.fullName, email: admin.email, role: 'ADMIN', lastLoginAt: now, createdAt: admin.createdAt }, token };
  },

  async forgotPassword(email: string) {
    log('forgotPassword', 'Looking up admin:', email.toLowerCase());
    const admin = await prisma.admin.findUnique({ where: { email: email.toLowerCase() } });
    if (!admin) return { message: 'If the email exists, a reset code has been sent.' };
    log('forgotPassword', 'Admin found, generating reset OTP');
    const otp = generateOtp();
    const otpExpiry = getOtpExpiry();
    await prisma.admin.update({ where: { id: admin.id }, data: { resetOtp: otp, resetOtpExpiry: otpExpiry } });
    await sendResetOtp(admin.fullName, admin.email, otp);
    log('forgotPassword', 'Reset OTP sent successfully');
    return { message: 'If the email exists, a reset code has been sent.' };
  },

  async verifyResetOtp(email: string, otp: string) {
    const admin = await prisma.admin.findUnique({ where: { email: email.toLowerCase() } });
    if (!admin) throw new AppError('Admin not found', 404);
    if (!admin.resetOtp || !admin.resetOtpExpiry) throw new AppError('No reset code found.', 400);
    if (isOtpExpired(admin.resetOtpExpiry)) throw new AppError('Reset code has expired.', 400);
    if (admin.resetOtp !== otp) throw new AppError('Invalid reset code', 400);
    log('verifyResetOtp', 'Reset OTP verified for:', email);
    return { message: 'OTP verified. You can now reset your password.' };
  },

  async resetPassword(email: string, otp: string, newPassword: string) {
    const admin = await prisma.admin.findUnique({ where: { email: email.toLowerCase() } });
    if (!admin) throw new AppError('Admin not found', 404);
    if (!admin.resetOtp || !admin.resetOtpExpiry) throw new AppError('No reset code found.', 400);
    if (isOtpExpired(admin.resetOtpExpiry)) throw new AppError('Reset code has expired.', 400);
    if (admin.resetOtp !== otp) throw new AppError('Invalid reset code', 400);
    log('resetPassword', 'Resetting password for:', email);
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.admin.update({
      where: { id: admin.id },
      data: { passwordHash, resetOtp: null, resetOtpExpiry: null },
    });
    log('resetPassword', 'Password reset successful');
    return { message: 'Password has been reset successfully.' };
  },

  async getMe(adminId: string) {
    log('getMe', 'Fetching admin:', adminId);
    const admin = await prisma.admin.findUnique({ where: { id: adminId }, select: adminSelect });
    if (!admin) throw new AppError('Admin not found', 404);
    return admin;
  },

  async resendOtp(email: string) {
    log('resendOtp', 'Resending OTP for:', email.toLowerCase());
    const admin = await prisma.admin.findUnique({ where: { email: email.toLowerCase() } });
    if (!admin) throw new AppError('Admin not found', 404);
    const otp = generateOtp();
    const otpExpiry = getOtpExpiry();
    log('resendOtp', 'New OTP:', otp);
    await prisma.admin.update({ where: { id: admin.id }, data: { otp, otpExpiry } });
    await sendVerificationOtp(admin.fullName, admin.email, otp);
    log('resendOtp', 'Resend email sent');
    return { message: 'A new OTP has been sent to your email.' };
  },

  async loginOld(email: string, password: string) {
    const admin = await prisma.admin.findUnique({ where: { email: email.toLowerCase() } });
    if (!admin) {
      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase(), role: 'ADMIN' } });
      if (!user) throw new AppError('Invalid credentials', 401);
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) throw new AppError('Invalid credentials', 401);
      const token = signToken(user.id, 'ADMIN');
      return { user: { id: user.id, name: user.name, email: user.email, role: 'ADMIN' }, token };
    }
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) throw new AppError('Invalid credentials', 401);
    const token = signToken(admin.id, 'ADMIN');
    return { user: { id: admin.id, fullName: admin.fullName, email: admin.email, role: 'ADMIN' }, token };
  },
};
