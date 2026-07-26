import { Request, Response, NextFunction } from 'express';
import { adminAuthService } from '../services/admin-auth.service.js';

export const adminAuthController = {
  signup: async (req: Request, res: Response, next: NextFunction) => {
    try { res.status(201).json(await adminAuthService.signup(req.body)); } catch (e) { next(e); }
  },
  verifyEmail: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await adminAuthService.verifyEmail(req.body.email, req.body.otp)); } catch (e) { next(e); }
  },
  login: async (req: Request, res: Response, next: NextFunction) => {
    console.log('[ADMIN-LOGIN-CTRL] === LOGIN CONTROLLER CALLED ===');
    console.log('[ADMIN-LOGIN-CTRL] body:', JSON.stringify(req.body));
    console.log('[ADMIN-LOGIN-CTRL] email:', req.body?.email);
    console.log('[ADMIN-LOGIN-CTRL] password length:', req.body?.password?.length || 0);
    console.log('[ADMIN-LOGIN-CTRL] content-type:', req.headers['content-type']);
    console.log('[ADMIN-LOGIN-CTRL] ip:', req.ip);
    console.log('[ADMIN-LOGIN-CTRL] originalUrl:', req.originalUrl);
    console.log('[ADMIN-LOGIN-CTRL] method:', req.method);
    try {
      const result = await adminAuthService.login(req.body.email, req.body.password);
      console.log('[ADMIN-LOGIN-CTRL] === RESPONSE SENT ===');
      res.json({ admin: result.admin, token: result.token });
    } catch (e) {
      console.log('[ADMIN-LOGIN-CTRL] === ERROR CAUGHT ===', e instanceof Error ? e.message : e);
      next(e);
    }
  },
  forgotPassword: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await adminAuthService.forgotPassword(req.body.email)); } catch (e) { next(e); }
  },
  verifyResetOtp: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await adminAuthService.verifyResetOtp(req.body.email, req.body.otp)); } catch (e) { next(e); }
  },
  resetPassword: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await adminAuthService.resetPassword(req.body.email, req.body.otp, req.body.password)); } catch (e) { next(e); }
  },
  me: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json({ user: await adminAuthService.getMe(req.user!.id) }); } catch (e) { next(e); }
  },
  logout: async (_req: Request, res: Response) => {
    console.log('[ADMIN-LOGIN-CTRL] === LOGOUT CALLED ===');
    res.json({ message: 'Logged out successfully.' });
  },
  resendOtp: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await adminAuthService.resendOtp(req.body.email)); } catch (e) { next(e); }
  },
};