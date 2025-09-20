import type { VercelRequest, VercelResponse } from '@vercel/node';
import { storage } from '../../server/storage';
import { getFogoToBonusRate, getBonusTokenMint } from '../../server/config';
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
    const stats = await storage.getBonusDistributionStats();
    const totalBonusDistributed = await storage.getTotalBonusDistributed();
    
    res.json({
      totalBonusDistributed,
      totalBonusClaims: stats?.totalBonusClaims || 0,
      lastUpdated: stats?.lastUpdated || null,
      conversionRate: getFogoToBonusRate(),
      bonusTokenMint: getBonusTokenMint()
    });
  } catch (error) {
    console.error("Bonus stats error:", error);
    res.status(500).json({ error: "Failed to get bonus distribution stats" });
  }
}