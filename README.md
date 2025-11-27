# Bridges Physiotherapy Services Platform

Full-stack clinic operations portal built with a React (CRA + MUI) frontend and an Express/MongoDB backend. The repository is now trimmed to production-only assets, ships with a Vercel-ready serverless API entry point, and excludes any local credentials, fixtures, or automation artefacts.

## Project Layout

```
.
├─ api/                 # Vercel serverless entry (wraps the Express app)
├─ public/              # CRA static assets
├─ server/              # Express bootstrap + database helpers
├─ src/                 # Shared frontend + backend source
│  ├─ components/       # React UI
│  ├─ config/           # Environment helpers
│  ├─ context/          # React providers
│  ├─ middleware/       # Express middleware
│  ├─ models/           # Mongoose models
│  ├─ routes/           # Express route handlers + SPA PrivateRoute
│  ├─ services/         # Email/PDF utilities
│  ├─ styles/           # Global styles
│  └─ utils/            # Shared helpers (API client, etc.)
├─ storage/             # Runtime output placeholder (.gitkeep only)
├─ vercel.json          # Build + routing config for Vercel
└─ server.js            # Local Express entry point (used by `npm run start:api`)
```

## Environment Configuration

Refer to `.env.example` for the complete list of required backend variables. Create a `.env` at the project root (never commit it) with at least:

```
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
MONGODB_URI=your-mongodb-uri
ACCESS_TOKEN_SECRET=your-access-secret
REFRESH_TOKEN_SECRET=your-refresh-secret
DATA_ENCRYPTION_KEY=32-byte-secret
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d
CORS_ORIGIN=https://your-vercel-app.vercel.app
RESEND_API_KEY=
EMAIL_FROM_ADDRESS=no-reply@bridgesphysio.com
FRONTEND_BASE_URL=https://your-vercel-app.vercel.app
STORAGE_ROOT=./storage
INVOICE_STORAGE_PATH=./storage/invoices
PDF_TEMP_PATH=./storage/tmp
ENFORCE_HTTPS=true
```

Frontend-specific values must be prefixed with `REACT_APP_`. Create `.env.local` in the project root (consumed by CRA) and set:

```
REACT_APP_API_BASE_URL=https://your-vercel-app.vercel.app/api
```

During local development you can instead point `REACT_APP_API_BASE_URL` at `http://localhost:3000`.

## Local Development

```bash
npm install
npm run start:api    # starts Express on http://localhost:3000
npm start            # starts CRA dev server on http://localhost:3001
```

The frontend expects the API to be available at `REACT_APP_API_BASE_URL`. When running both locally, set `PORT=3001` (CRA default) and keep the API on `3000`.

Build the production bundle with:

```bash
npm run build
```

## Deployment on Vercel

`vercel.json` defines the required configuration:

- `npm run build` generates the SPA in `/build`.
- The Express app is instantiated once in `server/app.js`.  
- `api/index.js` connects to MongoDB (with connection reuse) and proxies every `/api/*` request to the Express app inside a Vercel serverless function.
- A rewrite sends any non-API route to `index.html`, ensuring client-side routing works.

### Steps

1. Push this repository to Vercel and choose the root directory.
2. Add the backend environment variables from `.env.example` to the Vercel project settings.
3. Add `REACT_APP_API_BASE_URL=https://<your-project>.vercel.app/api` to the “Build & Development Settings → Environment Variables” section so the CRA build embeds the correct API origin.
4. If invoice PDFs need to persist beyond a single request, configure `INVOICE_STORAGE_PATH` and `PDF_TEMP_PATH` to point to durable storage (S3, Azure Blob, etc.). Vercel’s filesystem is ephemeral; by default the app will fall back to `/tmp` inside the function runtime.
5. Trigger a deployment; Vercel will run `npm install --production=false`, `npm run build`, upload `/build` as static assets, and bundle `api/index.js` (plus all required server files) as a serverless function.

## Operational Notes

- Sensitive credentials are no longer stored anywhere in the repository. `src/config/env.js` now requires all secrets (MongoDB URI, token secrets, encryption key) to be provided via environment variables.
- The `storage/` directory only contains `.gitkeep` placeholders; generated PDFs or temporary files are ignored via `.gitignore`.
- Automated tests, browser automation, and playground scripts have been removed from `package.json` along with their dependencies to keep deployment lean.
- `npm run start:api` replaces the previous collection of ad-hoc scripts for running the backend locally.
- The `/healthz` route exposes build metadata for monitoring, and Helmet/CORS/Cookie security hardening is enabled by default (`ENFORCE_HTTPS=true` outside of development).

## Database Validators

- Run `python scripts/db/sync_validators.py` whenever you change a Mongoose model. The script regenerates the Atlas `collMod` commands (`apply_validators_commands.json`, ignored by git) and refreshes `../bridges_physiotherapy_services_db_admin/schema.json`.
- Apply the validators by pointing `mongodb_playground.py` at the generated command file, for example:

  ```bash
  python mongodb_playground.py \
    --collection users \
    --mongo-uri "$MONGODB_URI" \
    --database bridges_physiotherapy_db \
    --db-command-file apply_validators_commands.json \
    --limit 1
  ```

## Scripts

- `npm start` - CRA dev server.
- `npm run build` – production build of the SPA.
- `npm run start:api` – start the Express API locally (useful alongside `npm start`).
- `npm run eject` – CRA eject (irreversible).

## License

ISC – see `package.json`.
