import { useState } from 'react'

export function ClaimInterface() {
  const [address, setAddress] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleClaim = async () => {
    if (!address.trim()) return
    setIsLoading(true)
    
    try {
      const response = await fetch('/api/faucet/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: address })
      })
      const result = await response.json()
      console.log('Claim result:', result)
      alert(response.ok ? 'Claim successful!' : `Error: ${result.error}`)
    } catch (error) {
      console.error('Claim error:', error)
      alert('Claim failed')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="border rounded-lg p-6 bg-card">
      <h2 className="text-xl font-bold mb-4">Claim FOGO Tokens</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-2">Wallet Address</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Enter Solana wallet address..."
            className="w-full px-3 py-2 border rounded-md bg-background"
          />
        </div>
        <button
          onClick={handleClaim}
          disabled={isLoading || !address.trim()}
          className="w-full bg-primary text-primary-foreground py-2 px-4 rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          {isLoading ? 'Claiming...' : 'Claim Tokens'}
        </button>
      </div>
    </div>
  )
}