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

router.post('/files/upload', requireAuth, requireRole('ADMIN'), upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const file = await prisma.file.create({
      data: {
        originalName: req.file.originalname,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
        path: req.file.path,
      },
    });
    res.json({ id: file.id, originalName: file.originalName, mimeType: file.mimeType, size: file.size, url: `/api/files/${file.id}` });
  } catch (err) {
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
