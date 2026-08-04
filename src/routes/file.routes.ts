import { Router } from 'express';
import path from 'path';
import { prisma } from '../utils/prisma.js';
import { multerUpload, getUploadCategoryForField } from '../middlewares/upload.middleware.js';
import { uploadFile, deleteFile } from '../services/upload.service.js';
import { requireAuth } from '../middlewares/require-auth.js';
import { requireRole } from '../middlewares/require-role.js';

const router = Router();

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

      console.log('[UPLOAD] === DATABASE VALUE ===');
      console.log('[UPLOAD] DB saved, id:', file.id, 'pdfUrl/secureUrl:', result.secureUrl, 'publicId:', result.publicId);
      const body = {
        id: file.id,
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.size,
        secureUrl: result.secureUrl,
        publicId: result.publicId,
        // Backward-compat field (already equals secure_url)
        url: result.secureUrl,
      };
      console.log('[UPLOAD] === API VALUE ===', JSON.stringify(body));
      if (!handled) { handled = true; res.json(body); }
    } catch (uploadErr) {
      console.error('[UPLOAD] Upload error:', uploadErr instanceof Error ? uploadErr.message : uploadErr);
      if (!handled) { handled = true; next(uploadErr); }
    }
  });
});

router.delete('/files/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const file = await prisma.file.findUnique({ where: { id: req.params.id as string } });
    if (!file) return res.status(404).json({ message: 'File not found' });

    if (file.publicId) {
      await deleteFile(file.publicId).catch((err) => {
        console.warn('[UPLOAD] Cloudinary delete failed (ignored):', file.publicId, err);
      });
    }

    await prisma.file.delete({ where: { id: file.id } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete file' });
  }
});

export default router;
