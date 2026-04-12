export default function HistoricoLoading() {
  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
      {/* Header skeleton */}
      <section className="panel rounded-[28px] p-6 sm:p-8">
        <div className="h-3 w-36 animate-pulse rounded-full bg-border" />
        <div className="mt-3 h-9 w-64 animate-pulse rounded-full bg-border" />
        <div className="mt-2 h-3 w-80 animate-pulse rounded-full bg-border" />
      </section>

      {/* Métricas skeleton */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="panel rounded-[20px] p-5">
            <div className="h-3 w-28 animate-pulse rounded-full bg-border" />
            <div className="mt-2 h-8 w-16 animate-pulse rounded-full bg-border" />
            <div className="mt-1 h-2.5 w-24 animate-pulse rounded-full bg-border" />
          </div>
        ))}
      </section>

      {/* Seletor de rodadas skeleton */}
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-7 w-10 animate-pulse rounded-full bg-border" />
        ))}
      </div>

      {/* Cards de variação skeleton */}
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="panel rounded-[20px] border border-border p-5 space-y-4">
            <div className="flex justify-between">
              <div className="h-5 w-10 animate-pulse rounded-full bg-border" />
              <div className="h-5 w-12 animate-pulse rounded-full bg-border" />
            </div>
            <div>
              <div className="h-3 w-48 animate-pulse rounded-full bg-border" />
              <div className="mt-1.5 h-2.5 w-36 animate-pulse rounded-full bg-border" />
            </div>
            <div className="space-y-1.5">
              {[1, 2, 3].map((j) => (
                <div key={j} className="h-9 w-full animate-pulse rounded-xl bg-border" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
