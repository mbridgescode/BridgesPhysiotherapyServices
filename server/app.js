const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const authRouter = require('../src/routes/auth');
const userRouter = require('../src/routes/users');
const appointmentsRouter = require('../src/routes/appointments');
const patientsRouter = require('../src/routes/patients');
const paymentsRouter = require('../src/routes/payments');
const notesRouter = require('../src/routes/notes');
const invoicesRouter = require('../src/routes/invoices');
const settingsRouter = require('../src/routes/settings');
const reportsRouter = require('../src/routes/reports');
const auditRouter = require('../src/routes/audit');
const servicesRouter = require('../src/routes/services');
const dataRequestsRouter = require('../src/routes/dataRequests');
const profitLossRouter = require('../src/routes/profitLoss');
const treatmentNoteTemplatesRouter = require('../src/routes/treatmentNoteTemplates');
const {
  host,
  corsOrigin,
  corsOrigins,
  corsOriginPatterns,
  nodeEnv,
  enforceHttps,
} = require('../src/config/env');

const app = express();

const resolvedOrigins = Array.isArray(corsOrigins) && corsOrigins.length > 0
  ? corsOrigins
  : (corsOrigin ? [corsOrigin] : []);
const allowedOrigins = new Set(resolvedOrigins);
const originPatterns = Array.isArray(corsOriginPatterns) ? corsOriginPatterns : [];

const corsOptions = {
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (
      allowedOrigins.size === 0
      || allowedOrigins.has(origin)
      || originPatterns.some((pattern) => pattern.test(origin))
    ) {
      return callback(null, true);
    }

    return callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'no-referrer' },
}));
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(cookieParser());

if (enforceHttps) {
  app.enable('trust proxy');
  app.use((req, res, next) => {
    const forwardedProto = req.headers['x-forwarded-proto'];
    if (req.secure || forwardedProto === 'https') {
      return next();
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      const hostHeader = req.headers.host || host;
      return res.redirect(301, `https://${hostHeader}${req.originalUrl}`);
    }

    return res.status(400).json({ success: false, message: 'HTTPS is required' });
  });
}

app.use(express.json({ limit: '1mb' }));

app.use('/auth', authRouter);
app.use('/api/users', userRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/patients', patientsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/notes', notesRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/audit', auditRouter);
app.use('/api/services', servicesRouter);
app.use('/api/data-requests', dataRequestsRouter);
app.use('/api/profit-loss', profitLossRouter);
app.use('/api/treatment-note-templates', treatmentNoteTemplatesRouter);

app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', environment: nodeEnv, timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

module.exports = app;
