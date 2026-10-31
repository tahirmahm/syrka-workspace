"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import { suiteName } from "@/lib/model";
import { supabase, cloudConfigError } from "@/lib/storage";
import { authErrorMessage } from "@/lib/cloud-config";
import { workspacePath } from "@/lib/paths";
export function Auth({
  onDemo,
  initialMessage = "",
  allowDemo = true,
  onAuthenticated,
}: {
  onDemo: () => Promise<void>;
  initialMessage?: string;
  allowDemo?: boolean;
  onAuthenticated?: () => void;
}) {
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(
    initialMessage || cloudConfigError || "",
  );
  const [failed, setFailed] = useState(
    Boolean(initialMessage || cloudConfigError),
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailed(false);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFailed(true);
      setMessage("Enter a valid email address.");
      return;
    }
    if (password.length < (signup ? 8 : 1)) {
      setFailed(true);
      setMessage(
        signup
          ? "Choose a password with at least 8 characters."
          : "Enter your password.",
      );
      return;
    }
    if (!supabase) {
      setFailed(true);
      setMessage(cloudConfigError || "Cloud sign-in is unavailable.");
      return;
    }
    setBusy(true);
    setMessage(signup ? "Creating your account…" : "Signing you in…");
    try {
      const credentials = { email, password };
      const result = signup
        ? await supabase.auth.signUp({
            ...credentials,
            options: {
              emailRedirectTo: `${window.location.origin}${workspacePath("/auth/callback")}`,
            },
          })
        : await supabase.auth.signInWithPassword(credentials);
      if (result.error) throw result.error;
      if (signup && !result.data.session)
        setMessage(
          "Your registration request was accepted. Check your inbox and spam folder for a confirmation link, then return here to sign in. Email delivery has not been independently verified. If you already have an account, sign in instead.",
        );
      else {
        setMessage("Signed in. Opening your workspace…");
        onAuthenticated?.();
      }
    } catch (error) {
      setFailed(true);
      setMessage(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link
          href="/"
          className="brand"
          aria-label={suiteName}
          title={suiteName}
        >
          <Brand />
        </Link>
        <h1>
          Your next idea
          <br />
          starts here.
        </h1>
        <p>
          Welcome to Syrka Workspace. Write your documents, organize numbers in
          Tables, and tell your story with Present.
        </p>
        {allowDemo && (
          <Button
            type="button"
            className="demo-sign-in"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onDemo();
              } catch (error) {
                setFailed(true);
                setMessage(authErrorMessage(error));
              } finally {
                setBusy(false);
              }
            }}
          >
            Try demo — no account needed
          </Button>
        )}
        <Link className="auth-tools-link" href="/tools">
          Explore free Tools — no account needed
        </Link>
        <form onSubmit={submit} noValidate aria-busy={busy}>
          <label>
            Email
            <input
              aria-label="Email"
              type="email"
              name="email"
              required
              autoComplete="email"
              disabled={busy}
            />
          </label>
          <label>
            Password
            <input
              aria-label="Password"
              type="password"
              name="password"
              required
              minLength={signup ? 8 : 1}
              autoComplete={signup ? "new-password" : "current-password"}
              disabled={busy}
            />
          </label>
          <Button type="submit" disabled={busy || !supabase}>
            {busy
              ? signup
                ? "Creating account…"
                : "Signing in…"
              : signup
                ? "Create account"
                : "Sign in"}
          </Button>
          <p
            className={failed ? "auth-error" : "auth-status"}
            role={failed ? "alert" : "status"}
          >
            {message}
          </p>
        </form>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setSignup(!signup);
            setMessage(cloudConfigError || "");
            setFailed(Boolean(cloudConfigError));
          }}
        >
          {signup
            ? "Already have an account? Sign in"
            : "New to Syrka? Create an account"}
        </Button>
      </div>
    </main>
  );
}
