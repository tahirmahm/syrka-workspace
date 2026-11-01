"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Moon, Sun, LoaderCircle } from "lucide-react";
import { Auth } from "@/components/auth";
import { ToolsShell } from "@/components/tools/shell";
import {
  supabase,
  cloudConfigError,
  isDemoMode,
  setDemoMode,
} from "@/lib/storage";
export function NativeFrame({
  app,
  children,
}: {
  app: "calendar" | "forms";
  children: (identity: { id: string; demo: boolean }) => ReactNode;
}) {
  const [identity, setIdentity] = useState<{
      id: string;
      demo: boolean;
    } | null>(null),
    [loading, setLoading] = useState(true),
    [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.dataset.nativeTheme === "dark");
    const load = async () => {
      if (isDemoMode())
        setIdentity({ id: "00000000-0000-4000-8000-000000000001", demo: true });
      else if (supabase) {
        const { data } = await supabase.auth.getSession();
        setIdentity(
          data.session && !data.session.user.is_anonymous
            ? { id: data.session.user.id, demo: false }
            : null,
        );
      }
      setLoading(false);
    };
    void load().catch(() => setLoading(false));
    const listener = supabase?.auth.onAuthStateChange((_event, session) => {
      if (!isDemoMode())
        setIdentity(
          session && !session.user.is_anonymous
            ? { id: session.user.id, demo: false }
            : null,
        );
    });
    return () => listener?.data.subscription.unsubscribe();
  }, []);
  if (loading)
    return (
      <div className="native-office">
        <div className="native-loading">
          <LoaderCircle
            className="native-spin"
            aria-label="Loading application"
          />
        </div>
      </div>
    );
  if (!identity)
    return (
      <Auth
        initialMessage={cloudConfigError || ""}
        onDemo={async () => {
          setDemoMode(true);
          setIdentity({
            id: "00000000-0000-4000-8000-000000000001",
            demo: true,
          });
        }}
        onAuthenticated={() => window.location.reload()}
      />
    );
  return (
    <div className="native-office">
      <ToolsShell application={app} cloudData={!identity.demo}>
        <div className="native-app">
          <div className="native-identity">
            <span>
              {identity.demo
                ? "Demo • saved on this device"
                : "Private account workspace"}
            </span>
            {!identity.demo && (
              <button
                title="Copy your account ID for calendar sharing"
                onClick={() => void navigator.clipboard.writeText(identity.id)}
              >
                Account ID
              </button>
            )}
            <button
              aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
              onClick={() => {
                const value = !dark;
                setDark(value);
                document.documentElement.dataset.nativeTheme = value
                  ? "dark"
                  : "light";
                localStorage.setItem(
                  "syrka-native-theme",
                  value ? "dark" : "light",
                );
              }}
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}{" "}
              {dark ? "Light" : "Dark"}
            </button>
          </div>
          {identity.demo && (
            <p className="native-notice">
              Local demo. Publishing, shared calendars, AI and scheduled
              reminders require a signed-in account.{" "}
              <button
                onClick={() => {
                  setDemoMode(false);
                  window.location.reload();
                }}
              >
                Sign in
              </button>
            </p>
          )}
          <div key={identity.id}>{children(identity)}</div>
        </div>
      </ToolsShell>
    </div>
  );
}
export function ErrorNotice({
  error,
  clear,
}: {
  error: string;
  clear: () => void;
}) {
  return error ? (
    <div className="native-error" role="alert">
      <span>{error}</span>
      <button onClick={clear}>Dismiss</button>
    </div>
  ) : null;
}
