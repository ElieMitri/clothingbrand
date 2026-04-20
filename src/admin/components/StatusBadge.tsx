interface StatusBadgeProps {
  tone: "neutral" | "success" | "warning" | "danger" | "info";
  children: React.ReactNode;
}

export function StatusBadge({ tone, children }: StatusBadgeProps) {
  return <span className={`adm-status adm-status--${tone}`}>{children}</span>;
}
