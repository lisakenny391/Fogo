import { useQuery } from '@tanstack/react-query'

export function StatsDashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['/api/stats'],
    refetchInterval: 60000, // Refresh every minute
  })

  if (isLoading) {
    return (
      <div className="border rounded-lg p-6 bg-card">
        <h2 className="text-xl font-bold mb-4">Statistics</h2>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="border rounded-lg p-6 bg-card">
      <h2 className="text-xl font-bold mb-4">Statistics</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
          <div className="text-sm text-muted-foreground">Total Users</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{stats?.totalClaims || 0}</div>
          <div className="text-sm text-muted-foreground">Total Claims</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{stats?.totalDistributed || 0}</div>
          <div className="text-sm text-muted-foreground">FOGO Distributed</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold">{stats?.totalBonusDistributed || 0}</div>
          <div className="text-sm text-muted-foreground">Bonus Distributed</div>
        </div>
      </div>
    </div>
  )
}