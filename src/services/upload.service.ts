import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { cloudinary, hasCloudinary } from '../config/cloudinary.js';
import { validateFile, getFolderForCategory, type UploadCategory } from '../utils/file-validation.js';
import { AppError } from '../utils/app-error.js';
import type { UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

export interface UploadResult {
  secureUrl: string;
  publicId: string;
  originalName?: string;
  mimeType: string;
  size: number;
}

export interface DeleteResult {
  deleted: boolean;
  publicId: string;
}

// ─── Upload ──────────────────────────────────────────────────────────────────

export async function uploadFile(
  file: Express.Multer.File,
  category: UploadCategory,
  slug?: string,
): Promise<UploadResult> {
  const validation = validateFile(file.mimetype, file.size, category);
  if (!validation.valid) {
    throw new AppError(validation.error!, 400);
  }

  console.log('[UPLOAD-SVC] upload started — category:', category, 'original:', file.originalname, 'size:', file.size, 'mime:', file.mimetype);

  if (hasCloudinary) {
    return uploadToCloudinary(file, category, slug);
  }

  return uploadToLocal(file, category);
}

async function uploadToCloudinary(
  file: Express.Multer.File,
  category: UploadCategory,
  slug?: string,
): Promise<UploadResult> {
  const folder = getFolderForCategory(category, slug);

  try {
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto',
          public_id: undefined,
          use_filename: true,
          unique_filename: true,
        },
        (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
          if (error) {
            console.error('[UPLOAD-SVC] Cloudinary upload error:', error.message);
            reject(new AppError(`Upload failed: ${error.message}`, 500));
          } else if (result) {
            resolve(result);
          } else {
            reject(new AppError('Upload failed: no response from Cloudinary', 500));
          }
        },
      );
      stream.end(file.buffer);
    });

    console.log('[UPLOAD-SVC] upload completed — publicId:', result.public_id, 'secureUrl:', result.secure_url);

    return {
      secureUrl: result.secure_url,
      publicId: result.public_id,
      originalName: file.originalname,
      mimeType: result.resource_type === 'raw' ? file.mimetype : result.format ? `image/${result.format}` : file.mimetype,
      size: result.bytes,
    };
  } catch (err) {
    console.error('[UPLOAD-SVC] Cloudinary upload failed:', err instanceof Error ? err.message : err);
    throw err instanceof AppError ? err : new AppError('Upload failed', 500);
  }
}

async function uploadToLocal(
  file: Express.Multer.File,
  category: UploadCategory,
): Promise<UploadResult> {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

  const ext = path.extname(file.originalname);
  const storedName = `${uuidv4()}${ext}`;
  const filePath = path.join(UPLOAD_DIR, storedName);

  fs.writeFileSync(filePath, file.buffer);

  console.log('[UPLOAD-SVC] local upload completed — storedName:', storedName);

  return {
    secureUrl: `/uploads/${storedName}`,
    publicId: storedName,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
  };
}

// ─── Delete ──────────────────────────────────────────────────────────────────

export async function deleteFile(publicId: string): Promise<DeleteResult> {
  console.log('[UPLOAD-SVC] delete started — publicId:', publicId);

  if (hasCloudinary) {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      console.log('[UPLOAD-SVC] delete completed — publicId:', publicId, 'result:', result.result);
      return { deleted: result.result === 'ok', publicId };
    } catch (err) {
      console.error('[UPLOAD-SVC] Cloudinary delete failed:', err instanceof Error ? err.message : err);
      throw new AppError('File deletion failed', 500);
    }
  }

  // Local fallback
  try {
    const filePath = path.join(UPLOAD_DIR, publicId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('[UPLOAD-SVC] local delete completed — publicId:', publicId);
      return { deleted: true, publicId };
    }
    return { deleted: false, publicId };
  } catch (err) {
    console.error('[UPLOAD-SVC] local delete failed:', err instanceof Error ? err.message : err);
    return { deleted: false, publicId };
  }
}

// ─── Delete by URL (extract publicId from URL) ──────────────────────────────

export async function deleteFileByUrl(url: string | null | undefined): Promise<DeleteResult | null> {
  if (!url) return null;
  const publicId = extractPublicId(url);
  if (!publicId) {
    console.log('[UPLOAD-SVC] deleteByUrl: no Cloudinary publicId extracted from:', url);
    return null;
  }
  return deleteFile(publicId);
}

// ─── Replace ─────────────────────────────────────────────────────────────────

export async function replaceFile(
  file: Express.Multer.File,
  category: UploadCategory,
  oldPublicId: string | null | undefined,
  slug?: string,
): Promise<UploadResult> {
  if (oldPublicId) {
    await deleteFile(oldPublicId).catch((err) => {
      console.warn('[UPLOAD-SVC] replace: old file deletion failed (ignored):', oldPublicId, err);
    });
  }
  return uploadFile(file, category, slug);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function extractPublicId(url: string): string | null {
  if (!url || !url.includes('cloudinary')) return null;
  try {
    const parts = url.split('/upload/');
    if (parts.length < 2) return null;
    const afterUpload = parts[1];
    const withoutVersion = afterUpload.replace(/^v\d+\//, '');
    return withoutVersion.replace(/\.[^.]+$/, '');
  } catch {
    return null;
  }
}

export function isCloudinaryUrl(url: string): boolean {
  return typeof url === 'string' && url.includes('cloudinary');
}
