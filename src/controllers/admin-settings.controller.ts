import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';

const profileSelect = {
  id: true, fullName: true, email: true, role: true, isVerified: true,
  profileImage: true, displayName: true, lastLoginAt: true,
  lastPasswordChangeAt: true, createdAt: true, updatedAt: true,
};

function getUserAgentInfo(req: Request) {
  const ua = req.headers['user-agent'] || 'Unknown';
  const browser = ua.includes('Chrome') ? 'Chrome' : ua.includes('Firefox') ? 'Firefox' : ua.includes('Safari') ? 'Safari' : 'Unknown';
  const device = ua.includes('Mobile') ? 'Mobile' : ua.includes('Tablet') ? 'Tablet' : 'Desktop';
  return { browser, device, userAgent: ua };
}

export const adminSettingsController = {
  getProfile: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const admin = await prisma.admin.findUnique({ where: { id: req.user!.id }, select: profileSelect });
      if (!admin) throw new AppError('Admin not found', 404);
      res.json({ admin });
    } catch (e) { next(e); }
  },

  updateProfile: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { fullName, displayName, profileImage } = req.body;
      const data: Record<string, unknown> = {};
      if (fullName !== undefined) data.fullName = fullName;
      if (displayName !== undefined) data.displayName = displayName;
      if (profileImage !== undefined) data.profileImage = profileImage;
      if (Object.keys(data).length === 0) throw new AppError('No fields to update', 400);
      const admin = await prisma.admin.update({ where: { id: req.user!.id }, data, select: profileSelect });
      res.json({ message: 'Profile updated successfully.', admin });
    } catch (e) { next(e); }
  },

  changePassword: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const admin = await prisma.admin.findUnique({ where: { id: req.user!.id } });
      if (!admin) throw new AppError('Admin not found', 404);
      const ok = await bcrypt.compare(currentPassword, admin.passwordHash);
      if (!ok) throw new AppError('Current password is incorrect', 400);
      const passwordHash = await bcrypt.hash(newPassword, 12);
      await prisma.admin.update({
        where: { id: admin.id },
        data: { passwordHash, lastPasswordChangeAt: new Date() },
      });
      res.json({ message: 'Password changed successfully. Please login again.' });
    } catch (e) { next(e); }
  },

  getSystemInfo: async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({
        frontend: { name: 'React', version: '18.x' },
        backend: { name: 'Node.js / Express', version: '20.x' },
        database: { name: 'PostgreSQL', type: 'Relational' },
        authentication: { method: 'JWT / OTP (Brevo)' },
        storage: { type: 'Cloud (Neon / Brevo)' },
        environment: process.env.NODE_ENV || 'development',
        nodeVersion: process.version,
        reactVersion: '18.x',
        databaseType: 'PostgreSQL (Neon)',
        authMethod: 'JWT (7 day expiry) + Brevo Email OTP',
        buildVersion: '1.0.0',
        appVersion: '1.0.0',
        serverStatus: 'Online',
      });
    } catch (e) { next(e); }
  },

  getSession: async (req: Request, res: Response, next: NextFunction) => {
    try {
      const info = getUserAgentInfo(req);
      const admin = await prisma.admin.findUnique({ where: { id: req.user!.id }, select: { lastLoginAt: true } });
      res.json({
        loginTime: admin?.lastLoginAt || new Date(),
        browser: info.browser,
        device: info.device,
        userAgent: info.userAgent,
        sessionId: req.headers['x-session-id'] || 'current',
      });
    } catch (e) { next(e); }
  },
};