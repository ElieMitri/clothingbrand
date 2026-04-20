import { Link } from "react-router-dom";

interface PageHeaderProps {
  title: string;
  breadcrumbs: Array<{ label: string; href?: string }>;
  description?: string;
  primaryAction?: React.ReactNode;
  secondaryActions?: React.ReactNode;
}

export function PageHeader({
  title,
  breadcrumbs,
  description,
  primaryAction,
  secondaryActions,
}: PageHeaderProps) {
  return (
    <header className="adm-page-header">
      <nav aria-label="Breadcrumb" className="adm-breadcrumbs">
        {breadcrumbs.map((crumb, index) => (
          <span key={`${crumb.label}-${index}`}>
            {crumb.href ? <Link to={crumb.href}>{crumb.label}</Link> : crumb.label}
            {index < breadcrumbs.length - 1 ? <span aria-hidden="true">/</span> : null}
          </span>
        ))}
      </nav>
      <div className="adm-page-header__main">
        <div>
          <h1>{title}</h1>
          {description ? <p className="adm-muted">{description}</p> : null}
        </div>
        <div className="adm-page-header__actions">
          {secondaryActions}
          {primaryAction}
        </div>
      </div>
    </header>
  );
}
