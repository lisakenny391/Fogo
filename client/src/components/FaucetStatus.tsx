import { useQuery } from '@tanstack/react-query'

export function FaucetStatus() {
  const { data: status, isLoading } = useQuery({
    queryKey: ['/api/faucet/status'],
    refetchInterval: 30000, // Refresh every 30 seconds
  })

  if (isLoading) {
    return (
      <div className="border rounded-lg p-6 bg-card">
        <h2 className="text-xl font-bold mb-4">Faucet Status</h2>
        <p>Loading...</p>
      </div>
    )
  }

  return (
    <div className="border rounded-lg p-6 bg-card">
      <h2 className="text-xl font-bold mb-4">Faucet Status</h2>
      <div className="space-y-2">
        <div className="flex justify-between">
          <span>Status:</span>
          <span className={status?.isActive ? 'text-green-600' : 'text-red-600'}>
            {status?.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Balance:</span>
          <span>{status?.balance || '0'} FOGO</span>
        </div>
        <div className="flex justify-between">
          <span>Daily Limit:</span>
          <span>{status?.dailyLimit || '0'} FOGO</span>
        </div>
        <div className="flex justify-between">
          <span>Total Claims:</span>
          <span>{status?.totalClaims || 0}</span>
        </div>
      </div>
    </div>
  )
}