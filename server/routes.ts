import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertClaimSchema, insertRateLimitSchema } from "@shared/schema";
import { z } from "zod";
import { createHash } from "crypto";
import { web3Service } from "./web3Service";

// Helper functions for Fogo testnet faucet

const computeProposedAmount = (txCount: number): string => {
  if (txCount >= 1000) return "3";
  if (txCount >= 400) return "2";
  if (txCount >= 80) return "1";
  return "0.1";
};

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

// Enhanced eligibility helper with Fogo rules
const isEligibleForClaim = async (walletAddress: string): Promise<{ 
  eligible: boolean; 
  reason?: string; 
  resetTime?: Date; 
  txnCount: number; 
  proposedAmount: string; 
  balanceExceeded: boolean; 
}> => {
  // Get real transaction count and proposed amount
  const txnCount = await getRealTransactionCount(walletAddress);
  const proposedAmount = computeProposedAmount(txnCount);
  
  // Check real wallet balance (10 FOGO maximum)
  const walletBalance = await getRealWalletBalance(walletAddress);
  const balanceExceeded = walletBalance > 10;
  
  if (balanceExceeded) {
    return {
      eligible: false,
      reason: "Wallet balance exceeds 10 FOGO",
      txnCount,
      proposedAmount,
      balanceExceeded: true
    };
  }

  // Check for pending claims first to prevent concurrent claims
  const pendingClaims = await storage.getPendingClaimsByWallet(walletAddress);
  if (pendingClaims.length > 0) {
    return { 
      eligible: false, 
      reason: "You have a pending claim. Please wait for it to complete before making another claim.",
      txnCount,
      proposedAmount,
      balanceExceeded: false
    };
  }

  const rateLimit = await storage.getRateLimit(walletAddress);
  const now = new Date();
  
  if (!rateLimit) {
    return { 
      eligible: true, 
      txnCount, 
      proposedAmount, 
      balanceExceeded: false 
    };
  }
  
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
      proposedAmount,
      balanceExceeded: false
    };
  }
  
  return { 
    eligible: true, 
    txnCount, 
    proposedAmount, 
    balanceExceeded: false 
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

  // Claim tokens endpoint
  app.post("/api/faucet/claim", async (req, res) => {
    try {
      const { walletAddress } = claimTokensSchema.parse(req.body);
      
      const config = await storage.getFaucetConfig();
      if (!config || !config.isActive) {
        return res.status(400).json({ error: "Faucet is currently inactive" });
      }
      
      // Check eligibility and get computed amount
      const eligibility = await isEligibleForClaim(walletAddress);
      
      if (!eligibility.eligible) {
        return res.status(400).json({ error: eligibility.reason || "Not eligible to claim" });
      }
      
      // Use server-computed amount
      const amount = eligibility.proposedAmount;
      const requestedAmount = parseFloat(amount);
      
      // Check faucet balance
      const currentBalance = parseFloat(config.balance);
      if (currentBalance < requestedAmount) {
        return res.status(400).json({ error: "Insufficient faucet balance" });
      }
      
      // Atomically create claim if no pending claims exist
      const claimResult = await storage.createClaimIfNoPending({
        walletAddress,
        amount,
        status: "pending"
      });
      
      if (!claimResult.success) {
        return res.status(400).json({ error: claimResult.error });
      }
      
      const claim = claimResult.claim!;
      
      // Process real blockchain transaction
      setTimeout(async () => {
        let balanceAdjusted = false;
        let rateLimitSnapshot: any = null;
        let rateLimitUpdated = false;
        let transactionHash: string | null = null;
        
        try {
          // Send real blockchain transaction
          transactionHash = await web3Service.sendTokens(walletAddress, amount);
          console.log(`Real blockchain transaction sent: ${transactionHash}`);
          
          // Step 1: Atomically adjust faucet balance (negative delta to deduct)
          const balanceResult = await storage.adjustFaucetBalance(-requestedAmount);
          if (!balanceResult.success) {
            throw new Error(balanceResult.error || "Failed to adjust faucet balance");
          }
          balanceAdjusted = true;
          
          // Step 2: Snapshot rate limit for potential rollback, then update
          rateLimitSnapshot = await storage.snapshotRateLimit(walletAddress);
          
          const existingRateLimit = await storage.getRateLimit(walletAddress);
          const now = new Date();
          const resetDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
          
          let newClaimCount = 1;
          if (existingRateLimit) {
            // Reset count if 24 hours have passed, otherwise increment
            const timeSinceLastClaim = now.getTime() - existingRateLimit.lastClaim.getTime();
            const twentyFourHours = 24 * 60 * 60 * 1000;
            newClaimCount = timeSinceLastClaim >= twentyFourHours ? 1 : existingRateLimit.claimCount + 1;
          }
          
          await storage.createOrUpdateRateLimit({
            walletAddress,
            claimCount: newClaimCount,
            resetDate
          });
          rateLimitUpdated = true;
          
          // Step 3: Mark claim as successful (final step)
          await storage.updateClaimStatus(claim.id, "success", transactionHash);
          
          console.log(`Claim ${claim.id} completed successfully with blockchain tx: ${transactionHash}`);
        } catch (error) {
          console.error(`Failed to complete claim ${claim.id}:`, error);
          
          // Rollback operations in reverse order
          if (rateLimitUpdated && rateLimitSnapshot) {
            try {
              await storage.restoreRateLimit(rateLimitSnapshot);
              console.log(`Rolled back rate limit for failed claim ${claim.id}`);
            } catch (rollbackError) {
              console.error(`Critical: Failed to rollback rate limit for claim ${claim.id}:`, rollbackError);
            }
          }
          
          if (balanceAdjusted) {
            // Rollback balance adjustment
            try {
              await storage.adjustFaucetBalance(requestedAmount); // Add back the amount
              console.log(`Rolled back balance adjustment for failed claim ${claim.id}`);
            } catch (rollbackError) {
              console.error(`Critical: Failed to rollback balance for claim ${claim.id}:`, rollbackError);
            }
          }
          
          // Mark claim as failed
          await storage.updateClaimStatus(claim.id, "failed");
        }
      }, 2000); // 2 second delay to simulate blockchain processing
      
      res.json({
        claimId: claim.id,
        status: "pending",
        amount: requestedAmount,
        message: "Claim submitted successfully. Processing on blockchain..."
      });
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