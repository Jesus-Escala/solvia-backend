import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env';

/** Public URL prefix under which `STORAGE_DIR` is served (see app.ts). */
export const FILES_ROUTE = '/files';

export const storageRoot = path.resolve(env.STORAGE_DIR);

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

async function save(folder: string, buffer: Buffer, extension: string): Promise<string> {
  const directory = path.join(storageRoot, folder);
  await mkdir(directory, { recursive: true });
  // Random names keep files unguessable; they are served without authentication.
  const fileName = `${randomUUID()}.${extension}`;
  await writeFile(path.join(directory, fileName), buffer);
  return `${FILES_ROUTE}/${folder}/${fileName}`;
}

/**
 * Local disk storage. Returned paths are relative (`/files/...`) so they work behind the
 * frontend proxy; use `toAbsoluteUrl` for links sent outside the app (e.g. WhatsApp).
 * Replace with S3/GCS in production.
 */
export const storageService = {
  savePaymentProof(buffer: Buffer, mimeType: string) {
    return save('proofs', buffer, EXTENSIONS[mimeType] ?? 'bin');
  },

  saveStatement(buffer: Buffer) {
    return save('statements', buffer, 'pdf');
  },

  toAbsoluteUrl(relativePath: string) {
    return new URL(relativePath, env.PUBLIC_API_URL).toString();
  },
};
