import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getFaucetConfig, getEligibleClaimAmount, getRemainingDailyPool, getRateLimit } from '../lib/storage-utils';
import { web3Service } from '../../server/web3Service';
import { z } from 'zod';

// Environment variable validation
const DAILY_POOL_LIMIT = process.env.DAILY_POOL_LIMIT;
const FOGO_TO_BONUS = process.env.FOGO_TO_BONUS;

if (!DAILY_POOL_LIMIT || !FOGO_TO_BONUS) {
  throw new Error('Missing DAILY_POOL_LIMIT or FOGO_TO_BONUS in environment');
}

// Validation schema
const checkEligibilitySchema = z.object({
  walletAddress: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid Solana address format"),
});

// Helper functions
const getRealTransactionCount = async (address: string): Promise<number> => {
  try {
    return await web3Service.getTransactionCount(address);
  } catch (error) {
    console.error("Failed to get real transaction count - blockchain RPC unavailable:", error);
    throw new Error("Unable to verify wallet transaction count - blockchain RPC unavailable");
  }
};

const checkDualFogoEligibility = async (address: string) => {
  try {
    return await web3Service.checkDualFogoBalance(address, 10);
  } catch (error) {
    console.error("Failed to check dual FOGO balance - RPC unavailable:", error);
    throw new Error("Unable to verify FOGO token balances - blockchain RPC unavailable");
  }
};

const isEligibleForClaim = async (walletAddress: string) => {
  const txnCount = await getRealTransactionCount(walletAddress);
  const dualBalanceCheck = await checkDualFogoEligibility(walletAddress);
  
  const walletBalance = parseFloat(dualBalanceCheck.nativeFogo);
  
  const eligibilityResult = await getEligibleClaimAmount(txnCount, walletBalance.toString());
  const poolStatus = await getRemainingDailyPool();
  
  const balanceExceeded = !dualBalanceCheck.eligible;
  
  if (balanceExceeded) {
    const balanceType = dualBalanceCheck.exceededType === "native" ? "native FOGO" : "SPL FOGO";
    return {
      eligible: false,
      reason: `Wallet ${balanceType} balance exceeds 10 tokens`,
      txnCount,
      proposedAmount: "0",
      balanceExceeded: true,
      remainingPool: poolStatus.remaining,
      nativeFogo: dualBalanceCheck.nativeFogo,
      splFogo: dualBalanceCheck.splFogo,
      totalFogo: dualBalanceCheck.totalFogo,
      exceededType: dualBalanceCheck.exceededType
    };
  }

  if (!eligibilityResult.eligible) {
    return {
      eligible: false,
      reason: eligibilityResult.reason,
      txnCount,
      proposedAmount: eligibilityResult.amount,
      balanceExceeded: false,
      remainingPool: poolStatus.remaining,
      nativeFogo: dualBalanceCheck.nativeFogo,
      splFogo: dualBalanceCheck.splFogo,
      totalFogo: dualBalanceCheck.totalFogo
    };
  }

  const rateLimit = await getRateLimit(walletAddress);
  const now = new Date();
  
  if (rateLimit) {
    const timeSinceLastClaim = now.getTime() - rateLimit.lastClaim.getTime();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    
    if (timeSinceLastClaim < twentyFourHours) {
      const resetTime = new Date(rateLimit.lastClaim.getTime() + twentyFourHours);
      return { 
        eligible: false, 
        reason: "Daily limit reached. Please wait 24 hours between claims.",
        resetTime,
        txnCount,
        proposedAmount: eligibilityResult.amount,
        balanceExceeded: false,
        remainingPool: poolStatus.remaining,
        nativeFogo: dualBalanceCheck.nativeFogo,
        splFogo: dualBalanceCheck.splFogo,
        totalFogo: dualBalanceCheck.totalFogo
      };
    }
  }
  
  return { 
    eligible: true, 
    txnCount, 
    proposedAmount: eligibilityResult.amount, 
    balanceExceeded: false,
    remainingPool: poolStatus.remaining,
    nativeFogo: dualBalanceCheck.nativeFogo,
    splFogo: dualBalanceCheck.splFogo,
    totalFogo: dualBalanceCheck.totalFogo
  };
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { walletAddress } = checkEligibilitySchema.parse(req.body);
    
    const config = await getFaucetConfig();
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
      
      return res.json(eligibility);
    } catch (timeoutError) {
      const duration = Date.now() - startTime;
      console.warn(`Eligibility check timed out after ${duration}ms for ${walletAddress}`);
      
      return res.json({
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
    return res.status(500).json({ error: "Failed to check eligibility" });
  }
}