import { useQuery } from '@tanstack/react-query'

export function AnalyticsChart() {
  const { data: chartData, isLoading } = useQuery({
    queryKey: ['/api/stats/chart'],
    refetchInterval: 300000, // Refresh every 5 minutes
  })

  if (isLoading) {
    return (
      <div className="border rounded-lg p-6 bg-card">
        <h2 className="text-xl font-bold mb-4">Analytics Chart</h2>
        <div className="h-64 flex items-center justify-center">
          <p>Loading chart data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="border rounded-lg p-6 bg-card">
      <h2 className="text-xl font-bold mb-4">Claims Over Time</h2>
      <div className="h-64 flex items-center justify-center border rounded">
        <div className="text-center">
          <p className="text-muted-foreground">Chart placeholder</p>
          <p className="text-sm text-muted-foreground">
            {chartData?.length || 0} data points available
          </p>
        </div>
      </div>
    </div>
  )
}