import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

interface AdminRouteProps {
  children: React.ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { user, loading } = useAuth();

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-300 mx-auto mb-4"></div>
          <p className="text-slate-300">Loading...</p>
        </div>
      </div>
    );
  }

  // Check if user is logged in
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Check if user is admin
  const adminEmails = ["eliegmitri7@gmail.com", "sammourdany@gmail.com"];
  const isAdmin = user.email && adminEmails.includes(user.email);

  if (!isAdmin) {
    return (
      <div className="min-h-screen pt-24 flex flex-col items-center justify-center px-4 bg-gray-50">
        <div className="text-center max-w-md bg-white p-12 rounded-2xl shadow-lg">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg
              className="w-10 h-10 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-3xl font-light mb-4">Access Denied</h2>
          <p className="text-gray-600 mb-8">
            You don't have permission to access the admin dashboard.
          </p>
          <a
            href="/"
            className="inline-block px-8 py-3 bg-black text-white rounded-xl hover:bg-gray-800 transition-colors font-semibold"
          >
            Go to Home
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
