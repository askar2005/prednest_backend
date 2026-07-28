import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { prisma } from '../utils/prisma.js';
import { multerUpload, getUploadCategoryForField } from '../middlewares/upload.middleware.js';
import { uploadFile, deleteFile } from '../services/upload.service.js';
import { requireAuth } from '../middlewares/require-auth.js';
import { requireRole } from '../middlewares/require-role.js';
import { AppError } from '../utils/app-error.js';

const router = Router();
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

// ─── Legacy: serve locally stored files ─────────────────────────────────────
router.get('/files/:id', async (req, res) => {
  try {
    const file = await prisma.file.findUnique({ where: { id: req.params.id as string } });
    if (!file) return res.status(404).json({ message: 'File not found' });

    // Prefer Cloudinary URL if available
    if (file.secureUrl) {
      return res.redirect(file.secureUrl);
    }

    // Fall back to local storage
    const filePath = path.join(UPLOAD_DIR, file.storedName);
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File not found on disk' });
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${file.originalName}"`);
    res.setHeader('Content-Length', file.size);
    res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ message: 'Failed to serve file' });
  }
});

// ─── Upload to Cloudinary ────────────────────────────────────────────────────
router.post('/files/upload', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
  console.log('[UPLOAD] === ROUTE HIT ===');

  let handled = false;
  const timeout = setTimeout(() => {
    if (!handled && !res.headersSent) {
      handled = true;
      res.status(500).json({ message: 'Upload processing timed out' });
    }
  }, 60000);
  res.on('finish', () => { clearTimeout(timeout); handled = true; });

  multerUpload.single('file')(req, res, async (err: any) => {
    clearTimeout(timeout);
    if (err) {
      console.error('[UPLOAD] Multer error:', err.name, err.message);
      return next(err);
    }

    if (!req.file) {
      if (!handled) { handled = true; res.status(400).json({ message: 'No file uploaded' }); }
      return;
    }

    console.log('[UPLOAD] file received:', req.file.originalname, req.file.mimetype, req.file.size);

    try {
      const category = getUploadCategoryForField('file');
      const result = await uploadFile(req.file, category);

      const file = await prisma.file.create({
        data: {
          originalName: req.file.originalname,
          storedName: path.basename(result.publicId),
          mimeType: result.mimeType,
          size: result.size,
          path: result.secureUrl,
          secureUrl: result.secureUrl,
          publicId: result.publicId,
        },
      });

      console.log('[UPLOAD] DB saved, id:', file.id, 'cloudUrl:', result.secureUrl);
      const body = {
        id: file.id,
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.size,
        url: result.secureUrl,
        publicId: result.publicId,
      };
      if (!handled) { handled = true; res.json(body); }
    } catch (uploadErr) {
      console.error('[UPLOAD] Upload error:', uploadErr instanceof Error ? uploadErr.message : uploadErr);
      if (!handled) { handled = true; next(uploadErr); }
    }
  });
});

// ─── Delete file ─────────────────────────────────────────────────────────────
router.delete('/files/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const file = await prisma.file.findUnique({ where: { id: req.params.id as string } });
    if (!file) return res.status(404).json({ message: 'File not found' });

    // Delete from Cloudinary if present
    if (file.publicId) {
      await deleteFile(file.publicId).catch((err) => {
        console.warn('[UPLOAD] Cloudinary delete failed (ignored):', file.publicId, err);
      });
    }

    // Delete local file if present
    const filePath = path.join(UPLOAD_DIR, file.storedName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await prisma.file.delete({ where: { id: file.id } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete file' });
  }
});

export default router;
