interface StatCardProps {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down";
  action?: React.ReactNode;
}

export function StatCard({ label, value, delta, trend, action }: StatCardProps) {
  return (
    <article className="adm-card adm-stat-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <p className="adm-muted adm-stat-card__label">{label}</p>
        {action}
      </div>
      <p className="adm-stat-card__value">{value}</p>
      <p className={trend === "up" ? "adm-positive" : "adm-negative"}>{delta}</p>
    </article>
  );
}
