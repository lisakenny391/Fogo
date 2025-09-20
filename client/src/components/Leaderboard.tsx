import { useQuery } from '@tanstack/react-query'

export function Leaderboard() {
  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ['/api/leaderboard'],
    refetchInterval: 60000, // Refresh every minute
  })

  if (isLoading) {
    return (
      <div className="border rounded-lg p-6 bg-card">
        <h2 className="text-xl font-bold mb-4">Leaderboard</h2>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="border rounded-lg p-6 bg-card">
      <h2 className="text-xl font-bold mb-4">Top Claimers</h2>
      <div className="space-y-2">
        {leaderboard?.length ? (
          leaderboard.slice(0, 10).map((entry: any, index: number) => (
            <div key={entry.walletAddress} className="flex justify-between items-center py-2">
              <div className="flex items-center space-x-3">
                <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
                  {index + 1}
                </div>
                <div>
                  <div className="font-medium">
                    {entry.walletAddress.slice(0, 8)}...{entry.walletAddress.slice(-8)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {entry.claims} claims
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="font-medium">{entry.totalAmount} FOGO</div>
                <div className="text-xs text-muted-foreground">{entry.lastClaimAgo}</div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-muted-foreground">No leaderboard data</p>
        )}
      </div>
    </div>
  )
}