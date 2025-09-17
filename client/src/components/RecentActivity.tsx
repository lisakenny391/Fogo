import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Activity, ExternalLink, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface ActivityItem {
  id: string;
  address: string;
  amount: string;
  timestamp: string;
  txHash: string;
  status: "success" | "pending" | "failed";
}

interface RecentActivityProps {
  activities?: ActivityItem[];
}

export function RecentActivity({ 
  activities = [
    {
      id: "1",
      address: "0x742d35Cc6e34C0532925a3b8D0f5757d112e4b01",
      amount: "50 STT",
      timestamp: "2 minutes ago",
      txHash: "0xabcd1234...5678efgh",
      status: "success"
    },
    {
      id: "2", 
      address: "0x8Ba1f109551bD432803012645Hac136c92F89e976",
      amount: "25 STT",
      timestamp: "5 minutes ago", 
      txHash: "0x1234abcd...efgh5678",
      status: "success"
    },
    {
      id: "3",
      address: "0x9Cd2f108440aC431702901634Hac157c82F79e887",
      amount: "100 STT",
      timestamp: "8 minutes ago",
      txHash: "0x5678efgh...abcd1234", 
      status: "pending"
    },
    {
      id: "4",
      address: "0x4Ef3g207330bD320601890523Hac168d71F69d776",
      amount: "75 STT",
      timestamp: "12 minutes ago",
      txHash: "0xefgh5678...1234abcd",
      status: "success"
    },
    {
      id: "5",
      address: "0x2Bc1e096220eC210490789412Hac179e60F58c665",
      amount: "30 STT", 
      timestamp: "15 minutes ago",
      txHash: "0x9876fedc...4321dcba",
      status: "failed"
    }
  ]
}: RecentActivityProps) {
  const { toast } = useToast();

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const truncateHash = (hash: string) => {
    return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
  };

  const copyToClipboard = async (text: string, type: string) => {
    await navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: `${type} copied to clipboard`,
    });
  };

  const getStatusBadge = (status: ActivityItem["status"]) => {
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
                      {truncateAddress(activity.address)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyToClipboard(activity.address, "Address")}
                      data-testid={`copy-address-${activity.id}`}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{activity.timestamp}</span>
                    <span>•</span>
                    <span className="font-mono" data-testid={`activity-hash-${activity.id}`}>
                      {truncateHash(activity.txHash)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4"
                      onClick={() => copyToClipboard(activity.txHash, "Transaction hash")}
                      data-testid={`copy-hash-${activity.id}`}
                    >
                      <Copy className="h-2 w-2" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4"
                      data-testid={`view-tx-${activity.id}`}
                    >
                      <ExternalLink className="h-2 w-2" />
                    </Button>
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <div className="font-semibold font-mono" data-testid={`activity-amount-${activity.id}`}>
                    {activity.amount}
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