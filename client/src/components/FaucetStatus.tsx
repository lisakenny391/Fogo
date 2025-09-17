import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Droplets, Clock, AlertCircle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { faucetApi } from "@/lib/api";

interface FaucetStatusProps {
  // Props are optional since we'll fetch data from API
}

export function FaucetStatus(props: FaucetStatusProps) {
  const { data: status, isLoading, error } = useQuery({
    queryKey: ['/api/faucet/status'],
    queryFn: () => faucetApi.getStatus(),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Droplets className="h-5 w-5 text-primary" />
            Faucet Status
          </CardTitle>
          <CardDescription>
            Loading faucet information...
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-2">
                  <div className="h-4 bg-muted rounded w-24"></div>
                  <div className="h-8 bg-muted rounded w-32"></div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !status) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Droplets className="h-5 w-5 text-primary" />
            Faucet Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-400">
              Failed to load faucet status. Please try refreshing the page.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusIcon = () => {
    if (status.isActive) {
      return <Activity className="h-4 w-4 text-green-500" />;
    } else {
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const getStatusBadge = () => {
    if (status.isActive) {
      return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">Online</Badge>;
    } else {
      return <Badge variant="destructive">Offline</Badge>;
    }
  };

  const formatBalance = (balance: string) => {
    const num = parseFloat(balance);
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M FOGO`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K FOGO`;
    } else {
      return `${num.toFixed(0)} FOGO`;
    }
  };

  const formatNextRefill = (nextRefill: string) => {
    const refillDate = new Date(nextRefill);
    const now = new Date();
    const diff = refillDate.getTime() - now.getTime();
    
    if (diff <= 0) {
      return "Soon";
    }
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Droplets className="h-5 w-5 text-primary" />
            Faucet Status
          </span>
          {getStatusBadge()}
        </CardTitle>
        <CardDescription>
          Real-time faucet information and availability
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {getStatusIcon()}
              Current Balance
            </div>
            <div className="text-2xl font-bold font-mono" data-testid="text-faucet-balance">
              {formatBalance(status.balance)}
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              Daily Limit per User
            </div>
            <div className="text-xl font-semibold font-mono" data-testid="text-daily-limit">
              {status.dailyLimit} FOGO
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              Next Refill
            </div>
            <div className="text-xl font-semibold font-mono" data-testid="text-next-refill">
              {formatNextRefill(status.nextRefill)}
            </div>
          </div>
        </div>
        
        {!status.isActive && (
          <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-400">
              Faucet is currently offline for maintenance. Please check back later.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}