import http from 'http';
import { URL, fileURLToPath } from 'url';
import fs from 'fs';
import path from 'path';
import zohoHandler from './api/zoho.ts';
import sendOtpHandler from './api/send-otp.ts';
import dealsHandler from './api/deals.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env if present
const possibleEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(__dirname, '.env'),
  '/root/be-portal/.env',
  '/root/.env'
];

for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    try {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [key, ...vals] = trimmed.split('=');
          const val = vals.join('=').trim().replace(/^["']|["']$/g, '');
          if (key) {
            process.env[key.trim()] = val;
          }
        }
      });
      break;
    } catch (e) {
      console.warn(`Could not read .env file at ${envPath}`, e);
    }
  }
}

// Ensure default WorkDrive & CRM credentials exist even if .env is missing or outdated
if (!process.env.VITE_ZOHO_REFRESH_TOKEN || process.env.VITE_ZOHO_REFRESH_TOKEN.includes('bdf58bb945') || process.env.VITE_ZOHO_REFRESH_TOKEN.includes('b141fe7e')) {
  process.env.VITE_ZOHO_REFRESH_TOKEN = '1000.3e0ddc29ef25c80e54d40d3c220ce6d9.d874981c4495b4c25f8e3f594cf18413';
}
process.env.VITE_ZOHO_DOMAIN = 'in';
process.env.VITE_ZOHO_ACCOUNTS_URL = process.env.VITE_ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.in';
process.env.VITE_ZOHO_API_URL = process.env.VITE_ZOHO_API_URL || 'https://www.zohoapis.in';
if (!process.env.VITE_ZOHO_WORKDRIVE_FOLDER_ID) {
  process.env.VITE_ZOHO_WORKDRIVE_FOLDER_ID = '20pmq2dc477e8e8144483a518d51e40b4b23c';
}

const PORT = process.env.PORT || 5000;

function parseJsonBody(req) {
  const contentType = (req.headers && req.headers['content-type']) || '';
  if (contentType.includes('multipart/form-data')) {
    return Promise.resolve({});
  }
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, X-CSRF-Token');

  if (req.method === 'OPTIONS') {
    res.statusCode = 200;
    return res.end();
  }

  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // Enhanced helper for Vercel/Express-like req & res
  const queryObj = Object.fromEntries(urlObj.searchParams.entries());
  req.query = queryObj;
  req.body = await parseJsonBody(req);

  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify(data));
  };
  res.send = (data) => {
    if (typeof data === 'object') {
      res.setHeader('Content-Type', 'application/json');
      return res.end(JSON.stringify(data));
    }
    return res.end(String(data));
  };

  try {
    // 1. Zoho API Endpoints (/api/zoho/* or /api/zoho or /api/deals)
    if (pathname === '/api/deals' || pathname.startsWith('/api/deals') || pathname === '/api/zoho/get-deals' || pathname.startsWith('/api/zoho/get-deals')) {
      return await dealsHandler(req, res);
    }

    if (pathname.startsWith('/api/zoho')) {
      return await zohoHandler(req, res);
    }

    // 2. Send OTP Endpoint
    if (pathname === '/api/send-otp') {
      return await sendOtpHandler(req, res);
    }

    // Health check
    if (pathname === '/api/health' || pathname === '/health') {
      return res.json({ status: 'ok', time: new Date().toISOString() });
    }

    res.statusCode = 404;
    return res.json({ error: `Route ${pathname} not found` });
  } catch (err) {
    console.error('[API Server] Error:', err);
    res.statusCode = 500;
    return res.json({ error: err.message || 'Internal Server Error' });
  }
});

server.listen(PORT, () => {
  console.log(`[BharatEdge API Server] Running on http://127.0.0.1:${PORT}`);
});
