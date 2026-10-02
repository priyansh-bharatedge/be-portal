import { handleZohoRequest } from './_zohoHandler';
export * from './_zohoHandler';
export { handleZohoRequest };

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb',
    },
  },
};

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    if (typeof res.status === 'function') return res.status(200).end();
    res.statusCode = 200;
    return res.end();
  }

  try {
    return await handleZohoRequest(req, res);
  } catch (err: any) {
    console.error('[Vercel Handler] Uncaught error:', err);
    if (!res.headersSent) {
      if (typeof res.status === 'function') {
        return res.status(500).json({ success: false, message: err?.message || 'Internal server error' });
      }
      res.statusCode = 500;
      return res.end(JSON.stringify({ success: false, message: err?.message || 'Internal server error' }));
    }
  }
}
