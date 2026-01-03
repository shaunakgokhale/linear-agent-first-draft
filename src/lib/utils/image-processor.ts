// Image download and preprocessing for vision API

import { ProcessedImage, Attachment } from '../agent/types';
import { Env } from '../../types/env';

export async function processImages(
  attachments: Attachment[],
  env: Env
): Promise<ProcessedImage[]> {
  const maxSize = parseInt(env.MAX_IMAGE_SIZE);
  const processed: ProcessedImage[] = [];

  for (const attachment of attachments) {
    try {
      // Only process image files
      if (!isImageUrl(attachment.url)) {
        continue;
      }

      const response = await fetch(attachment.url);

      if (!response.ok) {
        console.warn(`Failed to fetch image: ${attachment.url}`);
        continue;
      }

      const blob = await response.arrayBuffer();

      // Check size
      if (blob.byteLength > maxSize) {
        console.warn(`Image too large (${blob.byteLength} bytes): ${attachment.url}`);
        continue;
      }

      // Determine MIME type
      const contentType = response.headers.get('content-type') || 'image/jpeg';

      // Convert to base64
      const base64 = arrayBufferToBase64(blob);

      processed.push({
        url: attachment.url,
        base64,
        mimeType: contentType,
        size: blob.byteLength,
      });
    } catch (error) {
      console.error(`Error processing image ${attachment.url}:`, error);
    }
  }

  return processed;
}

function isImageUrl(url: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  const lowerUrl = url.toLowerCase();
  return imageExtensions.some(ext => lowerUrl.includes(ext));
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
