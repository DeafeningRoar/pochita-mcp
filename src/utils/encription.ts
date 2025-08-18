import crypto from 'crypto';

const { ENCRYPTION_KEY, ENCRYPTION_VERSION } = process.env as Record<string, string>;

const ALGORTITHM = 'aes-256-gcm';
const KEY = Buffer.from(ENCRYPTION_KEY, 'base64');
const IV_BYTES = 12;

function encrypt(text: string) {
  const iv = crypto.randomBytes(IV_BYTES);

  const cipher = crypto.createCipheriv(ALGORTITHM, KEY, iv);
  const ct = Buffer.concat([cipher.update(text, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [ENCRYPTION_VERSION, 'gcm', iv.toString('base64'), ct.toString('base64'), tag.toString('base64')].join('.');
}

function decrypt(token: string) {
  const [,, ivB64, ctB64, tagB64] = token.split('.');

  const iv = Buffer.from(ivB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORTITHM, KEY, iv);
  decipher.setAuthTag(tag);

  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

export { encrypt, decrypt };
