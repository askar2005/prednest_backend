import { Request, Response } from 'express';
import { privacyPolicyService } from '../services/privacy-policy.service.js';

export const privacyPolicyController = {
  async getPrivacyPolicy(_req: Request, res: Response) {
    try {
      const setting = await privacyPolicyService.getPrivacyPolicy();
      let parsed = {};
      try {
        parsed = JSON.parse(setting.value);
      } catch {
        parsed = { content: setting.value };
      }
      res.json({
        success: true,
        data: {
          key: setting.key,
          updatedAt: setting.updatedAt,
          ...parsed,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || 'Failed to fetch privacy policy' });
    }
  },

  async updatePrivacyPolicy(req: Request, res: Response) {
    try {
      const { title, effectiveDate, lastUpdated, content } = req.body;
      if (typeof content !== 'string') {
        res.status(400).json({ success: false, message: 'Content is required and must be a string' });
        return;
      }

      const setting = await privacyPolicyService.updatePrivacyPolicy({
        title,
        effectiveDate,
        lastUpdated,
        content,
      });

      let parsed = {};
      try {
        parsed = JSON.parse(setting.value);
      } catch {
        parsed = { content: setting.value };
      }

      res.json({
        success: true,
        message: 'Privacy policy updated successfully',
        data: {
          key: setting.key,
          updatedAt: setting.updatedAt,
          ...parsed,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || 'Failed to update privacy policy' });
    }
  },

  async resetToDefault(_req: Request, res: Response) {
    try {
      const setting = await privacyPolicyService.resetToDefault();
      let parsed = {};
      try {
        parsed = JSON.parse(setting.value);
      } catch {
        parsed = { content: setting.value };
      }
      res.json({
        success: true,
        message: 'Privacy policy reset to default successfully',
        data: {
          key: setting.key,
          updatedAt: setting.updatedAt,
          ...parsed,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message || 'Failed to reset privacy policy' });
    }
  }
};
