import { AdminLayout } from "./components/AdminLayout";
import { ToastProvider } from "./hooks/useToast";
import "./admin.css";

export function AdminRoot() {
  return (
    <ToastProvider>
      <AdminLayout />
    </ToastProvider>
  );
}
