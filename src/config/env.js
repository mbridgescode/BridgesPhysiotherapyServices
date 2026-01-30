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

const toUrlString = (value) => {
  if (!value) {
    return null;
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return `https://${value}`;
};

const toHostname = (value) => {
  if (!value) {
    return null;
  }
  try {
    return (new URL(toUrlString(value))).hostname;
  } catch (error) {
    return null;
  }
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

const resolveCorsOrigins = () => {
  const parsed = parseOrigins(process.env.CORS_ORIGIN);
  [
    process.env.VERCEL_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ].filter(Boolean).forEach((value) => parsed.push(toUrlString(value)));

  if (parsed.length > 0) {
    return Array.from(new Set(parsed));
  }

  return defaultCorsOrigins;
};

const deriveVercelProjectSlug = (origins) => {
  if (process.env.VERCEL_PROJECT_NAME) {
    return process.env.VERCEL_PROJECT_NAME;
  }

  const candidates = [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
    ...origins,
  ];

  for (const candidate of candidates) {
    const hostname = toHostname(candidate);
    if (hostname && hostname.endsWith('.vercel.app')) {
      const slug = hostname.slice(0, -'.vercel.app'.length);
      if (slug) {
        return slug;
      }
    }
  }

  return null;
};

const buildCorsOriginPatterns = (origins) => {
  const patterns = [];
  const vercelSlug = deriveVercelProjectSlug(origins);

  if (vercelSlug) {
    patterns.push(new RegExp(`^https://${vercelSlug}(?:-[^.]+)?\\.vercel\\.app$`, 'i'));
  }

  return patterns;
};

const corsOrigins = resolveCorsOrigins();
const corsOriginPatterns = buildCorsOriginPatterns(corsOrigins);

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  host: process.env.HOST || 'localhost',
  port: process.env.PORT || 3000,
  corsOrigin: corsOrigins[0],
  corsOrigins,
  corsOriginPatterns,
  mongoUri: assertEnv('MONGODB_URI', process.env.MONGODB_URI),
  accessTokenSecret: assertEnv('ACCESS_TOKEN_SECRET', process.env.ACCESS_TOKEN_SECRET),
  refreshTokenSecret: assertEnv('REFRESH_TOKEN_SECRET', process.env.REFRESH_TOKEN_SECRET),
  accessTokenExpiresIn: process.env.ACCESS_TOKEN_TTL || '15m',
  refreshTokenExpiresIn: process.env.REFRESH_TOKEN_TTL || '7d',
  resendApiKey: process.env.RESEND_API_KEY || '',
  defaultFromEmail: process.env.EMAIL_FROM_ADDRESS || 'no-reply@bridgesphysio.com',
  invoiceStoragePath: process.env.INVOICE_STORAGE_PATH
    || path.join(storageRoot, 'invoices'),
  receiptStoragePath: process.env.RECEIPT_STORAGE_PATH
    || path.join(storageRoot, 'receipts'),
  pdfTempPath: process.env.PDF_TEMP_PATH
    || path.join(storageRoot, 'tmp'),
  chromiumRemoteExecutable: process.env.CHROMIUM_REMOTE_EXEC_PATH || '',
  chromiumLocalExecutable: process.env.CHROMIUM_LOCAL_EXEC_PATH || '',
  dataEncryptionKey: assertEnv('DATA_ENCRYPTION_KEY', process.env.DATA_ENCRYPTION_KEY),
  enforceHttps: process.env.ENFORCE_HTTPS
    ? process.env.ENFORCE_HTTPS.toLowerCase() !== 'false'
    : (process.env.NODE_ENV || 'development') !== 'development',
};
