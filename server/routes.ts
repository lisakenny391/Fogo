import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertClaimSchema, insertRateLimitSchema } from "@shared/schema";
import { z } from "zod";
import { createHash } from "crypto";
import { web3Service } from "./web3Service";
import { fogoToBonusRate, bonusTokenMint } from "./config";

// Helper functions for Fogo testnet faucet

// DEPRECATED: Removed in favor of storage.getEligibleClaimAmount
// This function used incorrect tiers - new atomic method implements correct tiers

const getRealWalletBalance = async (address: string): Promise<number> => {
  try {
    const balance = await web3Service.getWalletBalance(address);
    return parseFloat(balance);
  } catch (error) {
    console.error("Failed to get real wallet balance - RPC unavailable:", error);
    // Security: Don't allow claims if we can't verify blockchain balance
    throw new Error("Unable to verify wallet balance - blockchain RPC unavailable");
  }
};

const checkDualFogoEligibility = async (address: string): Promise<{
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
    // Security: Don't allow claims if we can't verify blockchain balance
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

// Validation schemas - Using Solana address format
const checkEligibilitySchema = z.object({
  walletAddress: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid Solana address format"),
});

const claimTokensSchema = z.object({
  walletAddress: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, "Invalid Solana address format"),
});

// Enhanced eligibility helper with Fogo rules - now uses dual FOGO balance checking
const isEligibleForClaim = async (walletAddress: string): Promise<{ 
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
  // Get real transaction count and dual FOGO balance check
  const txnCount = await getRealTransactionCount(walletAddress);
  const dualBalanceCheck = await checkDualFogoEligibility(walletAddress);
  
  // Use native FOGO balance for legacy storage compatibility
  const walletBalance = parseFloat(dualBalanceCheck.nativeFogo);
  
  // Use storage method for correct tier calculation and daily pool checks
  const eligibilityResult = await storage.getEligibleClaimAmount(txnCount, walletBalance.toString());
  const poolStatus = await storage.getRemainingDailyPool();
  
  // Check if either native or SPL FOGO balance exceeds 10
  const balanceExceeded = !dualBalanceCheck.eligible;
  
  // First check if dual balance check failed (either token type exceeds 10)
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

  // Check for pending claims (redundant check as storage method handles this, but kept for rate limiting)
  const rateLimit = await storage.getRateLimit(walletAddress);
  const now = new Date();
  
  if (rateLimit) {
    // Check if 24 hours have passed since last claim
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

export async function registerRoutes(app: Express): Promise<Server> {
  // Perform blockchain health check on startup
  console.log("Performing blockchain connectivity check...");
  const healthCheck = await web3Service.healthCheck();
  if (!healthCheck.isReady) {
    console.error("❌ Blockchain connectivity failed:", healthCheck.error);
    console.warn("⚠️ Faucet will operate with limited functionality - claims will fail");
  } else {
    console.log("✅ Blockchain connection established successfully");
  }
  // Faucet status endpoint
  app.get("/api/faucet/status", async (req, res) => {
    try {
      const config = await storage.getFaucetConfig();
      if (!config) {
        return res.status(500).json({ error: "Faucet configuration not found" });
      }
      
      const totalClaims = await storage.getTotalClaims();
      const totalUsers = await storage.getTotalUsers();
      const totalDistributed = await storage.getTotalDistributed();
      
      // Try to get real faucet balance from blockchain, fallback to config
      let faucetBalance = config.balance;
      try {
        const realBalance = await web3Service.getFaucetBalance();
        faucetBalance = realBalance;
        console.log(`Real faucet balance: ${realBalance} FOGO`);
      } catch (error) {
        console.warn("Failed to get real faucet balance, using config:", error);
      }
      
      res.json({
        balance: faucetBalance,
        dailyLimit: config.dailyLimit,
        isActive: config.isActive,
        lastRefill: config.lastRefill,
        totalClaims,
        totalUsers,
        totalDistributed,
        nextRefill: new Date(config.lastRefill.getTime() + 24 * 60 * 60 * 1000) // Next refill 24h after last refill
      });
    } catch (error) {
      console.error("Faucet status error:", error);
      res.status(500).json({ error: "Failed to get faucet status" });
    }
  });

  // Check eligibility endpoint
  app.post("/api/faucet/check-eligibility", async (req, res) => {
    try {
      const { walletAddress } = checkEligibilitySchema.parse(req.body);
      
      const config = await storage.getFaucetConfig();
      if (!config || !config.isActive) {
        return res.json({ 
          eligible: false, 
          reason: "Faucet is currently inactive" 
        });
      }
      
      const eligibility = await isEligibleForClaim(walletAddress);
      res.json(eligibility);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid wallet address format" });
      }
      console.error("Eligibility check error:", error);
      res.status(500).json({ error: "Failed to check eligibility" });
    }
  });

  // Claim tokens endpoint - now uses atomic processing with dual FOGO balance checking
  app.post("/api/faucet/claim", async (req, res) => {
    try {
      const { walletAddress } = claimTokensSchema.parse(req.body);
      
      const config = await storage.getFaucetConfig();
      if (!config || !config.isActive) {
        return res.status(400).json({ error: "Faucet is currently inactive" });
      }
      
      // CRITICAL: Check dual FOGO balance BEFORE processing claim to prevent bypass
      const dualBalanceCheck = await checkDualFogoEligibility(walletAddress);
      if (!dualBalanceCheck.eligible) {
        const balanceType = dualBalanceCheck.exceededType === "native" ? "native FOGO" : "SPL FOGO";
        return res.status(400).json({ 
          error: `Wallet ${balanceType} balance exceeds 10 tokens (Native: ${dualBalanceCheck.nativeFogo}, SPL: ${dualBalanceCheck.splFogo})` 
        });
      }
      
      // Get real wallet data for atomic processing
      const txnCount = await getRealTransactionCount(walletAddress);
      const walletBalance = await getRealWalletBalance(walletAddress);
      
      // Use atomic claim processing with correct tiers and daily pool management
      const claimResult = await storage.processClaimAtomic({
        walletAddress,
        amount: "0", // Will be computed atomically by processClaimAtomic
        status: "pending"
      }, txnCount, walletBalance.toString());
      
      if (!claimResult.success) {
        return res.status(400).json({ error: claimResult.error });
      }
      
      const claim = claimResult.claim!;
      const claimedAmount = claim.amount;
      
      // Calculate bonus amount based on FOGO tier
      const bonusCalculation = await storage.calculateBonusAmount(claimedAmount);
      const bonusAmount = bonusCalculation.bonusAmount;
      const conversionRate = bonusCalculation.conversionRate;
      
      // Create bonus claim linked to FOGO claim
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
        // Continue with FOGO claim even if bonus claim creation fails
      }

      // Return success immediately with claim info, then process blockchain transactions asynchronously
      res.json({ 
        claimId: claim.id, 
        amount: claimedAmount,
        bonusClaimId: bonusClaim?.id,
        bonusAmount,
        remaining: claimResult.remaining || "0",
        message: "Claim created successfully. Blockchain transactions processing..." 
      });
      
      // Process real blockchain transactions asynchronously
      setTimeout(async () => {
        let fogoTxHash: string | null = null;
        let bonusTxHash: string | null = null;
        let fogoSuccess = false;
        let bonusSuccess = false;
        
        try {
          // Send FOGO tokens first
          fogoTxHash = await web3Service.sendTokens(walletAddress, claimedAmount);
          console.log(`FOGO transaction sent: ${fogoTxHash}`);
          fogoSuccess = true;
          
          // Send bonus tokens if bonus claim was created
          if (bonusClaim) {
            try {
              bonusTxHash = await web3Service.sendBonusTokens(walletAddress, bonusAmount);
              console.log(`Bonus token transaction sent: ${bonusTxHash}`);
              bonusSuccess = true;
            } catch (bonusError) {
              console.error(`Failed to send bonus tokens for claim ${claim.id}:`, bonusError);
              bonusSuccess = false;
            }
          }
          
          // Finalize FOGO claim as successful
          await storage.finalizeClaim(claim.id, { success: fogoSuccess, txHash: fogoTxHash });
          
          // Finalize bonus claim if it was created
          if (bonusClaim) {
            await storage.finalizeBonusClaim(bonusClaim.id, { success: bonusSuccess, txHash: bonusTxHash });
          }
          
          console.log(`Claim ${claim.id} completed - FOGO: ${fogoSuccess ? 'success' : 'failed'}, Bonus: ${bonusSuccess ? 'success' : 'failed'}`);
        } catch (error) {
          console.error(`Failed to complete FOGO claim ${claim.id}:`, error);
          
          // Finalize FOGO claim as failed with compensation to restore daily pool
          await storage.finalizeClaim(claim.id, { success: false, txHash: fogoTxHash });
          
          // Finalize bonus claim as failed if it was created
          if (bonusClaim) {
            await storage.finalizeBonusClaim(bonusClaim.id, { success: false, txHash: bonusTxHash });
          }
        }
      }, 100); // Small delay to process blockchain transactions
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request format" });
      }
      console.error("Claim error:", error);
      res.status(500).json({ error: "Failed to process claim" });
    }
  });

  // Get recent claims
  app.get("/api/claims/recent", async (req, res) => {
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

  // Get bonus distribution stats - Dashboard endpoint for tracking total bonus distributed
  app.get("/api/bonus/stats", async (req, res) => {
    try {
      const stats = await storage.getBonusDistributionStats();
      const totalBonusDistributed = await storage.getTotalBonusDistributed();
      
      res.json({
        totalBonusDistributed,
        totalBonusClaims: stats?.totalBonusClaims || 0,
        lastUpdated: stats?.lastUpdated || null,
        conversionRate: fogoToBonusRate,
        bonusTokenMint: bonusTokenMint
      });
    } catch (error) {
      console.error("Bonus stats error:", error);
      res.status(500).json({ error: "Failed to get bonus distribution stats" });
    }
  });

  // Get recent bonus claims
  app.get("/api/bonus/claims/recent", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const bonusClaims = await storage.getBonusClaimsByWallet(""); // Get all recent bonus claims
      
      // Since getBonusClaimsByWallet filters by wallet, we need a different approach
      // For now, let's just return an empty array and mention this needs to be implemented differently
      res.json([]);
    } catch (error) {
      console.error("Recent bonus claims error:", error);
      res.status(500).json({ error: "Failed to get recent bonus claims" });
    }
  });

  // Get statistics
  app.get("/api/stats", async (req, res) => {
    try {
      const totalClaims = await storage.getTotalClaims();
      const totalUsers = await storage.getTotalUsers();
      const totalDistributed = await storage.getTotalDistributed();
      const config = await storage.getFaucetConfig();
      
      res.json({
        totalClaims,
        totalUsers,
        totalDistributed,
        faucetBalance: config?.balance || "0",
        dailyLimit: config?.dailyLimit || "100",
        isActive: config?.isActive || false
      });
    } catch (error) {
      console.error("Stats error:", error);
      res.status(500).json({ error: "Failed to get statistics" });
    }
  });

  // Get leaderboard
  app.get("/api/leaderboard", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const leaderboard = await storage.getLeaderboard(limit);
      
      const formattedLeaderboard = leaderboard.map((entry, index) => ({
        rank: index + 1,
        walletAddress: entry.walletAddress,
        claims: entry.claims,
        totalAmount: entry.totalAmount,
        lastClaim: entry.lastClaim,
        lastClaimAgo: getTimeAgo(entry.lastClaim)
      }));
      
      res.json(formattedLeaderboard);
    } catch (error) {
      console.error("Leaderboard error:", error);
      res.status(500).json({ error: "Failed to get leaderboard" });
    }
  });

  // Get chart data
  app.get("/api/stats/chart", async (req, res) => {
    try {
      const stats = await storage.getClaimStats();
      
      const formattedStats = stats.map(stat => ({
        date: new Date(stat.date).toLocaleDateString('en-US', { weekday: 'short' }),
        claims: stat.claims,
        users: stat.users
      }));
      
      res.json(formattedStats);
    } catch (error) {
      console.error("Chart data error:", error);
      res.status(500).json({ error: "Failed to get chart data" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Helper function to calculate time ago
function getTimeAgo(date: Date): string {
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
}