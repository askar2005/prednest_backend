import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { signToken } from './token.service.js';
import { generateOtp, getOtpExpiry, isOtpExpired } from './otp.service.js';
import { sendVerificationOtp, sendResetOtp } from './email.service.js';

type AdminSignupInput = { fullName: string; email: string; password: string };

const adminSelect = { id: true, fullName: true, email: true, role: true, isVerified: true, createdAt: true };

export const adminAuthService = {
  async signup(input: AdminSignupInput) {
    console.log('[ADMIN-LOGIN] signup: checking existing email:', input.email.toLowerCase());
    const existing = await prisma.admin.findUnique({ where: { email: input.email.toLowerCase() } });
    if (existing) throw new AppError('Email is already registered', 409);
    const otp = generateOtp();
    const otpExpiry = getOtpExpiry();
    console.log('[ADMIN-LOGIN] signup: OTP generated');
    await sendVerificationOtp(input.fullName, input.email.toLowerCase(), otp);
    console.log('[ADMIN-LOGIN] signup: verification email sent');
    const passwordHash = await bcrypt.hash(input.password, 12);
    const admin = await prisma.admin.create({
      data: { fullName: input.fullName, email: input.email.toLowerCase(), passwordHash, role: 'ADMIN', otp, otpExpiry, isVerified: false },
      select: adminSelect,
    });
    console.log('[ADMIN-LOGIN] signup: admin created:', admin.id);
    return { message: 'Admin account created. Please verify your email.', email: admin.email };
  },

  async verifyEmail(email: string, otp: string) {
    console.log('[ADMIN-LOGIN] verifyEmail: looking up:', email.toLowerCase());
    const admin = await prisma.admin.findUnique({ where: { email: email.toLowerCase() } });
    if (!admin) throw new AppError('Admin not found', 404);
    console.log('[ADMIN-LOGIN] verifyEmail: admin found:', admin.id, 'OTP match:', admin.otp === otp);
    if (admin.isVerified) return { message: 'Email already verified.' };
    if (!admin.otp || !admin.otpExpiry) throw new AppError('No OTP found. Request a new one.', 400);
    if (isOtpExpired(admin.otpExpiry)) throw new AppError('OTP has expired. Request a new one.', 400);
    if (admin.otp !== otp) throw new AppError('Invalid OTP', 400);
    console.log('[ADMIN-LOGIN] verifyEmail: OTP valid, verifying admin');
    await prisma.admin.update({ where: { id: admin.id }, data: { otp: null, otpExpiry: null, isVerified: true } });
    const token = signToken(admin.id, 'ADMIN');
    console.log('[ADMIN-LOGIN] verifyEmail: JWT generated');
    return { admin: { id: admin.id, fullName: admin.fullName, email: admin.email, role: 'ADMIN', isVerified: true, createdAt: admin.createdAt }, token };
  },

  async login(email: string, password: string) {
    console.log('[ADMIN-LOGIN] === REQUEST RECEIVED === email:', email.toLowerCase());
    console.log('[ADMIN-LOGIN] password length:', password?.length || 0);
    const admin = await prisma.admin.findUnique({ where: { email: email.toLowerCase() } });
    if (!admin) {
      console.log('[ADMIN-LOGIN] === USER NOT FOUND === email not in database:', email.toLowerCase());
      throw new AppError('Invalid credentials', 401);
    }
    console.log('[ADMIN-LOGIN] === USER FOUND === id:', admin.id, 'email:', admin.email, 'role:', admin.role, 'isVerified:', admin.isVerified);
    console.log('[ADMIN-LOGIN] comparing password...');
    const ok = await bcrypt.compare(password, admin.passwordHash);
    console.log('[ADMIN-LOGIN] === PASSWORD MATCHED ===', ok);
    if (!ok) {
      console.log('[ADMIN-LOGIN] === PASSWORD MISMATCH === for admin:', admin.id);
      throw new AppError('Invalid credentials', 401);
    }
    if (!admin.isVerified) {
      console.log('[ADMIN-LOGIN] admin not verified, sending new OTP');
      const otp = generateOtp();
      const otpExpiry = getOtpExpiry();
      await prisma.admin.update({ where: { id: admin.id }, data: { otp, otpExpiry } });
      await sendVerificationOtp(admin.fullName, admin.email, otp);
      throw new AppError('Please verify your email first. A new OTP has been sent.', 403);
    }
    console.log('[ADMIN-LOGIN] === PASSWORD VALID === generating JWT...');
    const now = new Date();
    await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: now } });
    const token = signToken(admin.id, 'ADMIN');
    console.log('[ADMIN-LOGIN] === JWT GENERATED === token length:', token.length);
    console.log('[ADMIN-LOGIN] === RESPONSE SENT === admin:', admin.id, 'email:', admin.email);
    return { admin: { id: admin.id, fullName: admin.fullName, email: admin.email, role: 'ADMIN', lastLoginAt: now, createdAt: admin.createdAt }, token };
  },

  async forgotPassword(email: string) {
    console.log('[ADMIN-LOGIN] forgotPassword:', email.toLowerCase());
    const admin = await prisma.admin.findUnique({ where: { email: email.toLowerCase() } });
    if (!admin) return { message: 'If the email exists, a reset code has been sent.' };
    console.log('[ADMIN-LOGIN] forgotPassword: admin found, generating reset OTP');
    const otp = generateOtp();
    const otpExpiry = getOtpExpiry();
    await prisma.admin.update({ where: { id: admin.id }, data: { resetOtp: otp, resetOtpExpiry: otpExpiry } });
    await sendResetOtp(admin.fullName, admin.email, otp);
    console.log('[ADMIN-LOGIN] forgotPassword: reset OTP sent');
    return { message: 'If the email exists, a reset code has been sent.' };
  },

  async verifyResetOtp(email: string, otp: string) {
    const admin = await prisma.admin.findUnique({ where: { email: email.toLowerCase() } });
    if (!admin) throw new AppError('Admin not found', 404);
    if (!admin.resetOtp || !admin.resetOtpExpiry) throw new AppError('No reset code found.', 400);
    if (isOtpExpired(admin.resetOtpExpiry)) throw new AppError('Reset code has expired.', 400);
    if (admin.resetOtp !== otp) throw new AppError('Invalid reset code', 400);
    console.log('[ADMIN-LOGIN] verifyResetOtp: verified for:', email);
    return { message: 'OTP verified. You can now reset your password.' };
  },

  async resetPassword(email: string, otp: string, newPassword: string) {
    const admin = await prisma.admin.findUnique({ where: { email: email.toLowerCase() } });
    if (!admin) throw new AppError('Admin not found', 404);
    if (!admin.resetOtp || !admin.resetOtpExpiry) throw new AppError('No reset code found.', 400);
    if (isOtpExpired(admin.resetOtpExpiry)) throw new AppError('Reset code has expired.', 400);
    if (admin.resetOtp !== otp) throw new AppError('Invalid reset code', 400);
    console.log('[ADMIN-LOGIN] resetPassword: resetting for:', email);
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.admin.update({
      where: { id: admin.id },
      data: { passwordHash, resetOtp: null, resetOtpExpiry: null },
    });
    console.log('[ADMIN-LOGIN] resetPassword: success');
    return { message: 'Password has been reset successfully.' };
  },

  async getMe(adminId: string) {
    console.log('[ADMIN-LOGIN] getMe:', adminId);
    const admin = await prisma.admin.findUnique({ where: { id: adminId }, select: adminSelect });
    if (!admin) throw new AppError('Admin not found', 404);
    return admin;
  },

  async resendOtp(email: string) {
    console.log('[ADMIN-LOGIN] resendOtp:', email.toLowerCase());
    const admin = await prisma.admin.findUnique({ where: { email: email.toLowerCase() } });
    if (!admin) throw new AppError('Admin not found', 404);
    const otp = generateOtp();
    const otpExpiry = getOtpExpiry();
    await prisma.admin.update({ where: { id: admin.id }, data: { otp, otpExpiry } });
    await sendVerificationOtp(admin.fullName, admin.email, otp);
    console.log('[ADMIN-LOGIN] resendOtp: new OTP sent');
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