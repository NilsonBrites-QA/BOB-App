export default function CalendarioLoading() {
  return (
    <div className="flex flex-1 flex-col gap-8 px-4 py-10 sm:px-6 lg:px-10">
      {/* Header skeleton */}
      <section className="panel rounded-[28px] p-6 sm:p-8">
        <div className="h-3 w-36 animate-pulse rounded-full bg-border" />
        <div className="mt-3 h-9 w-44 animate-pulse rounded-full bg-border" />
        <div className="mt-4 flex gap-2">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-6 w-12 animate-pulse rounded-full bg-border" />
          ))}
        </div>
      </section>

      {/* Jogos skeleton */}
      <div className="flex flex-col gap-6">
        {[1, 2].map((group) => (
          <section key={group}>
            <div className="mb-3 h-2.5 w-40 animate-pulse rounded-full bg-border" />
            <div className="flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="panel flex items-center gap-4 rounded-[16px] px-4 py-3">
                  <div className="h-5 w-16 animate-pulse rounded-full bg-border" />
                  <div className="flex flex-1 justify-end gap-2">
                    <div className="h-3 w-20 animate-pulse rounded-full bg-border" />
                    <div className="h-5 w-5 animate-pulse rounded-full bg-border" />
                  </div>
                  <div className="h-5 w-20 animate-pulse rounded-full bg-border mx-4" />
                  <div className="flex flex-1 gap-2">
                    <div className="h-5 w-5 animate-pulse rounded-full bg-border" />
                    <div className="h-3 w-20 animate-pulse rounded-full bg-border" />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
