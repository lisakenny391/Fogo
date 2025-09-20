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
    const activities = await storage.getRecentClaims(limit);
    
    const formattedActivities = activities.map(claim => ({
      id: claim.id,
      type: 'claim',
      walletAddress: claim.walletAddress,
      amount: claim.amount,
      status: claim.status,
      timestamp: claim.createdAt,
      timeAgo: getTimeAgo(claim.createdAt)
    }));
    
    res.json(formattedActivities);
  } catch (error) {
    console.error("Recent activity error:", error);
    res.status(500).json({ error: "Failed to get recent activity" });
  }
}