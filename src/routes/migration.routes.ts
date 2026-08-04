import { Router } from 'express';
import { requireAdmin } from '../middlewares/require-auth.js';
import { migrateLegacyFiles, diagnoseAsset, diagnosePdfUrls, repairPdfUrls } from '../services/migration.service.js';

const router = Router();

router.post('/migrate-files', requireAdmin, async (_req, res) => {
  try {
    const result = await migrateLegacyFiles();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/diagnose/:id', requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    const result = await diagnoseAsset(id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// Diagnose all PDF URLs — flags image-typed Cloudinary URLs (the 401 cause)
router.get('/diagnose-pdfs', requireAdmin, async (_req, res) => {
  try {
    res.json(await diagnosePdfUrls());
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

// Clear DB references to broken image-typed PDFs so they can be re-uploaded as raw
router.post('/repair-pdfs', requireAdmin, async (_req, res) => {
  try {
    res.json(await repairPdfUrls());
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
