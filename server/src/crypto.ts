import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export type SealPurpose = 'aynes-key' | 'guest-token';

function key(secret: string, purpose: SealPurpose): Buffer {
  return createHash('sha256').update(`${purpose}:${secret}`).digest();
}

/** AES-256-GCM: the owner's Aynes key is stored encrypted (TZ §7), and so is the guest's link token. */
export function encrypt(plain: string, secret: string, purpose: SealPurpose = 'aynes-key'): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret, purpose), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(sealed: string, secret: string, purpose: SealPurpose = 'aynes-key'): string {
  const [iv, tag, data] = sealed.split('.').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !tag || !data) throw new Error('Malformed sealed value');
  const decipher = createDecipheriv('aes-256-gcm', key(secret, purpose), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(9).toString('base64url')}`;
}
