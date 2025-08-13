import crypto from 'crypto';

const algorithm = 'aes-256-cbc';
const key = crypto.scryptSync(process.env.HASH_PASSPHRASE as string, process.env.HASH_SALT as string, 32);
const iv = crypto.randomBytes(16);

function encrypt(text: string) {
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  // Return iv + encrypted data (iv is needed for decryption)
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedData: string) {
  const [ivHex, encrypted] = encryptedData.split(':');
  const ivBuffer = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(algorithm, key, ivBuffer);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export {
  encrypt,
  decrypt,
};
