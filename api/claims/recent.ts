import type { VercelRequest, VercelResponse } from '@vercel/node';
import { storage } from '../../server/storage';
import { getTimeAgo, setCORSHeaders } from '../../lib/shared';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCORSHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const claims = await storage.getRecentClaims(limit);
    
    const formattedClaims = claims.map(claim => ({
      id: claim.id,
      walletAddress: claim.walletAddress,
      amount: claim.amount,
      status: claim.status,
      transactionHash: claim.transactionHash,
      timestamp: claim.createdAt,
      timeAgo: getTimeAgo(claim.createdAt)
    }));
    
    res.json(formattedClaims);
  } catch (error) {
    console.error("Recent claims error:", error);
    res.status(500).json({ error: "Failed to get recent claims" });
  }
}