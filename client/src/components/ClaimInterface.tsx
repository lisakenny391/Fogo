import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Coins, CheckCircle, XCircle, Clock, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  const [claimAmount, setClaimAmount] = useState("10");
  const [isChecking, setIsChecking] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [eligibilityStatus, setEligibilityStatus] = useState<"idle" | "eligible" | "ineligible" | "cooldown">("idle");
  const [lastClaimTime, setLastClaimTime] = useState<string | null>(null);
  const { toast } = useToast();

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
      // Mock eligibility check - in real app this would call API
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Simulate different eligibility states
      const random = Math.random();
      if (random > 0.7) {
        setEligibilityStatus("cooldown");
        setLastClaimTime("2 hours ago");
      } else if (random > 0.1) {
        setEligibilityStatus("eligible");
        setLastClaimTime(null);
      } else {
        setEligibilityStatus("ineligible");
        setLastClaimTime(null);
      }
    } catch (error) {
      toast({
        title: "Check Failed",
        description: "Failed to check eligibility. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsChecking(false);
    }
  };

  const handleClaim = async () => {
    if (eligibilityStatus !== "eligible") return;
    
    setIsClaiming(true);
    
    try {
      // Mock claim process - in real app this would interact with blockchain
      await new Promise(resolve => setTimeout(resolve, 2500));
      
      onClaim?.(claimAmount);
      setEligibilityStatus("cooldown");
      setLastClaimTime("Just now");
      
      toast({
        title: "Claim Successful!",
        description: `Successfully claimed ${claimAmount} STT tokens`,
      });
    } catch (error) {
      toast({
        title: "Claim Failed",
        description: "Failed to claim tokens. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsClaiming(false);
    }
  };

  const getEligibilityBadge = () => {
    switch (eligibilityStatus) {
      case "eligible":
        return (
          <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">
            <CheckCircle className="h-3 w-3 mr-1" />
            Eligible
          </Badge>
        );
      case "ineligible":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" />
            Not Eligible
          </Badge>
        );
      case "cooldown":
        return (
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
            <Clock className="h-3 w-3 mr-1" />
            Cooldown
          </Badge>
        );
      default:
        return null;
    }
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
          Claim your daily STT tokens for testing on Somnia testnet
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="claim-amount">Amount (STT)</Label>
          <Input
            id="claim-amount"
            type="number"
            value={claimAmount}
            onChange={(e) => setClaimAmount(e.target.value)}
            placeholder="Enter amount"
            min="1"
            max="100"
            data-testid="input-claim-amount"
            disabled={!isConnected}
          />
          <p className="text-xs text-muted-foreground">
            Maximum: 100 STT per day
          </p>
        </div>

        {!isConnected && (
          <div className="p-3 bg-muted rounded-lg flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            Connect your wallet to check eligibility
          </div>
        )}

        {isConnected && eligibilityStatus === "idle" && (
          <Button 
            onClick={checkEligibility}
            disabled={isChecking}
            className="w-full"
            data-testid="button-check-eligibility"
          >
            {isChecking ? "Checking..." : "Check Eligibility"}
          </Button>
        )}

        {eligibilityStatus === "eligible" && (
          <Button 
            onClick={handleClaim}
            disabled={isClaiming}
            className="w-full"
            data-testid="button-claim-tokens"
          >
            {isClaiming ? "Claiming..." : `Claim ${claimAmount} STT`}
          </Button>
        )}

        {eligibilityStatus === "ineligible" && (
          <div className="space-y-2">
            <Button disabled className="w-full">
              Not Eligible
            </Button>
            <p className="text-xs text-red-600 dark:text-red-400">
              You are not eligible to claim tokens at this time.
            </p>
          </div>
        )}

        {eligibilityStatus === "cooldown" && (
          <div className="space-y-2">
            <Button disabled className="w-full">
              Cooldown Active
            </Button>
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              Last claim: {lastClaimTime}. Please wait 24 hours between claims.
            </p>
          </div>
        )}

        {isConnected && (
          <Button 
            variant="outline" 
            onClick={checkEligibility}
            disabled={isChecking}
            className="w-full"
            data-testid="button-recheck-eligibility"
          >
            Recheck Eligibility
          </Button>
        )}
      </CardContent>
    </Card>
  );
}