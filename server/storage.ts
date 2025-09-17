import { type User, type InsertUser, type Claim, type InsertClaim, type FaucetConfig, type InsertFaucetConfig, type RateLimit, type InsertRateLimit } from "@shared/schema";
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
  
  // Rate limiting operations
  getRateLimit(walletAddress: string): Promise<RateLimit | undefined>;
  createOrUpdateRateLimit(rateLimit: InsertRateLimit): Promise<RateLimit>;
  
  // Faucet configuration
  getFaucetConfig(): Promise<FaucetConfig | undefined>;
  updateFaucetConfig(config: Partial<InsertFaucetConfig>): Promise<FaucetConfig | undefined>;
  
  // Analytics
  getTotalClaims(): Promise<number>;
  getTotalUsers(): Promise<number>;
  getTotalDistributed(): Promise<string>;
  getLeaderboard(limit?: number): Promise<Array<{ walletAddress: string; claims: number; totalAmount: string; lastClaim: Date }>>;
  getClaimStats(): Promise<Array<{ date: string; claims: number; users: number }>>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private claims: Map<string, Claim>;
  private rateLimits: Map<string, RateLimit>;
  private faucetConfig: FaucetConfig | undefined;

  constructor() {
    this.users = new Map();
    this.claims = new Map();
    this.rateLimits = new Map();
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

  // Rate limiting operations
  async getRateLimit(walletAddress: string): Promise<RateLimit | undefined> {
    return this.rateLimits.get(walletAddress.toLowerCase());
  }

  async createOrUpdateRateLimit(insertRateLimit: InsertRateLimit): Promise<RateLimit> {
    const id = randomUUID();
    const rateLimit: RateLimit = {
      ...insertRateLimit,
      id,
      lastClaim: new Date(),
      claimCount: insertRateLimit.claimCount || 1,
      walletAddress: insertRateLimit.walletAddress.toLowerCase()
    };
    this.rateLimits.set(rateLimit.walletAddress, rateLimit);
    return rateLimit;
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