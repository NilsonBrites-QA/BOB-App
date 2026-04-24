type PageHeroTone = "neutral" | "accent" | "signal" | "danger";

type PageHeroChip = {
  label: string;
  tone?: PageHeroTone;
};

type PageHeroMetric = {
  label: string;
  value: string;
  note: string;
  tone?: PageHeroTone;
};

type PageHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  chips?: PageHeroChip[];
  metrics?: PageHeroMetric[];
  aside?: React.ReactNode;
  extra?: React.ReactNode;
};

const chipToneStyles: Record<PageHeroTone, string> = {
  neutral: "border-border/80 bg-background/60 text-muted",
  accent: "border-accent/20 bg-accent/10 text-accent-strong",
  signal: "border-signal/25 bg-signal/10 text-signal",
  danger: "border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300",
};

const metricToneStyles: Record<PageHeroTone, string> = {
  neutral: "text-foreground",
  accent: "text-accent-strong",
  signal: "text-signal",
  danger: "text-red-600 dark:text-red-300",
};

export function PageHero({
  eyebrow,
  title,
  description,
  chips = [],
  metrics = [],
  aside,
  extra,
}: PageHeroProps) {
  return (
    <section className="hero-panel panel overflow-hidden rounded-[32px] px-6 py-6 sm:px-8 sm:py-8">
      <div className="relative z-10 grid gap-8 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <div className="space-y-5">
          <div className="space-y-3">
            <p className="kicker text-xs text-muted">{eyebrow}</p>
            <div className="space-y-3">
              <h1 className="max-w-4xl text-3xl font-semibold leading-tight sm:text-4xl xl:text-[2.8rem]">
                {title}
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-muted sm:text-base">
                {description}
              </p>
            </div>
          </div>

          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {chips.map((chip) => (
                <span
                  key={chip.label}
                  className={[
                    "inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-medium",
                    chipToneStyles[chip.tone ?? "neutral"],
                  ].join(" ")}
                >
                  {chip.label}
                </span>
              ))}
            </div>
          )}

          {extra}
        </div>

        <div className="space-y-4">
          {metrics.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {metrics.map((metric) => (
                <article
                  key={metric.label}
                  className="rounded-[24px] border border-border/80 bg-background/55 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur"
                >
                  <p className="kicker text-[11px] text-muted">{metric.label}</p>
                  <p
                    className={[
                      "mt-3 text-2xl font-semibold leading-tight sm:text-[1.8rem]",
                      metricToneStyles[metric.tone ?? "neutral"],
                    ].join(" ")}
                  >
                    {metric.value}
                  </p>
                  <p className="mt-2 text-xs leading-6 text-muted">{metric.note}</p>
                </article>
              ))}
            </div>
          )}

          {aside}
        </div>
      </div>
    </section>
  );
}
