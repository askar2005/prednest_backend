import { cloudinary, hasCloudinary } from '../config/cloudinary.js';
import { validateFile, getFolderForCategory, type UploadCategory } from '../utils/file-validation.js';
import { AppError } from '../utils/app-error.js';
import type { UploadApiResponse, UploadApiErrorResponse } from 'cloudinary';

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

export function isImageMime(mimeType: string): boolean {
  return /^image\/(jpeg|png|gif|webp|bmp|svg\+xml)$/i.test(mimeType);
}

export async function uploadFile(
  file: Express.Multer.File,
  category: UploadCategory,
  slug?: string,
): Promise<UploadResult> {
  if (!hasCloudinary) {
    throw new AppError('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your environment.', 500);
  }

  const validation = validateFile(file.mimetype, file.size, category);
  if (!validation.valid) {
    throw new AppError(validation.error!, 400);
  }

  return uploadToCloudinary(file, category, slug);
}

async function uploadToCloudinary(
  file: Express.Multer.File,
  category: UploadCategory,
  slug?: string,
): Promise<UploadResult> {
  const folder = getFolderForCategory(category, slug);

  const isImage = isImageMime(file.mimetype);
  // CRITICAL: PDFs (and all non-image files) MUST be uploaded with resource_type: 'raw'.
  // Do NOT use 'auto' here — Cloudinary classifies PDFs uploaded with 'auto' as an IMAGE
  // resource, producing an /image/upload/ secure_url that Cloudinary refuses to deliver
  // for PDF files (HTTP 401, X-Cld-Error: deny or ACL failure).
  const resourceType: 'image' | 'raw' = isImage ? 'image' : 'raw';

  try {
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: resourceType,
          type: 'upload',
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

    // Guard: a non-image (e.g. PDF) must never come back as an image resource.
    // If Cloudinary stored it as 'image', the /image/upload/ URL will 401 on delivery.
    const urlLooksLikeImage = !!result.secure_url && result.secure_url.includes('/image/upload/');
    if (resourceType === 'raw' && (result.resource_type !== 'raw' || urlLooksLikeImage)) {
      console.error('[UPLOAD-SVC] CRITICAL: PDF uploaded with WRONG resource_type — expected raw, got', result.resource_type);
      console.error('[UPLOAD-SVC] CRITICAL: secure_url would be undeliverable:', result.secure_url);
      await cloudinary.uploader.destroy(result.public_id, { resource_type: result.resource_type === 'raw' ? 'raw' : 'image' }).catch(() => {});
      throw new AppError('Upload failed: Cloudinary stored the PDF as an image resource. The deployed backend is running outdated upload code. Please redeploy.', 500);
    }
    if (resourceType === 'image' && result.resource_type !== 'image') {
      console.error('[UPLOAD-SVC] CRITICAL: image uploaded with unexpected resource_type — expected image, got', result.resource_type);
    }

    return {
      secureUrl: result.secure_url,
      publicId: result.public_id,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: result.bytes,
    };
  } catch (err) {
    console.error('[UPLOAD-SVC] Cloudinary upload failed:', err instanceof Error ? err.message : err);
    throw err instanceof AppError ? err : new AppError('Upload failed', 500);
  }
}

export async function deleteFile(publicId: string): Promise<DeleteResult> {
  if (!hasCloudinary) {
    throw new AppError('Cloudinary is not configured.', 500);
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    if (result.result === 'ok') {
      return { deleted: true, publicId };
    }

    const rawResult = await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
    return { deleted: rawResult.result === 'ok', publicId };
  } catch (err) {
    console.error('[UPLOAD-SVC] Cloudinary delete failed:', err instanceof Error ? err.message : err);
    throw new AppError('File deletion failed', 500);
  }
}

export async function deleteFileByUrl(url: string | null | undefined): Promise<DeleteResult | null> {
  if (!url) return null;
  const publicId = extractPublicId(url);
  if (!publicId) return null;
  return deleteFile(publicId);
}

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
