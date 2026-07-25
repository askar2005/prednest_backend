import { Router } from 'express';
import { adminAuthController } from '../controllers/admin-auth.controller.js';
import { adminSettingsController } from '../controllers/admin-settings.controller.js';
import { requireAdmin } from '../middlewares/require-auth.js';
import { validateBody } from '../middlewares/validate-body.js';
import {
  adminSignupSchema, loginSchema, verifyEmailSchema, adminForgotPasswordSchema,
  verifyResetOtpSchema, resetPasswordSchema, updateProfileSchema, changePasswordSchema,
} from '../validators/auth.validators.js';

export const adminRouter = Router();

adminRouter.post('/signup', validateBody(adminSignupSchema), adminAuthController.signup);
adminRouter.post('/verify-email', validateBody(verifyEmailSchema), adminAuthController.verifyEmail);
adminRouter.post('/login', validateBody(loginSchema), adminAuthController.login);
adminRouter.post('/forgot-password', validateBody(adminForgotPasswordSchema), adminAuthController.forgotPassword);
adminRouter.post('/verify-reset-otp', validateBody(verifyResetOtpSchema), adminAuthController.verifyResetOtp);
adminRouter.post('/reset-password', validateBody(resetPasswordSchema), adminAuthController.resetPassword);
adminRouter.get('/me', requireAdmin, adminAuthController.me);
adminRouter.post('/logout', adminAuthController.logout);
adminRouter.post('/resend-otp', validateBody(adminForgotPasswordSchema), adminAuthController.resendOtp);

adminRouter.get('/profile', requireAdmin, adminSettingsController.getProfile);
adminRouter.put('/profile', requireAdmin, validateBody(updateProfileSchema), adminSettingsController.updateProfile);
adminRouter.put('/change-password', requireAdmin, validateBody(changePasswordSchema), adminSettingsController.changePassword);
adminRouter.get('/system-info', requireAdmin, adminSettingsController.getSystemInfo);
adminRouter.get('/session', requireAdmin, adminSettingsController.getSession);
adminRouter.post('/logout-all', requireAdmin, (_req, res) => {
  res.json({ message: 'Logged out from all devices.' });
});
