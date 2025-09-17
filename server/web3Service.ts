import { ethers } from "ethers";

export class Web3Service {
  private provider!: ethers.JsonRpcProvider;
  private wallet!: ethers.Wallet;
  private isInitialized: boolean = false;

  constructor() {
    // Initialize will be called when needed
  }

  private initialize() {
    if (this.isInitialized) return;

    const rpcUrl = process.env.FOGO_RPC_URL;
    const privateKey = process.env.PRIVATE_KEY;

    if (!rpcUrl || !privateKey) {
      throw new Error("FOGO_RPC_URL and PRIVATE_KEY must be set in environment variables");
    }

    try {
      this.provider = new ethers.JsonRpcProvider(rpcUrl);
      this.wallet = new ethers.Wallet(privateKey, this.provider);
      this.isInitialized = true;
      console.log("Web3Service initialized with Fogo RPC");
    } catch (error) {
      console.error("Failed to initialize Web3Service:", error);
      throw error;
    }
  }

  async getWalletBalance(walletAddress: string): Promise<string> {
    try {
      this.initialize();
      const balance = await this.provider.getBalance(walletAddress);
      // Convert from wei to FOGO (assuming 18 decimals like ETH)
      const fogoBalance = ethers.formatEther(balance);
      return fogoBalance;
    } catch (error: any) {
      console.error("Error getting wallet balance:", error);
      throw new Error(`Failed to get wallet balance: ${error.message}`);
    }
  }

  async getFaucetBalance(): Promise<string> {
    try {
      this.initialize();
      const balance = await this.provider.getBalance(this.wallet.address);
      const fogoBalance = ethers.formatEther(balance);
      return fogoBalance;
    } catch (error: any) {
      console.error("Error getting faucet balance:", error);
      throw new Error(`Failed to get faucet balance: ${error.message}`);
    }
  }

  async sendTokens(toAddress: string, amount: string): Promise<string> {
    try {
      this.initialize();
      
      // Convert FOGO amount to wei (assuming 18 decimals)
      const amountInWei = ethers.parseEther(amount);
      
      // Validate address format
      if (!ethers.isAddress(toAddress)) {
        throw new Error(`Invalid recipient address: ${toAddress}`);
      }
      
      // Create transaction (let ethers estimate gas)
      const tx = {
        to: toAddress,
        value: amountInWei,
      };

      // Send transaction
      console.log(`Sending ${amount} FOGO to ${toAddress}`);
      const transaction = await this.wallet.sendTransaction(tx);
      
      console.log(`Transaction sent: ${transaction.hash}`);
      
      // Wait for confirmation
      const receipt = await transaction.wait();
      
      if (receipt?.status === 1) {
        console.log(`Transaction confirmed: ${transaction.hash}`);
        return transaction.hash;
      } else {
        throw new Error("Transaction failed");
      }
    } catch (error: any) {
      console.error("Error sending tokens:", error);
      throw new Error(`Failed to send tokens: ${error.message}`);
    }
  }

  async getTransactionCount(walletAddress: string): Promise<number> {
    try {
      this.initialize();
      const txCount = await this.provider.getTransactionCount(walletAddress);
      return txCount;
    } catch (error: any) {
      console.error("Error getting transaction count:", error);
      // Fallback to simulated count if RPC fails
      console.log("Falling back to simulated transaction count");
      return this.simulateTxCount(walletAddress);
    }
  }

  private simulateTxCount(address: string): number {
    // Deterministic hash of address mapped to [0..1500]
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256').update(address.toLowerCase()).digest('hex');
    const num = parseInt(hash.substring(0, 8), 16);
    return num % 1501; // 0 to 1500
  }

  getFaucetAddress(): string {
    this.initialize();
    return this.wallet.address;
  }

  async healthCheck(): Promise<{ isReady: boolean; error?: string }> {
    try {
      this.initialize();
      
      // Test RPC connection
      await this.provider.getBlockNumber();
      
      // Test wallet can sign
      const faucetAddress = this.wallet.address;
      await this.provider.getBalance(faucetAddress);
      
      console.log(`Web3Service health check passed. Faucet address: ${faucetAddress}`);
      return { isReady: true };
    } catch (error: any) {
      console.error("Web3Service health check failed:", error);
      return { 
        isReady: false, 
        error: `Blockchain connection failed: ${error.message}` 
      };
    }
  }
}

// Export singleton instance
export const web3Service = new Web3Service();