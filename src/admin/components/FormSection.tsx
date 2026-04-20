interface FormSectionProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function FormSection({ title, description, children }: FormSectionProps) {
  return (
    <section className="adm-card adm-form-section">
      <header>
        <h3>{title}</h3>
        {description ? <p className="adm-muted">{description}</p> : null}
      </header>
      <div className="adm-form-grid">{children}</div>
    </section>
  );
}
