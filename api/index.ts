import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import { storage } from '../server/storage';
import { insertClaimSchema } from '../shared/schema';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { web3Service } from '../server/web3Service';
import { getFogoToBonusRate, getBonusTokenMint } from '../server/config';

// Performance optimization: In-memory cache for expensive operations
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

// Helper functions
const getRealWalletBalance = async (address: string): Promise<number> => {
  try {
    const balance = await web3Service.getWalletBalance(address);
    return parseFloat(balance);
  } catch (error) {
    console.error("Failed to get real wallet balance - RPC unavailable:", error);
    throw new Error("Unable to verify wallet balance - blockchain RPC unavailable");
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

const getRealTransactionCount = async (address: string): Promise<number> => {
  try {
    return await web3Service.getTransactionCount(address);
  } catch (error) {
    console.error("Failed to get real transaction count - blockchain RPC unavailable:", error);
    throw new Error("Unable to verify wallet transaction count - blockchain RPC unavailable");
  }
};

const isEligibleForClaim = async (address: string) => {
  try {
    const [txnCount, walletBalance, dualBalance] = await Promise.all([
      getRealTransactionCount(address),
      getRealWalletBalance(address),
      checkDualFogoEligibility(address)
    ]);

    if (!dualBalance.eligible) {
      return {
        eligible: false,
        reason: `Wallet ${dualBalance.exceededType} FOGO balance exceeds 10 tokens`,
        txnCount,
        proposedAmount: "0",
        balanceExceeded: true,
        remainingPool: "N/A",
        nativeFogo: dualBalance.nativeFogo,
        splFogo: dualBalance.splFogo,
        totalFogo: dualBalance.totalFogo
      };
    }

    const eligibilityResult = await storage.getEligibleClaimAmount(txnCount, walletBalance.toString());
    
    if (!eligibilityResult.eligible || parseFloat(eligibilityResult.amount) <= 0) {
      return {
        eligible: false,
        reason: eligibilityResult.reason || "Not eligible for claims or daily pool exhausted",
        txnCount,
        proposedAmount: "0",
        balanceExceeded: false,
        remainingPool: "0",
        nativeFogo: dualBalance.nativeFogo,
        splFogo: dualBalance.splFogo,
        totalFogo: dualBalance.totalFogo
      };
    }

    const remainingPool = await storage.getRemainingDailyPool();
    
    return {
      eligible: true,
      reason: "Wallet is eligible for claim",
      txnCount,
      proposedAmount: eligibilityResult.amount,
      balanceExceeded: false,
      remainingPool: remainingPool.remaining,
      nativeFogo: dualBalance.nativeFogo,
      splFogo: dualBalance.splFogo,
      totalFogo: dualBalance.totalFogo
    };
  } catch (error) {
    console.error("Eligibility check failed:", error);
    throw error;
  }
};

const getTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  return `${Math.floor(diffInSeconds / 86400)}d ago`;
};

// Validation schemas
const checkEligibilitySchema = z.object({
  walletAddress: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid Solana address format"),
});

const claimTokensSchema = z.object({
  walletAddress: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid Solana address format"),
});

// Create Express app for routing
const app = express();
app.use(express.json());

// API Routes

// Faucet Status
app.get('/api/faucet/status', async (req, res) => {
  try {
    const cacheKey = "faucet-status";
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      res.json(cached);
      return;
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
});

// Check Eligibility
app.post('/api/faucet/check-eligibility', async (req, res) => {
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
      console.warn(`Eligibility check timed out for ${walletAddress}`);
      
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
});

// Claim Tokens
app.post('/api/faucet/claim', async (req, res) => {
  try {
    const { walletAddress } = claimTokensSchema.parse(req.body);
    
    const config = await storage.getFaucetConfig();
    if (!config || !config.isActive) {
      return res.status(400).json({ error: "Faucet is currently inactive" });
    }
    
    const dualBalanceCheck = await checkDualFogoEligibility(walletAddress);
    if (!dualBalanceCheck.eligible) {
      const balanceType = dualBalanceCheck.exceededType === "native" ? "native FOGO" : "SPL FOGO";
      return res.status(400).json({ 
        error: `Wallet ${balanceType} balance exceeds 10 tokens (Native: ${dualBalanceCheck.nativeFogo}, SPL: ${dualBalanceCheck.splFogo})` 
      });
    }
    
    const txnCount = await getRealTransactionCount(walletAddress);
    const walletBalance = await getRealWalletBalance(walletAddress);
    
    const claimResult = await storage.processClaimAtomic({
      walletAddress,
      amount: "0",
      status: "pending"
    }, txnCount, walletBalance.toString());
    
    if (!claimResult.success) {
      return res.status(400).json({ error: claimResult.error });
    }
    
    const claim = claimResult.claim!;
    const claimedAmount = claim.amount;
    
    const bonusCalculation = await storage.calculateBonusAmount(claimedAmount);
    const bonusAmount = bonusCalculation.bonusAmount;
    const conversionRate = bonusCalculation.conversionRate;
    
    let bonusClaim: any = null;
    try {
      const bonusClaimResult = await storage.processBonusClaimAtomic({
        walletAddress,
        fogoAmount: claimedAmount,
        bonusAmount,
        conversionRate,
        status: "pending",
        relatedClaimId: claim.id
      });
      
      if (bonusClaimResult.success) {
        bonusClaim = bonusClaimResult.bonusClaim;
      }
    } catch (error) {
      console.error("Failed to create bonus claim:", error);
    }

    // Process blockchain transactions
    let fogoTxHash: string | null = null;
    let bonusTxHash: string | null = null;
    let fogoSuccess = false;
    let bonusSuccess = false;
    
    try {
      fogoTxHash = await web3Service.sendTokens(walletAddress, claimedAmount);
      fogoSuccess = true;
      
      if (bonusClaim) {
        try {
          bonusTxHash = await web3Service.sendBonusTokens(walletAddress, bonusAmount);
          bonusSuccess = true;
        } catch (bonusError) {
          console.error(`Failed to send bonus tokens:`, bonusError);
          bonusSuccess = false;
        }
      }
      
      await storage.finalizeClaim(claim.id, { success: fogoSuccess, txHash: fogoTxHash });
      
      if (bonusClaim) {
        await storage.finalizeBonusClaim(bonusClaim.id, { success: bonusSuccess, txHash: bonusTxHash });
      }
      
      return res.json({ 
        claimId: claim.id, 
        amount: claimedAmount,
        bonusClaimId: bonusClaim?.id,
        bonusAmount,
        remaining: claimResult.remaining || "0",
        transactionHash: fogoTxHash,
        bonusTransactionHash: bonusTxHash,
        success: fogoSuccess,
        bonusSuccess,
        message: "Claim processed successfully" 
      });
      
    } catch (error) {
      console.error(`Failed to complete claim:`, error);
      
      await storage.finalizeClaim(claim.id, { success: false, txHash: fogoTxHash });
      
      if (bonusClaim) {
        await storage.finalizeBonusClaim(bonusClaim.id, { success: false, txHash: bonusTxHash });
      }
      
      return res.status(500).json({ 
        error: "Failed to process blockchain transactions",
        claimId: claim.id,
        amount: claimedAmount
      });
    }
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid request format" });
    }
    console.error("Claim error:", error);
    res.status(500).json({ error: "Failed to process claim" });
  }
});

// Wallet Check
app.post('/api/wallet/check', async (req, res) => {
  try {
    const { walletAddress } = checkEligibilitySchema.parse(req.body);
    
    try {
      const walletResult = await web3Service.checkWallet(walletAddress);
      res.json(walletResult);
    } catch (error: any) {
      console.error(`Enhanced wallet check failed for ${walletAddress}:`, error);
      
      res.status(500).json({
        success: false,
        error: "Failed to check wallet",
        details: error.message,
        wallet: walletAddress
      });
    }
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid wallet address format",
        details: error.errors
      });
    }
    console.error("Enhanced wallet check validation error:", error);
    res.status(500).json({ 
      success: false,
      error: "Request validation failed" 
    });
  }
});

