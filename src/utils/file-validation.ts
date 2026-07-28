export type UploadCategory = 'notes' | 'pyqs' | 'images' | 'profile' | 'attachments' | 'general' | 'categories';

export interface UploadLimits {
  maxSize: number;
  allowedMimes: string[];
}

const MB = 1024 * 1024;

const CATEGORY_LIMITS: Record<UploadCategory, UploadLimits> = {
  notes: {
    maxSize: 20 * MB,
    allowedMimes: ['application/pdf'],
  },
  pyqs: {
    maxSize: 20 * MB,
    allowedMimes: ['application/pdf'],
  },
  images: {
    maxSize: 10 * MB,
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp'],
  },
  profile: {
    maxSize: 10 * MB,
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp'],
  },
  attachments: {
    maxSize: 20 * MB,
    allowedMimes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  },
  general: {
    maxSize: 50 * MB,
    allowedMimes: [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/zip', 'text/csv', 'application/json',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
  categories: {
    maxSize: 10 * MB,
    allowedMimes: ['image/jpeg', 'image/png', 'image/webp'],
  },
};

export function getCategoryLimits(category: UploadCategory): UploadLimits {
  return CATEGORY_LIMITS[category] || CATEGORY_LIMITS.general;
}

export function validateFile(
  mimetype: string,
  size: number,
  category: UploadCategory,
): { valid: boolean; error?: string } {
  const limits = getCategoryLimits(category);
  if (!limits.allowedMimes.includes(mimetype)) {
    return { valid: false, error: `File type ${mimetype} not allowed for ${category}. Allowed: ${limits.allowedMimes.join(', ')}` };
  }
  if (size > limits.maxSize) {
    return { valid: false, error: `File too large. Maximum ${limits.maxSize / MB}MB for ${category}` };
  }
  return { valid: true };
}

export function getFolderForCategory(category: UploadCategory, slug?: string): string {
  const base = 'PrepNest';
  if (category === 'categories' && slug) return `${base}/categories/${slug}`;
  return `${base}/${category}`;
}
