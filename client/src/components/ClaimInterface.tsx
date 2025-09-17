import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Coins, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { faucetApi } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";

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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
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
      
      toast({
        title: "Claim Submitted!",
        description: data.message,
      });
      
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
          Claim FOGO tokens automatically calculated based on your wallet's transaction history
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
{/* Removed detailed eligibility information as requested by user */}

        {!isConnected && (
          <div className="p-3 bg-muted rounded-lg flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            Connect your wallet to check eligibility
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
          <Button disabled className="w-full">
            Not Eligible
          </Button>
        )}

      </CardContent>
    </Card>
  );
}