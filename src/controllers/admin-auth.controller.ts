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
    try {
      const result = await adminAuthService.login(req.body.email, req.body.password);
      res.json({ admin: result.admin, token: result.token });
    } catch (e) {
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
    res.json({ message: 'Logged out successfully.' });
  },
  resendOtp: async (req: Request, res: Response, next: NextFunction) => {
    try { res.json(await adminAuthService.resendOtp(req.body.email)); } catch (e) { next(e); }
  },
};