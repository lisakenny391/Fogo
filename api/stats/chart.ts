import type { VercelRequest, VercelResponse } from '@vercel/node';
import { storage } from '../../server/storage';
import { setCORSHeaders } from '../../lib/shared';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCORSHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stats = await storage.getClaimStats();
    
    const formattedStats = stats.map(stat => ({
      date: new Date(stat.date).toLocaleDateString('en-US', { weekday: 'short' }),
      claims: stat.claims,
      users: stat.users
    }));
    
    res.json(formattedStats);
  } catch (error) {
    console.error("Chart data error:", error);
    res.status(500).json({ error: "Failed to get chart data" });
  }
}