export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_HOMEWORK_ATTACHMENTS = 5;
export const MAX_USER_ATTACHMENT_BYTES = 100 * 1024 * 1024;
export const ATTACHMENT_ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';
export interface HomeworkAttachment {
  id: string;
  name: string;
  mime: string;
  size: number;
}
const types: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
};
export function attachmentMime(name: string): string | null {
  return types[name.toLowerCase().split('.').pop() || ''] || null;
}
export const fileSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? Math.max(1, Math.round(bytes / 1024)) + ' КБ'
    : (bytes / (1024 * 1024)).toLocaleString('ru-RU', { maximumFractionDigits: 1 }) + ' МБ';
