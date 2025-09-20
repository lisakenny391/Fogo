import type { VercelRequest, VercelResponse } from '@vercel/node';
import { storage } from '../server/storage';
import { getFogoToBonusRate } from '../server/config';
import { getFromCache, setCache, setCORSHeaders } from '../lib/shared';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCORSHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const cacheKey = "general-stats";
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }

    const [totalClaims, totalUsers, totalDistributed, totalBonusDistributed] = await Promise.all([
      storage.getTotalClaims(),
      storage.getTotalUsers(),
      storage.getTotalDistributed(),
      storage.getTotalBonusDistributed()
    ]);
    
    const stats = {
      totalClaims,
      totalUsers,
      totalDistributed,
      totalBonusDistributed,
      lastUpdated: new Date().toISOString()
    };

    setCache(cacheKey, stats, 10);
    res.json(stats);
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({ error: "Failed to get statistics" });
  }
}