import { type User, type InsertUser, type Claim, type InsertClaim, type FaucetConfig, type InsertFaucetConfig, type RateLimit, type InsertRateLimit, type WalletEligibility, type InsertWalletEligibility } from "@shared/schema";
import { randomUUID } from "crypto";

// Storage interface for faucet operations
export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Claim operations
  createClaim(claim: InsertClaim): Promise<Claim>;
  getClaimsByWallet(walletAddress: string): Promise<Claim[]>;
  getRecentClaims(limit?: number): Promise<Claim[]>;
  updateClaimStatus(id: string, status: string, transactionHash?: string): Promise<Claim | undefined>;
  getPendingClaimsByWallet(walletAddress: string): Promise<Claim[]>;
  createClaimIfNoPending(claim: InsertClaim): Promise<{ success: boolean; claim?: Claim; error?: string }>;
  
  // Rate limiting operations
  getRateLimit(walletAddress: string): Promise<RateLimit | undefined>;
  createOrUpdateRateLimit(rateLimit: InsertRateLimit): Promise<RateLimit>;
  snapshotRateLimit(walletAddress: string): Promise<RateLimit | undefined>;
  restoreRateLimit(snapshot: RateLimit): Promise<void>;
  
  // Faucet configuration
  getFaucetConfig(): Promise<FaucetConfig | undefined>;
  updateFaucetConfig(config: Partial<InsertFaucetConfig>): Promise<FaucetConfig | undefined>;
  adjustFaucetBalance(delta: number): Promise<{ success: boolean; newBalance?: string; error?: string }>;
  
  // Wallet eligibility operations
  getWalletEligibility(walletAddress: string): Promise<WalletEligibility | undefined>;
  upsertWalletEligibility(eligibility: InsertWalletEligibility): Promise<WalletEligibility>;
  
  // Analytics
  getTotalClaims(): Promise<number>;
  getTotalUsers(): Promise<number>;
  getTotalDistributed(): Promise<string>;
  getWalletTotalDistributed(walletAddress: string): Promise<string>;
  getLeaderboard(limit?: number): Promise<Array<{ walletAddress: string; claims: number; totalAmount: string; lastClaim: Date }>>;
  getClaimStats(): Promise<Array<{ date: string; claims: number; users: number }>>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private claims: Map<string, Claim>;
  private rateLimits: Map<string, RateLimit>;
  private walletEligibilities: Map<string, WalletEligibility>;
  private faucetConfig: FaucetConfig | undefined;

  constructor() {
    this.users = new Map();
    this.claims = new Map();
    this.rateLimits = new Map();
    this.walletEligibilities = new Map();
    // Initialize default faucet config
    this.faucetConfig = {
      id: randomUUID(),
      balance: "1000000",
      dailyLimit: "100",
      isActive: true,
      lastRefill: new Date(),
      updatedAt: new Date()
    };
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Claim operations
  async createClaim(insertClaim: InsertClaim): Promise<Claim> {
    const id = randomUUID();
    const claim: Claim = {
      ...insertClaim,
      id,
      status: insertClaim.status || "pending",
      transactionHash: insertClaim.transactionHash || null,
      ipAddress: insertClaim.ipAddress || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.claims.set(id, claim);
    return claim;
  }

  async getClaimsByWallet(walletAddress: string): Promise<Claim[]> {
    return Array.from(this.claims.values()).filter(
      (claim) => claim.walletAddress.toLowerCase() === walletAddress.toLowerCase()
    );
  }

  async getRecentClaims(limit = 10): Promise<Claim[]> {
    return Array.from(this.claims.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async updateClaimStatus(id: string, status: string, transactionHash?: string): Promise<Claim | undefined> {
    const claim = this.claims.get(id);
    if (claim) {
      const updatedClaim = {
        ...claim,
        status: status as "pending" | "success" | "failed",
        transactionHash: transactionHash || claim.transactionHash,
        updatedAt: new Date()
      };
      this.claims.set(id, updatedClaim);
      return updatedClaim;
    }
    return undefined;
  }

  async getPendingClaimsByWallet(walletAddress: string): Promise<Claim[]> {
    return Array.from(this.claims.values()).filter(
      (claim) => claim.walletAddress.toLowerCase() === walletAddress.toLowerCase() && claim.status === "pending"
    );
  }

  async createClaimIfNoPending(insertClaim: InsertClaim): Promise<{ success: boolean; claim?: Claim; error?: string }> {
    const walletAddress = insertClaim.walletAddress.toLowerCase();
    
    // Atomic check for pending claims and create new claim if none exist
    const existingPendingClaims = Array.from(this.claims.values()).filter(
      (claim) => claim.walletAddress.toLowerCase() === walletAddress && claim.status === "pending"
    );
    
    if (existingPendingClaims.length > 0) {
      return { 
        success: false, 
        error: "You have a pending claim. Please wait for it to complete before making another claim." 
      };
    }
    
    // No pending claims, create new one
    const id = randomUUID();
    const claim: Claim = {
      ...insertClaim,
      id,
      status: insertClaim.status || "pending",
      transactionHash: insertClaim.transactionHash || null,
      ipAddress: insertClaim.ipAddress || null,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.claims.set(id, claim);
    
    return { success: true, claim };
  }

  // Rate limiting operations
  async getRateLimit(walletAddress: string): Promise<RateLimit | undefined> {
    return this.rateLimits.get(walletAddress.toLowerCase());
  }

  async createOrUpdateRateLimit(insertRateLimit: InsertRateLimit): Promise<RateLimit> {
    const walletAddress = insertRateLimit.walletAddress.toLowerCase();
    const existingRateLimit = this.rateLimits.get(walletAddress);
    
    if (existingRateLimit) {
      // Update existing rate limit
      const updatedRateLimit: RateLimit = {
        ...existingRateLimit,
        lastClaim: new Date(),
        claimCount: insertRateLimit.claimCount || existingRateLimit.claimCount,
        resetDate: insertRateLimit.resetDate
      };
      this.rateLimits.set(walletAddress, updatedRateLimit);
      return updatedRateLimit;
    } else {
      // Create new rate limit
      const id = randomUUID();
      const rateLimit: RateLimit = {
        ...insertRateLimit,
        id,
        lastClaim: new Date(),
        claimCount: insertRateLimit.claimCount || 1,
        walletAddress: walletAddress
      };
      this.rateLimits.set(walletAddress, rateLimit);
      return rateLimit;
    }
  }

  async snapshotRateLimit(walletAddress: string): Promise<RateLimit | undefined> {
    const rateLimit = this.rateLimits.get(walletAddress.toLowerCase());
    return rateLimit ? { ...rateLimit } : undefined; // Return a copy
  }

  async restoreRateLimit(snapshot: RateLimit): Promise<void> {
    this.rateLimits.set(snapshot.walletAddress.toLowerCase(), { ...snapshot });
  }

  // Faucet configuration
  async getFaucetConfig(): Promise<FaucetConfig | undefined> {
    return this.faucetConfig;
  }

  async updateFaucetConfig(config: Partial<InsertFaucetConfig>): Promise<FaucetConfig | undefined> {
    if (this.faucetConfig) {
      this.faucetConfig = {
        ...this.faucetConfig,
        ...config,
        updatedAt: new Date()
      };
    }
    return this.faucetConfig;
  }

  // Atomic balance adjustment to prevent race conditions
  async adjustFaucetBalance(delta: number): Promise<{ success: boolean; newBalance?: string; error?: string }> {
    if (!this.faucetConfig) {
      return { success: false, error: "Faucet configuration not found" };
    }

    const currentBalance = parseFloat(this.faucetConfig.balance);
    const newBalance = currentBalance + delta;

    if (newBalance < 0) {
      return { success: false, error: "Insufficient balance for this operation" };
    }

    this.faucetConfig = {
      ...this.faucetConfig,
      balance: newBalance.toFixed(8),
      updatedAt: new Date()
    };

    return { success: true, newBalance: newBalance.toFixed(8) };
  }

  // Wallet eligibility operations
  async getWalletEligibility(walletAddress: string): Promise<WalletEligibility | undefined> {
    return this.walletEligibilities.get(walletAddress.toLowerCase());
  }

  async upsertWalletEligibility(insertEligibility: InsertWalletEligibility): Promise<WalletEligibility> {
    const walletAddress = insertEligibility.walletAddress.toLowerCase();
    const existing = this.walletEligibilities.get(walletAddress);
    
    const eligibility: WalletEligibility = {
      walletAddress,
      isEligible: insertEligibility.isEligible ?? true,
      lastClaimAt: insertEligibility.lastClaimAt || existing?.lastClaimAt || null,
      transactionCount: insertEligibility.transactionCount ?? 0,
      createdAt: existing?.createdAt || new Date(),
      updatedAt: new Date()
    };
    
    this.walletEligibilities.set(walletAddress, eligibility);
    return eligibility;
  }

  // Analytics
  async getTotalClaims(): Promise<number> {
    return this.claims.size;
  }

  async getTotalUsers(): Promise<number> {
    const uniqueWallets = new Set(
      Array.from(this.claims.values()).map(claim => claim.walletAddress.toLowerCase())
    );
    return uniqueWallets.size;
  }

  async getTotalDistributed(): Promise<string> {
    const total = Array.from(this.claims.values())
      .filter(claim => claim.status === "success")
      .reduce((sum, claim) => sum + parseFloat(claim.amount), 0);
    return total.toFixed(8);
  }

  async getWalletTotalDistributed(walletAddress: string): Promise<string> {
    const total = Array.from(this.claims.values())
      .filter(claim => claim.walletAddress.toLowerCase() === walletAddress.toLowerCase() && claim.status === "success")
      .reduce((sum, claim) => sum + parseFloat(claim.amount), 0);
    return total.toFixed(8);
  }

  async getLeaderboard(limit = 10): Promise<Array<{ walletAddress: string; claims: number; totalAmount: string; lastClaim: Date }>> {
    const walletStats = new Map<string, { claims: number; totalAmount: number; lastClaim: Date }>();
    
    Array.from(this.claims.values())
      .filter(claim => claim.status === "success")
      .forEach(claim => {
        const wallet = claim.walletAddress.toLowerCase();
        const existing = walletStats.get(wallet) || { claims: 0, totalAmount: 0, lastClaim: claim.createdAt };
        walletStats.set(wallet, {
          claims: existing.claims + 1,
          totalAmount: existing.totalAmount + parseFloat(claim.amount),
          lastClaim: claim.createdAt > existing.lastClaim ? claim.createdAt : existing.lastClaim
        });
      });
    
    return Array.from(walletStats.entries())
      .map(([walletAddress, stats]) => ({
        walletAddress,
        claims: stats.claims,
        totalAmount: stats.totalAmount.toFixed(8),
        lastClaim: stats.lastClaim
      }))
      .sort((a, b) => b.claims - a.claims)
      .slice(0, limit);
  }

  async getClaimStats(): Promise<Array<{ date: string; claims: number; users: number }>> {
    const dailyStats = new Map<string, { claims: number; users: Set<string> }>();
    
    Array.from(this.claims.values()).forEach(claim => {
      const date = claim.createdAt.toISOString().split('T')[0];
      const existing = dailyStats.get(date) || { claims: 0, users: new Set() };
      existing.claims++;
      existing.users.add(claim.walletAddress.toLowerCase());
      dailyStats.set(date, existing);
    });
    
    return Array.from(dailyStats.entries())
      .map(([date, stats]) => ({
        date,
        claims: stats.claims,
        users: stats.users.size
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7); // Last 7 days
  }
}

export const storage = new MemStorage();