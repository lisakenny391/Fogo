import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getBonusDistributionStats, getTotalBonusDistributed } from '../../lib/storage-utils';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stats = await getBonusDistributionStats();
    const totalBonusDistributed = await getTotalBonusDistributed();
    
    return res.json({
      totalBonusDistributed,
      totalBonusClaims: stats?.totalBonusClaims || 0,
      lastUpdated: stats?.lastUpdated || null,
      conversionRate: parseFloat(process.env.FOGO_TO_BONUS || "1"),
      bonusTokenMint: process.env.BONUS_TOKEN_MINT || ""
    });
  } catch (error) {
    console.error("Bonus stats error:", error);
    return res.status(500).json({ error: "Failed to get bonus distribution stats" });
  }
}