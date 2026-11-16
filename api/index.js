import { handleVercelRequest } from '../server/index.js';

export default async function handler(req, res) {
  const rawUrl = req.url || '/api/health';
  const parsed = new URL(rawUrl, `https://${req.headers.host || 'localhost'}`);
  const subPath = parsed.searchParams.get('__chase_api_path');
  if (subPath !== null) {
    parsed.searchParams.delete('__chase_api_path');
    const qs = parsed.searchParams.toString();
    req.url = `/api/${subPath.replace(/^\/+/, '')}${qs ? `?${qs}` : ''}`;
  }
  return handleVercelRequest(req, res);
}
