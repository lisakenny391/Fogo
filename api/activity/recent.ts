import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getRecentClaims } from '../lib/storage-utils';

// Helper function for time formatting
const getTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else {
    return `${diffDays}d ago`;
  }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const claims = await getRecentClaims(limit);
    
    const formattedClaims = claims.map(claim => ({
      id: claim.id,
      walletAddress: claim.walletAddress,
      amount: claim.amount,
      status: claim.status,
      transactionHash: claim.transactionHash,
      timestamp: claim.createdAt,
      timeAgo: getTimeAgo(claim.createdAt)
    }));
    
    return res.json(formattedClaims);
  } catch (error) {
    console.error("Recent activity error:", error);
    return res.status(500).json({ error: "Failed to get recent claims" });
  }
}