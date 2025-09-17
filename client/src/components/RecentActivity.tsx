import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, ExternalLink, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { faucetApi } from "@/lib/api";

interface RecentActivityProps {
  limit?: number;
}

export function RecentActivity({ limit = 20 }: RecentActivityProps) {
  const { toast } = useToast();
  
  const { data: activities, isLoading, error } = useQuery({
    queryKey: ['/api/claims/recent', limit],
    queryFn: () => faucetApi.getRecentClaims(limit),
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const truncateHash = (hash: string | null) => {
    if (!hash) return "Processing...";
    return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
  };

  const copyToClipboard = async (text: string, type: string) => {
    await navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${type} copied to clipboard`,
    });
  };

  const getStatusBadge = (status: "success" | "pending" | "failed") => {
    switch (status) {
      case "success":
        return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400">Success</Badge>;
      case "pending":
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">Pending</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Recent Activity
          </CardTitle>
          <CardDescription>
            Latest token claims and transactions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 animate-pulse">
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-muted rounded w-32"></div>
                  <div className="h-3 bg-muted rounded w-48"></div>
                </div>
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-16"></div>
                  <div className="h-4 bg-muted rounded w-12"></div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-400">
              Failed to load recent activity. Please try refreshing the page.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Recent Activity
          </CardTitle>
          <CardDescription>
            Latest token claims and transactions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Activity className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-sm text-muted-foreground">
              No recent activity yet. Be the first to claim tokens!
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Recent Activity
        </CardTitle>
        <CardDescription>
          Latest token claims and transactions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-4">
            {activities.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover-elevate">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm" data-testid={`activity-address-${activity.id}`}>
                      {truncateAddress(activity.walletAddress)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(activity.walletAddress, "Address")}
                      data-testid={`copy-address-${activity.id}`}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{activity.timeAgo}</span>
                    <span>•</span>
                    <span className="font-mono" data-testid={`activity-hash-${activity.id}`}>
                      {truncateHash(activity.transactionHash)}
                    </span>
                    {activity.transactionHash && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4"
                          onClick={() => copyToClipboard(activity.transactionHash!, "Transaction hash")}
                          data-testid={`copy-hash-${activity.id}`}
                        >
                          <Copy className="h-2 w-2" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4"
                          onClick={() => window.open(`https://explorer.fogo.io/tx/${activity.transactionHash}`, '_blank')}
                          title="View transaction on Fogo Explorer"
                          data-testid={`view-tx-${activity.id}`}
                        >
                          <ExternalLink className="h-2 w-2" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <div className="font-semibold font-mono" data-testid={`activity-amount-${activity.id}`}>
                    {activity.amount} STT
                  </div>
                  {getStatusBadge(activity.status)}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}