// Wallet Balances
app.post('/api/wallet/balances', async (req, res) => {
  try {
    const { walletAddress } = checkEligibilitySchema.parse(req.body);
    
    try {
      const balanceResult = await web3Service.getEnhancedFogoBalances(walletAddress);
      
      res.json({
        success: true,
        wallet: walletAddress,
        balances: balanceResult
      });
      
    } catch (error: any) {
      console.error(`Enhanced balance check failed for ${walletAddress}:`, error);
      
      res.status(500).json({
        success: false,
        error: "Failed to check balances",
        details: error.message,
        wallet: walletAddress
      });
    }
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false,
        error: "Invalid wallet address format",
        details: error.errors
      });
    }
    console.error("Enhanced balance check validation error:", error);
    res.status(500).json({ 
      success: false,
      error: "Request validation failed" 
    });
  }
});

// Recent Claims
app.get('/api/claims/recent', async (req, res) => {
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
});

// Bonus Stats
app.get('/api/bonus/stats', async (req, res) => {
  try {
    const stats = await storage.getBonusDistributionStats();
    const totalBonusDistributed = await storage.getTotalBonusDistributed();
    
    res.json({
      totalBonusDistributed,
      totalBonusClaims: stats?.totalBonusClaims || 0,
      lastUpdated: stats?.lastUpdated || null,
      conversionRate: getFogoToBonusRate(),
      bonusTokenMint: getBonusTokenMint()
    });
  } catch (error) {
    console.error("Bonus stats error:", error);
    res.status(500).json({ error: "Failed to get bonus distribution stats" });
  }
});

