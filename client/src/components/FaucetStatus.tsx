import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Droplets, Clock, AlertCircle } from "lucide-react";

interface FaucetStatusProps {
  balance?: string;
  status?: "online" | "offline" | "maintenance";
  dailyLimit?: string;
  nextRefill?: string;
}

export function FaucetStatus({ 
  balance = "50,000 STT",
  status = "online",
  dailyLimit = "100 STT",
  nextRefill = "12:34:56"
}: FaucetStatusProps) {
  
  const getStatusIcon = () => {
    switch (status) {
      case "online":
        return <Activity className="h-4 w-4 text-green-500" />;
      case "offline":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "maintenance":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getStatusBadge = () => {
    switch (status) {
      case "online":
        return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">Online</Badge>;
      case "offline":
        return <Badge variant="destructive">Offline</Badge>;
      case "maintenance":
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">Maintenance</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
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
              {balance}
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              Daily Limit per User
            </div>
            <div className="text-xl font-semibold font-mono" data-testid="text-daily-limit">
              {dailyLimit}
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              Next Refill
            </div>
            <div className="text-xl font-semibold font-mono" data-testid="text-next-refill">
              {nextRefill}
            </div>
          </div>
        </div>
        
        {status === "offline" && (
          <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-400">
              Faucet is currently offline for maintenance. Please check back later.
            </p>
          </div>
        )}
        
        {status === "maintenance" && (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-700 dark:text-yellow-400">
              Faucet is under maintenance. Limited functionality may be available.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}