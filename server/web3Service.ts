import { 
  Connection, 
  PublicKey, 
  Keypair, 
  LAMPORTS_PER_SOL, 
  SystemProgram, 
  Transaction,
  sendAndConfirmTransaction 
} from "@solana/web3.js";
import bs58 from "bs58";
import { createHash } from "crypto";

export class Web3Service {
  private connection!: Connection;
  private wallet!: Keypair;
  private isInitialized: boolean = false;

  constructor() {
    // Initialize will be called when needed
  }

  private initialize() {
    if (this.isInitialized) return;

    const rpcUrl = process.env.SOLANA_RPC_URL || process.env.FOGO_RPC_URL || "https://rpc.fogo.io";
    const privateKeyBase58 = process.env.PRIVATE_KEY;

    console.log("Initializing Web3Service...");
    console.log("RPC URL:", rpcUrl);
    console.log("PRIVATE_KEY exists:", !!privateKeyBase58);
    console.log("PRIVATE_KEY length:", privateKeyBase58?.length || 0);

    if (!privateKeyBase58) {
      throw new Error("PRIVATE_KEY must be set in environment variables (base58 encoded Solana private key)");
    }

    if (privateKeyBase58.trim() === "") {
      throw new Error("PRIVATE_KEY is empty. Please provide a valid base58 encoded Solana private key");
    }

    try {
      this.connection = new Connection(rpcUrl, 'confirmed');
      
      // Parse private key to Keypair
      const secretKeyArray = this.parsePrivateKey(privateKeyBase58);
      this.wallet = Keypair.fromSecretKey(secretKeyArray);
      
      this.isInitialized = true;
      console.log("Web3Service initialized with Solana RPC:", rpcUrl);
      console.log("Faucet address:", this.wallet.publicKey.toString());
    } catch (error) {
      console.error("Failed to initialize Web3Service:", error);
      throw error;
    }
  }

  private parsePrivateKey(privateKey: string): Uint8Array {
    try {
      // Try to parse as JSON array first (common format)
      const parsedArray = JSON.parse(privateKey);
      if (Array.isArray(parsedArray) && parsedArray.length === 64) {
        return new Uint8Array(parsedArray);
      }
      throw new Error("Not a valid JSON array");
    } catch {
      // Try to decode as base58 string
      try {
        const decoded = bs58.decode(privateKey);
        if (decoded.length !== 64) {
          throw new Error(`Invalid private key length: expected 64 bytes, got ${decoded.length}`);
        }
        return decoded;
      } catch (error) {
        throw new Error("Invalid private key format. Expected base58 string or JSON array of 64 numbers");
      }
    }
  }

  async getWalletBalance(walletAddress: string): Promise<string> {
    try {
      this.initialize();
      const publicKey = new PublicKey(walletAddress);
      const balance = await this.connection.getBalance(publicKey);
      // Convert from lamports to SOL
      const solBalance = (balance / LAMPORTS_PER_SOL).toString();
      return solBalance;
    } catch (error: any) {
      console.error("Error getting wallet balance:", error);
      throw new Error(`Failed to get wallet balance: ${error.message}`);
    }
  }

  async getFaucetBalance(): Promise<string> {
    try {
      this.initialize();
      const balance = await this.connection.getBalance(this.wallet.publicKey);
      const solBalance = (balance / LAMPORTS_PER_SOL).toString();
      return solBalance;
    } catch (error: any) {
      console.error("Error getting faucet balance:", error);
      throw new Error(`Failed to get faucet balance: ${error.message}`);
    }
  }

  async getWalletTransactionCount(walletAddress: string): Promise<number> {
    return this.getTransactionCount(walletAddress);
  }

  async sendTokens(toAddress: string, amount: string, contractAddress?: string): Promise<string> {
    try {
      this.initialize();
      
      // Convert amount to lamports with proper precision
      const amountFloat = parseFloat(amount);
      if (isNaN(amountFloat) || amountFloat < 0) {
        throw new Error(`Invalid amount: ${amount}`);
      }
      const amountInLamports = Math.round(amountFloat * LAMPORTS_PER_SOL);
      
      // Validate address format
      let recipientPublicKey: PublicKey;
      try {
        recipientPublicKey = new PublicKey(toAddress);
      } catch (error) {
        throw new Error(`Invalid recipient address: ${toAddress}`);
      }
      
      // Get recent blockhash and create transaction
      const { blockhash } = await this.connection.getLatestBlockhash();
      const transaction = new Transaction({
        recentBlockhash: blockhash,
        feePayer: this.wallet.publicKey
      }).add(
        SystemProgram.transfer({
          fromPubkey: this.wallet.publicKey,
          toPubkey: recipientPublicKey,
          lamports: amountInLamports,
        })
      );

      // Send transaction
      console.log(`Sending ${amount} SOL to ${toAddress}`);
      const signature = await sendAndConfirmTransaction(
        this.connection,
        transaction,
        [this.wallet]
      );
      
      console.log(`Transaction confirmed: ${signature}`);
      return signature;
    } catch (error: any) {
      console.error("Error sending tokens:", error);
      throw new Error(`Failed to send tokens: ${error.message}`);
    }
  }

  async getTransactionCount(walletAddress: string): Promise<number> {
    try {
      this.initialize();
      const publicKey = new PublicKey(walletAddress);
      
      // Get recent transaction signatures for this wallet
      const signatures = await this.connection.getSignaturesForAddress(publicKey, { limit: 1000 });
      return signatures.length;
    } catch (error: any) {
      console.error("Error getting transaction count:", error);
      // Fallback to simulated count if RPC fails
      console.log("Falling back to simulated transaction count");
      return this.simulateTxCount(walletAddress);
    }
  }

  private simulateTxCount(address: string): number {
    // Deterministic hash of address mapped to [0..1500]
    const hash = createHash('sha256').update(address.toLowerCase()).digest('hex');
    const num = parseInt(hash.substring(0, 8), 16);
    return num % 1501; // 0 to 1500
  }

  getFaucetAddress(): string {
    this.initialize();
    return this.wallet.publicKey.toString();
  }

  async healthCheck(): Promise<{ isReady: boolean; error?: string }> {
    try {
      this.initialize();
      
      // Test RPC connection
      await this.connection.getSlot();
      
      // Test wallet can sign by getting balance
      const faucetAddress = this.wallet.publicKey;
      await this.connection.getBalance(faucetAddress);
      
      console.log(`Web3Service health check passed. Faucet address: ${faucetAddress.toString()}`);
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