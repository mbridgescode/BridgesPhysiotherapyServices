const path = require('path');
const os = require('os');
require('dotenv').config();

const assertEnv = (name, value) => {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
};

const defaultStorageRoot = process.env.VERCEL
  ? os.tmpdir()
  : path.join(process.cwd(), 'storage');

const storageRoot = process.env.STORAGE_ROOT || defaultStorageRoot;

const parseOrigins = (value) => {
  if (!value) {
    return [];
  }

  if (value.includes(',')) {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return [value.trim()];
};

const defaultCorsOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'https://localhost:3000',
  'https://127.0.0.1:3000',
  'https://localhost:3001',
  'https://127.0.0.1:3001',
];

const corsOrigins = (() => {
  const parsed = parseOrigins(process.env.CORS_ORIGIN);
  if (parsed.length > 0) {
    return parsed;
  }
  return defaultCorsOrigins;
})();

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  host: process.env.HOST || 'localhost',
  port: process.env.PORT || 3000,
  corsOrigin: corsOrigins[0],
  corsOrigins,
  mongoUri: assertEnv('MONGODB_URI', process.env.MONGODB_URI),
  accessTokenSecret: assertEnv('ACCESS_TOKEN_SECRET', process.env.ACCESS_TOKEN_SECRET),
  refreshTokenSecret: assertEnv('REFRESH_TOKEN_SECRET', process.env.REFRESH_TOKEN_SECRET),
  accessTokenExpiresIn: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_TTL || '7d',
  resendApiKey: process.env.RESEND_API_KEY || '',
  defaultFromEmail: process.env.EMAIL_FROM_ADDRESS || 'no-reply@bridgesphysio.com',
  invoiceStoragePath: process.env.INVOICE_STORAGE_PATH
    || path.join(storageRoot, 'invoices'),
  pdfTempPath: process.env.PDF_TEMP_PATH
    || path.join(storageRoot, 'tmp'),
  dataEncryptionKey: assertEnv('DATA_ENCRYPTION_KEY', process.env.DATA_ENCRYPTION_KEY),
  enforceHttps: process.env.ENFORCE_HTTPS
    ? process.env.ENFORCE_HTTPS.toLowerCase() !== 'false'
    : (process.env.NODE_ENV || 'development') !== 'development',
};
