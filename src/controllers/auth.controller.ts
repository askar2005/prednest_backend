import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth.service.js';

export async function signup(req: Request, res: Response, next: NextFunction) {
  try { res.status(201).json(await authService.signup(req.body)); } catch (e) { next(e); }
}

export async function verifyEmail(req: Request, res: Response, next: NextFunction) {
  try { res.json(await authService.verifyEmail(req.body.email, req.body.otp)); } catch (e) { next(e); }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  console.log('[LOGIN CTRL] req.body:', JSON.stringify(req.body));
  console.log('[LOGIN CTRL] req.body.email:', req.body?.email);
  console.log('[LOGIN CTRL] req.body.password length:', req.body?.password?.length || 0);
  console.log('[LOGIN CTRL] content-type:', req.headers['content-type']);
  try { res.json(await authService.login(req.body)); } catch (e) { next(e); }
}

export async function forgotPassword(req: Request, res: Response, next: NextFunction) {
  try { res.json(await authService.forgotPassword(req.body.email)); } catch (e) { next(e); }
}

export async function verifyResetOtp(req: Request, res: Response, next: NextFunction) {
  try { res.json(await authService.verifyResetOtp(req.body.email, req.body.otp)); } catch (e) { next(e); }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction) {
  try { res.json(await authService.resetPassword(req.body.email, req.body.otp, req.body.password)); } catch (e) { next(e); }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  try { res.json({ user: await authService.getMe(req.user!.id) }); } catch (e) { next(e); }
}

export async function resendOtp(req: Request, res: Response, next: NextFunction) {
  try { res.json(await authService.resendOtp(req.body.email)); } catch (e) { next(e); }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try { res.json(await authService.updateProfile(req.user!.id, req.body)); } catch (e) { next(e); }
}

export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try { res.json(await authService.changePassword(req.user!.id, req.body.oldPassword, req.body.newPassword)); } catch (e) { next(e); }
}

export async function logout(_req: Request, res: Response) {
  res.json({ message: 'Logged out successfully.' });
}
