import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertClaimSchema, insertRateLimitSchema } from "@shared/schema";
import { z } from "zod";

// Validation schemas
const checkEligibilitySchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
});

const claimTokensSchema = z.object({
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid Ethereum address"),
  amount: z.string().regex(/^\d+(\.\d{1,8})?$/, "Invalid amount format"),
});

// Rate limiting helper
const isEligibleForClaim = async (walletAddress: string): Promise<{ eligible: boolean; reason?: string; resetTime?: Date }> => {
  const rateLimit = await storage.getRateLimit(walletAddress);
  const now = new Date();
  
  if (!rateLimit) {
    return { eligible: true };
  }
  
  // Check if 24 hours have passed since last claim
  const timeSinceLastClaim = now.getTime() - rateLimit.lastClaim.getTime();
  const twentyFourHours = 24 * 60 * 60 * 1000;
  
  if (timeSinceLastClaim < twentyFourHours) {
    const resetTime = new Date(rateLimit.lastClaim.getTime() + twentyFourHours);
    return { 
      eligible: false, 
      reason: "Daily limit reached. Please wait 24 hours between claims.",
      resetTime 
    };
  }
  
  return { eligible: true };
};

export async function registerRoutes(app: Express): Promise<Server> {
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
      
      res.json({
        balance: config.balance,
        dailyLimit: config.dailyLimit,
        isActive: config.isActive,
        lastRefill: config.lastRefill,
        totalClaims,
        totalUsers,
        totalDistributed,
        nextRefill: new Date(Date.now() + 24 * 60 * 60 * 1000) // Mock next refill
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
      const { walletAddress, amount } = claimTokensSchema.parse(req.body);
      
      const config = await storage.getFaucetConfig();
      if (!config || !config.isActive) {
        return res.status(400).json({ error: "Faucet is currently inactive" });
      }
      
      // Check eligibility
      const eligibility = await isEligibleForClaim(walletAddress);
      if (!eligibility.eligible) {
        return res.status(400).json({ error: eligibility.reason });
      }
      
      // Validate amount
      const requestedAmount = parseFloat(amount);
      const dailyLimit = parseFloat(config.dailyLimit);
      
      if (requestedAmount > dailyLimit) {
        return res.status(400).json({ 
          error: `Amount exceeds daily limit of ${config.dailyLimit} STT` 
        });
      }
      
      if (requestedAmount <= 0) {
        return res.status(400).json({ error: "Amount must be greater than 0" });
      }
      
      // Check faucet balance
      const currentBalance = parseFloat(config.balance);
      if (currentBalance < requestedAmount) {
        return res.status(400).json({ error: "Insufficient faucet balance" });
      }
      
      // Create claim record
      const claim = await storage.createClaim({
        walletAddress,
        amount,
        status: "pending"
      });
      
      // Update rate limit
      const resetDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await storage.createOrUpdateRateLimit({
        walletAddress,
        claimCount: 1,
        resetDate
      });
      
      // Simulate blockchain transaction (in real app, this would use ethers.js)
      setTimeout(async () => {
        try {
          // Mock transaction hash
          const mockTxHash = "0x" + Array.from({length: 64}, () => Math.floor(Math.random() * 16).toString(16)).join('');
          
          // Update claim status to success
          await storage.updateClaimStatus(claim.id, "success", mockTxHash);
          
          // Update faucet balance
          const newBalance = (currentBalance - requestedAmount).toFixed(8);
          await storage.updateFaucetConfig({ balance: newBalance });
          
          console.log(`Claim ${claim.id} completed successfully with tx: ${mockTxHash}`);
        } catch (error) {
          console.error(`Failed to complete claim ${claim.id}:`, error);
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