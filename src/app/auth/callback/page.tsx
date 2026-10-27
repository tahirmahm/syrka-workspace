"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, cloudConfigError } from "@/lib/storage";
import { authErrorMessage } from "@/lib/cloud-config";
export default function AuthCallback() {
  const [message, setMessage] = useState("Confirming your sign-in…");
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    async function confirm() {
      try {
        if (!supabase)
          throw Error(cloudConfigError || "Cloud sign-in is unavailable.");
        const params = new URLSearchParams(window.location.search);
        const hash = new URLSearchParams(window.location.hash.slice(1));
        const error =
          params.get("error_description") || hash.get("error_description");
        if (error) throw Error(error);
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!data.session && params.get("code")) {
          const result = await supabase.auth.exchangeCodeForSession(
            params.get("code")!,
          );
          if (result.error) throw result.error;
        }
        const result = await supabase.auth.getUser();
        if (result.error || !result.data.user)
          throw Error(
            "This confirmation link is invalid or has expired. Return to sign-in and try again.",
          );
        if (active) window.location.replace("/");
      } catch (error) {
        if (active) {
          setFailed(true);
          setMessage(authErrorMessage(error));
        }
      }
    }
    void confirm();
    return () => {
      active = false;
    };
  }, []);
  return (
    <main className="auth-page">
      <div className="auth-card">
        <h1>{failed ? "Link could not be verified." : "Welcome back."}</h1>
        <p role={failed ? "alert" : "status"}>{message}</p>
        <Link href="/" className="auth-tools-link">
          Return to sign-in
        </Link>
      </div>
    </main>
  );
}
