"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Sun, Moon, Send, CheckCircle2 } from "lucide-react";
import { Brand } from "@/components/brand";
import { Auth } from "@/components/auth";
import { ErrorNotice } from "./frame";
import { Questions } from "./questions";
import { supabase } from "@/lib/storage";
import { nativeRequest } from "@/lib/native/client";
import {
  validateAnswers,
  type FormSchema,
  type Answers,
} from "@/lib/native/forms";
export default function Respond({ token }: { token: string }) {
  const [form, setForm] = useState<{
      schema: FormSchema;
      version_id: string;
      access: "public" | "authenticated";
    } | null>(null),
    [answers, setAnswers] = useState<Answers>({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState<{ id: string; confirmation: string } | null>(
      null,
    ),
    [auth, setAuth] = useState(false),
    [dark, setDark] = useState(false),
    [identity, setIdentity] = useState<{
      response_id: string;
      receipt: string;
    } | null>(null);
  useEffect(() => {
    setDark(document.documentElement.dataset.nativeTheme === "dark");
    void nativeRequest("public?token=" + token)
      .then((value) => {
        setForm(value);
        setAuth(false);
        try {
          const key = "syrka-form-response:" + token;
          let saved = JSON.parse(sessionStorage.getItem(key) || "null");
          if (!saved) {
            saved = {
              response_id: crypto.randomUUID(),
              receipt: Array.from(
                crypto.getRandomValues(new Uint8Array(32)),
                (x) => x.toString(16).padStart(2, "0"),
              ).join(""),
            };
            sessionStorage.setItem(key, JSON.stringify(saved));
          }
          setIdentity(saved);
        } catch {
          setIdentity({
            response_id: crypto.randomUUID(),
            receipt: crypto.randomUUID() + crypto.randomUUID(),
          });
        }
      })
      .catch((e) => {
        setError(e.message);
        if (/sign in/i.test(e.message)) setAuth(true);
      });
  }, [token]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form || !identity) return;
    setBusy(true);
    setError("");
    try {
      const website = new FormData(e.currentTarget).get("website") || "";
      const validated = validateAnswers(form.schema, answers);
      const result = await nativeRequest("public", {
        token,
        version_id: form.version_id,
        ...identity,
        answers: validated,
        website,
      });
      setDone(result);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Submission failed. Your answers remain on this page.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (auth)
    return (
      <Auth
        allowDemo={false}
        initialMessage={error}
        onDemo={async () => {}}
        onAuthenticated={() => window.location.reload()}
      />
    );
  return (
    <div className="native-office native-respond">
      <header>
        <Brand />
        <button
          aria-label="Toggle form appearance"
          onClick={() => {
            setDark(!dark);
            document.documentElement.dataset.nativeTheme = dark
              ? "light"
              : "dark";
            localStorage.setItem("syrka-native-theme", dark ? "light" : "dark");
          }}
        >
          {dark ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </header>
      <main className="native-respond-content">
        <ErrorNotice error={error} clear={() => setError("")} />
        {done ? (
          <section className="native-panel native-empty">
            <CheckCircle2 size={40} />
            <h1>Response received</h1>
            <p>{done.confirmation}</p>
            <small>Receipt: {done.id}</small>
            {form?.access === "public" && (
              <button
                onClick={() => {
                  const next = {
                    response_id: crypto.randomUUID(),
                    receipt: Array.from(
                      crypto.getRandomValues(new Uint8Array(32)),
                      (x) => x.toString(16).padStart(2, "0"),
                    ).join(""),
                  };
                  setIdentity(next);
                  try {
                    sessionStorage.setItem(
                      "syrka-form-response:" + token,
                      JSON.stringify(next),
                    );
                  } catch {}
                  setAnswers({});
                  setDone(null);
                }}
              >
                Submit another response
              </button>
            )}
            <p>
              Your answers are private to the form owner. Keep this confirmation
              for your records.
            </p>
          </section>
        ) : form ? (
          <form onSubmit={submit} className="native-stack">
            <div className="native-panel">
              <span className="native-eyebrow">SYRKA FORMS</span>
              <h1>{form.schema.title}</h1>
              <p>{form.schema.description}</p>
              <small>
                Required questions are marked *. Responses are visible to the
                form owner. This form does not request your account identity
                unless sign-in is required.
              </small>
            </div>
            <Questions
              schema={form.schema}
              answers={answers}
              setAnswers={setAnswers}
              upload={async (q, file) => {
                if (!identity)
                  throw Error("The response session is not ready.");
                const body = new FormData();
                body.set("file", file);
                body.set("token", token);
                body.set("question_id", q.id);
                body.set("response_id", identity.response_id);
                body.set("receipt", identity.receipt);
                body.set("answers", JSON.stringify(answers));
                const session = await supabase?.auth.getSession();
                const access = session?.data.session?.access_token;
                const res = await fetch("/workspace/api/native/upload", {
                  method: "POST",
                  headers: access ? { Authorization: "Bearer " + access } : {},
                  body,
                });
                const result = await res.json();
                if (!res.ok) throw Error(result.error || "Upload failed.");
                return result.id;
              }}
            />
            <label className="native-honeypot" aria-hidden="true">
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
            <button
              className="native-primary native-submit"
              disabled={busy || !identity}
              type="submit"
            >
              <Send size={18} />
              {busy ? "Submitting…" : "Submit response"}
            </button>
            <small>
              Never share passwords, payment details or highly sensitive
              information through a form.
            </small>
          </form>
        ) : !error ? (
          <p role="status">Opening form…</p>
        ) : null}
      </main>
    </div>
  );
}
