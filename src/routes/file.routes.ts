import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { prisma } from '../utils/prisma.js';
import { upload } from '../middlewares/upload.js';
import { requireAuth } from '../middlewares/require-auth.js';
import { requireRole } from '../middlewares/require-role.js';

const router = Router();
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

router.get('/files/:id', async (req, res) => {
  try {
    const file = await prisma.file.findUnique({ where: { id: req.params.id as string } });
    if (!file) return res.status(404).json({ message: 'File not found' });
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

router.post('/files/upload', (req, res, next) => {
  console.log('[UPLOAD] === ROUTE HIT ===');
  console.log('[UPLOAD] Content-Type:', req.headers['content-type']);
  console.log('[UPLOAD] Content-Length:', req.headers['content-length']);
  console.log('[UPLOAD] Host:', req.headers['host']);
  console.log('[UPLOAD] Origin:', req.headers['origin']);
  console.log('[UPLOAD] Authorization present:', !!req.headers.authorization);

  // Wrap upload.single in a try/catch to detect multer hangs
  let handled = false;
  const origJson = res.json.bind(res);
  res.json = function (body: any) {
    if (!handled) { handled = true; console.log('[UPLOAD] Response sent:', JSON.stringify(body).substring(0, 200)); }
    return origJson(body);
  };
  const origStatus = res.status.bind(res);
  res.status = function (code: number) {
    if (!handled) { handled = true; console.log('[UPLOAD] Status set to', code); }
    return origStatus(code);
  };
  const timeout = setTimeout(() => {
    if (!handled) {
      console.error('[UPLOAD] *** TIMEOUT - request hung for 60s, forcing 500 response ***');
      handled = true;
      if (!res.headersSent) res.status(500).json({ message: 'Upload processing timed out' });
    }
  }, 60000);

  res.on('finish', () => { clearTimeout(timeout); if (!handled) { handled = true; console.log('[UPLOAD] Response finished (status=' + res.statusCode + ')'); } });
  res.on('close', () => { clearTimeout(timeout); });

  next();
}, requireAuth, requireRole('ADMIN'), (req, res, next) => {
  console.log('[UPLOAD] Auth passed, calling multer...');
  const start = Date.now();
  upload.single('file')(req, res, (err: any) => {
    const elapsed = Date.now() - start;
    if (err) {
      console.error(`[UPLOAD] Multer error after ${elapsed}ms:`, err.name, err.message, err.code);
      return next(err);
    }
    console.log(`[UPLOAD] Multer OK after ${elapsed}ms`);
    console.log('[UPLOAD] req.file:', req.file ? { originalname: req.file.originalname, mimetype: req.file.mimetype, size: req.file.size, filename: req.file.filename, path: req.file.path } : 'MISSING');
    next();
  });
}, async (req, res) => {
  console.log('[UPLOAD] === CONTROLLER ===');
  try {
    if (!req.file) {
      console.log('[UPLOAD] No file in request, returning 400');
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }
    console.log('[UPLOAD] Saving to database:', { originalName: req.file.originalname, storedName: req.file.filename, mimeType: req.file.mimetype, size: req.file.size });
    const file = await prisma.file.create({
      data: {
        originalName: req.file.originalname,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
      },
    });
    console.log('[UPLOAD] DB saved, id:', file.id);
    const body = { id: file.id, originalName: file.originalName, mimeType: file.mimeType, size: file.size, url: `/api/files/${file.id}` };
    console.log('[UPLOAD] Sending response:', JSON.stringify(body));
    res.json(body);
  } catch (err) {
    console.error('[UPLOAD] Controller error:', err instanceof Error ? err.message : err);
    if (err instanceof Error) console.error('[UPLOAD] Stack:', err.stack);
    res.status(500).json({ message: 'Failed to save file' });
  }
});

router.delete('/files/:id', requireAuth, requireRole('ADMIN'), async (req, res) => {
  try {
    const file = await prisma.file.findUnique({ where: { id: req.params.id as string } });
    if (!file) return res.status(404).json({ message: 'File not found' });
    const filePath = path.join(UPLOAD_DIR, file.storedName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await prisma.file.delete({ where: { id: file.id } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ message: 'Failed to delete file' });
  }
});

export default router;
