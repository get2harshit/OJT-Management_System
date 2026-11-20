// Files a student uploads straight to Google Cloud Storage through a signed
// URL, never through our backend (Cloud Run refuses request bodies over
// 32 MiB). The backend enforces the same limits again and is the authority —
// checking here only makes a wrong file fail the moment it is picked, not
// after a long upload. Mirrors backend src/domain/directUpload.ts.

const BYTES_PER_MB = 1024 * 1024;

export type DirectUploadKind = 'video' | 'document';

export interface DirectUploadRule {
  /** What the file input accepts. */
  accept: string;
  maxBytes: number;
  label: string;
  /** Shown on the drop zone before a file is picked. */
  pickPrompt: string;
  wrongTypeMessage: string;
  isRightType: (file: File) => boolean;
}

export const DIRECT_UPLOAD_RULES: Record<DirectUploadKind, DirectUploadRule> = {
  video: {
    accept: 'video/mp4',
    maxBytes: 100 * BYTES_PER_MB,
    label: 'Video',
    pickPrompt: 'Click to select an MP4 video',
    wrongTypeMessage: 'Only MP4 videos are supported.',
    isRightType: (file) => file.type === 'video/mp4',
  },
  document: {
    accept: 'application/pdf',
    maxBytes: 35 * BYTES_PER_MB,
    label: 'PDF',
    pickPrompt: 'Click to select a PDF',
    wrongTypeMessage: 'Only PDF documents are allowed.',
    // Some systems report no type for a PDF; the extension still says what it is.
    isRightType: (file) => file.type === 'application/pdf' || (!file.type && /\.pdf$/i.test(file.name)),
  },
};

export function maxSizeLabel(rule: DirectUploadRule): string {
  return `${rule.maxBytes / BYTES_PER_MB}MB`;
}

/** Why this file cannot be uploaded as this kind, or null when it can. */
export function pickedFileProblem(kind: DirectUploadKind, file: File): string | null {
  const rule = DIRECT_UPLOAD_RULES[kind];
  if (!rule.isRightType(file)) return rule.wrongTypeMessage;
  if (file.size === 0) return 'This file is empty.';
  if (file.size > rule.maxBytes) return `${rule.label} exceeds the ${maxSizeLabel(rule)} limit.`;
  return null;
}
