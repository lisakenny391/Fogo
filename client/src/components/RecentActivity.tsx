import { useQuery } from '@tanstack/react-query'

export function RecentActivity() {
  const { data: activities, isLoading } = useQuery({
    queryKey: ['/api/activity/recent'],
    refetchInterval: 15000, // Refresh every 15 seconds
  })

  if (isLoading) {
    return (
      <div className="border rounded-lg p-6 bg-card">
        <h2 className="text-xl font-bold mb-4">Recent Activity</h2>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="border rounded-lg p-6 bg-card">
      <h2 className="text-xl font-bold mb-4">Recent Activity</h2>
      <div className="space-y-2 max-h-80 overflow-y-auto">
        {activities?.length ? (
          activities.map((activity: any) => (
            <div key={activity.id} className="flex justify-between items-center py-2 border-b border-border">
              <div>
                <div className="font-medium">{activity.amount} FOGO</div>
                <div className="text-sm text-muted-foreground">
                  {activity.walletAddress.slice(0, 8)}...{activity.walletAddress.slice(-8)}
                </div>
              </div>
              <div className="text-right">
                <div className={`text-sm font-medium ${
                  activity.status === 'completed' ? 'text-green-600' : 
                  activity.status === 'pending' ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {activity.status}
                </div>
                <div className="text-xs text-muted-foreground">{activity.timeAgo}</div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-muted-foreground">No recent activity</p>
        )}
      </div>
    </div>
  )
}