// API client utilities for faucet backend

export interface FaucetStatus {
  balance: string;
  dailyLimit: string;
  isActive: boolean;
  lastRefill: string;
  totalClaims: number;
  totalUsers: number;
  totalDistributed: string;
  nextRefill: string;
}

export interface EligibilityCheck {
  eligible: boolean;
  reason?: string;
  resetTime?: string;
}

export interface ClaimResponse {
  claimId: string;
  status: string;
  amount: number;
  message: string;
}

export interface RecentClaim {
  id: string;
  walletAddress: string;
  amount: string;
  status: "pending" | "success" | "failed";
  transactionHash: string | null;
  timestamp: string;
  timeAgo: string;
}

export interface Stats {
  totalClaims: number;
  totalUsers: number;
  totalDistributed: string;
  faucetBalance: string;
  dailyLimit: string;
  isActive: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  walletAddress: string;
  claims: number;
  totalAmount: string;
  lastClaim: string;
  lastClaimAgo: string;
}

export interface ChartData {
  date: string;
  claims: number;
  users: number;
}

// API functions
export const faucetApi = {
  // Get faucet status
  getStatus: async (): Promise<FaucetStatus> => {
    const response = await fetch("/api/faucet/status");
    if (!response.ok) {
      throw new Error("Failed to fetch faucet status");
    }
    return response.json();
  },

  // Check wallet eligibility
  checkEligibility: async (walletAddress: string): Promise<EligibilityCheck> => {
    const response = await fetch("/api/faucet/check-eligibility", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ walletAddress }),
    });
    if (!response.ok) {
      throw new Error("Failed to check eligibility");
    }
    return response.json();
  },

  // Claim tokens
  claimTokens: async (walletAddress: string, amount: string): Promise<ClaimResponse> => {
    const response = await fetch("/api/faucet/claim", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ walletAddress, amount }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to claim tokens");
    }
    return response.json();
  },

  // Get recent claims
  getRecentClaims: async (limit = 20): Promise<RecentClaim[]> => {
    const response = await fetch(`/api/claims/recent?limit=${limit}`);
    if (!response.ok) {
      throw new Error("Failed to fetch recent claims");
    }
    return response.json();
  },

  // Get statistics
  getStats: async (): Promise<Stats> => {
    const response = await fetch("/api/stats");
    if (!response.ok) {
      throw new Error("Failed to fetch statistics");
    }
    return response.json();
  },

  // Get leaderboard
  getLeaderboard: async (limit = 10): Promise<LeaderboardEntry[]> => {
    const response = await fetch(`/api/leaderboard?limit=${limit}`);
    if (!response.ok) {
      throw new Error("Failed to fetch leaderboard");
    }
    return response.json();
  },

  // Get chart data
  getChartData: async (): Promise<ChartData[]> => {
    const response = await fetch("/api/stats/chart");
    if (!response.ok) {
      throw new Error("Failed to fetch chart data");
    }
    return response.json();
  },
};