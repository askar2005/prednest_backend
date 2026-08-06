import { Router } from 'express';
import path from 'path';
import { Readable } from 'stream';
import { prisma } from '../utils/prisma.js';
import { multerUpload, getUploadCategoryForField } from '../middlewares/upload.middleware.js';
import { uploadFile, deleteFile } from '../services/upload.service.js';
import { requireAuth } from '../middlewares/require-auth.js';
import { requireRole } from '../middlewares/require-role.js';

const router = Router();

/**
 * Shared fetch-and-serve logic for the /files/preview and /files/download
 * endpoints. Accepts inline PDF data: URLs and Cloudinary-hosted http(s) URLs
 * only (no open proxy).
 */
async function resolveAsset(
  raw: string
): Promise<{ ok: true; buffer?: Buffer; stream?: Readable } | { ok: false; status: number; message: string }> {
  try {
    if (raw.startsWith('data:application/pdf;base64,')) {
      const buffer = Buffer.from(raw.split(',')[1] ?? '', 'base64');
      if (!buffer.byteLength) return { ok: false, status: 400, message: 'Invalid PDF data' };
      return { ok: true, buffer };
    }

    const target = new URL(raw);
    const host = target.hostname.toLowerCase();
    const allowedCloudinary = host === 'res.cloudinary.com' || host.endsWith('.res.cloudinary.com');
    if ((target.protocol !== 'http:' && target.protocol !== 'https:') || !allowedCloudinary) {
      return { ok: false, status: 400, message: 'Invalid preview URL' };
    }

    const upstream = await fetch(target.toString(), { redirect: 'follow' });
    if (!upstream.ok) return { ok: false, status: upstream.status, message: 'Upstream fetch failed' };
    if (!upstream.body) return { ok: false, status: 502, message: 'Empty upstream body' };
    return { ok: true, stream: Readable.fromWeb(upstream.body as import('stream/web').ReadableStream) };
  } catch {
    return { ok: false, status: 400, message: 'Invalid preview URL' };
  }
}

function sendPdfBuffer(res: any, buffer: Buffer, disposition: string) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', disposition);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.send(buffer);
}

/**
 * Inline PDF preview proxy.
 *
 * Cloudinary raw assets uploaded WITHOUT a file extension are served with
 * `Content-Disposition: attachment` + `application/octet-stream`, so opening
 * them directly in a new tab forces a download instead of the browser's native
 * PDF viewer. Cloudinary offers no "inline" flag for such assets, so this
 * endpoint re-serves the bytes with `Content-Type: application/pdf` and an
 * explicit `inline` disposition, giving the frontend a URL the browser always
 * renders natively.
 *
 * Security: only res.cloudinary.com hosts (and inline PDF data: URLs) are
 * accepted — no open proxy.
 */
router.get('/files/preview', requireAuth, async (req, res) => {
  const raw = typeof req.query.url === 'string' ? req.query.url : '';
  if (!raw) return res.status(400).json({ message: 'Missing ?url=' });

  const result = await resolveAsset(raw);
  if (!result.ok) return res.status(result.status).json({ message: result.message });
  if (result.buffer) return sendPdfBuffer(res, result.buffer, 'inline; filename="preview.pdf"');
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', 'inline; filename="preview.pdf"');
  res.set('Cache-Control', 'public, max-age=3600');
  result.stream!.pipe(res);
});

/**
 * Attachment download proxy: same fetching rules, but always serves with
 * `Content-Disposition: attachment` so the browser downloads the file.
 */
router.get('/files/download', requireAuth, async (req, res) => {
  const raw = typeof req.query.url === 'string' ? req.query.url : '';
  if (!raw) return res.status(400).json({ message: 'Missing ?url=' });

  const result = await resolveAsset(raw);
  if (!result.ok) return res.status(result.status).json({ message: result.message });
  if (result.buffer) return sendPdfBuffer(res, result.buffer, 'attachment; filename="document.pdf"');
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', 'attachment; filename="document.pdf"');
  res.set('Cache-Control', 'public, max-age=3600');
  result.stream!.pipe(res);
});

router.post('/files/upload', requireAuth, requireRole('ADMIN'), async (req, res, next) => {
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
