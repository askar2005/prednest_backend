import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { signToken } from './token.service.js';
import { generateOtp, getOtpExpiry, isOtpExpired } from './otp.service.js';
import { sendVerificationOtp, sendResetOtp, sendAccountDeletionOtp } from './email.service.js';

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
    if (existing) {
      if (existing.isVerified) {
        throw new AppError('An account with this email address already exists. Please sign in.', 409);
      }
      // Re-use pending unverified record for retry
      const otp = generateOtp();
      const otpExpiry = getOtpExpiry();
      const passwordHash = await hashPassword(input.password);

      await sendVerificationOtp(input.fullName, email, otp);

      await prisma.user.update({
        where: { id: existing.id },
        data: { name: input.fullName, passwordHash, otp, otpExpiry },
      });

      return { message: 'Account creation initiated. Please check your email for the verification code.', email };
    }

    const otp = generateOtp();
    const otpExpiry = getOtpExpiry();
    const passwordHash = await hashPassword(input.password);

    // 1. Send OTP email via Brevo FIRST (throws AppError if Brevo fails)
    await sendVerificationOtp(input.fullName, email, otp);

    // 2. Store unverified user record ONLY after Brevo accepts the email
    const user = await prisma.user.create({
      data: { name: input.fullName, email, passwordHash, role: 'USER', otp, otpExpiry, isVerified: false },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });

    return { message: 'Account creation initiated. Please check your email for the verification code.', email: user.email };
  },

  async verifyEmail(emailInput: string, otpInput: string) {
    const email = normalizeEmail(emailInput);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError('Account not found. Please sign up.', 404);
    if (user.isVerified) return { message: 'Email is already verified. You can now sign in.' };
    if (!user.otp || !user.otpExpiry) throw new AppError('No verification code found. Please request a new code.', 400);
    if (isOtpExpired(user.otpExpiry)) throw new AppError('Verification code has expired. Please request a new code.', 400);
    if (user.otp !== String(otpInput).trim()) throw new AppError('Invalid verification code. Please check and try again.', 400);

    await prisma.user.update({
      where: { id: user.id },
      data: { otp: null, otpExpiry: null, isVerified: true },
    });

    const token = signToken(user.id, user.role);
    return { message: 'Email verified successfully. You can now sign in.', token };
  },

  async login(input: LoginInput) {
    const email = normalizeEmail(input.email);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError('Invalid email or password.', 401);
    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) throw new AppError('Invalid email or password.', 401);

    if (!user.isVerified) {
      const otp = generateOtp();
      const otpExpiry = getOtpExpiry();
      try {
        await sendVerificationOtp(user.name, user.email, otp);
        await prisma.user.update({ where: { id: user.id }, data: { otp, otpExpiry } });
      } catch (e) {
        // ignore send error so 403 message is returned
      }
      throw new AppError('Please verify your email address before logging in. A verification code has been sent.', 403);
    }

    const token = signToken(user.id, user.role);
    return { user: { id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt }, token };
  },

  async forgotPassword(emailInput: string) {
    const email = normalizeEmail(emailInput);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return { message: 'If an account with this email exists, a password reset code has been sent.' };
    }

    const otp = generateOtp();
    const otpExpiry = getOtpExpiry();

    await sendResetOtp(user.name, user.email, otp);

    await prisma.user.update({
      where: { id: user.id },
      data: { resetOtp: otp, resetOtpExpiry: otpExpiry },
    });

    return { message: 'If an account with this email exists, a password reset code has been sent.' };
  },

  async verifyResetOtp(emailInput: string, otpInput: string) {
    const email = normalizeEmail(emailInput);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError('Account not found.', 404);
    if (!user.resetOtp || !user.resetOtpExpiry) throw new AppError('No password reset code found. Please request a new code.', 400);
    if (isOtpExpired(user.resetOtpExpiry)) throw new AppError('Password reset code has expired. Please request a new code.', 400);
    if (user.resetOtp !== String(otpInput).trim()) throw new AppError('Invalid password reset code.', 400);

    return { message: 'Verification code accepted. You can now set your new password.' };
  },

  async resetPassword(emailInput: string, otpInput: string, newPassword: string) {
    const email = normalizeEmail(emailInput);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError('Account not found.', 404);
    if (!user.resetOtp || !user.resetOtpExpiry) throw new AppError('No password reset code found. Please request a new code.', 400);
    if (isOtpExpired(user.resetOtpExpiry)) throw new AppError('Password reset code has expired.', 400);
    if (user.resetOtp !== String(otpInput).trim()) throw new AppError('Invalid password reset code.', 400);

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetOtp: null, resetOtpExpiry: null },
    });

    return { message: 'Your password has been reset successfully. Please sign in.' };
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

  async resendOtp(emailInput: string) {
    const email = normalizeEmail(emailInput);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError('User account not found', 404);
    if (user.isVerified) throw new AppError('Email is already verified.', 400);

    const otp = generateOtp();
    const otpExpiry = getOtpExpiry();

    await sendVerificationOtp(user.name, user.email, otp);

    await prisma.user.update({
      where: { id: user.id },
      data: { otp, otpExpiry },
    });

    return { message: 'A new verification code has been sent to your email.' };
  },

  async deleteAccount(userId: string, password?: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('User not found', 404);

    if (password) {
      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) throw new AppError('Current password is incorrect', 400);
    }

    await deleteUserCascade(user.id);
    return { message: 'Your account and all associated personal data have been deleted successfully.' };
  },

  async requestWebDeleteAccount(emailInput: string) {
    const email = normalizeEmail(emailInput);
    const user = await prisma.user.findUnique({ where: { email } });

    // Always return consistent success message to prevent account enumeration vulnerabilities
    if (!user) {
      return { message: 'If an account with this email exists, a deletion verification code has been sent.' };
    }

    const otp = generateOtp();
    const otpExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15 minute expiry for deletion code

    await prisma.user.update({
      where: { id: user.id },
      data: { resetOtp: otp, resetOtpExpiry: otpExpiry },
    });

    try {
      await sendAccountDeletionOtp(user.name, user.email, otp);
    } catch (e) {
      console.error('[Web Account Deletion Email Error]', e);
    }

    return { message: 'If an account with this email exists, a deletion verification code has been sent.' };
  },

  async confirmWebDeleteAccount(emailInput: string, otp: string) {
    const email = normalizeEmail(emailInput);
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new AppError('Invalid or expired verification code', 400);
    }

    if (!user.resetOtp || !user.resetOtpExpiry) {
      throw new AppError('No deletion verification code found. Please request a new code.', 400);
    }

    if (isOtpExpired(user.resetOtpExpiry)) {
      throw new AppError('Verification code has expired. Please request a new code.', 400);
    }

    if (user.resetOtp !== otp) {
      throw new AppError('Invalid verification code', 400);
    }

    await deleteUserCascade(user.id);
    return { message: 'Your account and associated personal data have been deleted successfully.' };
  },
};

async function deleteUserCascade(userId: string) {
  return prisma.$transaction(async (tx) => {
    // 1. Delete user daily challenge attempts
    await tx.userDailyChallenge.deleteMany({ where: { userId } });

    // 2. Delete user streak
    await tx.userStreak.deleteMany({ where: { userId } });

    // 3. Delete progress
    await tx.progress.deleteMany({ where: { userId } });

    // 4. Find results owned by this user
    const userResults = await tx.result.findMany({
      where: { userId },
      select: { id: true },
    });
    const resultIds = userResults.map((r) => r.id);

    // 5. Delete answer records for those results
    if (resultIds.length > 0) {
      await tx.answerRecord.deleteMany({
        where: { resultId: { in: resultIds } },
      });
    }

    // 6. Delete user results
    await tx.result.deleteMany({ where: { userId } });

    // 7. Delete notification read markers
    await tx.notificationRead.deleteMany({ where: { userId } });

    // 8. Disassociate discussion comments (set userId to null)
    await tx.discussionComment.updateMany({
      where: { userId },
      data: { userId: null },
    });

    // 9. Delete user record itself
    return tx.user.delete({ where: { id: userId } });
  });
}


