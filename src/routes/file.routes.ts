import { Router } from 'express';
import path from 'path';
import { Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { multerUpload, getUploadCategoryForField } from '../middlewares/upload.middleware.js';
import { uploadFile, deleteFile } from '../services/upload.service.js';
import { requireAuth } from '../middlewares/require-auth.js';
import { requireRole } from '../middlewares/require-role.js';

const router = Router();

/**
 * Shared fetch-and-serve logic for the /files/preview and /files/download
 * endpoints. Accepts inline PDF data: URLs and Cloudinary-hosted http(s) URLs
 * only (no open proxy). Always resolves to a full in-memory Buffer so that
 * byte-range requests can be honoured by the caller.
 */
async function resolveAsset(
  raw: string
): Promise<{ ok: true; buffer: Buffer } | { ok: false; status: number; message: string }> {
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
    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (!buffer.byteLength) return { ok: false, status: 502, message: 'Empty upstream body' };
    return { ok: true, buffer };
  } catch {
    return { ok: false, status: 400, message: 'Invalid preview URL' };
  }
}

function servePdfStream(req: Request, res: Response, buffer: Buffer, disposition: string) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', disposition);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.setHeader('Accept-Ranges', 'bytes');

  const total = buffer.length;
  const rangeHeader = req.headers.range;
  const rm = typeof rangeHeader === 'string' && /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (rm) {
    let start = rm[1] ? parseInt(rm[1], 10) : 0;
    let end = rm[2] ? parseInt(rm[2], 10) : total - 1;
    if (Number.isNaN(start)) start = 0;
    if (Number.isNaN(end)) end = total - 1;
    if (start > end || start >= total) {
      res.setHeader('Content-Range', `bytes */${total}`);
      return res.status(416).end();
    }
    end = Math.min(end, total - 1);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
    res.setHeader('Content-Length', end - start + 1);
    return res.status(206).end(buffer.subarray(start, end + 1));
  }

  res.setHeader('Content-Length', total);
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
 * Auth: Bearer JWT required (requireAuth) — previews are only served to
 * authenticated users; unauthenticated requests get 401.
 */
router.get('/files/preview', requireAuth, async (req: any, res) => {
  const raw = typeof req.query.url === 'string' ? req.query.url : '';
  if (!raw) return res.status(400).json({ message: 'Missing ?url=' });

  const result = await resolveAsset(raw);
  if (!result.ok) return res.status(result.status).json({ message: result.message });
  return servePdfStream(req, res, result.buffer, 'inline; filename="preview.pdf"');
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
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', 'attachment; filename="document.pdf"');
  res.set('Cache-Control', 'public, max-age=3600');
  res.setHeader('Content-Length', String(result.buffer.length));
  return res.send(result.buffer);
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
  } catch {
    res.status(500).json({ message: 'Failed to delete file' });
  }
});

export default router;
