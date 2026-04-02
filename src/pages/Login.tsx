import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ChevronLeft,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, resetPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

  useEffect(() => {
    const remembered = localStorage.getItem("remember_email");
    if (remembered) {
      setEmail(remembered);
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    const navNotice =
      typeof location.state === "object" &&
      location.state !== null &&
      "message" in location.state &&
      typeof (location.state as { message?: unknown }).message === "string"
        ? (location.state as { message: string }).message
        : "";

    if (navNotice) setNotice(navNotice);
  }, [location.state]);

  const validate = () => {
    if (!normalizedEmail) return "Email is required.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return "Please enter a valid email address.";
    }
    if (!password) return "Password is required.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    return "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setNotice("");

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setLoading(true);
      await signIn(normalizedEmail, password);

      if (rememberMe) {
        localStorage.setItem("remember_email", normalizedEmail);
      } else {
        localStorage.removeItem("remember_email");
      }

      navigate("/", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to sign in.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError("");
    setNotice("");

    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Enter your email first, then click reset password.");
      return;
    }

    try {
      setLoading(true);
      await resetPassword(normalizedEmail);
      setNotice("Password reset email sent. Check your inbox.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to send reset email.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-16 pb-12 px-4">
      <div className="max-w-xl mx-auto surface-card rounded-3xl border border-slate-700/70 overflow-hidden premium-ring min-h-[780px] flex flex-col">
        <div className="border-b border-slate-700/70 bg-[linear-gradient(120deg,rgba(34,211,238,0.14),rgba(15,23,42,0.1))] px-6 md:px-10 py-6">
          <div className="flex items-center justify-between gap-3">
            <p className="inline-flex items-center gap-2 text-xs tracking-[0.16em] text-cyan-100">
              <Sparkles size={13} />
              MEMBER ACCESS
            </p>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-cyan-200 transition-colors"
            >
              <ChevronLeft size={14} />
              Home
            </Link>
          </div>
          <h1 className="mt-3 font-display text-3xl md:text-4xl tracking-[0.08em] text-slate-50">
            SIGN IN TO ISHTARI 961
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Professional checkout, real-time orders, and premium member features.
          </p>
        </div>

        <div className="p-6 md:p-10 flex-1 flex">
          <form onSubmit={handleSubmit} className="w-full flex flex-col">
            <div className="space-y-4 pt-2">
              {error ? (
                <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-rose-200 text-sm flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5" />
                  <span>{error}</span>
                </div>
              ) : null}

              {notice ? (
                <div className="rounded-xl border border-cyan-300/35 bg-cyan-500/10 px-4 py-3 text-cyan-100 text-sm">
                  {notice}
                </div>
              ) : null}

              <div>
                <label className="block text-xs tracking-[0.14em] text-slate-300 mb-2">
                  EMAIL
                </label>
                <div className="relative">
                  <Mail
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com"
                    className="w-full rounded-xl border border-slate-600/80 pl-10 pr-3 py-3 focus:outline-none focus:border-cyan-300"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs tracking-[0.14em] text-slate-300 mb-2">
                  PASSWORD
                </label>
                <div className="relative">
                  <Lock
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-xl border border-slate-600/80 pl-10 pr-11 py-3 focus:outline-none focus:border-cyan-300"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-500"
                    />
                    Remember me
                  </label>

                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    className="text-sm text-cyan-200 hover:text-cyan-100 underline"
                  >
                    Reset password
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-auto pt-6 space-y-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl px-6 py-3.5 luxe-button text-sm font-semibold tracking-[0.14em] disabled:opacity-60"
              >
                {loading ? "SIGNING IN..." : "SIGN IN"}
              </button>

              <p className="text-center text-sm text-slate-300">
                New here?{" "}
                <Link
                  to="/register"
                  className="text-cyan-200 hover:text-cyan-100 underline"
                >
                  Create an account
                </Link>
              </p>
              <p className="text-center text-xs text-slate-400">
                By signing in, you agree to our{" "}
                <Link
                  to="/terms"
                  className="text-cyan-200 hover:text-cyan-100 underline"
                >
                  Terms
                </Link>{" "}
                and{" "}
                <Link
                  to="/privacy"
                  className="text-cyan-200 hover:text-cyan-100 underline"
                >
                  Privacy Policy
                </Link>
                .
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
