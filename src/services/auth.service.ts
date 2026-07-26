import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { signToken } from './token.service.js';
import { generateOtp, getOtpExpiry, isOtpExpired } from './otp.service.js';
import { sendVerificationOtp, sendResetOtp } from './email.service.js';

type SignupInput = { fullName: string; email: string; password: string };
type LoginInput = { email: string; password: string };

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function log(context: string, ...args: unknown[]) {
  console.log(`[AUTH] [${context}]`, ...args);
}

export const authService = {
  async signup(input: SignupInput) {
    log('signup', 'Checking for existing email:', input.email.toLowerCase());
    const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (existing) throw new AppError('Email is already registered', 409);
    const otp = generateOtp();
    const otpExpiry = getOtpExpiry();
    log('signup', 'OTP generated:', otp, 'expires:', otpExpiry);
    log('signup', 'Sending verification email BEFORE creating user...');
    await sendVerificationOtp(input.fullName, input.email.toLowerCase(), otp);
    log('signup', 'Verification email sent successfully, now creating user...');
    const passwordHash = await hashPassword(input.password);
    const user = await prisma.user.create({
      data: { name: input.fullName, email: input.email.toLowerCase(), passwordHash, role: 'USER', otp, otpExpiry, isVerified: false },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    console.log('=== AUTH SIGNUP === User created successfully');
    console.log('=== AUTH SIGNUP === Database ID:', user.id);
    console.log('=== AUTH SIGNUP === Email:', user.email);
    console.log('=== AUTH SIGNUP === Name:', user.name);
    console.log('=== AUTH SIGNUP === Created at:', user.createdAt);
    log('signup', 'User created:', user.id);
    return { message: 'Account created. Please verify your email.', userId: user.id, email: user.email };
  },

  async verifyEmail(email: string, otp: string) {
    log('verifyEmail', 'Looking up user:', email.toLowerCase());
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) throw new AppError('User not found', 404);
    log('verifyEmail', 'User found, stored OTP:', user.otp, 'provided OTP:', otp);
    if (user.isVerified) return { message: 'Email already verified.' };
    if (!user.otp || !user.otpExpiry) throw new AppError('No OTP found. Request a new one.', 400);
    if (isOtpExpired(user.otpExpiry)) throw new AppError('OTP has expired. Request a new one.', 400);
    if (user.otp !== otp) throw new AppError('Invalid OTP', 400);
    log('verifyEmail', 'OTP valid, marking user as verified');
    await prisma.user.update({ where: { id: user.id }, data: { otp: null, otpExpiry: null, isVerified: true } });
    const token = signToken(user.id, user.role);
    log('verifyEmail', 'JWT generated, email verified');
    return { message: 'Email verified successfully.', token };
  },

  async login(input: LoginInput) {
    console.log('[AUTH-LOGIN] === REQUEST RECEIVED === email:', input.email.toLowerCase());
    console.log('[AUTH-LOGIN] password length:', input.password?.length || 0);
    const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!user) {
      console.log('[AUTH-LOGIN] === USER NOT FOUND === email not in database:', input.email.toLowerCase());
      throw new AppError('Invalid credentials', 401);
    }
    console.log('[AUTH-LOGIN] === USER FOUND === id:', user.id, 'email:', user.email, 'role:', user.role, 'isVerified:', user.isVerified);
    console.log('[AUTH-LOGIN] comparing password...');
    const ok = await verifyPassword(input.password, user.passwordHash);
    console.log('[AUTH-LOGIN] === PASSWORD MATCHED ===', ok);
    if (!ok) {
      console.log('[AUTH-LOGIN] === PASSWORD MISMATCH === for user:', user.id);
      throw new AppError('Invalid credentials', 401);
    }
    if (!user.isVerified) {
      console.log('[AUTH-LOGIN] user not verified, sending new OTP');
      const otp = generateOtp();
      const otpExpiry = getOtpExpiry();
      await prisma.user.update({ where: { id: user.id }, data: { otp, otpExpiry } });
      await sendVerificationOtp(user.name, user.email, otp);
      throw new AppError('Please verify your email first. A new OTP has been sent.', 403);
    }
    console.log('[AUTH-LOGIN] === PASSWORD VALID === generating JWT...');
    const token = signToken(user.id, user.role);
    console.log('[AUTH-LOGIN] === JWT GENERATED === token length:', token.length);
    console.log('[AUTH-LOGIN] === RESPONSE SENT === user:', user.id, 'email:', user.email);
    return { user: { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt }, token };
  },

  async forgotPassword(email: string) {
    log('forgotPassword', 'Looking up user:', email.toLowerCase());
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return { message: 'If the email exists, a reset code has been sent.' };
    log('forgotPassword', 'User found, generating reset OTP');
    const otp = generateOtp();
    const otpExpiry = getOtpExpiry();
    await prisma.user.update({ where: { id: user.id }, data: { resetOtp: otp, resetOtpExpiry: otpExpiry } });
    await sendResetOtp(user.name, user.email, otp);
    log('forgotPassword', 'Reset OTP sent successfully');
    return { message: 'If the email exists, a reset code has been sent.' };
  },

  async verifyResetOtp(email: string, otp: string) {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) throw new AppError('User not found', 404);
    if (!user.resetOtp || !user.resetOtpExpiry) throw new AppError('No reset code found. Request a new one.', 400);
    if (isOtpExpired(user.resetOtpExpiry)) throw new AppError('Reset code has expired. Request a new one.', 400);
    if (user.resetOtp !== otp) throw new AppError('Invalid reset code', 400);
    log('verifyResetOtp', 'Reset OTP verified for:', email);
    return { message: 'OTP verified. You can now reset your password.' };
  },

  async resetPassword(email: string, otp: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) throw new AppError('User not found', 404);
    if (!user.resetOtp || !user.resetOtpExpiry) throw new AppError('No reset code found. Request a new one.', 400);
    if (isOtpExpired(user.resetOtpExpiry)) throw new AppError('Reset code has expired.', 400);
    if (user.resetOtp !== otp) throw new AppError('Invalid reset code', 400);
    log('resetPassword', 'Resetting password for:', email);
    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetOtp: null, resetOtpExpiry: null },
    });
    log('resetPassword', 'Password reset successful');
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
    log('getMe', 'Fetching user:', userId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, isVerified: true, createdAt: true },
    });
    if (!user) throw new AppError('User not found', 404);
    return user;
  },

  async resendOtp(email: string) {
    log('resendOtp', 'Resending OTP for:', email.toLowerCase());
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) throw new AppError('User not found', 404);
    const otp = generateOtp();
    const otpExpiry = getOtpExpiry();
    log('resendOtp', 'New OTP:', otp);
    await prisma.user.update({ where: { id: user.id }, data: { otp, otpExpiry } });
    await sendVerificationOtp(user.name, user.email, otp);
    log('resendOtp', 'Resend email sent');
    return { message: 'A new OTP has been sent to your email.' };
  },
};
