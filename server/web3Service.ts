import { 
  Connection, 
  PublicKey, 
  Keypair, 
  LAMPORTS_PER_SOL, 
  SystemProgram, 
  Transaction,
  sendAndConfirmTransaction 
} from "@solana/web3.js";
import { 
  getAccount, 
  getAssociatedTokenAddress, 
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
  getOrCreateAssociatedTokenAccount,
  transfer
} from "@solana/spl-token";
import bs58 from "bs58";
import { createHash } from "crypto";
import { getBonusTokenMint } from "./config";

export class Web3Service {
  private connection!: Connection;
  private wallet!: Keypair;
  private isInitialized: boolean = false;
  
  // SPL FOGO token contract address
  private readonly SPL_FOGO_MINT = "So11111111111111111111111111111111111111112";

  constructor() {
    // Initialize will be called when needed
  }

  private initialize() {
    if (this.isInitialized) return;

    // Use correct Fogo RPC URL
    let fogoRpcUrl = process.env.FOGO_RPC_URL;
    if (fogoRpcUrl && fogoRpcUrl.includes('explorer.fogo.io')) {
      fogoRpcUrl = "https://testnet.fogo.io";
      console.log("Fixed FOGO_RPC_URL to correct RPC endpoint: https://testnet.fogo.io");
    }
    
    const rpcUrl = process.env.SOLANA_RPC_URL || fogoRpcUrl || "https://testnet.fogo.io";
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
      // Convert from lamports to FOGO (native token on Fogo testnet)
      const fogoBalance = (balance / LAMPORTS_PER_SOL).toString();
      return fogoBalance;
    } catch (error: any) {
      console.error("Error getting wallet balance:", error);
      throw new Error(`Failed to get wallet balance: ${error.message}`);
    }
  }

  async getSplFogoBalance(walletAddress: string): Promise<string> {
    try {
      this.initialize();
      const walletPublicKey = new PublicKey(walletAddress);
      const splFogoMint = new PublicKey(this.SPL_FOGO_MINT);

      // Get the associated token account address
      const associatedTokenAddress = await getAssociatedTokenAddress(
        splFogoMint,
        walletPublicKey
      );

      try {
        // Get the account info
        const account = await getAccount(this.connection, associatedTokenAddress);
        // Convert balance from smallest units (considering decimals, usually 9 for SPL tokens)
        const balance = Number(account.amount) / Math.pow(10, 9); // Assuming 9 decimals
        return balance.toString();
      } catch (error) {
        // Account doesn't exist, so balance is 0
        return "0";
      }
    } catch (error: any) {
      console.error("Error getting SPL FOGO balance:", error);
      throw new Error(`Failed to get SPL FOGO balance: ${error.message}`);
    }
  }

  async checkDualFogoBalance(walletAddress: string, maxBalance: number = 10): Promise<{ 
    eligible: boolean; 
    nativeFogo: string; 
    splFogo: string; 
    totalFogo: string;
    exceededType?: string;
  }> {
    try {
      // Get both native FOGO and SPL FOGO balances
      const nativeFogoBalance = await this.getWalletBalance(walletAddress);
      const splFogoBalance = await this.getSplFogoBalance(walletAddress);

      const nativeFogo = parseFloat(nativeFogoBalance);
      const splFogo = parseFloat(splFogoBalance);
      const totalFogo = nativeFogo + splFogo;

      // Check if either balance exceeds the threshold
      let eligible = true;
      let exceededType: string | undefined;

      if (nativeFogo > maxBalance) {
        eligible = false;
        exceededType = "native";
      } else if (splFogo > maxBalance) {
        eligible = false;
        exceededType = "spl";
      }

      return {
        eligible,
        nativeFogo: nativeFogoBalance,
        splFogo: splFogoBalance,
        totalFogo: totalFogo.toString(),
        exceededType
      };
    } catch (error: any) {
      console.error("Error checking dual FOGO balance:", error);
      throw new Error(`Failed to check FOGO balances: ${error.message}`);
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

  async sendBonusTokens(toAddress: string, amount: string): Promise<string> {
    try {
      this.initialize();
      
      // Convert amount to smallest units (assuming 9 decimals for SPL tokens)
      const amountFloat = parseFloat(amount);
      if (isNaN(amountFloat) || amountFloat < 0) {
        throw new Error(`Invalid bonus token amount: ${amount}`);
      }
      const amountInSmallestUnits = Math.round(amountFloat * Math.pow(10, 9));
      
      // Validate recipient address
      let recipientPublicKey: PublicKey;
      try {
        recipientPublicKey = new PublicKey(toAddress);
      } catch (error) {
        throw new Error(`Invalid recipient address: ${toAddress}`);
      }
      
      // Get bonus token mint
      const mintPublicKey = new PublicKey(getBonusTokenMint());
      
      // Get or create associated token accounts
      const fromTokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.wallet,
        mintPublicKey,
        this.wallet.publicKey
      );
      
      const toTokenAccount = await getOrCreateAssociatedTokenAccount(
        this.connection,
        this.wallet,
        mintPublicKey,
        recipientPublicKey
      );
      
      // Send the SPL token transfer
      console.log(`Sending ${amount} bonus tokens to ${toAddress}`);
      const signature = await transfer(
        this.connection,
        this.wallet,
        fromTokenAccount.address,
        toTokenAccount.address,
        this.wallet.publicKey,
        amountInSmallestUnits
      );
      
      console.log(`Bonus token transaction confirmed: ${signature}`);
      return signature;
    } catch (error: any) {
      console.error("Error sending bonus tokens:", error);
      throw new Error(`Failed to send bonus tokens: ${error.message}`);
    }
  }

  async sendTokensAndBonus(toAddress: string, fogoAmount: string, bonusAmount: string): Promise<{ fogoTxHash: string; bonusTxHash: string }> {
    try {
      // Send both FOGO and bonus tokens
      const fogoTxHash = await this.sendTokens(toAddress, fogoAmount);
      const bonusTxHash = await this.sendBonusTokens(toAddress, bonusAmount);
      
      return {
        fogoTxHash,
        bonusTxHash
      };
    } catch (error: any) {
      console.error("Error sending tokens and bonus:", error);
      throw new Error(`Failed to send tokens and bonus: ${error.message}`);
    }
  }

  async getTransactionCount(walletAddress: string): Promise<number> {
    try {
      this.initialize();
      const publicKey = new PublicKey(walletAddress);
      
      let allSignatures: any[] = [];
      let before: string | undefined;
      const limit = 1000; // Maximum allowed by RPC
      
      // Fetch all transaction signatures by paginating through results
      while (true) {
        const options: any = { limit };
        if (before) {
          options.before = before;
        }
        
        const signatures = await this.connection.getSignaturesForAddress(publicKey, options);
        
        if (signatures.length === 0) {
          break;
        }
        
        allSignatures = allSignatures.concat(signatures);
        
        // If we got fewer than the limit, we've reached the end
        if (signatures.length < limit) {
          break;
        }
        
        // Set the 'before' cursor to the last signature for pagination
        before = signatures[signatures.length - 1].signature;
      }
      
      return allSignatures.length;
    } catch (error: any) {
      console.error("Error getting transaction count:", error);
      throw new Error(`Failed to get wallet transaction count: ${error.message}`);
    }
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