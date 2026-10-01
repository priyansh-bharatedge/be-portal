import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleZohoRequest } from './_handler';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb',
    },
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    return await handleZohoRequest(req as any, res as any);
  } catch (err: any) {
    console.error('[Vercel Handler] Uncaught error:', err);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        message: err?.message || 'Internal server error',
        stack: process.env.NODE_ENV === 'development' ? err?.stack : undefined,
      });
    }
  }
}
