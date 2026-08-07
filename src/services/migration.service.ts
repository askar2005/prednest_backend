import { prisma } from '../utils/prisma.js';
import { cloudinary, hasCloudinary } from '../config/cloudinary.js';
import { AppError } from '../utils/app-error.js';
import { isImageMime } from '../services/upload.service.js';
import fs from 'fs';
import path from 'path';

interface MigrationResult {
  filesScanned: number;
  filesMigrated: number;
  filesSkipped: number;
  notesUpdated: number;
  pyqsUpdated: number;
  errors: string[];
}

export async function migrateLegacyFiles(): Promise<MigrationResult> {
  const result: MigrationResult = {
    filesScanned: 0, filesMigrated: 0, filesSkipped: 0,
    notesUpdated: 0, pyqsUpdated: 0, errors: [],
  };

  if (!hasCloudinary) {
    throw new AppError('Cloudinary not configured', 500);
  }

  // Step 1: Find all File records that aren't on Cloudinary yet
  const legacyFiles = await prisma.file.findMany({
    where: { secureUrl: null },
  });
  result.filesScanned = legacyFiles.length;

  for (const file of legacyFiles) {
    try {
      const localPath = file.path || path.resolve(process.cwd(), 'uploads', file.storedName || '');

      if (!fs.existsSync(localPath)) {
        console.log(`[MIGRATION] File not found on disk: ${localPath}`);
        result.filesSkipped++;
        continue;
      }

      const fileBuffer = fs.readFileSync(localPath);
      const mimeType = file.mimeType || 'application/octet-stream';
      // Never use 'auto' — Cloudinary classifies PDFs uploaded with 'auto' as an image
      // resource, which produces undeliverable /image/upload/ URLs (HTTP 401).
      const resourceType: 'image' | 'raw' = isImageMime(mimeType) ? 'image' : 'raw';

      const uploadResult = await new Promise<any>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'PrepNest/migrated', resource_type: resourceType, type: 'upload', use_filename: true, unique_filename: true },
          (error, result) => {
            if (error) reject(new Error(error.message));
            else if (result) resolve(result);
            else reject(new Error('No response from Cloudinary'));
          },
        );
        stream.end(fileBuffer);
      });

      await prisma.file.update({
        where: { id: file.id },
        data: { secureUrl: uploadResult.secure_url, publicId: uploadResult.public_id },
      });
      result.filesMigrated++;
      console.log(`[MIGRATION] Migrated file ${file.id}: ${uploadResult.secure_url}`);
    } catch (err: any) {
      result.errors.push(`File ${file.id}: ${err.message}`);
      console.error(`[MIGRATION] Failed to migrate file ${file.id}:`, err.message);
    }
  }

  // Step 2: Update Notes with legacy /api/files/ URLs
  const legacyNotes = await prisma.note.findMany({
    where: { pdfUrl: { contains: '/api/files/' } },
  });

  for (const note of legacyNotes) {
    try {
      const fileId = note.pdfUrl!.split('/').pop()!;
      const file = await prisma.file.findUnique({ where: { id: fileId } });

      if (file?.secureUrl) {
        await prisma.note.update({
          where: { id: note.id },
          data: { pdfUrl: file.secureUrl, pdfPublicId: file.publicId },
        });
        result.notesUpdated++;
        console.log(`[MIGRATION] Updated Note ${note.id}: pdfUrl → ${file.secureUrl}`);
      } else {
        await prisma.note.update({
          where: { id: note.id },
          data: { pdfUrl: null, pdfPublicId: null },
        });
        result.notesUpdated++;
        console.log(`[MIGRATION] Cleared pdfUrl for Note ${note.id} (file unavailable)`);
      }
    } catch (err: any) {
      result.errors.push(`Note ${note.id}: ${err.message}`);
    }
  }

  // Step 3: Update PYQs with legacy /api/files/ URLs
  const legacyPyqs = await prisma.previousYearQuestion.findMany({
    where: { pdfUrl: { contains: '/api/files/' } },
  });

  for (const pyq of legacyPyqs) {
    try {
      const fileId = pyq.pdfUrl!.split('/').pop()!;
      const file = await prisma.file.findUnique({ where: { id: fileId } });

      if (file?.secureUrl) {
        await prisma.previousYearQuestion.update({
          where: { id: pyq.id },
          data: { pdfUrl: file.secureUrl, pdfPublicId: file.publicId },
        });
        result.pyqsUpdated++;
      } else {
        await prisma.previousYearQuestion.update({
          where: { id: pyq.id },
          data: { pdfUrl: null, pdfPublicId: null },
        });
        result.pyqsUpdated++;
      }
    } catch (err: any) {
      result.errors.push(`PYQ ${pyq.id}: ${err.message}`);
    }
  }

  return result;
}

