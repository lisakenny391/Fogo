import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, Coins } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { faucetApi } from "@/lib/api";

interface StatsDashboardProps {
  // Props are optional since we'll fetch data from API
}

export function StatsDashboard(props: StatsDashboardProps) {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['/api/stats'],
    queryFn: () => faucetApi.getStats(),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                <div className="h-4 bg-muted rounded w-20 animate-pulse"></div>
              </CardTitle>
              <div className="h-4 w-4 bg-muted rounded animate-pulse"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-muted rounded w-24 animate-pulse mb-2"></div>
              <div className="h-3 bg-muted rounded w-32 animate-pulse"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="col-span-full">
          <CardContent className="pt-6">
            <div className="p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-400">
                Failed to load statistics. Please try refreshing the page.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    } else {
      return num.toString();
    }
  };

  const formatTokenAmount = (amount: string) => {
    const num = parseFloat(amount);
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M FOGO`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K FOGO`;
    } else {
      return `${num.toFixed(0)} FOGO`;
    }
  };

  const statItems = [
    {
      title: "Total Claims",
      value: formatNumber(stats.totalClaims),
      description: "Successful token claims",
      icon: Coins,
      trend: "+12.5%"
    },
    {
      title: "Active Users",
      value: formatNumber(stats.totalUsers),
      description: "Unique wallet addresses",
      icon: Users,
      trend: "+8.2%"
    },
    {
      title: "Tokens Distributed",
      value: formatTokenAmount(stats.totalDistributed),
      description: "Total FOGO distributed",
      icon: TrendingUp,
      trend: "+15.3%"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {statItems.map((item, index) => (
        <Card key={index} className="hover-elevate">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {item.title}
            </CardTitle>
            <item.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono" data-testid={`stat-${item.title.toLowerCase().replace(/\s+/g, '-')}`}>
              {item.value}
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-muted-foreground">
                {item.description}
              </p>
              <span className={`text-xs font-medium ${
                item.trend.startsWith('+') ? 'text-green-600' : 
                item.trend === "Online" ? 'text-green-600' :
                item.trend === "Offline" ? 'text-red-600' :
                'text-muted-foreground'
              }`}>
                {item.trend}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}