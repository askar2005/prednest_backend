import { Router } from 'express';
import { requireUser } from '../middlewares/require-auth.js';
import { validateBody } from '../middlewares/validate-body.js';
import {
  signupSchema, loginSchema, verifyEmailSchema, forgotPasswordSchema,
  verifyResetOtpSchema, resetPasswordSchema, deleteAccountSchema,
  requestWebDeleteAccountSchema, confirmWebDeleteAccountSchema,
} from '../validators/auth.validators.js';
import {
  signup, verifyEmail, login, forgotPassword, verifyResetOtp,
  resetPassword, me, resendOtp, logout, updateProfile, changePassword,
  deleteAccount, requestWebDeleteAccount, confirmWebDeleteAccount,
} from '../controllers/auth.controller.js';

export const authRouter = Router();

authRouter.post('/signup', validateBody(signupSchema), signup);
authRouter.post('/verify-email', validateBody(verifyEmailSchema), verifyEmail);
authRouter.post('/login', validateBody(loginSchema), login);
authRouter.post('/forgot-password', validateBody(forgotPasswordSchema), forgotPassword);
authRouter.post('/verify-reset-otp', validateBody(verifyResetOtpSchema), verifyResetOtp);
authRouter.post('/reset-password', validateBody(resetPasswordSchema), resetPassword);
authRouter.get('/me', requireUser, me);
authRouter.put('/profile', requireUser, updateProfile);
authRouter.put('/change-password', requireUser, changePassword);
authRouter.delete('/account', requireUser, validateBody(deleteAccountSchema), deleteAccount);
authRouter.post('/request-web-delete-account', validateBody(requestWebDeleteAccountSchema), requestWebDeleteAccount);
authRouter.post('/confirm-web-delete-account', validateBody(confirmWebDeleteAccountSchema), confirmWebDeleteAccount);
authRouter.post('/logout', logout);
authRouter.post('/resend-otp', validateBody(forgotPasswordSchema), resendOtp);

// Keep old endpoints for backward compatibility
authRouter.post('/register', validateBody(signupSchema), signup);

