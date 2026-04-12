export default function ClassificacaoLoading() {
  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
      {/* Header skeleton */}
      <section className="panel rounded-[28px] p-6 sm:p-8">
        <div className="h-3 w-40 animate-pulse rounded-full bg-border" />
        <div className="mt-3 h-9 w-72 animate-pulse rounded-full bg-border" />
        <div className="mt-3 h-3 w-56 animate-pulse rounded-full bg-border" />
      </section>

      {/* Tabela skeleton */}
      <section className="overflow-hidden rounded-[20px] border border-border">
        <div className="border-b border-border/60 bg-[rgba(18,32,24,0.04)] px-4 py-3">
          <div className="h-3 w-64 animate-pulse rounded-full bg-border" />
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 border-t border-border/60 px-4 py-3"
          >
            <div className="h-4 w-4 animate-pulse rounded-full bg-border" />
            <div className="h-5 w-5 animate-pulse rounded-full bg-border" />
            <div className="h-3 w-28 animate-pulse rounded-full bg-border" />
            <div className="ml-auto flex gap-6">
              {[1, 2, 3, 4, 5, 6].map((j) => (
                <div key={j} className="h-3 w-5 animate-pulse rounded-full bg-border" />
              ))}
              <div className="h-4 w-8 animate-pulse rounded-full bg-border" />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
