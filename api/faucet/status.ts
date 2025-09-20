import type { VercelRequest, VercelResponse } from '@vercel/node';
import { storage } from '../../server/storage';
import { web3Service } from '../../server/web3Service';
import { getFromCache, setCache, setCORSHeaders } from '../../lib/shared';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCORSHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const cacheKey = "faucet-status";
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }

    const config = await storage.getFaucetConfig();
    if (!config) {
      return res.status(500).json({ error: "Faucet configuration not found" });
    }
    
    const totalClaims = await storage.getTotalClaims();
    const totalUsers = await storage.getTotalUsers();
    const totalDistributed = await storage.getTotalDistributed();
    
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
    res.json(statusData);
  } catch (error) {
    console.error("Faucet status error:", error);
    res.status(500).json({ error: "Failed to get faucet status" });
  }
}