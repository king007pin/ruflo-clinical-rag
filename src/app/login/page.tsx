"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState, useCallback } from "react";
import Image from "next/image";

type Mode = "login" | "signup";

// ── Clinical designation options ──────────────────────────────────────────────
const DESIGNATIONS = [
  { value: "",             label: "Select your role…" },
  { value: "consultant",   label: "Consultant / Attending" },
  { value: "resident",     label: "Resident / Registrar" },
  { value: "gp",           label: "General Practitioner" },
  { value: "intern",       label: "Intern / House Officer" },
  { value: "pg_student",   label: "Postgraduate Student" },
  { value: "ug_student",   label: "Undergraduate Student" },
  { value: "nurse",        label: "Nurse Practitioner" },
  { value: "other",        label: "Other Licensed Clinician" },
];

// ── Password strength scorer ──────────────────────────────────────────────────
function scorePassword(pw: string): { score: number; label: string; color: string } {
  if (pw.length === 0) return { score: 0, label: "", color: "transparent" };
  let score = 0;
  if (pw.length >= 8)               score++;
  if (pw.length >= 12)              score++;
  if (/[A-Z]/.test(pw))             score++;
  if (/[0-9]/.test(pw))             score++;
  if (/[^A-Za-z0-9]/.test(pw))      score++;
  if (score <= 1) return { score, label: "Weak",   color: "#ef4444" };
  if (score <= 2) return { score, label: "Fair",   color: "#f59e0b" };
  if (score <= 3) return { score, label: "Good",   color: "#3b82f6" };
  return           { score, label: "Strong", color: "#10b981" };
}

// ── Per-field inline validation ───────────────────────────────────────────────
const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

