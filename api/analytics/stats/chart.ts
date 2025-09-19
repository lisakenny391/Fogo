import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getClaimStats } from '../../lib/storage-utils';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stats = await getClaimStats();
    
    const formattedStats = stats.map(stat => ({
      date: new Date(stat.date).toLocaleDateString('en-US', { weekday: 'short' }),
      claims: stat.claims,
      users: stat.users
    }));
    
    return res.json(formattedStats);
  } catch (error) {
    console.error("Analytics chart error:", error);
    return res.status(500).json({ error: "Failed to get chart data" });
  }
}