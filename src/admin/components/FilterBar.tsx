import type { SavedView } from "../types";

interface FilterBarProps {
  savedViews: SavedView[];
  activeView: string;
  onViewChange: (viewId: string) => void;
  children?: React.ReactNode;
}

export function FilterBar({ savedViews, activeView, onViewChange, children }: FilterBarProps) {
  return (
    <div className="adm-card adm-filter-bar">
      <div className="adm-filter-bar__views" role="tablist" aria-label="Saved views">
        {savedViews.map((view) => (
          <button
            key={view.id}
            type="button"
            className={`adm-tab ${activeView === view.id ? "is-active" : ""}`}
            role="tab"
            aria-selected={activeView === view.id}
            onClick={() => onViewChange(view.id)}
          >
            {view.label}
          </button>
        ))}
      </div>
      <div className="adm-filter-bar__controls">{children}</div>
    </div>
  );
}