function validateField(
  name: string,
  value: string,
  extra?: { password?: string },
): string {
  switch (name) {
    case "fullName":
      return value.trim().length < 2 ? "Please enter your full name" : "";
    case "email":
      return !EMAIL_RE.test(value.trim()) ? "Enter a valid email address" : "";
    case "institution":
      return value.trim().length < 2 ? "Please enter your institution" : "";
    case "designation":
      return value === "" ? "Please select your role" : "";
    case "password":
      return value.length < 8 ? "Password must be at least 8 characters" : "";
    case "confirmPassword":
      return value !== extra?.password ? "Passwords do not match" : "";
    default:
      return "";
  }
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");

  // form fields
  const [email,           setEmail]           = useState("");
  const [password,        setPassword]        = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName,        setFullName]        = useState("");
  const [institution,     setInstitution]     = useState("");
  const [designation,     setDesignation]     = useState("");

  // ui state
  const [showPw,        setShowPw]        = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [fieldErrors,   setFieldErrors]   = useState<Record<string, string>>({});
  const [touched,       setTouched]       = useState<Record<string, boolean>>({});
  const [error,         setError]         = useState<string | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [signedUp,      setSignedUp]      = useState(false);

  const strength = scorePassword(password);

  // blur → validate individual field
  const handleBlur = useCallback(
    (name: string, value: string) => {
      setTouched((t) => ({ ...t, [name]: true }));
      setFieldErrors((e) => ({
        ...e,
        [name]: validateField(name, value, { password }),
      }));
    },
    [password],
  );

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setSignedUp(false);
    setFieldErrors({});
    setTouched({});
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setFullName("");
    setInstitution("");
    setDesignation("");
    setShowPw(false);
    setShowConfirmPw(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // client-side full validation before touching the API
    if (mode === "signup") {
      const errs: Record<string, string> = {
        fullName:        validateField("fullName",        fullName),
        email:           validateField("email",           email),
        institution:     validateField("institution",     institution),
        designation:     validateField("designation",     designation),
        password:        validateField("password",        password),
        confirmPassword: validateField("confirmPassword", confirmPassword, { password }),
      };
      setFieldErrors(errs);
      setTouched({
        fullName: true, email: true, institution: true,
        designation: true, password: true, confirmPassword: true,
      });
      if (Object.values(errs).some(Boolean)) return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const res = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email:       email.trim(),
            password,
            fullName:    fullName.trim(),
            institution: institution.trim(),
            designation,
          }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          if (res.status === 429) {
            throw new Error(
              "Too many accounts created from this network. Please try again in an hour.",
            );
          }
          throw new Error(data.error ?? "Sign up failed");
        }
        // Show pending-approval screen — do NOT redirect silently
        setSignedUp(true);
        return;
      } else {
        const res = await fetch("/api/auth", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), password }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          if (res.status === 429) {
            throw new Error("Too many login attempts. Please wait a minute and try again.");
          }
          throw new Error(data.error ?? "Login failed");
        }
      }
      router.push(params.get("from") ?? "/");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // ── Post-signup pending approval screen ──────────────────────────────────────
  if (signedUp) {
    return (
      <main
        className="flex min-h-screen items-center justify-center px-4 relative overflow-hidden"
        style={{
          background:
            "radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.1) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(20, 184, 166, 0.1) 0%, transparent 40%), var(--bg)",
        }}
      >
        <div
          className="w-full max-w-md rounded-3xl border p-8 shadow-2xl backdrop-blur-xl text-center space-y-5"
          style={{
            backgroundColor: "color-mix(in srgb, var(--card) 45%, transparent)",
            borderColor: "var(--card-border)",
          }}
        >
          {/* tick icon */}
          <div
            className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: "rgba(20,184,166,0.12)" }}
          >
            <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="#14b8a6" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h2 className="text-xl font-bold" style={{ color: "var(--text)" }}>
            Account created
          </h2>

          <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            Your account has been created with <strong>read-only access</strong>. A MedIQ admin
            will review your details and upgrade your account to clinician access — usually within
            one working day.
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            You can sign in now, but the clinical query swarm requires admin approval before it
            becomes available to you.
          </p>

          <button
            onClick={() => switchMode("login")}
            className="w-full rounded-2xl py-3 text-sm font-bold text-white transition-all duration-300 hover:-translate-y-0.5"
            style={{ background: "linear-gradient(135deg, #6366f1, #14b8a6)" }}
          >
            Go to sign in
          </button>
        </div>
      </main>
    );
  }

  // ── Shared input style helpers ────────────────────────────────────────────────
  const baseInputCls =
    "mt-1.5 w-full rounded-xl border px-3.5 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent";
  const inputCls = (name: string) =>
    `${baseInputCls} ${touched[name] && fieldErrors[name] ? "!border-red-400" : ""}`;
  const inputStyle = {
    borderColor: "var(--card-border)",
    backgroundColor: "rgba(0, 0, 0, 0.05)",
    color: "var(--text)",
  };
  const FieldError = ({ name }: { name: string }) =>
    touched[name] && fieldErrors[name] ? (
      <p className="mt-1 text-xs text-red-400">{fieldErrors[name]}</p>
    ) : null;

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4 relative overflow-hidden"
      style={{
        background:
          "radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.1) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(20, 184, 166, 0.1) 0%, transparent 40%), var(--bg)",
      }}
    >
      {/* Ambient blobs */}
      <div className="absolute top-1/4 left-1/3 -z-10 h-72 w-72 rounded-full bg-indigo-500/10 blur-[120px] animate-pulse duration-10000" />
      <div className="absolute bottom-1/4 right-1/3 -z-10 h-72 w-72 rounded-full bg-teal-500/10 blur-[120px] animate-pulse duration-7000" />

      <div
        className="w-full max-w-md rounded-3xl border p-8 shadow-2xl backdrop-blur-xl transition-all duration-500 hover:shadow-[0_20px_50px_rgba(99,102,241,0.15)] hover:scale-[1.01]"
        style={{
          backgroundColor: "color-mix(in srgb, var(--card) 45%, transparent)",
          borderColor: "var(--card-border)",
        }}
      >
        {/* Header */}
        <div className="mb-6 text-center">
          <div className="inline-block relative mb-4">
            <Image
              src="/brain-icon.png"
              alt="Mediq Logo"
              width={64}
              height={64}
              className="h-16 w-16 transition-all duration-500 hover:rotate-6 hover:scale-105"
              style={{ filter: "drop-shadow(0 4px 15px rgba(13,148,136,0.3))" }}
              priority
            />
          </div>
          <p
            className="text-[10px] font-bold uppercase tracking-[0.3em] mb-1"
            style={{ color: "var(--accent)" }}
          >
            Clinical Swarm Notebook
          </p>
          <h1
            className="text-3xl font-extrabold tracking-tight"
            style={{ color: "var(--text)", fontFamily: "var(--font-sans, 'Inter', sans-serif)" }}
          >
            MEDIQ
          </h1>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            Licensed Clinical Portal
          </p>
        </div>

        {/* Tabs — Bypass tab removed from production */}
        <div
          className="flex p-1 mb-6 rounded-xl border transition-all duration-300 gap-0.5"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.05)", borderColor: "var(--card-border)" }}
        >
          {([
            { id: "login",  label: "Sign In"  },
            { id: "signup", label: "Sign Up"  },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchMode(tab.id)}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold tracking-wide transition-all duration-300 ${
                mode === tab.id
                  ? "shadow-sm text-[color:var(--text)] bg-[color:var(--card)]"
                  : "text-[color:var(--muted)] hover:text-[color:var(--text)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── Full name (signup only) ── */}
          {mode === "signup" && (
            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                style={{ color: "var(--text)" }}
              >
                Full name
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onBlur={(e) => handleBlur("fullName", e.target.value)}
                  required
                  placeholder="Dr. Aisha Kapoor"
                  autoComplete="name"
                  className={inputCls("fullName")}
                  style={inputStyle}
                />
              </label>
              <FieldError name="fullName" />
            </div>
          )}

          {/* ── Email ── */}
          <div>
            <label
              className="block text-xs font-bold uppercase tracking-wider mb-1.5"
              style={{ color: "var(--text)" }}
            >
              {mode === "signup" ? "Email address" : "Clinical email address"}
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onBlur={(e) => handleBlur("email", e.target.value)}
                required
                placeholder="doctor@hospital.com"
                autoComplete={mode === "signup" ? "email" : "username"}
                className={inputCls("email")}
                style={inputStyle}
              />
            </label>
            <FieldError name="email" />
          </div>

          {/* ── Institution (signup only) ── */}
          {mode === "signup" && (
            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                style={{ color: "var(--text)" }}
              >
                Hospital / institution
                <input
                  type="text"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  onBlur={(e) => handleBlur("institution", e.target.value)}
                  required
                  placeholder="AIIMS New Delhi / City General Hospital"
                  autoComplete="organization"
                  className={inputCls("institution")}
                  style={inputStyle}
                />
              </label>
              <FieldError name="institution" />
            </div>
          )}

          {/* ── Clinical role (signup only) ── */}
          {mode === "signup" && (
            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                style={{ color: "var(--text)" }}
              >
                Clinical role
                <select
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  onBlur={(e) => handleBlur("designation", e.target.value)}
                  required
                  className={inputCls("designation")}
                  style={{ ...inputStyle, appearance: "none" as const }}
                >
                  {DESIGNATIONS.map((d) => (
                    <option key={d.value} value={d.value} disabled={d.value === ""}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
              <FieldError name="designation" />
            </div>
          )}

          {/* ── Password ── */}
          <div>
            <label
              className="block text-xs font-bold uppercase tracking-wider mb-1.5"
              style={{ color: "var(--text)" }}
            >
              {mode === "signup" ? "Create password" : "Clinician password"}
            </label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={(e) => handleBlur("password", e.target.value)}
                required
                autoFocus
                minLength={mode === "signup" ? 8 : undefined}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                placeholder="••••••••"
                className={inputCls("password")}
                style={{ ...inputStyle, paddingRight: "3.5rem" }}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold transition-colors"
                style={{ color: "var(--muted)", marginTop: "0.75rem" }}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
            <FieldError name="password" />

            {/* Password strength meter (signup only) */}
            {mode === "signup" && password.length > 0 && (
              <div className="mt-2">
                <div className="flex gap-1 mb-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="h-1 flex-1 rounded-full transition-all duration-300"
                      style={{
                        backgroundColor: strength.score >= i ? strength.color : "rgba(0,0,0,0.1)",
                      }}
                    />
                  ))}
                </div>
                <p className="text-[10px] font-semibold" style={{ color: strength.color }}>
                  {strength.label}
                </p>
              </div>
            )}
          </div>

          {/* ── Confirm password (signup only) ── */}
          {mode === "signup" && (
            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider mb-1.5"
                style={{ color: "var(--text)" }}
              >
                Confirm password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPw ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onBlur={(e) => handleBlur("confirmPassword", e.target.value)}
                  required
                  autoComplete="new-password"
                  placeholder="••••••••"
                  className={inputCls("confirmPassword")}
                  style={{ ...inputStyle, paddingRight: "3.5rem" }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPw((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[11px] font-semibold transition-colors"
                  style={{ color: "var(--muted)", marginTop: "0.75rem" }}
                  aria-label={showConfirmPw ? "Hide password" : "Show password"}
                >
                  {showConfirmPw ? "Hide" : "Show"}
                </button>
              </div>
              <FieldError name="confirmPassword" />
            </div>
          )}

          {/* Global API error */}
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-3.5 py-2.5 text-xs text-red-400 font-medium leading-relaxed">
              ⚠️ {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full relative overflow-hidden rounded-2xl py-3 text-sm font-bold text-white shadow-lg shadow-indigo-500/20 transition-all duration-300 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
            style={{ background: "linear-gradient(135deg, #6366f1, #14b8a6)" }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {mode === "signup" ? "Creating account…" : "Verifying credentials…"}
              </span>
            ) : mode === "signup" ? (
              "Create Account & Enter"
            ) : (
              "Enter Swarm Ecosystem"
            )}
          </button>

          {/* Terms — signup only */}
          {mode === "signup" && (
            <p className="text-center text-[10px]" style={{ color: "var(--muted)" }}>
              By signing up you agree to our{" "}
              <a href="/terms" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
                Terms of Use
              </a>{" "}
              and{" "}
              <a href="/privacy" className="underline underline-offset-2" style={{ color: "var(--accent)" }}>
                Privacy Policy
              </a>
              .
            </p>
          )}
        </form>

        <p
          className="mt-6 text-center text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--muted)" }}
        >
          CONFIDENTIAL · DISCRETION ADVISED
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
