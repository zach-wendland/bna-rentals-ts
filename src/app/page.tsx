/**
 * Home page - Nashville Rentals Dashboard
 * Migrated from Python streamlit_app.py
 */

export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4">
        <div className="mb-8">
          <h1 className="text-4xl font-bold tracking-tight">
            Nashville Rentals
          </h1>
          <p className="text-muted-foreground mt-2">
            Real-time rental property listings from Zillow
          </p>
        </div>

        <div className="rounded-lg border bg-card p-8 text-center">
          <h2 className="text-2xl font-semibold mb-4">Dashboard Coming Soon</h2>
          <p className="text-muted-foreground">
            The rental property dashboard is being built.
            <br />
            API endpoints are ready for data fetching and persistence.
          </p>
        </div>
      </div>
    </main>
  )
}
