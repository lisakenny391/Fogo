import { StatsDashboard } from '../StatsDashboard';

export default function StatsDashboardExample() {
  const mockStats = {
    totalClaims: "12,456",
    totalUsers: "3,789", 
    tokensDistributed: "1.2M STT",
    avgClaimTime: "2.3s"
  };

  return (
    <div className="p-4">
      <StatsDashboard stats={mockStats} />
    </div>
  );
}