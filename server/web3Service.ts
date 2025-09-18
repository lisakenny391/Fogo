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
import { getBonusTokenMint, getBalanceCapForTxCount, TIERED_CAPS } from "./config";

export class Web3Service {
  private connection!: Connection;
  private wallet!: Keypair;
  private isInitialized: boolean = false;
  
  // FOGO token addresses - enhanced with dual native/contract support
  private readonly FOGO_NATIVE = "So11111111111111111111111111111111111111112";
  private readonly FOGO_CONTRACT = "B7mVgAvW7i2wkcDS6WNCmNYi8FTUWBTScJk3vZ55JN4K";
  private readonly SPL_FOGO_MINT = "So11111111111111111111111111111111111111112"; // Legacy compatibility
  
  // Configuration constants
  private readonly TX_CAP = 3000;
  // Balance caps now use tiered system based on transaction count - see getBalanceCapForTxCount()

  constructor() {
    // Initialize will be called when needed
  }

  private initialize() {
    if (this.isInitialized) return;

    // Use enhanced Flux RPC endpoint for improved reliability
    const enhancedFluxRpc = process.env.ENHANCED_FLUX_RPC_URL;
    const rpcUrl = enhancedFluxRpc || process.env.FOGO_RPC_URL || "https://testnet.fogo.io";
    
    if (enhancedFluxRpc) {
      console.log("Using enhanced Flux RPC endpoint for improved reliability");
    }
    const privateKeyBase58 = process.env.PRIVATE_KEY;

    console.log("Initializing Web3Service...");
    // Log only safe information to avoid credential exposure
    const safeRpcDisplay = enhancedFluxRpc ? "[Enhanced Flux RPC]" : new URL(rpcUrl).origin;
    console.log("RPC endpoint:", safeRpcDisplay);
    console.log("PRIVATE_KEY configured:", !!privateKeyBase58);

    if (!privateKeyBase58) {
      throw new Error("PRIVATE_KEY must be set in environment variables (base58 encoded Solana private key)");
    }

    if (privateKeyBase58.trim() === "") {
      throw new Error("PRIVATE_KEY is empty. Please provide a valid base58 encoded Solana private key");
    }

    try {
      // Initialize connection with enhanced timeout settings for Flux RPC
      this.connection = new Connection(rpcUrl, {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000, // 60 seconds for Flux RPC
        wsEndpoint: undefined, // Disable websockets to reduce hanging connections
        httpHeaders: {
          'User-Agent': 'FOGO-Faucet/1.0'
        }
      });
      
      // Parse private key to Keypair
      const secretKeyArray = this.parsePrivateKey(privateKeyBase58);
      this.wallet = Keypair.fromSecretKey(secretKeyArray);
      
      this.isInitialized = true;
      // Log only the hostname to avoid exposing credentials in URLs
      const safeRpcUrl = enhancedFluxRpc ? "[Enhanced Flux RPC]" : new URL(rpcUrl).origin;
      console.log("Web3Service initialized with RPC:", safeRpcUrl);
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

  // Enhanced retry logic for RPC failures
  private async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000,
    operationName: string = 'RPC operation'
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        if (attempt === maxRetries) {
          console.error(`${operationName} failed after ${maxRetries} attempts:`, error.message);
          throw error;
        }
        
        // Exponential backoff with jitter
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        console.warn(`${operationName} attempt ${attempt} failed, retrying in ${Math.round(delay)}ms:`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }

  /**
   * Enhanced unified wallet checker that combines transaction count and FOGO balances.
   * Returns comprehensive wallet analysis including cap violation flags.
   * Based on the improved FOGO checker script with enhanced error handling.
   */
  async checkWallet(walletAddress: string): Promise<{
    wallet: string;
    transactionCount: number;
    fogoNative: string;
    fogoContract: string;
    totalFogo: string;
    exceedsCap: boolean;
    eligible: boolean;
    exceededType?: string;
  }> {
    try {
      this.initialize();
      
      const pubkey = new PublicKey(walletAddress);
      
      // Execute all checks concurrently with enhanced error handling
      const [transactionCount, nativeBalance, contractBalance] = await Promise.all([
        this.withRetry(
          () => this.getTransactionCountWithCap(walletAddress),
          3, 1000, 'Transaction count check'
        ),
        this.withRetry(
          () => this.getNativeFogoBalance(pubkey),
          3, 1000, 'Native FOGO balance check'
        ),
        this.withRetry(
          () => this.getContractFogoBalance(pubkey),
          3, 1000, 'Contract FOGO balance check'
        )
      ]);
      
      const fogoNative = parseFloat(nativeBalance);
      const fogoContract = parseFloat(contractBalance);
      const totalFogo = fogoNative + fogoContract;
      // Get appropriate balance cap based on transaction count (tiered system)
      const balanceCap = getBalanceCapForTxCount(transactionCount);
      
      // Determine eligibility and exceeded type - any cap violation makes wallet ineligible
      let eligible = true;
      let exceededType: string | undefined;
      let exceedsCap = false;
      
      if (fogoNative > balanceCap) {
        eligible = false;
        exceededType = "native";
        exceedsCap = true;
      } else if (fogoContract > balanceCap) {
        eligible = false;
        exceededType = "contract";
        exceedsCap = true;
      } else if (totalFogo > balanceCap) {
        eligible = false;
        exceededType = "total";
        exceedsCap = true;
      }
      
      const result = {
        wallet: walletAddress,
        transactionCount,
        fogoNative: nativeBalance,
        fogoContract: contractBalance,
        totalFogo: totalFogo.toString(),
        balanceCap, // Include the cap used for this wallet
        exceedsCap,
        eligible,
        exceededType
      };
      
      console.log(`Wallet check completed for ${walletAddress}:`, {
        txCount: transactionCount,
        nativeFogo: fogoNative,
        contractFogo: fogoContract,
        totalFogo,
        exceedsCap,
        eligible
      });
      
      return result;
      
    } catch (error: any) {
      console.error(`Enhanced wallet check failed for ${walletAddress}:`, error);
      throw new Error(`Failed to check wallet: ${error.message}`);
    }
  }

  /**
   * Get transaction count with cap (matches the enhanced script logic).
   */
  private async getTransactionCountWithCap(walletAddress: string): Promise<number> {
    const pubkey = new PublicKey(walletAddress);
    // Add timeout to prevent hanging
    const signatures = await Promise.race([
      this.connection.getSignaturesForAddress(pubkey, {
        limit: this.TX_CAP,
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Transaction count check timeout')), 10000)
      )
    ]);
    return signatures.length;
  }

  /**
   * Get native FOGO balance (SOL equivalent on Fogo network).
   */
  private async getNativeFogoBalance(pubkey: PublicKey): Promise<string> {
    // Add timeout to prevent hanging
    const lamports = await Promise.race([
      this.connection.getBalance(pubkey),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Native balance check timeout')), 10000)
      )
    ]);
    const fogoNative = lamports / LAMPORTS_PER_SOL; // Use constant for consistency
    return fogoNative.toString();
  }

  /**
   * Get contract-based FOGO balance (SPL token).
   */
  private async getContractFogoBalance(pubkey: PublicKey): Promise<string> {
    // Use mint filter for better performance and reliability
    const fogoContractMint = new PublicKey(this.FOGO_CONTRACT);
    
    // Add timeout to prevent hanging
    const tokenAccounts = await Promise.race([
      this.connection.getParsedTokenAccountsByOwner(pubkey, {
        mint: fogoContractMint, // Filter by specific mint for better performance
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Contract balance check timeout')), 10000)
      )
    ]);

    let fogoContract = 0;
    for (const { account } of tokenAccounts.value) {
      const info = account.data.parsed.info;
      const amount = parseFloat(info.tokenAmount.uiAmount || '0');
      fogoContract += amount;
    }

    return fogoContract.toString();
  }

  /**
   * Enhanced dual FOGO balance check using the new contract addresses.
   * Returns raw balance data without cap checking (use checkWallet() for cap logic).
   */
  async getEnhancedFogoBalances(walletAddress: string): Promise<{
    fogoNative: string;
    fogoContract: string;
    totalFogo: string;
  }> {
    try {
      this.initialize();
      const pubkey = new PublicKey(walletAddress);
      
      // Use the enhanced methods with retry logic
      const [nativeBalance, contractBalance] = await Promise.all([
        this.withRetry(() => this.getNativeFogoBalance(pubkey), 3, 1000, 'Enhanced native balance'),
        this.withRetry(() => this.getContractFogoBalance(pubkey), 3, 1000, 'Enhanced contract balance')
      ]);
      
      const fogoNative = parseFloat(nativeBalance);
      const fogoContract = parseFloat(contractBalance);
      const totalFogo = fogoNative + fogoContract;
      
      return {
        fogoNative: nativeBalance,
        fogoContract: contractBalance,
        totalFogo: totalFogo.toString()
      };
    } catch (error: any) {
      console.error("Error in enhanced FOGO balance check:", error);
      throw new Error(`Failed to get enhanced FOGO balances: ${error.message}`);
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
      const balance = await this.withRetry(
        () => Promise.race([
          this.connection.getBalance(publicKey),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Native balance check timeout')), 10000)
          )
        ]),
        3, 1000, 'Legacy native balance check'
      );
      
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
        // Get the account info with timeout and retry
        const account = await this.withRetry(
          () => Promise.race([
            getAccount(this.connection, associatedTokenAddress),
            new Promise<never>((_, reject) => 
              setTimeout(() => reject(new Error('SPL account fetch timeout')), 10000)
            )
          ]),
          3, 1000, 'Legacy SPL balance check'
        );
        
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
      const balance = await this.withRetry(
        () => Promise.race([
          this.connection.getBalance(this.wallet.publicKey),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Faucet balance check timeout')), 10000)
          )
        ]),
        3, 1000, 'Faucet balance check'
      );
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
      
      // Optimized pagination - stop at 3000+ transactions since that's the maximum tier
      while (true) {
        pageCount++;
        const options: any = { limit };
        if (before) {
          options.before = before;
        }
        
        try {
          const signatures = await this.withRetry(
            () => Promise.race([
              this.connection.getSignaturesForAddress(publicKey, options),
              new Promise<never>((_, reject) => 
                setTimeout(() => reject(new Error('Transaction signature fetch timeout')), 15000)
              )
            ]),
            2, 500, `Transaction signatures page ${pageCount}`
          );
          
          // Stop when we get zero results (proper end condition)
          if (signatures.length === 0) {
            console.log(`Reached end of transaction history for ${walletAddress} after ${pageCount} pages`);
            break;
          }
          
          totalCount += signatures.length;
          
          // OPTIMIZATION: Stop counting at 3000+ transactions since that's the maximum tier (3.0 FOGO)
          if (totalCount >= 3000) {
            console.log(`Reached maximum tier threshold for ${walletAddress}: ${totalCount} transactions (3000+ = 3.0 FOGO tier)`);
            break;
          }
          
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
      
      // Test RPC connection with timeout
      await this.withRetry(
        () => Promise.race([
          this.connection.getSlot(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Health check slot timeout')), 5000)
          )
        ]),
        2, 1000, 'Health check slot'
      );
      
      // Test wallet can sign by getting balance with timeout
      const faucetAddress = this.wallet.publicKey;
      await this.withRetry(
        () => Promise.race([
          this.connection.getBalance(faucetAddress),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Health check balance timeout')), 5000)
          )
        ]),
        2, 1000, 'Health check balance'
      );
      
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