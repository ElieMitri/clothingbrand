interface StatCardProps {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down";
}

export function StatCard({ label, value, delta, trend }: StatCardProps) {
  return (
    <article className="adm-card adm-stat-card">
      <p className="adm-muted adm-stat-card__label">{label}</p>
      <p className="adm-stat-card__value">{value}</p>
      <p className={trend === "up" ? "adm-positive" : "adm-negative"}>{delta}</p>
    </article>
  );
}