// General Stats
app.get('/api/stats', async (req, res) => {
  try {
    const cacheKey = "general-stats";
    const cached = getFromCache(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }

    const [totalClaims, totalUsers, totalDistributed, totalBonusDistributed] = await Promise.all([
      storage.getTotalClaims(),
      storage.getTotalUsers(),
      storage.getTotalDistributed(),
      storage.getTotalBonusDistributed()
    ]);
    
    const stats = {
      totalClaims,
      totalUsers,
      totalDistributed,
      totalBonusDistributed,
      lastUpdated: new Date().toISOString()
    };

    setCache(cacheKey, stats, 10);
    res.json(stats);
  } catch (error) {
    console.error("Stats error:", error);
    res.status(500).json({ error: "Failed to get statistics" });
  }
});

// Leaderboard
app.get('/api/leaderboard', async (req, res) => {
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
});

// Chart Stats
app.get('/api/stats/chart', async (req, res) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const chartData = await storage.getClaimStats();
    
    res.json(chartData);
  } catch (error) {
    console.error("Chart stats error:", error);
    res.status(500).json({ error: "Failed to get chart data" });
  }
});

// Recent Activity - using recent claims as activity
app.get('/api/activity/recent', async (req, res) => {
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
});

// Debug endpoint to test database connection
app.get('/api/debug/database', async (req, res) => {
  try {
    // Simple database test
    const { getDb } = await import('../lib/db');
    const db = getDb();
    
    // Try a simple query
    const result = await db.execute(sql`SELECT 1 as test`);
    
    res.json({
      success: true,
      message: "Database connection successful",
      envVarsPresent: {
        DATABASE_URL: !!process.env.DATABASE_URL,
        POSTGRES_URL: !!process.env.POSTGRES_URL
      },
      result: result.rows
    });
  } catch (error: any) {
    console.error("Database debug error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Database connection failed",
      envVarsPresent: {
        DATABASE_URL: !!process.env.DATABASE_URL,
        POSTGRES_URL: !!process.env.POSTGRES_URL
      }
    });
  }
});

// Main handler for Vercel
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  return new Promise((resolve, reject) => {
    // Use Express app to handle the request
    app(req as any, res as any, (err: any) => {
      if (err) {
        console.error('Express app error:', err);
        res.status(500).json({ error: 'Internal server error' });
        return resolve(res);
      }
      
      // If no route was matched, return 404
      if (!res.headersSent) {
        res.status(404).json({ error: 'Not found' });
      }
      resolve(res);
    });
  });
}