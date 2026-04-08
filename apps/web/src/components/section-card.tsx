type SectionCardProps = {
  title: string;
  value: string;
  description: string;
};

export function SectionCard({ title, value, description }: SectionCardProps) {
  return (
    <article className="panel rounded-[22px] p-5">
      <p className="kicker text-xs text-muted">{title}</p>
      <h3 className="mt-3 text-xl font-semibold leading-8">{value}</h3>
      <p className="mt-2 text-sm leading-7 text-muted">{description}</p>
    </article>
  );
}