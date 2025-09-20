import type { VercelRequest, VercelResponse } from '@vercel/node';
import { storage } from '../../server/storage';
import { z } from 'zod';
import { checkEligibilitySchema, isEligibleForClaim, setCORSHeaders } from '../../lib/shared';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCORSHeaders(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { walletAddress } = checkEligibilitySchema.parse(req.body);
    
    const config = await storage.getFaucetConfig();
    if (!config || !config.isActive) {
      return res.json({ 
        eligible: false, 
        reason: "Faucet is currently inactive" 
      });
    }
    
    const startTime = Date.now();
    console.log(`Starting eligibility check for ${walletAddress}`);
    
    try {
      const eligibilityPromise = isEligibleForClaim(walletAddress);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Eligibility check timeout')), 12000)
      );
      
      const eligibility = await Promise.race([eligibilityPromise, timeoutPromise]);
      
      const duration = Date.now() - startTime;
      console.log(`Eligibility check completed in ${duration}ms for ${walletAddress}`);
      
      res.json(eligibility);
    } catch (timeoutError) {
      const duration = Date.now() - startTime;
      console.warn(`Eligibility check timed out after ${duration}ms for ${walletAddress}`);
      
      res.json({
        eligible: false,
        reason: "Network is busy - please try again in a few minutes",
        txnCount: 0,
        proposedAmount: "0",
        balanceExceeded: false,
        remainingPool: "Unknown",
        nativeFogo: "Unknown",
        splFogo: "Unknown",
        totalFogo: "Unknown"
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid wallet address format" });
    }
    console.error("Eligibility check error:", error);
    res.status(500).json({ error: "Failed to check eligibility" });
  }
}