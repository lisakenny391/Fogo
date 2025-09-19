import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFaucetConfig, getTotalClaims, getTotalUsers, getTotalDistributed } from '../lib/storage-utils';
import { web3Service } from '../../server/web3Service';

// Performance optimization: In-memory cache
const cache = new Map<string, { data: any; expires: number }>();

const getFromCache = (key: string) => {
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }
  cache.delete(key);
  return null;
};

const setCache = (key: string, data: any, ttlSeconds: number = 5) => {
  cache.set(key, { data, expires: Date.now() + ttlSeconds * 1000 });
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const cacheKey = "faucet-status";
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }

    const config = await getFaucetConfig();
    if (!config) {
      return res.status(500).json({ error: "Faucet configuration not found" });
    }
    
    const totalClaims = await getTotalClaims();
    const totalUsers = await getTotalUsers();
    const totalDistributed = await getTotalDistributed();
    
    let faucetBalance = config.balance;
    try {
      const realBalance = await web3Service.getFaucetBalance();
      faucetBalance = realBalance;
      console.log(`Real faucet balance: ${realBalance} FOGO`);
    } catch (error) {
      console.warn("Failed to get real faucet balance, using config:", error);
    }
    
    const statusData = {
      balance: faucetBalance,
      dailyLimit: config.dailyLimit,
      isActive: config.isActive,
      lastRefill: config.lastRefill,
      totalClaims,
      totalUsers,
      totalDistributed,
      nextRefill: new Date(config.lastRefill.getTime() + 24 * 60 * 60 * 1000)
    };

    setCache(cacheKey, statusData, 3);
    return res.json(statusData);
  } catch (error) {
    console.error("Faucet status error:", error);
    return res.status(500).json({ error: "Failed to get faucet status" });
  }
}