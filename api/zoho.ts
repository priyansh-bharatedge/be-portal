import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleZohoRequest } from './_zohoHandler';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '15mb',
    },
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return handleZohoRequest(req as any, res as any);
}
