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
      // Initialize connection with aggressive timeout settings
      this.connection = new Connection(rpcUrl, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 30000, // 30 seconds
        wsEndpoint: undefined, // Disable websockets to reduce hanging connections
        httpHeaders: {
          'User-Agent': 'FOGO-Faucet/1.0'
        }
      });
      
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

  // Simple cache for balance checks (2 minute TTL for more frequent updates)
  private static balanceCache = new Map<string, { balance: string; timestamp: number }>();
  private static readonly BALANCE_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
  
  async getWalletBalance(walletAddress: string): Promise<string> {
    const cacheKey = `native:${walletAddress}`;
    
    // Check cache first
    const cached = Web3Service.balanceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < Web3Service.BALANCE_CACHE_TTL_MS) {
      return cached.balance;
    }
    
    // Check if there's already an in-flight request for this balance (coalescing)
    const existingRequest = Web3Service.inFlightBalanceRequests.get(cacheKey);
    if (existingRequest) {
      return existingRequest;
    }
    
    // Create the promise and store it for coalescing
    const requestPromise = this._getWalletBalanceInternal(walletAddress, cacheKey)
      .finally(() => {
        // Clean up in-flight request
        Web3Service.inFlightBalanceRequests.delete(cacheKey);
      });
    
    Web3Service.inFlightBalanceRequests.set(cacheKey, requestPromise);
    
    return requestPromise;
  }

  private async _getWalletBalanceInternal(walletAddress: string, cacheKey: string): Promise<string> {
    try {
      this.initialize();
      const publicKey = new PublicKey(walletAddress);
      
      // Add timeout to prevent hanging
      const balance = await Promise.race([
        this.connection.getBalance(publicKey),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Native balance check timeout')), 10000)
        )
      ]);
      
      // Convert from lamports to FOGO (native token on Fogo testnet)
      const fogoBalance = (balance / LAMPORTS_PER_SOL).toString();
      
      // Cache the successful result
      Web3Service.balanceCache.set(cacheKey, {
        balance: fogoBalance,
        timestamp: Date.now()
      });
      
      return fogoBalance;
    } catch (error: any) {
      console.error("Error getting wallet balance:", error);
      
      // Try to return stale cache (max 10 minutes old)
      const staleCache = Web3Service.balanceCache.get(cacheKey);
      if (staleCache && Date.now() - staleCache.timestamp < 10 * 60 * 1000) { // Max 10 min stale
        console.warn(`Using stale cached balance for ${walletAddress}: ${staleCache.balance}`);
        return staleCache.balance;
      }
      
      throw new Error(`Failed to get wallet balance: ${error.message}`);
    }
  }

  async getSplFogoBalance(walletAddress: string): Promise<string> {
    const cacheKey = `spl:${walletAddress}`;
    
    // Check cache first
    const cached = Web3Service.balanceCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < Web3Service.BALANCE_CACHE_TTL_MS) {
      return cached.balance;
    }
    
    // Check if there's already an in-flight request for this balance (coalescing)
    const existingRequest = Web3Service.inFlightBalanceRequests.get(cacheKey);
    if (existingRequest) {
      return existingRequest;
    }
    
    // Create the promise and store it for coalescing
    const requestPromise = this._getSplFogoBalanceInternal(walletAddress, cacheKey)
      .finally(() => {
        // Clean up in-flight request
        Web3Service.inFlightBalanceRequests.delete(cacheKey);
      });
    
    Web3Service.inFlightBalanceRequests.set(cacheKey, requestPromise);
    
    return requestPromise;
  }

  private async _getSplFogoBalanceInternal(walletAddress: string, cacheKey: string): Promise<string> {
    try {
      this.initialize();
      const walletPublicKey = new PublicKey(walletAddress);
      const splFogoMint = new PublicKey(this.SPL_FOGO_MINT);

      // Get the associated token account address with timeout
      const associatedTokenAddress = await Promise.race([
        getAssociatedTokenAddress(splFogoMint, walletPublicKey),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Associated token address timeout')), 5000)
        )
      ]);

      try {
        // Get the account info with timeout
        const account = await Promise.race([
          getAccount(this.connection, associatedTokenAddress),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('SPL account fetch timeout')), 10000)
          )
        ]);
        
        // Convert balance from smallest units (considering decimals, usually 9 for SPL tokens)
        const balance = Number(account.amount) / Math.pow(10, 9); // Assuming 9 decimals
        const balanceStr = balance.toString();
        
        // Cache the successful result
        Web3Service.balanceCache.set(cacheKey, {
          balance: balanceStr,
          timestamp: Date.now()
        });
        
        return balanceStr;
        
      } catch (accountError: any) {
        // Check if this is specifically a "TokenAccountNotFoundError" (account doesn't exist)
        if (accountError.name === 'TokenAccountNotFoundError' || 
            accountError.message?.includes('could not find account')) {
          // Account genuinely doesn't exist - safe to cache "0"
          const balanceStr = "0";
          Web3Service.balanceCache.set(cacheKey, {
            balance: balanceStr,
            timestamp: Date.now()
          });
          return balanceStr;
        }
        
        // For other errors (timeout, network issues), DON'T cache "0" 
        // Try to return stale cache instead
        const staleCache = Web3Service.balanceCache.get(cacheKey);
        if (staleCache) {
          console.warn(`Using stale cached SPL balance for ${walletAddress} due to error: ${accountError.message}`);
          return staleCache.balance;
        }
        
        // No cache available - this is a real error, don't return "0"
        throw accountError;
      }
      
    } catch (error: any) {
      console.error("Error getting SPL FOGO balance:", error);
      
      // Try to return stale cache even if expired
      const staleCache = Web3Service.balanceCache.get(cacheKey);
      if (staleCache && Date.now() - staleCache.timestamp < 10 * 60 * 1000) { // Max 10 min stale
        console.warn(`Using stale cached SPL balance for ${walletAddress}: ${staleCache.balance}`);
        return staleCache.balance;
      }
      
      // No reliable cache available - throw error instead of returning fake "0"
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
      // Get both native FOGO and SPL FOGO balances concurrently
      // Timeout handling is now done in the individual balance methods
      const [nativeFogoBalance, splFogoBalance] = await Promise.all([
        this.getWalletBalance(walletAddress),
        this.getSplFogoBalance(walletAddress)
      ]);

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

  // Simple in-memory cache for transaction counts (10 minute TTL)
  private static txCountCache = new Map<string, { count: number; timestamp: number }>();
  private static readonly CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
  
  // In-flight request coalescing to prevent duplicate scans
  private static inFlightRequests = new Map<string, Promise<number>>();
  
  // In-flight balance request coalescing
  private static inFlightBalanceRequests = new Map<string, Promise<string>>();
  
  async getTransactionCount(walletAddress: string): Promise<number> {
    // Check cache first
    const cached = Web3Service.txCountCache.get(walletAddress);
    if (cached && Date.now() - cached.timestamp < Web3Service.CACHE_TTL_MS) {
      console.log(`Transaction count cache hit for ${walletAddress}: ${cached.count}`);
      return cached.count;
    }
    
    // Check if there's already an in-flight request for this wallet (coalescing)
    const existingRequest = Web3Service.inFlightRequests.get(walletAddress);
    if (existingRequest) {
      console.log(`Coalescing transaction count request for ${walletAddress}`);
      return existingRequest;
    }
    
    // Create the promise and store it for coalescing
    const requestPromise = this._getTransactionCountReliable(walletAddress)
      .then(count => {
        // Cache the result on success
        Web3Service.txCountCache.set(walletAddress, {
          count,
          timestamp: Date.now()
        });
        return count;
      })
      .catch(error => {
        // On error, try to return stale cache if available
        const staleCache = Web3Service.txCountCache.get(walletAddress);
        if (staleCache) {
          console.warn(`Using stale cached transaction count for ${walletAddress}: ${staleCache.count}`);
          return staleCache.count;
        }
        throw error;
      })
      .finally(() => {
        // Clean up in-flight request
        Web3Service.inFlightRequests.delete(walletAddress);
      });
    
    Web3Service.inFlightRequests.set(walletAddress, requestPromise);
    
    return requestPromise;
  }
  
  private async _getTransactionCountReliable(walletAddress: string): Promise<number> {
    try {
      this.initialize();
      const publicKey = new PublicKey(walletAddress);
      
      let totalCount = 0;
      let before: string | undefined;
      const limit = 1000; // Standard RPC limit
      let pageCount = 0;
      
      console.log(`Fetching complete transaction count for ${walletAddress}`);
      
      // Simple, reliable pagination through ALL transactions
      while (true) {
        pageCount++;
        const options: any = { limit };
        if (before) {
          options.before = before;
        }
        
        try {
          const signatures = await this.connection.getSignaturesForAddress(publicKey, options);
          
          // Stop when we get zero results (proper end condition)
          if (signatures.length === 0) {
            console.log(`Reached end of transaction history for ${walletAddress} after ${pageCount} pages`);
            break;
          }
          
          totalCount += signatures.length;
          
          // Set cursor for next page
          before = signatures[signatures.length - 1].signature;
          
          // Log progress for large wallets
          if (pageCount % 10 === 0) {
            console.log(`Fetched ${totalCount} transactions so far for ${walletAddress} (page ${pageCount})`);
          }
          
          // If we got fewer than the limit, we might be at the end, but continue to be sure
          // (some RPCs return partial pages due to rate limiting but still have more data)
          
          // Small delay between pages to be respectful
          await new Promise(resolve => setTimeout(resolve, 100));
          
        } catch (pageError: any) {
          console.warn(`Page ${pageCount} fetch error for ${walletAddress}: ${pageError.message}`);
          
          // On page error, wait a bit and try next page
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // If we can't get this page, stop here and return what we have
          // This prevents one bad page from ruining the entire count
          console.log(`Stopping at ${totalCount} transactions due to page error`);
          break;
        }
      }
      
      console.log(`Final transaction count for ${walletAddress}: ${totalCount}`);
      return totalCount;
      
    } catch (error: any) {
      console.error(`Error getting transaction count for ${walletAddress}:`, error);
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