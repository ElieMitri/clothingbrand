import { X } from "lucide-react";

interface ToastProps {
  title: string;
  description?: string;
  onClose: () => void;
}

export function Toast({ title, description, onClose }: ToastProps) {
  return (
    <div className="adm-toast" role="status">
      <div>
        <p className="adm-toast__title">{title}</p>
        {description ? <p className="adm-muted">{description}</p> : null}
      </div>
      <button type="button" className="adm-icon-button" onClick={onClose} aria-label="Dismiss notification">
        <X size={14} />
      </button>
    </div>
  );
}