export async function diagnoseAsset(assetId: string): Promise<any> {
  const [file, note, pyq] = await Promise.all([
    prisma.file.findFirst({ where: { OR: [{ id: assetId }, { publicId: assetId }] } }),
    prisma.note.findFirst({ where: { OR: [{ id: assetId }, { pdfPublicId: assetId }] } }),
    prisma.previousYearQuestion.findFirst({ where: { OR: [{ id: assetId }, { pdfPublicId: assetId }] } }),
  ]);

  const record = file || note || pyq;
  if (!record) throw new AppError('Asset not found in database', 404);

  const dbRecord: any = { ...record };
  if ('preparationCategoryId' in dbRecord) delete dbRecord.preparationCategoryId;

  let cloudinaryAsset: any = null;
  let cloudinaryError: any = null;

  if (hasCloudinary) {
    const publicId = (record as any).publicId || (record as any).pdfPublicId;

    if (publicId) {
      for (const rt of ['image', 'raw'] as const) {
        if (cloudinaryAsset) break;
        try {
          const asset = await cloudinary.api.resource(publicId, { resource_type: rt });
          cloudinaryAsset = { resource_type_fetched: rt, ...asset };
        } catch { /* try next */ }
      }
      if (!cloudinaryAsset) {
        cloudinaryError = 'Could not fetch asset as image or raw. It may have been deleted.';
      }
    }

    return {
      database: dbRecord,
      database_id_type: file ? 'file' : note ? 'note' : 'pyq',
      cloudinary: cloudinaryAsset,
      cloudinary_error: cloudinaryError,
    };
  }

  return {
    database: dbRecord,
    cloudinary: 'CLOUDINARY_NOT_CONFIGURED - set env vars on this server to inspect',
  };
}

export async function nullifyLegacyUrls(): Promise<{ notesUpdated: number; pyqsUpdated: number }> {
  const [notes, pyqs] = await Promise.all([
    prisma.note.updateMany({
      where: { pdfUrl: { contains: '/api/files/' } },
      data: { pdfUrl: null, pdfPublicId: null },
    }),
    prisma.previousYearQuestion.updateMany({
      where: { pdfUrl: { contains: '/api/files/' } },
      data: { pdfUrl: null, pdfPublicId: null },
    }),
  ]);
  return { notesUpdated: notes.count, pyqsUpdated: pyqs.count };
}

// A Cloudinary PDF is broken when it was stored with resource_type 'image'
// (secure_url contains /image/upload/). Cloudinary refuses to deliver PDFs
// through the image pipeline → HTTP 401. Correct URLs use /raw/upload/.
function isBrokenPdfUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.includes('/image/upload/')) return true;
  if (url.includes('cloudinary') && !url.includes('/raw/upload/')) return true;
  return false;
}

export async function diagnosePdfUrls(): Promise<any> {
  const [notes, pyqs, files] = await Promise.all([
    prisma.note.findMany({ where: { pdfUrl: { not: null } }, select: { id: true, title: true, pdfUrl: true, pdfPublicId: true } }),
    prisma.previousYearQuestion.findMany({ where: { pdfUrl: { not: null } }, select: { id: true, title: true, pdfUrl: true, pdfPublicId: true } }),
    prisma.file.findMany({ where: { secureUrl: { not: null } }, select: { id: true, originalName: true, secureUrl: true, publicId: true } }),
  ]);

  const brokenNotes = notes.filter((n) => isBrokenPdfUrl(n.pdfUrl));
  const brokenPyqs = pyqs.filter((p) => isBrokenPdfUrl(p.pdfUrl));
  const brokenFiles = files.filter((f) => isBrokenPdfUrl(f.secureUrl));

  console.log('[MIGRATION] === PDF DIAGNOSTIC ===');
  console.log('[MIGRATION] broken notes:', brokenNotes.length, '/', notes.length);
  console.log('[MIGRATION] broken pyqs:', brokenPyqs.length, '/', pyqs.length);
  console.log('[MIGRATION] broken files:', brokenFiles.length, '/', files.length);

  return {
    summary: {
      notes: notes.length,
      brokenNotes: brokenNotes.length,
      pyqs: pyqs.length,
      brokenPyqs: brokenPyqs.length,
      files: files.length,
      brokenFiles: brokenFiles.length,
    },
    brokenNotes,
    brokenPyqs,
    brokenFiles,
  };
}

export async function repairPdfUrls(): Promise<any> {
  // Broken image-typed assets cannot be re-delivered and their original bytes are
  // not recoverable from Cloudinary (the image-pipeline URL 401s). We clear the DB
  // references so the admin UI no longer shows dead PDFs and they can re-upload —
  // re-uploads now use resource_type 'raw' and deliver with HTTP 200.
  const [notes, pyqs] = await Promise.all([
    prisma.note.updateMany({
      where: { pdfUrl: { contains: '/image/upload/' } },
      data: { pdfUrl: null, pdfPublicId: null },
    }),
    prisma.previousYearQuestion.updateMany({
      where: { pdfUrl: { contains: '/image/upload/' } },
      data: { pdfUrl: null, pdfPublicId: null },
    }),
  ]);

  const result = { notesCleared: notes.count, pyqsCleared: pyqs.count };
  console.log('[MIGRATION] === PDF REPAIR ===', JSON.stringify(result));
  return result;
}
