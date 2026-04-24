type SectionCardProps = {
  title: string;
  value: string;
  description: string;
  tone?: "neutral" | "accent" | "signal";
};

const toneStyles = {
  neutral: "from-white/70 to-white/20 dark:from-white/8 dark:to-transparent",
  accent: "from-accent/14 to-transparent",
  signal: "from-signal/14 to-transparent",
};

export function SectionCard({
  title,
  value,
  description,
  tone = "neutral",
}: SectionCardProps) {
  return (
    <article className="panel panel-hover relative overflow-hidden rounded-[24px] p-5">
      <div
        className={[
          "pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b opacity-90",
          toneStyles[tone],
        ].join(" ")}
      />
      <div className="relative space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="kicker text-xs text-muted">{title}</p>
          <span className="h-1.5 w-10 rounded-full bg-border/80" />
        </div>
        <h3 className="text-2xl font-semibold leading-none sm:text-[1.8rem]">{value}</h3>
        <p className="max-w-[18rem] text-sm leading-6 text-muted">{description}</p>
      </div>
    </article>
  );
}
