interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="adm-empty-state" role="status">
      <h3>{title}</h3>
      <p className="adm-muted">{description}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
