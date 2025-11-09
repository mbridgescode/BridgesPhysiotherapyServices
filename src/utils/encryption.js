const crypto = require('crypto');
const { dataEncryptionKey } = require('../config/env');

const ENC_PREFIX = 'enc::';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

if (!dataEncryptionKey) {
  throw new Error('DATA_ENCRYPTION_KEY is required to start the application');
}

const masterKey = crypto.createHash('sha256').update(dataEncryptionKey, 'utf8').digest();

const deriveKeyMaterial = (purpose) => crypto
  .createHmac('sha256', masterKey)
  .update(purpose)
  .digest();

const searchIndexKey = deriveKeyMaterial('search-index');

const toBuffer = (value) => {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (typeof value === 'string') {
    return Buffer.from(value, 'utf8');
  }

  return Buffer.from(JSON.stringify(value), 'utf8');
};

const encryptValue = (value) => {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value === 'string' && value.startsWith(ENC_PREFIX)) {
    return value;
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(toBuffer(value)), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENC_PREFIX}${Buffer.concat([iv, authTag, ciphertext]).toString('base64')}`;
};

const decryptValue = (value) => {
  if (value === undefined || value === null) {
    return value;
  }

  if (typeof value !== 'string' || !value.startsWith(ENC_PREFIX)) {
    return value;
  }

  const payload = Buffer.from(value.slice(ENC_PREFIX.length), 'base64');
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return decrypted.toString('utf8');
};

const toISODateString = (value) => {
  if (!value) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString();
};

const hashToken = (token) => {
  if (!token) {
    return null;
  }

  return crypto.createHmac('sha256', searchIndexKey)
    .update(token)
    .digest('base64url');
};

const normalizeSearchValue = (input) => {
  if (!input) {
    return '';
  }

  return input
    .toString()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '');
};

const generateSearchTokensFromValues = (values = []) => {
  const tokens = new Set();

  values
    .flat()
    .map(normalizeSearchValue)
    .filter(Boolean)
    .forEach((value) => {
      const truncated = value.slice(0, 64);

      if (truncated.length < 3) {
        tokens.add(hashToken(truncated));
        return;
      }

      for (let window = 3; window <= Math.min(6, truncated.length); window += 1) {
        for (let index = 0; index <= truncated.length - window; index += 1) {
          tokens.add(hashToken(truncated.slice(index, index + window)));
        }
      }

      tokens.add(hashToken(truncated));
    });

  return Array.from(tokens).filter(Boolean);
};

module.exports = {
  ENC_PREFIX,
  encryptValue,
  decryptValue,
  toISODateString,
  hashToken,
  generateSearchTokensFromValues,
};
