import type { VercelRequest, VercelResponse } from '@vercel/node';
import { storage } from '../server/storage';
import { getTimeAgo, setCORSHeaders } from '../lib/shared';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCORSHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const leaderboard = await storage.getLeaderboard(limit);
    
    const formattedLeaderboard = leaderboard.map((entry, index) => ({
      rank: index + 1,
      walletAddress: entry.walletAddress,
      claims: entry.claims,
      totalAmount: entry.totalAmount,
      lastClaim: entry.lastClaim,
      lastClaimAgo: getTimeAgo(entry.lastClaim),
      bonusClaims: entry.bonusClaims,
      totalBonusAmount: entry.totalBonusAmount
    }));
    
    res.json(formattedLeaderboard);
  } catch (error) {
    console.error("Leaderboard error:", error);
    res.status(500).json({ error: "Failed to get leaderboard" });
  }
}