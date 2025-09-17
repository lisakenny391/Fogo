import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Users, Coins, Clock } from "lucide-react";

interface StatsData {
  totalClaims: string;
  totalUsers: string;
  tokensDistributed: string;
  avgClaimTime: string;
}

interface StatsDashboardProps {
  stats?: StatsData;
}

export function StatsDashboard({ 
  stats = {
    totalClaims: "12,456",
    totalUsers: "3,789",
    tokensDistributed: "1.2M STT",
    avgClaimTime: "2.3s"
  }
}: StatsDashboardProps) {
  
  const statItems = [
    {
      title: "Total Claims",
      value: stats.totalClaims,
      description: "Successful token claims",
      icon: Coins,
      trend: "+12.5%"
    },
    {
      title: "Active Users",
      value: stats.totalUsers,
      description: "Unique wallet addresses",
      icon: Users,
      trend: "+8.2%"
    },
    {
      title: "Tokens Distributed",
      value: stats.tokensDistributed,
      description: "Total STT distributed",
      icon: TrendingUp,
      trend: "+15.3%"
    },
    {
      title: "Avg Claim Time",
      value: stats.avgClaimTime,
      description: "Average processing time",
      icon: Clock,
      trend: "-0.5s"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                item.trend.startsWith('-') && item.title === "Avg Claim Time" ? 'text-green-600' :
                'text-red-600'
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