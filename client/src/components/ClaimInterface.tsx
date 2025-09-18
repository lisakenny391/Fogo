import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Coins, CheckCircle, XCircle, Clock, AlertTriangle, ExternalLink, Copy, Droplets } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { faucetApi } from "@/lib/api";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

interface ClaimInterfaceProps {
  walletAddress?: string;
  isConnected?: boolean;
  onClaim?: (amount: string) => void;
}

export function ClaimInterface({ 
  walletAddress = "", 
  isConnected = false,
  onClaim 
}: ClaimInterfaceProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [eligibilityStatus, setEligibilityStatus] = useState<"idle" | "eligible" | "ineligible" | "cooldown">("idle");
  const [eligibilityData, setEligibilityData] = useState<any>(null);
  const [lastClaimTime, setLastClaimTime] = useState<string | null>(null);
  const [lastClaimId, setLastClaimId] = useState<string | null>(null);
  const [lastTransactionHash, setLastTransactionHash] = useState<string | null>(null);
  const [isPollingTransaction, setIsPollingTransaction] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  
  // Real-time pool status query (updates every second)
  const { data: poolStatus } = useQuery({
    queryKey: ['/api/faucet/status'],
    queryFn: () => faucetApi.getStatus(),
    refetchInterval: 1000, // Update every second
    refetchIntervalInBackground: true,
    staleTime: 0, // Always consider stale to refetch
  });

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
      }
    };
  }, []);

  // Automatically check eligibility when wallet connects
  useEffect(() => {
    if (isConnected && walletAddress && eligibilityStatus === "idle") {
      // Check eligibility twice as requested for security
      const performDoubleCheck = async () => {
        if (!isMountedRef.current) return;
        await checkEligibility();
        
        // Wait a moment, then check again to ensure consistency
        timeoutRef.current = setTimeout(async () => {
          if (isMountedRef.current) {
            await checkEligibility();
          }
        }, 1000);
      };
      performDoubleCheck();
    }
  }, [isConnected, walletAddress]);

  const checkEligibility = async () => {
    if (!isConnected || !walletAddress) {
      toast({
        title: "Wallet Required",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return;
    }

    setIsChecking(true);
    
    try {
      const result = await faucetApi.checkEligibility(walletAddress);
      
      setEligibilityData(result);
      if (result.eligible) {
        setEligibilityStatus("eligible");
        setLastClaimTime(null);
      } else {
        if (result.balanceExceeded) {
          setEligibilityStatus("ineligible");
        } else {
          setEligibilityStatus("cooldown");
        }
        setLastClaimTime(result.reason || "Recently claimed");
      }
    } catch (error) {
      console.error('Eligibility check failed:', error);
      setEligibilityStatus("ineligible");
      toast({
        title: "Check Failed",
        description: "Failed to check eligibility. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsChecking(false);
    }
  };

  const claimMutation = useMutation({
    mutationFn: () => faucetApi.claimTokens(walletAddress),
    onSuccess: (data) => {
      onClaim?.(eligibilityData?.proposedAmount || "0");
      setEligibilityStatus("cooldown");
      setLastClaimTime("Just now");
      setLastClaimId(data.claimId);
      setIsPollingTransaction(true);
      
      toast({
        title: "Claim Submitted!",
        description: data.message,
      });
      
      // Poll for transaction hash
      const pollForTransaction = async () => {
        const maxAttempts = 30; // 30 attempts over 1 minute
        let attempts = 0;
        
        const poll = async () => {
          if (!isMountedRef.current) return;
          
          try {
            attempts++;
            const recentClaims = await faucetApi.getRecentClaims(10);
            const claim = recentClaims.find(c => c.id === data.claimId);
            
            if (claim?.transactionHash && isMountedRef.current) {
              setLastTransactionHash(claim.transactionHash);
              setIsPollingTransaction(false);
              toast({
                title: "Transaction Confirmed!",
                description: "Your claim has been processed on the blockchain.",
              });
              return;
            }
            
            if (attempts < maxAttempts && isMountedRef.current) {
              pollTimeoutRef.current = setTimeout(poll, 2000); // Poll every 2 seconds
            } else if (isMountedRef.current) {
              setIsPollingTransaction(false);
            }
          } catch (error) {
            if (attempts < maxAttempts && isMountedRef.current) {
              pollTimeoutRef.current = setTimeout(poll, 2000);
            } else if (isMountedRef.current) {
              setIsPollingTransaction(false);
            }
          }
        };
        
        // Start polling after a short delay
        setTimeout(poll, 3000);
      };
      
      pollForTransaction();
      
      // Invalidate and refetch related queries
      queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/claims/recent'] });
      queryClient.invalidateQueries({ queryKey: ['/api/faucet/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leaderboard'] });
    },
    onError: (error: any) => {
      console.error('Claim failed:', error);
      toast({
        title: "Claim Failed",
        description: error.message || "Failed to claim tokens. Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleClaim = async () => {
    if (eligibilityStatus !== "eligible" || !walletAddress) return;
    claimMutation.mutate();
  };

  const getEligibilityBadge = () => {
    if (eligibilityStatus === "eligible") {
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
          <CheckCircle className="h-3 w-3 mr-1" />
          Eligible
        </Badge>
      );
    } else if (eligibilityStatus === "ineligible" || eligibilityStatus === "cooldown") {
      return (
        <Badge variant="destructive">
          <XCircle className="h-3 w-3 mr-1" />
          Not Eligible
        </Badge>
      );
    }
    return null;
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            Claim Tokens
          </span>
          {eligibilityStatus !== "idle" && getEligibilityBadge()}
        </CardTitle>
        <CardDescription>
          Claim FOGO tokens from the testnet faucet
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enhanced Real-time Pool Status Display */}
        {poolStatus && (
          <div className="space-y-2">
            {/* Pool Status Card */}
            {(() => {
              const dailyLimit = parseFloat(poolStatus.dailyLimit) || 0;
              const distributed = parseFloat(poolStatus.totalDistributed || "0") || 0;
              
              // Guard against invalid dailyLimit and calculate safe values
              const remaining = dailyLimit > 0 ? Math.max(0, Math.min(dailyLimit, dailyLimit - distributed)) : 0;
              const remainingPercent = dailyLimit > 0 ? Math.max(0, Math.min(100, (remaining / dailyLimit) * 100)) : 0;
              
              const isLow = remainingPercent < 20 && remainingPercent > 0;
              const isVeryLow = remainingPercent < 5 && remainingPercent > 0;
              const isExhausted = remaining <= 0 || dailyLimit <= 0;

              return (
                <div 
                  className={`p-4 border rounded-lg ${
                    isExhausted 
                      ? 'bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/10 dark:to-orange-900/10 border-red-200 dark:border-red-800' 
                      : isVeryLow 
                      ? 'bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-900/10 dark:to-yellow-900/10 border-orange-200 dark:border-orange-800'
                      : isLow
                      ? 'bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/10 dark:to-amber-900/10 border-yellow-200 dark:border-yellow-800'
                      : 'bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/10 dark:to-cyan-900/10 border-blue-200 dark:border-blue-800'
                  }`}
                  data-testid="card-pool-status"
                >
                  <div className="flex items-center justify-between">
                    <div className={`flex items-center gap-2 ${
                      isExhausted 
                        ? 'text-red-700 dark:text-red-400' 
                        : isVeryLow 
                        ? 'text-orange-700 dark:text-orange-400'
                        : isLow
                        ? 'text-yellow-700 dark:text-yellow-400'
                        : 'text-blue-700 dark:text-blue-400'
                    }`}>
                      {isExhausted ? (
                        <XCircle className="h-5 w-5" />
                      ) : isVeryLow ? (
                        <AlertTriangle className="h-5 w-5" />
                      ) : (
                        <Droplets className="h-5 w-5" />
                      )}
                      <div>
                        <span className="font-semibold text-base">Daily Pool Status</span>
                        {isExhausted && (
                          <div className="text-sm font-medium" data-testid="status-pool-message">Pool Exhausted - Try Tomorrow</div>
                        )}
                        {isVeryLow && !isExhausted && (
                          <div className="text-sm font-medium" data-testid="status-pool-message">Very Low - Hurry Up!</div>
                        )}
                        {isLow && !isVeryLow && (
                          <div className="text-sm font-medium" data-testid="status-pool-message">Running Low</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div 
                        className={`font-mono text-xl font-bold ${
                          isExhausted 
                            ? 'text-red-800 dark:text-red-300' 
                            : isVeryLow 
                            ? 'text-orange-800 dark:text-orange-300'
                            : isLow
                            ? 'text-yellow-800 dark:text-yellow-300'
                            : 'text-blue-800 dark:text-blue-300'
                        }`}
                        data-testid="text-remaining-fogo"
                      >
                        {remaining.toFixed(1)} FOGO
                      </div>
                      <div className="text-sm opacity-80" data-testid="text-remaining-percent">
                        {remainingPercent.toFixed(1)}% of {dailyLimit.toFixed(0)} remaining
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                      <div 
                        className={`h-3 rounded-full transition-all duration-500 ${
                          isExhausted 
                            ? 'bg-gradient-to-r from-red-500 to-red-600' 
                            : isVeryLow 
                            ? 'bg-gradient-to-r from-orange-500 to-red-500'
                            : isLow
                            ? 'bg-gradient-to-r from-yellow-500 to-orange-500'
                            : 'bg-gradient-to-r from-blue-500 to-cyan-500'
                        }`}
                        style={{ 
                          width: isExhausted ? '0%' : `${Math.max(3, Math.min(100, remainingPercent))}%` 
                        }}
                        data-testid="bar-remaining"
                      />
                    </div>
                    <div className="flex justify-between text-xs opacity-70">
                      <span>Distributed: {distributed.toFixed(1)} FOGO</span>
                      <span>Resets daily at UTC midnight</span>
                    </div>
                  </div>
                </div>
              );
            })()}
            
            {/* Pool Management Notice */}
            <div className="text-xs text-muted-foreground text-center p-2 bg-muted/50 rounded-lg">
              Pool status updates in real-time • Managed by administrators
            </div>
          </div>
        )}

        {isConnected && isChecking && eligibilityStatus === "idle" && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg text-center">
            <div className="text-sm text-blue-700 dark:text-blue-400">Checking eligibility automatically...</div>
          </div>
        )}

        {eligibilityStatus === "eligible" && (
          <Button 
            onClick={handleClaim}
            disabled={claimMutation.isPending}
            className="w-full"
            data-testid="button-claim-tokens"
          >
            {claimMutation.isPending ? "Claiming..." : `Claim ${eligibilityData?.proposedAmount || 0} FOGO`}
          </Button>
        )}

        {(eligibilityStatus === "ineligible" || eligibilityStatus === "cooldown") && (
          <div className="space-y-3">
            <Button disabled className="w-full">
              Not Eligible
            </Button>
            {lastClaimId && lastClaimTime === "Just now" && (
              <div className="p-3 bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg text-center">
                {isPollingTransaction ? (
                  <div className="text-sm text-blue-700 dark:text-blue-400 mb-2">
                    <Clock className="h-4 w-4 inline mr-1" />
                    Your claim is being processed on the blockchain...
                  </div>
                ) : lastTransactionHash ? (
                  <div className="space-y-2">
                    <div className="text-sm text-green-700 dark:text-green-400 mb-2">
                      <CheckCircle className="h-4 w-4 inline mr-1" />
                      Transaction confirmed!
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <code className="bg-muted px-2 py-1 rounded text-xs">
                        {lastTransactionHash.slice(0, 12)}...{lastTransactionHash.slice(-8)}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          navigator.clipboard.writeText(lastTransactionHash);
                          toast({ title: "Copied", description: "Transaction hash copied to clipboard" });
                        }}
                        data-testid="copy-transaction-hash"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => window.open(`https://explorer.fogo.io/tx/${lastTransactionHash}`, '_blank')}
                        title="View on Fogo Explorer"
                        data-testid="view-transaction-explorer"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-blue-700 dark:text-blue-400 mb-2">
                    <Clock className="h-4 w-4 inline mr-1" />
                    Your claim is being processed...
                  </div>
                )}
                <div className="text-xs text-blue-600 dark:text-blue-300">
                  View all transactions in{" "}
                  <Link href="/activity" className="underline hover:no-underline" data-testid="link-recent-activity">
                    Recent Activity
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}

      </CardContent>
    </Card>
  );
}