"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  ClipboardList,
  Copy,
  Archive,
  Trash2,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  Eye,
  Undo2,
  Redo2,
  ExternalLink,
  Check,
  Download,
  Sparkles,
  X,
  Table2,
  BarChart3,
  Send,
} from "lucide-react";
import { NativeFrame, ErrorNotice } from "./frame";
import { Questions } from "./questions";
import {
  rows,
  put,
  remove,
  nativeRequest,
  saveDownload,
} from "@/lib/native/client";
import {
  blankForm,
  blankQuestion,
  questionTypes,
  validateForm,
  validateAnswers,
  responseRows,
  csv,
  type FormRecord,
  type FormSchema,
  type Question,
  type Answers,
} from "@/lib/native/forms";
import { supabase, saveFile, isDemoMode } from "@/lib/storage";
import { makeFile } from "@/lib/model";
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
export default function FormsApp({
  formId,
  responses = false,
}: {
  formId?: string;
  responses?: boolean;
}) {
  return (
    <NativeFrame app="forms">
      {(identity) =>
        formId ? (
          <FormBuilder {...identity} formId={formId} responses={responses} />
        ) : (
          <FormLibrary {...identity} />
        )
      }
    </NativeFrame>
  );
}
function FormLibrary({ id: uid }: { id: string; demo: boolean }) {
  const router = useRouter(),
    [forms, setForms] = useState<FormRecord[]>([]),
    [counts, setCounts] = useState<Record<string, number>>({}),
    [query, setQuery] = useState(""),
    [status, setStatus] = useState("all"),
    [sort, setSort] = useState("updated"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setForms(await rows<FormRecord>("native_forms"));
      if (supabase && !isDemoMode()) {
        const { data, error } = await supabase.rpc("native_form_counts");
        if (!error && data)
          setCounts(
            Object.fromEntries(
              data.map((r: { form_id: string; submissions: number }) => [
                r.form_id,
                Number(r.submissions),
              ]),
            ),
          );
      }
    } catch (e) {
      setError(msg(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };
  async function create(template = "Blank form") {
    const schema = blankForm(
      template === "Blank form" ? "Untitled form" : template,
    );
    if (template === "Event registration") {
      schema.questions = [
        { ...blankQuestion(), title: "Full name", required: true },
        { ...blankQuestion("email"), title: "Email address", required: true },
        {
          ...blankQuestion("consent"),
          title: "I agree to be contacted about this event",
          required: true,
        },
      ];
    }
    if (template === "Course feedback") {
      schema.questions = [
        {
          ...blankQuestion("rating"),
          title: "How useful was the course?",
          min: 1,
          max: 5,
        },
        { ...blankQuestion("long"), title: "What could be improved?" },
      ];
    }
    const id = crypto.randomUUID();
    await put("native_forms", {
      id,
      owner_id: uid,
      title: schema.title,
      draft: schema,
      revision: 0,
      status: "draft",
      public_token: crypto.randomUUID(),
      access: "public",
      one_per_user: false,
      current_version: null,
      updated_at: new Date().toISOString(),
      deleted_at: null,
    });
    router.push("/forms/" + id);
  }
  return (
    <>
      <header className="native-title">
        <div>
          <span className="native-eyebrow">
            GOOD QUESTIONS. MEANINGFUL ANSWERS.
          </span>
          <h1>Forms</h1>
          <p>Collect ideas, understand people, make better decisions.</p>
        </div>
        <button
          className="native-primary"
          disabled={busy}
          onClick={() => void act(() => create())}
        >
          <Plus size={18} />
          New form
        </button>
      </header>
      <ErrorNotice error={error} clear={() => setError("")} />
      <div className="native-templates">
        {["Blank form", "Event registration", "Course feedback"].map((t, i) => (
          <button
            key={t}
            disabled={busy}
            onClick={() => void act(() => create(t))}
          >
            <span className={"native-template-icon tint-" + i}>
              <ClipboardList size={24} />
            </span>
            <strong>{t}</strong>
            <span>
              {i === 0
                ? "Start with a clean page"
                : i === 1
                  ? "Bring people together"
                  : "Make the next course better"}
            </span>
            <Plus size={16} />
          </button>
        ))}
      </div>
      <section className="native-panel">
        <div className="native-calendar-toolbar">
          <h2>Your forms</h2>
          <label className="native-search">
            <Search size={17} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search forms"
              aria-label="Search forms"
            />
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Form status"
          >
            <option value="all">All forms</option>
            {["draft", "published", "closed", "archived", "deleted"].map(
              (v) => (
                <option key={v}>{v}</option>
              ),
            )}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort forms"
          >
            <option value="updated">Recently modified</option>
            <option value="title">Name</option>
          </select>
        </div>
        <div className="native-form-cards">
          {forms
            .filter(
              (f) =>
                f.title.toLowerCase().includes(query.toLowerCase()) &&
                (status === "deleted"
                  ? !!f.deleted_at
                  : !f.deleted_at && (status === "all" || f.status === status)),
            )
            .sort((a, b) =>
              sort === "title"
                ? a.title.localeCompare(b.title)
                : b.updated_at.localeCompare(a.updated_at),
            )
            .map((f) => (
              <article className="native-form-card" key={f.id}>
                <Link href={"/forms/" + f.id}>
                  <ClipboardList size={28} />
                  <h3>{f.title}</h3>
                </Link>
                <span className="native-pill">
                  {f.deleted_at ? "Deleted" : f.status}
                </span>
                <p>
                  Modified {new Date(f.updated_at).toLocaleDateString()} •{" "}
                  {counts[f.id] === undefined
                    ? "Response count unavailable"
                    : `${counts[f.id]} responses`}
                </p>
                <div className="native-row wrap">
                  <Link href={"/forms/" + f.id + "/responses"}>
                    <BarChart3 size={15} />
                    Responses
                  </Link>
                  <button
                    title="Duplicate form"
                    aria-label={`Duplicate ${f.title}`}
                    onClick={() =>
                      void act(async () => {
                        await put("native_forms", {
                          ...f,
                          id: crypto.randomUUID(),
                          owner_id: uid,
                          title: f.title + " (copy)",
                          draft: { ...f.draft, title: f.title + " (copy)" },
                          status: "draft",
                          current_version: null,
                          public_token: crypto.randomUUID(),
                          revision: 0,
                          deleted_at: null,
                          updated_at: new Date().toISOString(),
                        });
                        await load();
                      })
                    }
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    aria-label={
                      f.status === "archived" ? "Restore draft" : "Archive form"
                    }
                    onClick={() =>
                      void act(async () => {
                        await put("native_forms", {
                          id: f.id,
                          status:
                            f.status === "archived" ? "draft" : "archived",
                        });
                        await load();
                      })
                    }
                  >
                    <Archive size={16} />
                  </button>
                  <button
                    aria-label={f.deleted_at ? "Restore form" : "Delete form"}
                    onClick={() =>
                      void act(async () => {
                        await put("native_forms", {
                          id: f.id,
                          deleted_at: f.deleted_at
                            ? null
                            : new Date().toISOString(),
                          status: "closed",
                        });
                        await load();
                      })
                    }
                  >
                    {f.deleted_at ? (
                      <RotateCcw size={16} />
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </button>
                </div>
              </article>
            ))}
        </div>
        {!forms.length && (
          <div className="native-empty">
            <ClipboardList size={36} />
            <h2>Your next question starts here.</h2>
            <p>Create a form or choose a template above.</p>
          </div>
        )}
      </section>
    </>
  );
}
function FormBuilder({
  id: uid,
  demo,
  formId,
  responses,
}: {
  id: string;
  demo: boolean;
  formId: string;
  responses: boolean;
}) {
  const [record, setRecord] = useState<FormRecord | null>(null),
    [draft, setDraft] = useState<FormSchema | null>(null),
    [error, setError] = useState(""),
    [saveStatus, setSaveStatus] = useState("Loading…"),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState(false),
    [previewAnswers, setPreviewAnswers] = useState<Answers>({}),
    [ai, setAi] = useState(false),
    [prompt, setPrompt] = useState(""),
    [consent, setConsent] = useState(false),
    [past, setPast] = useState<FormSchema[]>([]),
    [future, setFuture] = useState<FormSchema[]>([]),
    [recovery, setRecovery] = useState<FormSchema | null>(null);
  const revision = useRef(0),
    saved = useRef(""),
    saving = useRef(false),
    latest = useRef<FormSchema | null>(null),
    recordRef = useRef<FormRecord | null>(null);
  const recoveryKey = `syrka-form-recovery:${uid}:${formId}`;
  const router = useRouter();
  useEffect(() => {
    let live = true;
    void rows<FormRecord>("native_forms")
      .then((all) => {
        const f = all.find((f) => f.id === formId);
        if (!f) throw Error("Form not found or access is denied.");
        if (live) {
          setRecord(f);
          recordRef.current = f;
          setDraft(f.draft);
          latest.current = f.draft;
          revision.current = f.revision;
          saved.current = JSON.stringify(f.draft);
          setSaveStatus("Saved");
          try {
            const local = JSON.parse(
              localStorage.getItem(recoveryKey) || "null",
            );
            if (local && JSON.stringify(local) !== saved.current)
              setRecovery(local);
          } catch {}
        }
      })
      .catch((e) => setError(msg(e)));
    return () => {
      live = false;
    };
  }, [formId, recoveryKey]);
  const persist = useCallback(async () => {
    const value = latest.current,
      f = recordRef.current;
    if (
      !value ||
      !f ||
      saving.current ||
      JSON.stringify(value) === saved.current
    )
      return;
    saving.current = true;
    setSaveStatus("Saving…");
    try {
      const result = await put(
        "native_forms",
        {
          id: f.id,
          owner_id: uid,
          title: value.title || "Untitled form",
          draft: value,
          revision: revision.current + 1,
          updated_at: new Date().toISOString(),
        },
        revision.current,
      );
      revision.current = result.revision as number;
      saved.current = JSON.stringify(value);
      setRecord((r) =>
        r
          ? {
              ...r,
              title: value.title,
              draft: value,
              revision: revision.current,
            }
          : r,
      );
      setSaveStatus("Saved");
      if (JSON.stringify(latest.current) === saved.current)
        localStorage.removeItem(recoveryKey);
    } catch (e) {
      setSaveStatus("Save failed — recovery copy kept");
      setError(msg(e));
    } finally {
      saving.current = false;
    }
  }, [uid, recoveryKey]);
  useEffect(() => {
    if (!draft) return;
    latest.current = draft;
    if (JSON.stringify(draft) === saved.current) return;
    localStorage.setItem(recoveryKey, JSON.stringify(draft));
    setSaveStatus("Unsaved changes");
    const t = setTimeout(() => void persist(), 800);
    return () => clearTimeout(t);
  }, [draft, persist, recoveryKey]);
  useEffect(() => {
    const t = setInterval(() => {
      if (
        !saving.current &&
        latest.current &&
        JSON.stringify(latest.current) !== saved.current
      )
        void persist();
    }, 3000);
    const leave = (e: BeforeUnloadEvent) => {
      if (latest.current && JSON.stringify(latest.current) !== saved.current)
        e.preventDefault();
    };
    window.addEventListener("beforeunload", leave);
    return () => {
      clearInterval(t);
      window.removeEventListener("beforeunload", leave);
    };
  }, [persist]);
  function update(value: FormSchema) {
    if (draft) setPast((p) => [...p.slice(-39), draft]);
    setFuture([]);
    setDraft(value);
    latest.current = value;
  }
  function changeQuestion(index: number, patch: Partial<Question>) {
    if (draft)
      update({
        ...draft,
        questions: draft.questions.map((q, i) =>
          i === index ? { ...q, ...patch } : q,
        ),
      });
  }
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };
  if (!record || !draft)
    return (
      <>
        <ErrorNotice error={error} clear={() => setError("")} />
        <p>{error ? "Unable to open form." : "Opening form…"}</p>
        <Link href="/forms">Back to Forms</Link>
      </>
    );
  if (responses) return <Responses record={record} demo={demo} uid={uid} />;
  const publicLink =
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/workspace/respond/${record.public_token}`;
  return (
    <>
      <header className="native-title">
        <div>
          <Link href="/forms" className="native-eyebrow">
            FORMS / YOUR DRAFT
          </Link>
          <h1>{draft.title || "Untitled form"}</h1>
          <span className="native-save" role="status">
            <Check size={14} />
            {saveStatus}
          </span>
        </div>
        <div className="native-row wrap">
          <button onClick={() => setPreview(true)}>
            <Eye size={17} />
            Preview
          </button>
          <Link
            className="native-button"
            href={"/forms/" + formId + "/responses"}
          >
            <BarChart3 size={17} />
            Responses
          </Link>
          <button
            className="native-primary"
            disabled={demo || busy || saving.current}
            onClick={() =>
              void act(async () => {
                validateForm(draft);
                await persist();
                if (JSON.stringify(latest.current) !== saved.current)
                  throw Error("Save all changes before publishing.");
                await nativeRequest("forms", {
                  form_id: formId,
                  revision: revision.current,
                });
                setRecord({ ...record, status: "published" });
                setSaveStatus("Published — share link ready");
              })
            }
          >
            <Send size={17} />
            Publish
          </button>
        </div>
      </header>
      <ErrorNotice error={error} clear={() => setError("")} />
      {recovery && (
        <div className="native-notice">
          An interrupted editing session has a recovery copy.
          <button
            onClick={() => {
              update(recovery);
              setRecovery(null);
            }}
          >
            Restore copy
          </button>
          <button
            onClick={() => {
              setRecovery(null);
              localStorage.removeItem(recoveryKey);
            }}
          >
            Discard copy
          </button>
        </div>
      )}
      {record.status === "published" && (
        <div className="native-share">
          <label>
            Public response link
            <input
              readOnly
              aria-label="Public response link"
              value={publicLink}
            />
          </label>
          <button
            onClick={() =>
              void navigator.clipboard
                .writeText(publicLink)
                .catch((e) => setError(msg(e)))
            }
          >
            <Copy size={16} />
            Copy link
          </button>
          <a href={publicLink} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={16} />
            Open
          </a>
          <button
            onClick={() =>
              void act(async () => {
                const QR = (await import("qrcode")).default;
                const data = await QR.toDataURL(publicLink, {
                  width: 600,
                  margin: 2,
                });
                const a = document.createElement("a");
                a.href = data;
                a.download = draft.title + "-QR.png";
                a.click();
              })
            }
          >
            QR code
          </button>
          <button
            onClick={() =>
              void act(async () => {
                await put("native_forms", { id: formId, status: "closed" });
                setRecord({ ...record, status: "closed" });
              })
            }
          >
            Close form
          </button>
        </div>
      )}
      <div className="native-builder-layout">
        <section className="native-stack">
          <div className="native-panel native-stack">
            <label>
              Form title
              <input
                value={draft.title}
                maxLength={180}
                onChange={(e) => update({ ...draft, title: e.target.value })}
              />
            </label>
            <label>
              Description
              <textarea
                value={draft.description}
                onChange={(e) =>
                  update({ ...draft, description: e.target.value })
                }
              />
            </label>
            <div className="native-row wrap">
              <button
                disabled={!past.length}
                aria-label="Undo form edit"
                onClick={() => {
                  setFuture([draft, ...future]);
                  const prev = past.at(-1)!;
                  setPast(past.slice(0, -1));
                  setDraft(prev);
                  latest.current = prev;
                }}
              >
                <Undo2 size={17} />
              </button>
              <button
                disabled={!future.length}
                aria-label="Redo form edit"
                onClick={() => {
                  setPast([...past, draft]);
                  const next = future[0];
                  setFuture(future.slice(1));
                  setDraft(next);
                  latest.current = next;
                }}
              >
                <Redo2 size={17} />
              </button>
              <button onClick={() => void persist()}>Save now</button>
              <button onClick={() => setAi(true)}>
                <Sparkles size={17} />
                AI draft assistant
              </button>
            </div>
          </div>
          {draft.questions.map((q, i) => (
            <section key={q.id} className="native-panel native-question-card">
              <div className="native-row between">
                <span className="native-pill">Question {i + 1}</span>
                <div className="native-row">
                  <button
                    aria-label={`Move question ${i + 1} up`}
                    disabled={!i}
                    onClick={() => {
                      const qs = [...draft.questions];
                      [qs[i - 1], qs[i]] = [qs[i], qs[i - 1]];
                      update({ ...draft, questions: qs });
                    }}
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    aria-label={`Move question ${i + 1} down`}
                    disabled={i === draft.questions.length - 1}
                    onClick={() => {
                      const qs = [...draft.questions];
                      [qs[i + 1], qs[i]] = [qs[i], qs[i + 1]];
                      update({ ...draft, questions: qs });
                    }}
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    aria-label={`Duplicate question ${i + 1}`}
                    onClick={() => {
                      const qs = [...draft.questions];
                      qs.splice(i + 1, 0, {
                        ...q,
                        id: crypto.randomUUID(),
                        title: q.title + " (copy)",
                      });
                      update({ ...draft, questions: qs });
                    }}
                  >
                    <Copy size={16} />
                  </button>
                  <button
                    aria-label={`Delete question ${i + 1}`}
                    onClick={() =>
                      update({
                        ...draft,
                        questions: draft.questions.filter((x) => x.id !== q.id),
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <label>
                Question
                <input
                  value={q.title}
                  onChange={(e) => changeQuestion(i, { title: e.target.value })}
                  maxLength={500}
                />
              </label>
              <div className="native-two">
                <label>
                  Type
                  <select
                    value={q.type}
                    onChange={(e) =>
                      changeQuestion(i, {
                        type: e.target.value as Question["type"],
                      })
                    }
                  >
                    {questionTypes.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="native-check">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) =>
                      changeQuestion(i, { required: e.target.checked })
                    }
                  />
                  Required when visible
                </label>
              </div>
              <label>
                Description
                <textarea
                  value={q.description}
                  onChange={(e) =>
                    changeQuestion(i, { description: e.target.value })
                  }
                />
              </label>
              {[
                "single",
                "multiple",
                "dropdown",
                "checkboxes",
                "likert",
                "grid",
                "checkgrid",
                "ranking",
              ].includes(q.type) && (
                <label>
                  Options (one per line)
                  <textarea
                    value={q.options.join("\n")}
                    onChange={(e) =>
                      changeQuestion(i, { options: e.target.value.split("\n") })
                    }
                  />
                </label>
              )}
              {["grid", "checkgrid"].includes(q.type) && (
                <label>
                  Rows (one per line)
                  <textarea
                    value={q.rows.join("\n")}
                    onChange={(e) =>
                      changeQuestion(i, { rows: e.target.value.split("\n") })
                    }
                  />
                </label>
              )}
              {["short", "long", "number", "rating", "scale"].includes(
                q.type,
              ) && (
                <div className="native-two">
                  <label>
                    Minimum{" "}
                    {["short", "long"].includes(q.type)
                      ? "characters"
                      : "value"}
                    <input
                      type="number"
                      value={q.min ?? ""}
                      onChange={(e) =>
                        changeQuestion(i, {
                          min: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </label>
                  <label>
                    Maximum
                    <input
                      type="number"
                      value={q.max ?? ""}
                      onChange={(e) =>
                        changeQuestion(i, {
                          max: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                    />
                  </label>
                </div>
              )}
              <details>
                <summary>Conditional visibility</summary>
                <p>
                  Only earlier questions are allowed, preventing cycles. Hidden
                  questions are never required or stored.
                </p>
                <label>
                  Show if
                  <select
                    value={q.show_if?.question || ""}
                    onChange={(e) =>
                      changeQuestion(i, {
                        show_if: e.target.value
                          ? {
                              question: e.target.value,
                              operator: "equals",
                              value: "",
                            }
                          : null,
                      })
                    }
                  >
                    <option value="">Always visible</option>
                    {draft.questions
                      .slice(0, i)
                      .filter(
                        (x) => !["section", "information"].includes(x.type),
                      )
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.title}
                        </option>
                      ))}
                  </select>
                </label>
                {q.show_if && (
                  <div className="native-two">
                    <select
                      aria-label="Logic operator"
                      value={q.show_if.operator}
                      onChange={(e) =>
                        changeQuestion(i, {
                          show_if: {
                            ...q.show_if!,
                            operator: e.target.value as NonNullable<
                              Question["show_if"]
                            >["operator"],
                          },
                        })
                      }
                    >
                      {[
                        "equals",
                        "not_equals",
                        "contains",
                        "greater",
                        "less",
                      ].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                    <input
                      aria-label="Logic comparison value"
                      value={String(q.show_if.value)}
                      onChange={(e) =>
                        changeQuestion(i, {
                          show_if: { ...q.show_if!, value: e.target.value },
                        })
                      }
                    />
                  </div>
                )}
              </details>
              {draft.quiz &&
                ["single", "dropdown", "yesno", "number"].includes(q.type) && (
                  <div className="native-two">
                    <label>
                      Correct answer
                      <input
                        value={String(q.correct ?? "")}
                        onChange={(e) =>
                          changeQuestion(i, {
                            correct:
                              q.type === "number"
                                ? Number(e.target.value)
                                : q.type === "yesno"
                                  ? e.target.value === "true"
                                  : e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Practice points
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        value={q.points}
                        onChange={(e) =>
                          changeQuestion(i, { points: Number(e.target.value) })
                        }
                      />
                    </label>
                  </div>
                )}
            </section>
          ))}
          <button
            className="native-add-question"
            onClick={() =>
              update({
                ...draft,
                questions: [...draft.questions, blankQuestion()],
              })
            }
          >
            <Plus size={19} />
            Add question
          </button>
        </section>
        <aside className="native-panel native-settings native-stack">
          <h2>Form settings</h2>
          <span className="native-pill">{record.status}</span>
          <label>
            Respondents
            <select
              value={record.access}
              onChange={(e) =>
                void act(async () => {
                  const access = e.target.value as FormRecord["access"];
                  await put("native_forms", {
                    id: formId,
                    access,
                    one_per_user:
                      access === "public" ? false : record.one_per_user,
                  });
                  setRecord({
                    ...record,
                    access,
                    one_per_user:
                      access === "public" ? false : record.one_per_user,
                  });
                })
              }
            >
              <option value="public">Anyone with the link</option>
              <option value="authenticated">Signed-in Syrka users</option>
            </select>
          </label>
          <label className="native-check">
            <input
              type="checkbox"
              disabled={record.access !== "authenticated"}
              checked={record.one_per_user}
              onChange={(e) =>
                void act(async () => {
                  await put("native_forms", {
                    id: formId,
                    one_per_user: e.target.checked,
                  });
                  setRecord({ ...record, one_per_user: e.target.checked });
                })
              }
            />
            One response per signed-in user
          </label>
          <label>
            Close date
            <input
              type="datetime-local"
              value={
                record.closes_at
                  ? new Date(
                      Date.parse(record.closes_at) -
                        new Date(record.closes_at).getTimezoneOffset() * 60000,
                    )
                      .toISOString()
                      .slice(0, 16)
                  : ""
              }
              onChange={(e) => {
                const closes_at = e.target.value
                  ? new Date(e.target.value).toISOString()
                  : null;
                void act(async () => {
                  await put("native_forms", { id: formId, closes_at });
                  setRecord({ ...record, closes_at });
                });
              }}
            />
          </label>
          <label>
            Maximum responses
            <input
              type="number"
              min={1}
              max={1000000}
              value={record.max_responses ?? ""}
              onChange={(e) => {
                const max_responses = e.target.value
                  ? Number(e.target.value)
                  : null;
                void act(async () => {
                  await put("native_forms", { id: formId, max_responses });
                  setRecord({ ...record, max_responses });
                });
              }}
            />
          </label>
          <label>
            Confirmation message
            <textarea
              value={draft.confirmation}
              onChange={(e) =>
                update({ ...draft, confirmation: e.target.value })
              }
            />
          </label>
          <label className="native-check">
            <input
              type="checkbox"
              checked={draft.quiz}
              onChange={(e) => update({ ...draft, quiz: e.target.checked })}
            />
            Practice quiz scoring
          </label>
          <p>
            Results are practice assessments, not official Campus grades.
            Publishing creates an immutable schema version. Existing responses
            retain their original questions.
          </p>
          <p>
            Organisation restrictions, invite lists and response editing are not
            enabled in this release.
          </p>
        </aside>
      </div>
      {preview && (
        <div className="native-overlay">
          <section className="native-dialog native-stack">
            <div className="native-row between">
              <h2>Preview</h2>
              <button
                aria-label="Close preview"
                onClick={() => setPreview(false)}
              >
                <X />
              </button>
            </div>
            <h2>{draft.title}</h2>
            <p>{draft.description}</p>
            <Questions
              schema={draft}
              answers={previewAnswers}
              setAnswers={setPreviewAnswers}
            />
            <button
              onClick={() => {
                try {
                  validateAnswers(validateForm(draft), previewAnswers);
                  setSaveStatus(
                    "Preview validation passed; no response was submitted.",
                  );
                  setPreview(false);
                } catch (e) {
                  setError(msg(e));
                }
              }}
            >
              Test validation
            </button>
          </section>
        </div>
      )}
      {ai && (
        <div className="native-overlay">
          <section className="native-dialog native-stack">
            <div className="native-row between">
              <h2>Draft with Qwen</h2>
              <button
                aria-label="Close AI assistant"
                onClick={() => setAi(false)}
              >
                <X />
              </button>
            </div>
            <p>
              Describe the form you need. A generated draft replaces the current
              draft after your explicit confirmation, and is never published
              automatically.
            </p>
            <textarea
              aria-label="Form generation request"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <label className="native-check">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              Send this request to Qwen in Singapore. No responses will be sent.
            </label>
            <button
              disabled={demo || busy || !consent || !prompt}
              onClick={() =>
                void act(async () => {
                  const result = await nativeRequest("ai", {
                    action: "form",
                    consent,
                    prompt,
                  });
                  const schema = validateForm(result.schema);
                  if (
                    window.confirm(
                      "Replace the editable draft with this AI proposal? You can undo the change.",
                    )
                  )
                    update(schema);
                  setAi(false);
                })
              }
            >
              <Sparkles size={17} />
              Generate editable draft
            </button>
          </section>
        </div>
      )}
      <button className="native-back" onClick={() => router.push("/forms")}>
        Back to Forms
      </button>
    </>
  );
}
type ResponseRecord = {
  id: string;
  form_id: string;
  version_id: string;
  answers: Answers;
  score: { earned: number; max: number; practice: boolean } | null;
  created_at: string;
};
function Responses({
  record,
  demo,
  uid,
}: {
  record: FormRecord;
  demo: boolean;
  uid: string;
}) {
  const [responses, setResponses] = useState<ResponseRecord[]>([]),
    [versions, setVersions] = useState<
      { id: string; schema: FormSchema; number: number }[]
    >([]),
    [selected, setSelected] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [total, setTotal] = useState(0);
  const router = useRouter();
  const load = useCallback(async () => {
    try {
      if (demo) {
        setResponses([]);
        return;
      }
      const { data: v, error: e } = await supabase!
        .from("native_form_versions")
        .select("*")
        .eq("form_id", record.id)
        .order("number", { ascending: false });
      if (e) throw e;
      setVersions(v || []);
      setSelected((s) => s || v?.[0]?.id || "");
      const { count, error: ce } = await supabase!
        .from("native_responses")
        .select("id", { count: "exact", head: true })
        .eq("form_id", record.id);
      if (ce) throw ce;
      setTotal(count || 0);
      const all: ResponseRecord[] = [];
      for (let offset = 0; offset < 10000; offset += 500) {
        const { data, error } = await supabase!
          .from("native_responses")
          .select("*")
          .eq("form_id", record.id)
          .order("created_at", { ascending: false })
          .order("id")
          .range(offset, offset + 499);
        if (error) throw error;
        all.push(...data);
        if (data.length < 500) break;
      }
      setResponses(all);
    } catch (e) {
      setError(msg(e));
    }
  }, [record.id, demo]);
  useEffect(() => {
    void load();
  }, [load]);
  const version = versions.find((v) => v.id === selected),
    schema = version?.schema || record.draft;
  const subset = responses.filter(
    (r) =>
      r.version_id === selected &&
      (!query ||
        JSON.stringify(r.answers).toLowerCase().includes(query.toLowerCase())),
  );
  const exportData = responseRows(schema, subset);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <header className="native-title">
        <div>
          <Link href={"/forms/" + record.id} className="native-eyebrow">
            FORMS / RESPONSES
          </Link>
          <h1>{record.title}</h1>
          <p>Real answers. A clearer picture.</p>
        </div>
        <button onClick={() => void load()}>Refresh responses</button>
      </header>
      <ErrorNotice error={error} clear={() => setError("")} />
      <div className="native-stat-grid">
        <div className="native-panel">
          <span>Total submissions</span>
          <strong>{total}</strong>
        </div>
        <div className="native-panel">
          <span>Selected version / filter</span>
          <strong>{subset.length}</strong>
        </div>
        <div className="native-panel">
          <span>Published versions</span>
          <strong>{versions.length}</strong>
        </div>
      </div>
      {total > 10000 && (
        <p role="alert">
          Showing the latest 10,000 responses. Analytics and exports below cover
          only those loaded responses. Narrow datasets before further analysis.
        </p>
      )}
      <section className="native-panel native-stack">
        <div className="native-row wrap">
          <label>
            Schema version
            <select
              aria-label="Response schema version"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setPage(0);
              }}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  Version {v.number} — {v.schema.title}
                </option>
              ))}
            </select>
          </label>
          <input
            aria-label="Search response answers"
            placeholder="Search answers"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
          <button
            disabled={!subset.length || busy}
            onClick={() =>
              saveDownload(
                record.title + ".csv",
                csv(exportData),
                "text/csv;charset=utf-8",
              )
            }
          >
            <Download size={16} />
            CSV
          </button>
          <button
            disabled={!subset.length || busy}
            onClick={() =>
              void act(async () => {
                const ExcelJS = (await import("exceljs")).default;
                const workbook = new ExcelJS.Workbook();
                const sheet = workbook.addWorksheet("Responses");
                exportData.forEach((r) => sheet.addRow(r));
                sheet.getRow(1).font = { bold: true };
                const buffer = await workbook.xlsx.writeBuffer();
                saveDownload(
                  record.title + ".xlsx",
                  new Uint8Array(buffer),
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                );
              })
            }
          >
            <Download size={16} />
            XLSX
          </button>
          <button
            disabled={!subset.length || busy}
            onClick={() =>
              void act(async () => {
                const file = makeFile("sheet", demo ? "demo" : uid);
                file.name = record.title + " — response snapshot";
                const cellData: Record<
                  string,
                  Record<string, { v: string | number | boolean; t: number }>
                > = {};
                exportData.forEach((r, i) => {
                  cellData[i] = Object.fromEntries(
                    r.map((v, j) => [
                      j,
                      {
                        v,
                        t:
                          typeof v === "number"
                            ? 2
                            : typeof v === "boolean"
                              ? 3
                              : 1,
                      },
                    ]),
                  );
                });
                file.content = {
                  id: file.id,
                  name: file.name,
                  sheetOrder: ["responses"],
                  sheets: {
                    responses: {
                      id: "responses",
                      name: "Responses",
                      rowCount: Math.max(1000, exportData.length + 10),
                      columnCount: Math.max(26, exportData[0].length),
                      cellData,
                    },
                  },
                  syrkaResponseSnapshot: {
                    contract: "syrka.form-response-table.v1",
                    form_id: record.id,
                    version_id: selected,
                    created_at: new Date().toISOString(),
                    refresh:
                      "Create a new snapshot from Forms Responses; this file is an independent editable copy.",
                  },
                };
                await saveFile(file);
                router.push("/?file=" + file.id);
              })
            }
          >
            <Table2 size={16} />
            Copy snapshot to Tables
          </button>
        </div>
        <p>
          Exports use the selected immutable schema version and current answer
          filter. Tables receives a new, editable snapshot; existing
          spreadsheets are never overwritten. It does not synchronize
          automatically.
        </p>
      </section>
      {subset.length > 0 && (
        <section className="native-panel native-stack">
          <h2>Submission trend</h2>
          <small>
            Selected version and filter • dates in your browser timezone
          </small>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Responses</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(
                subset.reduce<Record<string, number>>((groups, r) => {
                  const date = new Intl.DateTimeFormat("en-CA", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  }).format(new Date(r.created_at));
                  groups[date] = (groups[date] || 0) + 1;
                  return groups;
                }, {}),
              )
                .sort(([a], [b]) => b.localeCompare(a))
                .slice(0, 30)
                .map(([day, count]) => (
                  <tr key={day}>
                    <td>{day}</td>
                    <td>{count}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}
      <div className="native-analytics">
        {schema.questions
          .filter((q) => !["section", "information", "long"].includes(q.type))
          .map((q) => {
            const values = subset
              .map((r) => r.answers[q.id])
              .filter((v) => v !== undefined);
            const nums = values.filter(
              (v) => typeof v === "number",
            ) as number[];
            const counts = new Map<string, number>();
            values
              .flatMap((v) =>
                Array.isArray(v)
                  ? v
                  : [typeof v === "object" ? JSON.stringify(v) : String(v)],
              )
              .forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
            return (
              <section className="native-panel" key={q.id}>
                <h3>{q.title}</h3>
                <small>
                  {values.length} answers • up to 20 distinct values shown
                </small>
                {nums.length > 0 && (
                  <p>
                    Average:{" "}
                    {(nums.reduce((s, v) => s + v, 0) / nums.length).toFixed(2)}
                  </p>
                )}
                <table className="native-breakdown">
                  <caption className="sr-only">
                    Answer distribution for {q.title}
                  </caption>
                  <thead>
                    <tr>
                      <th>Answer</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...counts].slice(0, 20).map(([value, count]) => (
                      <tr key={value}>
                        <td>
                          {value}
                          <span
                            className="native-bar"
                            style={{
                              width:
                                Math.max(
                                  2,
                                  (count / Math.max(1, values.length)) * 100,
                                ) + "%",
                            }}
                          />
                        </td>
                        <td>{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            );
          })}
      </div>
      <section className="native-panel native-stack">
        <h2>Individual responses</h2>
        {subset.slice(page * 25, (page + 1) * 25).map((r) => (
          <details key={r.id} className="native-response">
            <summary>
              {new Date(r.created_at).toLocaleString()} • {r.id.slice(0, 8)}
              {r.score
                ? ` • Practice score ${r.score.earned}/${r.score.max}`
                : ""}
            </summary>
            <dl>
              {schema.questions
                .filter((q) => r.answers[q.id] !== undefined)
                .map((q) => (
                  <div key={q.id}>
                    <dt>{q.title}</dt>
                    <dd>
                      {q.type === "file" ? (
                        <button
                          onClick={() =>
                            void act(async () => {
                              if (
                                !confirm(
                                  "This attachment has not been malware scanned. Download only if you trust the respondent.",
                                )
                              )
                                return;
                              const { data, error } = await supabase!
                                .from("native_attachments")
                                .select("object_path,filename")
                                .eq("id", r.answers[q.id])
                                .eq("form_id", record.id)
                                .single();
                              if (error) throw error;
                              const signed = await supabase!.storage
                                .from("office-form-uploads")
                                .createSignedUrl(data.object_path, 60, {
                                  download: data.filename,
                                });
                              if (signed.error) throw signed.error;
                              window.open(
                                signed.data.signedUrl,
                                "_blank",
                                "noopener,noreferrer",
                              );
                            })
                          }
                        >
                          <Download size={15} />
                          Download private attachment (unscanned)
                        </button>
                      ) : typeof r.answers[q.id] === "object" ? (
                        JSON.stringify(r.answers[q.id])
                      ) : (
                        String(r.answers[q.id])
                      )}
                    </dd>
                  </div>
                ))}
            </dl>
            <button
              className="native-danger"
              onClick={() => {
                if (window.confirm("Permanently delete this response?"))
                  void act(async () => {
                    await remove("native_responses", r.id);
                    await load();
                  });
              }}
            >
              <Trash2 size={16} />
              Delete response
            </button>
          </details>
        ))}
        {!subset.length && (
          <p>
            No responses in this version yet. Publish and share your form to
            collect responses.
          </p>
        )}
        <div className="native-row">
          <button disabled={!page} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <span>Page {page + 1}</span>
          <button
            disabled={(page + 1) * 25 >= subset.length}
            onClick={() => setPage(page + 1)}
          >
            Next
          </button>
        </div>
      </section>
      <Link href={"/forms/" + record.id}>Back to builder</Link>
    </>
  );
}
export function NewForm() {
  return (
    <NativeFrame app="forms">
      {({ id }) => <NewFormContent uid={id} />}
    </NativeFrame>
  );
}
function NewFormContent({ uid }: { uid: string }) {
  const router = useRouter(),
    [error, setError] = useState("");
  const creating = useRef(false);
  useEffect(() => {
    if (creating.current) return;
    creating.current = true;
    const draft = blankForm(),
      id = crypto.randomUUID();
    void put("native_forms", {
      id,
      owner_id: uid,
      title: draft.title,
      draft,
      revision: 0,
      status: "draft",
      public_token: crypto.randomUUID(),
      access: "public",
      one_per_user: false,
      current_version: null,
      updated_at: new Date().toISOString(),
      deleted_at: null,
    })
      .then(() => router.replace("/forms/" + id))
      .catch((e) => setError(msg(e)));
  }, [uid, router]);
  return (
    <>
      <p>Creating your form…</p>
      <ErrorNotice error={error} clear={() => setError("")} />
    </>
  );
}
