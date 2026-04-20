import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";

interface PlaceholderPageProps {
  title: string;
  description: string;
  actionLabel: string;
}

export function PlaceholderPage({ title, description, actionLabel }: PlaceholderPageProps) {
  return (
    <div className="adm-page">
      <PageHeader
        title={title}
        breadcrumbs={[{ label: "Admin", href: "/admin/overview" }, { label: title }]}
        description={description}
      />
      <section className="adm-card adm-panel">
        <EmptyState
          title={`${title} workspace ready`}
          description="This section is scaffolded and ready for your real data + business logic wiring."
          action={<button className="adm-button adm-button--primary">{actionLabel}</button>}
        />
      </section>
    </div>
  );
}
