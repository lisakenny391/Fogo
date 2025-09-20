export function Navigation() {
  return (
    <nav className="border-b bg-background">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">FOGO Faucet</h1>
          <div className="flex items-center space-x-4">
            <a href="/" className="text-foreground hover:text-primary">Home</a>
            <a href="/analytics" className="text-foreground hover:text-primary">Analytics</a>
          </div>
        </div>
      </div>
    </nav>
  )
}