import http from 'http';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import zohoHandler from './api/zoho.ts';
import sendOtpHandler from './api/send-otp.ts';

// Load .env if present
if (fs.existsSync('.env')) {
  try {
    const envContent = fs.readFileSync('.env', 'utf-8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const [key, ...vals] = trimmed.split('=');
        const val = vals.join('=').trim().replace(/^["']|["']$/g, '');
        if (key && !process.env[key.trim()]) {
          process.env[key.trim()] = val;
        }
      }
    });
  } catch (e) {
    console.warn('Could not read .env file', e);
  }
}

const PORT = process.env.PORT || 5000;

function parseJsonBody(req) {
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
    // 1. Zoho API Endpoints (/api/zoho/* or /api/zoho)
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
