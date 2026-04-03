import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  ChevronLeft,
  Check,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  Sparkles,
  User,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

export function Register() {
  const navigate = useNavigate();
  const { signUp } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const normalizedPhoneDigits = useMemo(
    () => phone.replace(/\D/g, ""),
    [phone]
  );
  const formatLebaneseLocalPhone = (digits: string) => {
    const clean = digits.replace(/\D/g, "").slice(0, 8);
    const a = clean.slice(0, 2);
    const b = clean.slice(2, 5);
    const c = clean.slice(5, 8);
    return [a, b, c].filter(Boolean).join(" ");
  };

  const passwordChecks = {
    minLength: password.length >= 8,
    upper: /[A-Z]/.test(password),
    lower: /[a-z]/.test(password),
    number: /\d/.test(password),
  };

  const validate = () => {
    if (!firstName.trim() || firstName.trim().length < 2) {
      return "First name must be at least 2 characters.";
    }
    if (!lastName.trim() || lastName.trim().length < 2) {
      return "Last name must be at least 2 characters.";
    }
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return "Please enter a valid email address.";
    }
    if (!phone.trim()) {
      return "Please fill in your mobile number.";
    }
    if (normalizedPhoneDigits.length !== 8) {
      return "Please enter a valid Lebanese mobile number (8 digits).";
    }

    if (!passwordChecks.minLength || !passwordChecks.upper || !passwordChecks.lower || !passwordChecks.number) {
      return "Password must include 8+ chars, upper/lowercase letters, and a number.";
    }

    if (confirmPassword !== password) {
      return "Passwords do not match.";
    }

    if (!agreeToTerms) {
      return "You need to accept the terms to continue.";
    }

    return "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      if (validationError.toLowerCase().includes("mobile number")) {
        alert(validationError);
      }
      return;
    }

    try {
      setLoading(true);
      const normalizedPhone = `+961 ${formatLebaneseLocalPhone(
        normalizedPhoneDigits
      )}`;

      await signUp(
        normalizedEmail,
        password,
        firstName.trim(),
        lastName.trim(),
        normalizedPhone
      );

      try {
        await fetch("/api/send-user-created-discord", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: normalizedEmail,
            phone: normalizedPhone,
            source: "register",
          }),
        });
      } catch (notifyError) {
        console.error("User created webhook failed:", notifyError);
      }

      setSuccess("Account created successfully. Redirecting to login...");
      setTimeout(() => {
        navigate("/login", {
          replace: true,
          state: {
            message: "Your account is ready. Please sign in.",
          },
        });
      }, 1500);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create account.";
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
              NEW ACCOUNT
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
            CREATE YOUR ACCOUNT
          </h1>
          <p className="mt-2 text-sm text-slate-300">
            Join the store for faster checkout, order tracking, and member updates.
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

              {success ? (
                <div className="rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-emerald-200 text-sm">
                  {success}
                </div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs tracking-[0.14em] text-slate-300 mb-2">
                    FIRST NAME
                  </label>
                  <div className="relative">
                    <User
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="John"
                      className="w-full rounded-xl border border-slate-600/80 pl-10 pr-3 py-3 focus:outline-none focus:border-cyan-300"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs tracking-[0.14em] text-slate-300 mb-2">
                    LAST NAME
                  </label>
                  <div className="relative">
                    <User
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    />
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Doe"
                      className="w-full rounded-xl border border-slate-600/80 pl-10 pr-3 py-3 focus:outline-none focus:border-cyan-300"
                      required
                    />
                  </div>
                </div>
              </div>

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
                  MOBILE NUMBER
                </label>
                <div className="relative">
                  <Phone
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <span className="absolute left-9 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                    +961
                  </span>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) =>
                      setPhone(formatLebaneseLocalPhone(e.target.value))
                    }
                    placeholder="70 123 456"
                    className="w-full rounded-xl border border-slate-600/80 pl-24 pr-3 py-3 focus:outline-none focus:border-cyan-300"
                    autoComplete="tel"
                    required
                  />
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Lebanese numbers only (8 digits).
                </p>
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
                    placeholder="Create a strong password"
                    className="w-full rounded-xl border border-slate-600/80 pl-10 pr-11 py-3 focus:outline-none focus:border-cyan-300"
                    autoComplete="new-password"
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

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {[
                    { ok: passwordChecks.minLength, label: "8+ chars" },
                    { ok: passwordChecks.upper, label: "Uppercase" },
                    { ok: passwordChecks.lower, label: "Lowercase" },
                    { ok: passwordChecks.number, label: "Number" },
                  ].map((rule) => (
                    <div
                      key={rule.label}
                      className={`inline-flex items-center gap-1.5 ${
                        rule.ok ? "text-emerald-300" : "text-slate-400"
                      }`}
                    >
                      <Check size={12} />
                      <span>{rule.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs tracking-[0.14em] text-slate-300 mb-2">
                  CONFIRM PASSWORD
                </label>
                <div className="relative">
                  <Lock
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat password"
                    className="w-full rounded-xl border border-slate-600/80 pl-10 pr-11 py-3 focus:outline-none focus:border-cyan-300"
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                    aria-label="Toggle confirm password visibility"
                  >
                    {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-700/70 bg-slate-900/50 p-4 space-y-3">
                <label className="inline-flex items-start gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={agreeToTerms}
                    onChange={(e) => setAgreeToTerms(e.target.checked)}
                    className="h-4 w-4 mt-0.5 rounded border-slate-500"
                  />
                  <span>
                    I agree to the{" "}
                    <Link to="/terms" className="text-cyan-200 hover:text-cyan-100 underline">
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link
                      to="/privacy"
                      className="text-cyan-200 hover:text-cyan-100 underline"
                    >
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </label>

              </div>
            </div>

            <div className="mt-auto pt-6 space-y-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl px-6 py-3.5 luxe-button text-sm font-semibold tracking-[0.14em] disabled:opacity-60"
              >
                {loading ? "CREATING ACCOUNT..." : "CREATE ACCOUNT"}
              </button>

              <p className="text-center text-sm text-slate-300">
                Already have an account?{" "}
                <Link to="/login" className="text-cyan-200 hover:text-cyan-100 underline">
                  Sign in
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
