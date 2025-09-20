import { storage } from '../server/storage';
import { web3Service } from '../server/web3Service';
import { z } from 'zod';

// Performance optimization: In-memory cache for expensive operations
const cache = new Map<string, { data: any; expires: number }>();

export const getFromCache = (key: string) => {
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }
  cache.delete(key);
  return null;
};

export const setCache = (key: string, data: any, ttlSeconds: number = 5) => {
  cache.set(key, { data, expires: Date.now() + ttlSeconds * 1000 });
};

// Helper functions for Fogo testnet faucet
export const getRealWalletBalance = async (address: string): Promise<number> => {
  try {
    const balance = await web3Service.getWalletBalance(address);
    return parseFloat(balance);
  } catch (error) {
    console.error("Failed to get real wallet balance - RPC unavailable:", error);
    throw new Error("Unable to verify wallet balance - blockchain RPC unavailable");
  }
};

export const checkDualFogoEligibility = async (address: string): Promise<{
  eligible: boolean;
  nativeFogo: string;
  splFogo: string; 
  totalFogo: string;
  exceededType?: string;
}> => {
  try {
    return await web3Service.checkDualFogoBalance(address, 10);
  } catch (error) {
    console.error("Failed to check dual FOGO balance - RPC unavailable:", error);
    throw new Error("Unable to verify FOGO token balances - blockchain RPC unavailable");
  }
};

export const getRealTransactionCount = async (address: string): Promise<number> => {
  try {
    return await web3Service.getTransactionCount(address);
  } catch (error) {
    console.error("Failed to get real transaction count - blockchain RPC unavailable:", error);
    throw new Error("Unable to verify wallet transaction count - blockchain RPC unavailable");
  }
};

// Validation schemas
export const checkEligibilitySchema = z.object({
  walletAddress: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid Solana address format"),
});

export const claimTokensSchema = z.object({
  walletAddress: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid Solana address format"),
});

// Enhanced eligibility helper with Fogo rules
export const isEligibleForClaim = async (walletAddress: string): Promise<{ 
  eligible: boolean; 
  reason?: string; 
  resetTime?: Date; 
  txnCount: number; 
  proposedAmount: string; 
  balanceExceeded: boolean;
  remainingPool?: string;
  nativeFogo?: string;
  splFogo?: string;
  totalFogo?: string;
  exceededType?: string;
}> => {
  const txnCount = await getRealTransactionCount(walletAddress);
  const dualBalanceCheck = await checkDualFogoEligibility(walletAddress);
  
  const walletBalance = parseFloat(dualBalanceCheck.nativeFogo);
  
  const eligibilityResult = await storage.getEligibleClaimAmount(txnCount, walletBalance.toString());
  const poolStatus = await storage.getRemainingDailyPool();
  
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

  const rateLimit = await storage.getRateLimit(walletAddress);
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

// Helper function to calculate time ago
export const getTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) {
    return `${diffInSeconds} seconds ago`;
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
  }
};

// CORS helper
export const setCORSHeaders = (res: any) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};