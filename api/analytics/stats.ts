import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getTotalClaims, getTotalUsers, getTotalDistributed, getTotalBonusDistributed, getBonusDistributionStats, getFaucetConfig } from '../lib/storage-utils';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const totalClaims = await getTotalClaims();
    const totalUsers = await getTotalUsers();
    const totalDistributed = await getTotalDistributed();
    const totalBonusDistributed = await getTotalBonusDistributed();
    const bonusStats = await getBonusDistributionStats();
    const config = await getFaucetConfig();
    
    return res.json({
      totalClaims,
      totalUsers,
      totalDistributed,
      totalBonusDistributed,
      totalBonusClaims: bonusStats?.totalBonusClaims || 0,
      faucetBalance: config?.balance || "0",
      dailyLimit: config?.dailyLimit || "100",
      isActive: config?.isActive || false,
      bonusConversionRate: parseFloat(process.env.FOGO_TO_BONUS || "1")
    });
  } catch (error) {
    console.error("Analytics stats error:", error);
    return res.status(500).json({ error: "Failed to get statistics" });
  }
}