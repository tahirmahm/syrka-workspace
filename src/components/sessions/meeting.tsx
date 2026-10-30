"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Video,
  Copy,
  Search,
  NotebookPen,
  FileText,
  Download,
  ShieldCheck,
  Users,
  Link2,
  Upload,
  PanelRight,
} from "lucide-react";
import NotesReview from "./notes-review";
import { Auth } from "@/components/auth";
import { sessionsApi } from "@/lib/sessions/client";
import {
  meetingLink,
  segmentText,
  timestamp,
  transcriptText,
  transcriptCaptions,
  studySchema,
  notesSchema,
  type Snapshot,
  type SessionSource,
  type Job,
} from "@/lib/sessions/model";
import { notesDocument } from "@/lib/sessions/transcripts";
import { saveFile, isDemoMode } from "@/lib/storage";
import { makeFile, download } from "@/lib/model";
const LiveStage = dynamic(() => import("./live-stage"), {
  ssr: false,
  loading: () => <p role="status">Loading meeting controls…</p>,
});
export default function Meeting({
  id,
  source = "workspace",
  notesView = false,
}: {
  id: string;
  source?: SessionSource;
  notesView?: boolean;
}) {
  const router = useRouter();
  const [clock, setClock] = useState(() => Date.now());
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState(notesView ? "notes" : "transcript");
  const [query, setQuery] = useState("");
  const [panelOpen, setPanelOpen] = useState(notesView);
  const [signingIn, setSigningIn] = useState(false);
  const [joinRequested, setJoinRequested] = useState(false);
  const [speechPaused, setSpeechPaused] = useState(false);
  const [callNotice, setCallNotice] = useState("");
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(location.origin), []);
  const [display, setDisplay] = useState("");
  const [token, setToken] = useState<{ token: string; url: string } | null>(
    null,
  );
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [cardFront, setCardFront] = useState("");
  const [cardBack, setCardBack] = useState("");
  const [question, setQuestion] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [audioUpload, setAudioUpload] = useState<File | null>(null);
  const [audioLanguage, setAudioLanguage] = useState("en");
  const [audioPermission, setAudioPermission] = useState(false);
  const audioPolling = useRef(false);
  const lastAudioPoll = useRef(0);
  const [imported, setImported] = useState("");
  const [format, setFormat] = useState("txt");
  const [permission, setPermission] = useState(false);
  const [personal, setPersonal] = useState("");
  const [folder, setFolder] = useState("");
  const [bookmarked, setBookmarked] = useState(false);
  const poll = useRef(false);
  const openedAnchor = useRef(false);
  const latest = useRef<Snapshot | null>(null);
  latest.current = snapshot;
  const load = useCallback(
    async (full = false) => {
      if (poll.current) return;
      poll.current = true;
      try {
        const previous = latest.current;
        const after =
          !full && previous?.segments.length
            ? previous.segments.reduce(
                (stamp, s) => (s.created_at > stamp ? s.created_at : stamp),
                "",
              )
            : undefined;
        const result = (await sessionsApi(
          source,
          undefined,
          id,
          after,
        )) as Snapshot & {
          admission?: "waiting";
          annotations?: { body: string; folder: string; bookmarked: boolean };
        };
        if (result.admission === "waiting") {
          setJoinRequested(true);
          setSnapshot(null);
          setError("");
          return;
        }
        setJoinRequested(false);
        setClock(Date.now());
        setSnapshot((old) => ({
          ...result,
          segments:
            after && old
              ? [
                  ...new Map(
                    [...old.segments, ...result.segments].map((s) => [s.id, s]),
                  ).values(),
                ].sort((a, b) => a.start_ms - b.start_ms)
              : result.segments,
        }));
        if (full) {
          if (result.me)
            setDisplay((current) => current || result.me!.display_name);
          if (result.note)
            setNoteDraft(JSON.stringify(result.note.body, null, 2));
          if (result.annotations) {
            setPersonal(result.annotations.body);
            setFolder(result.annotations.folder);
            setBookmarked(result.annotations.bookmarked);
          }
        }
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        poll.current = false;
      }
    },
    [id, source],
  );
  useEffect(() => {
    void load(true);
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (
      !snapshot ||
      openedAnchor.current ||
      !location.hash.startsWith("#segment-")
    )
      return;
    openedAnchor.current = true;
    setTab("transcript");
    const timer = setTimeout(
      () =>
        document
          .getElementById(location.hash.slice(1))
          ?.scrollIntoView({ block: "center" }),
      100,
    );
    return () => clearTimeout(timer);
  }, [snapshot]);
  async function action(payload: Record<string, unknown>, refresh = true) {
    setBusy(true);
    setError("");
    try {
      const result = await sessionsApi(source, { ...payload, roomId: id });
      if (payload.action === "request_join") setJoinRequested(true);
      if (refresh) await load(true);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    const job = snapshot?.jobs.find(
      (j) => j.kind === "filetrans" && j.state === "running",
    );
    if (
      !job ||
      audioPolling.current ||
      Date.now() - lastAudioPoll.current < 4000
    )
      return;
    audioPolling.current = true;
    lastAudioPoll.current = Date.now();
    void sessionsApi(source, {
      action: "poll_uploaded",
      roomId: id,
      job_id: job.id,
    })
      .then((result) => {
        if (result.state === "done") void load(true);
      })
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Audio processing failed."),
      )
      .finally(() => (audioPolling.current = false));
  }, [snapshot, source, id, load]);
  async function uploadAudio() {
    if (!audioUpload || !audioPermission) return;
    setBusy(true);
    setError("");
    try {
      const ext = audioUpload.name.split(".").pop()?.toLowerCase();
      const prepared = await sessionsApi(source, {
        action: "prepare_audio",
        roomId: id,
        extension: ext,
        size: audioUpload.size,
        confirmed: true,
      });
      const types: Record<string, string> = {
        wav: "audio/wav",
        mp3: "audio/mpeg",
        mp4: "audio/mp4",
        webm: "audio/webm",
        ogg: "audio/ogg",
      };
      const upload = await fetch(prepared.url, {
        method: "PUT",
        headers: { "Content-Type": types[ext || ""] || audioUpload.type },
        body: audioUpload,
      });
      if (!upload.ok)
        throw Error("Private audio upload failed. Check file format and size.");
      await sessionsApi(source, {
        action: "transcribe_uploaded",
        roomId: id,
        path: prepared.path,
        language: audioLanguage,
        confirmed: true,
        request_id: crypto.randomUUID(),
      });
      setAudioUpload(null);
      await load(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Audio transcription failed.");
    } finally {
      setBusy(false);
    }
  }
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(
        location.origin + meetingLink(source, id),
      );
      setCallNotice(
        "Meeting invitation copied. Recipients must sign in and be admitted.",
      );
    } catch {
      setCallNotice(
        "Clipboard is unavailable. Open Invitation and select the meeting link to copy it.",
      );
    }
  }
  async function connect() {
    if (!snapshot) return;
    setCallNotice("");
    try {
      if (
        !snapshot.room.locked &&
        display.trim() &&
        display.trim() !== snapshot.me?.display_name
      ) {
        if (
          !(await action({
            action: "request_join",
            display_name: display.trim(),
          }))
        )
          return;
      }
      const result = await action({ action: "token" }, false);
      if (result) setToken(result);
    } catch (e) {
      setError(String(e));
    }
  }
  async function exportNotes(format: "docx" | "pdf" | "md" | "txt" | "write") {
    if (!snapshot?.note) return;
    setBusy(true);
    try {
      const file = makeFile("doc", isDemoMode() ? "demo" : snapshot.user_id);
      file.name = snapshot.room.title + " — Notes";
      file.content = notesDocument(
        snapshot.room.title,
        snapshot.note.body,
        snapshot.segments,
      );
      if (format === "write") {
        if (source === "campus" && !isDemoMode()) {
          const { supabase } = await import("@/lib/storage");
          const result = await supabase?.auth.getUser();
          if (!result?.data.user)
            throw Error(
              "Sign in independently to Workspace before saving a copy in Write.",
            );
          file.owner_id = result.data.user.id;
        }
        await saveFile(file);
        setError("An editable copy was saved in your Workspace file library.");
      } else {
        const { exportFile } = await import("@/lib/universal-export");
        await exportFile(file, format);
      }
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }
  const host = !!snapshot && snapshot.room.owner_id === snapshot.user_id;
  const consented = !!snapshot?.members
    .filter((m) => m.status === "approved")
    .every((m) => m.consent);
  const sourceSuffix = source === "campus" ? "?source=campus" : "";
  const jump = (segment: string) => {
    setTab("transcript");
    setTimeout(
      () =>
        document
          .getElementById("segment-" + segment)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      50,
    );
  };
  function refs(ids: string[]) {
    return (
      <span className="session-refs">
        {ids.map((segment) => {
          const s = snapshot?.segments.find((item) => item.id === segment);
          return (
            <button key={segment} onClick={() => jump(segment)} disabled={!s}>
              {s ? timestamp(s.start_ms) : "Source unavailable"}
            </button>
          );
        })}
      </span>
    );
  }
  return (
    <div className={`sessions-app ${token ? "session-in-call" : ""}`}>
      <nav className="session-nav">
        <Link href={`/tools/sessions${sourceSuffix}`}>
          <Video size={16} />
          Sessions
        </Link>
        <Link href={`/tools/notes${sourceSuffix}`}>
          <NotebookPen size={16} />
          Notes
        </Link>
      </nav>
      {error && !signingIn && (
        <div className="error" role="alert">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      {callNotice && (
        <p className="session-call-notice" role="status">
          {callNotice}
        </p>
      )}
      {!snapshot && signingIn && source === "workspace" ? (
        <Auth
          allowDemo={false}
          onDemo={async () => {}}
          onAuthenticated={() => {
            setSigningIn(false);
            setJoinRequested(false);
            void load(true);
          }}
        />
      ) : !snapshot ? (
        <section className="session-form">
          <h1>Join a private session</h1>
          <p>
            Sign in to {source === "campus" ? "Campus" : "Workspace"}, then
            request admission using this meeting link. Course access is verified
            by Campus.
          </p>
          <label>
            Your display name
            <input
              aria-label="Display name"
              value={display}
              onChange={(e) => setDisplay(e.target.value)}
              maxLength={120}
            />
          </label>
          <button
            className="session-primary"
            disabled={busy || !display.trim() || joinRequested}
            onClick={() =>
              void action({ action: "request_join", display_name: display })
            }
          >
            {joinRequested ? "Admission requested" : "Request admission"}
          </button>
          {joinRequested && (
            <p role="status">
              Waiting for the host to admit you. This invitation opens
              automatically after approval; audio and video stay disconnected
              until you join.
            </p>
          )}
          {source === "workspace" ? (
            <button onClick={() => setSigningIn(true)}>
              Sign in without leaving this invitation
            </button>
          ) : (
            <a
              href="https://www.syrka.co/cam/login"
              target="_blank"
              rel="noopener"
            >
              Sign in to Campus in a new tab, then return to this invitation
            </a>
          )}
        </section>
      ) : (
        <>
          <header className="session-heading">
            <div>
              <small>
                {snapshot.room.kind === "lecture" ? "Lecture" : "Meeting"} ·{" "}
                {snapshot.room.status} ·{" "}
                {new Date(snapshot.room.starts_at).toLocaleString()}
              </small>
              <h1>{snapshot.room.title}</h1>
              <p>{snapshot.room.description}</p>
            </div>
            <button
              aria-label="Copy meeting link"
              onClick={() => void copyInvite()}
            >
              <Copy size={16} />
              Copy link
            </button>
          </header>
          {source === "workspace" && isDemoMode() && (
            <div className="session-notice">
              <strong>Fictional demonstration data.</strong> Examples are not
              real records; calling, speech recognition and AI are not
              simulated.
            </div>
          )}
          {snapshot.capabilities.missing.length > 0 && (
            <details className="session-notice">
              <summary>Service availability</summary>
              {snapshot.capabilities.missing.map((m) => (
                <p key={m}>{m}</p>
              ))}
            </details>
          )}
          {!snapshot.me && (
            <section className="session-form">
              <label>
                Your display name
                <input
                  value={display}
                  onChange={(e) => setDisplay(e.target.value)}
                  maxLength={120}
                />
              </label>
              <button
                disabled={busy || !display.trim()}
                onClick={() =>
                  void action({ action: "request_join", display_name: display })
                }
              >
                Request admission
              </button>
            </section>
          )}
          {snapshot.me?.status === "waiting" && (
            <p role="status" className="session-notice">
              Waiting for the host to admit you. Audio and video are not
              connected.
            </p>
          )}
          {snapshot.me?.status === "removed" && (
            <p role="alert" className="error">
              The host removed your access.
            </p>
          )}
          <details className="session-invitation">
            <summary>
              <Link2 size={15} />
              Invitation
            </summary>
            <label>
              Meeting invitation URL
              <input
                aria-label="Meeting invitation URL"
                readOnly
                value={origin + meetingLink(source, id)}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <p>
              Only authenticated, admitted participants can obtain a room token.
              A link does not grant access.
            </p>
          </details>
          <div
            className={`session-call-workspace ${token && panelOpen ? "has-panel" : ""}`}
          >
            <div className="session-stage-column">
              {token ? (
                <LiveStage
                  onConnected={() => {
                    if (host && snapshot.room.status === "scheduled")
                      void action({
                        action: "host_update",
                        patch: { status: "live" },
                      });
                  }}
                  panelOpen={panelOpen}
                  onTogglePanel={() => setPanelOpen((p) => !p)}
                  onInvite={() => void copyInvite()}
                  speechLanguages={snapshot.capabilities.speechLanguages}
                  speechFormat={snapshot.capabilities.speechFormat}
                  token={token.token}
                  url={token.url}
                  source={source}
                  roomId={id}
                  startedAt={
                    (snapshot.room as { started_at?: string }).started_at ||
                    snapshot.room.starts_at
                  }
                  transcribing={
                    snapshot.room.transcribing && consented && !speechPaused
                  }
                  onDisconnect={(reason) => {
                    setToken(null);
                    setCallNotice(
                      reason ||
                        "Disconnected. Rejoin while this session is still open.",
                    );
                  }}
                />
              ) : (
                <div className="session-connect">
                  <Video size={25} />
                  <div>
                    <h2>
                      {snapshot.room.status === "ended"
                        ? "Session has ended"
                        : "Ready when you are"}
                    </h2>
                    <p>
                      Camera and microphone start off. Select devices and enable
                      them in the meeting controls.
                    </p>
                    {snapshot.me?.status === "approved" && (
                      <label className="session-display-name">
                        Your name
                        <input
                          aria-label="Your meeting name"
                          value={display}
                          onChange={(e) => setDisplay(e.target.value)}
                          maxLength={120}
                          disabled={snapshot.room.locked || busy}
                        />
                      </label>
                    )}
                  </div>
                  {snapshot.capabilities.video &&
                    snapshot.room.status !== "ended" &&
                    snapshot.me?.status === "approved" && (
                      <button
                        className="session-primary"
                        disabled={busy}
                        onClick={() => void connect()}
                      >
                        {host ? "Start / join meeting" : "Join meeting"}
                      </button>
                    )}
                </div>
              )}
            </div>
            <details
              className="session-side-panel"
              open={!token || panelOpen}
              onToggle={(e) => {
                if (token) setPanelOpen(e.currentTarget.open);
              }}
            >
              <summary>
                <PanelRight size={16} />
                Transcript, notes & host controls
              </summary>
              <div className="session-panel-content">
                {snapshot.me?.status === "approved" && (
                  <label className="session-consent">
                    <input
                      type="checkbox"
                      checked={snapshot.me.consent}
                      disabled={busy || !snapshot.capabilities.stt}
                      onChange={(e) => {
                        const consent = e.target.checked;
                        if (!consent) setSpeechPaused(true);
                        void action({ action: "consent", consent }).then(
                          (result) => {
                            if (result && consent) setSpeechPaused(false);
                          },
                        );
                      }}
                    />
                    I consent to my microphone being sent to the configured
                    speech provider and the transcript being processed by the
                    configured AI provider for notes and revision in this
                    session. All admitted participants must consent. Revoking
                    consent stops new chunks; already-transcribed text remains
                    subject to the retention policy.
                  </label>
                )}
                {host && (
                  <details
                    className="session-host"
                    open={token && panelOpen ? true : undefined}
                  >
                    <summary>
                      <ShieldCheck size={16} />
                      Host controls
                    </summary>
                    <div className="session-actions">
                      <label>
                        <input
                          type="checkbox"
                          checked={snapshot.room.locked}
                          onChange={(e) =>
                            void action({
                              action: "host_update",
                              patch: { locked: e.target.checked },
                            })
                          }
                        />
                        Lock new admission requests
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={snapshot.room.transcript_published}
                          onChange={(e) =>
                            void action({
                              action: "host_update",
                              patch: { transcript_published: e.target.checked },
                            })
                          }
                        />
                        Share transcript with the authorized audience
                      </label>
                      {snapshot.capabilities.stt && (
                        <label>
                          <input
                            type="checkbox"
                            checked={snapshot.room.transcribing}
                            disabled={
                              !consented || snapshot.room.status === "ended"
                            }
                            onChange={(e) =>
                              void action({
                                action: "host_update",
                                patch: { transcribing: e.target.checked },
                              })
                            }
                          />
                          Enable near-real-time transcription (all participants
                          must consent)
                        </label>
                      )}
                      <label>
                        Transcript access retention (days)
                        <input
                          type="number"
                          min={1}
                          max={365}
                          defaultValue={snapshot.room.retention_days}
                          onBlur={(e) =>
                            void action({
                              action: "host_update",
                              patch: { retention_days: Number(e.target.value) },
                            })
                          }
                        />
                      </label>
                      {snapshot.room.status === "live" && (
                        <button
                          onClick={() => {
                            if (
                              confirm("End this session for every participant?")
                            )
                              void action({
                                action: "host_update",
                                patch: { status: "ended" },
                              });
                          }}
                        >
                          End for everyone
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              "Delete this session, its transcript, notes and personal revision materials?",
                            )
                          )
                            void action({ action: "delete" }).then((result) => {
                              if (result)
                                router.push("/tools/sessions" + sourceSuffix);
                            });
                        }}
                      >
                        Delete records
                      </button>
                    </div>
                    <h3>
                      <Users size={16} />
                      Participants & waiting room
                    </h3>
                    {snapshot.members.map((member) => (
                      <div className="session-member" key={member.user_id}>
                        <span>
                          {member.display_name} · {member.status} ·{" "}
                          {member.consent ? "consented" : "not consented"}
                        </span>
                        {member.user_id !== snapshot.room.owner_id && (
                          <>
                            {member.status === "waiting" && (
                              <button
                                disabled={busy}
                                onClick={() =>
                                  void action({
                                    action: "member_update",
                                    user_id: member.user_id,
                                    patch: { status: "approved" },
                                  })
                                }
                              >
                                Admit
                              </button>
                            )}
                            {member.status === "approved" && (
                              <button
                                disabled={busy}
                                onClick={() =>
                                  void action({
                                    action: "member_update",
                                    user_id: member.user_id,
                                    patch: { can_publish: !member.can_publish },
                                  })
                                }
                              >
                                {member.can_publish
                                  ? "Disable microphone/camera/sharing"
                                  : "Allow publishing"}
                              </button>
                            )}
                            <button
                              disabled={busy}
                              onClick={() =>
                                void action({
                                  action: "member_update",
                                  user_id: member.user_id,
                                  patch: { status: "removed" },
                                })
                              }
                            >
                              Remove
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </details>
                )}
                <nav className="session-tabs" aria-label="Session views">
                  {["transcript", "notes", "study", "personal"].map((t) => (
                    <button
                      key={t}
                      aria-pressed={tab === t}
                      onClick={() => setTab(t)}
                    >
                      {
                        {
                          transcript: "Transcript",
                          notes: "Notes",
                          study: "Revision",
                          personal: "Personal notes",
                        }[t]
                      }
                    </button>
                  ))}
                </nav>
                {tab === "transcript" && (
                  <section>
                    <label className="tools-search">
                      <Search size={18} />
                      <input
                        aria-label="Search transcript"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search what was said…"
                      />
                    </label>
                    <div className="session-actions">
                      {(["txt", "srt", "vtt"] as const).map((format) => (
                        <button
                          key={format}
                          onClick={() =>
                            download(
                              format === "txt"
                                ? transcriptText(snapshot.segments)
                                : transcriptCaptions(snapshot.segments, format),
                              `${snapshot.room.title}.${format}`,
                              "text/plain;charset=utf-8",
                            )
                          }
                        >
                          <Download size={15} />
                          {format.toUpperCase()}
                        </button>
                      ))}
                    </div>
                    <div className="session-transcript">
                      {snapshot.segments
                        .filter((s) =>
                          `${s.speaker_name} ${segmentText(s)}`
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                        )
                        .map((s) => (
                          <article
                            id={"segment-" + s.id}
                            key={s.id}
                            className={s.important ? "important" : ""}
                          >
                            <header>
                              <strong>{s.speaker_name}</strong>
                              <time>
                                {timestamp(s.start_ms)}–{timestamp(s.end_ms)}
                              </time>
                              <small>
                                {s.language}
                                {s.edited_text !== null
                                  ? " · edited (original preserved)"
                                  : ""}
                              </small>
                            </header>
                            <p dir="auto">{segmentText(s)}</p>
                            {host && (
                              <div>
                                <button
                                  onClick={() => {
                                    const value = prompt(
                                      "Correct transcript (original is preserved)",
                                      segmentText(s),
                                    );
                                    if (value !== null)
                                      void action({
                                        action: "edit_segment",
                                        segment_id: s.id,
                                        patch: { edited_text: value },
                                      });
                                  }}
                                >
                                  Correct
                                </button>
                                <button
                                  onClick={() =>
                                    void action({
                                      action: "edit_segment",
                                      segment_id: s.id,
                                      patch: { important: !s.important },
                                    })
                                  }
                                >
                                  {s.important ? "Unmark" : "Mark important"}
                                </button>
                              </div>
                            )}
                          </article>
                        ))}
                    </div>
                    {!snapshot.segments.length && (
                      <p className="session-notice">
                        No shared transcript is available. The host controls
                        publication and retention.
                      </p>
                    )}
                    {host && snapshot.capabilities.stt && (
                      <details className="session-form">
                        <summary>
                          <Upload size={16} />
                          Transcribe a permitted audio recording
                        </summary>
                        <p>
                          Private upload, up to 20 MB. Qwen file transcription
                          returns sentence timestamps. Speaker identities are
                          unverified. Temporary audio is deleted after
                          processing; this does not record the current meeting.
                        </p>
                        <label className="session-file-picker">
                          <Upload size={16} />
                          Audio file
                          <input
                            type="file"
                            className="session-file-input"
                            accept=".wav,.mp3,.mp4,.webm,.ogg"
                            onChange={(e) =>
                              setAudioUpload(e.target.files?.[0] || null)
                            }
                          />
                          <span>
                            {audioUpload?.name || "Choose an audio recording"}
                          </span>
                        </label>
                        <label>
                          Recording language
                          <select
                            value={audioLanguage}
                            onChange={(e) => setAudioLanguage(e.target.value)}
                          >
                            {(
                              snapshot.capabilities.speechLanguages || ["en"]
                            ).map((language) => (
                              <option key={language}>{language}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <input
                            type="checkbox"
                            checked={audioPermission}
                            onChange={(e) =>
                              setAudioPermission(e.target.checked)
                            }
                          />
                          I have permission from the recorded participants to
                          upload this audio and process it with Qwen.
                        </label>
                        <button
                          disabled={
                            busy ||
                            !audioPermission ||
                            !audioUpload ||
                            audioUpload.size > 20971520
                          }
                          onClick={() => void uploadAudio()}
                        >
                          {busy
                            ? "Uploading / submitting…"
                            : "Upload & transcribe"}
                        </button>
                        {snapshot.jobs
                          .filter((j) => j.kind === "filetrans")
                          .map((j) => (
                            <p key={j.id} role="status">
                              Audio transcription: {j.state}
                              {j.error ? ` — ${j.error}` : ""}
                            </p>
                          ))}
                      </details>
                    )}
                    {host && (
                      <details className="session-form">
                        <summary>
                          <Upload size={16} />
                          Import a permitted transcript
                        </summary>
                        <label>
                          Format
                          <select
                            aria-label="Transcript format"
                            value={format}
                            onChange={(e) => setFormat(e.target.value)}
                          >
                            {["txt", "srt", "vtt"].map((f) => (
                              <option key={f}>{f}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Transcript text
                          <textarea
                            aria-label="Transcript import text"
                            value={imported}
                            onChange={(e) => setImported(e.target.value)}
                            maxLength={1000000}
                          />
                        </label>
                        <label className="session-file-picker">
                          <Upload size={16} />
                          Or open a file
                          <input
                            type="file"
                            className="session-file-input"
                            accept=".txt,.srt,.vtt"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              if (f) {
                                setImported(await f.text());
                                setFormat(f.name.split(".").pop() || "txt");
                              }
                            }}
                          />
                        </label>
                        <p>
                          Plain text has synthetic line timestamps. Imported
                          speaker labels are unknown; they are not verified
                          participant identities.
                        </p>
                        <label>
                          <input
                            type="checkbox"
                            checked={permission}
                            onChange={(e) => setPermission(e.target.checked)}
                          />
                          I have permission to import and process this
                          transcript.
                        </label>
                        <button
                          disabled={busy || !permission || !imported.trim()}
                          onClick={() =>
                            void action({
                              action: "import",
                              text: imported,
                              format,
                              confirmed: permission,
                            }).then((result) => {
                              if (result) setImported("");
                            })
                          }
                        >
                          Import transcript
                        </button>
                      </details>
                    )}
                  </section>
                )}
                {tab === "notes" && (
                  <section className="session-notes">
                    <div className="session-actions">
                      {host && snapshot.capabilities.ai && (
                        <button
                          className="session-primary"
                          disabled={busy || !snapshot.segments.length}
                          onClick={() =>
                            void action({
                              action: "process",
                              kind: "notes",
                              request_id: crypto.randomUUID(),
                            })
                          }
                        >
                          Generate reviewed draft
                        </button>
                      )}
                      {snapshot.note &&
                        (["write", "docx", "pdf", "md", "txt"] as const).map(
                          (format) => (
                            <button
                              disabled={busy}
                              key={format}
                              onClick={() => void exportNotes(format)}
                            >
                              <FileText size={15} />
                              {format === "write"
                                ? "Save copy in Write"
                                : format.toUpperCase()}
                            </button>
                          ),
                        )}
                    </div>
                    {snapshot.note ? (
                      <>
                        <p className="session-notice">
                          {snapshot.note.ai_generated
                            ? "AI-generated draft. Verify claims against the transcript."
                            : "Manually prepared or fictional example notes."}{" "}
                          ·{" "}
                          {snapshot.note.published
                            ? "Published to the authorized audience"
                            : "Private draft — host only"}
                        </p>
                        <h2>Overview</h2>
                        {snapshot.note.body.overview.map((n, i) => (
                          <p key={i}>
                            {n.text}
                            {refs(n.segment_ids)}
                          </p>
                        ))}
                        {snapshot.note.body.topics.map((t, i) => (
                          <div key={i}>
                            <h2>{t.title}</h2>
                            {t.details.map((n, j) => (
                              <p key={j}>
                                {n.text}
                                {refs(n.segment_ids)}
                              </p>
                            ))}
                          </div>
                        ))}
                        <h2>Decisions</h2>
                        {snapshot.note.body.decisions.map((n, i) => (
                          <p key={i}>
                            {n.text}
                            {refs(n.segment_ids)}
                          </p>
                        ))}
                        <h2>Action items</h2>
                        {snapshot.note.body.actions.map((a, i) => (
                          <p key={i}>
                            {a.text}
                            <small>
                              Owner: {a.owner || "unconfirmed"} · Deadline:{" "}
                              {a.deadline || "not stated"}
                              {a.needs_confirmation
                                ? " · Confirm responsibility"
                                : ""}
                            </small>
                            {refs(a.segment_ids)}
                          </p>
                        ))}
                        <h2>Concepts</h2>
                        {snapshot.note.body.concepts.map((c, i) => (
                          <p key={i}>
                            <strong>{c.name}</strong> — {c.explanation}
                            {refs(c.segment_ids)}
                          </p>
                        ))}
                        {host && (
                          <details className="session-form">
                            <summary>Review, edit & publish</summary>
                            <p>
                              Review claims and their source passages before
                              publishing.
                            </p>
                            <NotesReview
                              draft={noteDraft}
                              onChange={setNoteDraft}
                              segments={snapshot.segments}
                            />
                            <button
                              disabled={busy}
                              onClick={() => {
                                try {
                                  const body = notesSchema.parse(
                                    JSON.parse(noteDraft),
                                  );
                                  void action({
                                    action: "save_note",
                                    body,
                                    published: false,
                                    ai_generated: snapshot.note?.ai_generated,
                                  });
                                } catch (e) {
                                  setError(String(e));
                                }
                              }}
                            >
                              Save private draft
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => {
                                try {
                                  const body = notesSchema.parse(
                                    JSON.parse(noteDraft),
                                  );
                                  void action({
                                    action: "save_note",
                                    body,
                                    published: true,
                                    ai_generated: snapshot.note?.ai_generated,
                                  });
                                } catch (e) {
                                  setError(String(e));
                                }
                              }}
                            >
                              Publish to authorized audience
                            </button>
                          </details>
                        )}
                      </>
                    ) : (
                      <div className="session-notice">
                        <p>
                          No published notes yet. AI generation requires a
                          configured provider; you can also prepare your own
                          structured notes.
                        </p>
                        {host && (
                          <button
                            disabled={busy}
                            onClick={() =>
                              void action({
                                action: "save_note",
                                body: {
                                  overview: [],
                                  topics: [],
                                  decisions: [],
                                  actions: [],
                                  concepts: [],
                                  questions: [],
                                },
                                published: false,
                                ai_generated: false,
                              })
                            }
                          >
                            Create a manual draft
                          </button>
                        )}
                      </div>
                    )}
                  </section>
                )}
                {tab === "study" && (
                  <section>
                    <h2>Personal revision</h2>
                    <p>
                      Practice material is not an official university
                      assessment.
                    </p>
                    {snapshot.capabilities.ai && (
                      <button
                        disabled={busy || !snapshot.segments.length}
                        onClick={() =>
                          void action({
                            action: "process",
                            kind: "study",
                            request_id: crypto.randomUUID(),
                          })
                        }
                      >
                        Generate flashcards & practice quiz
                      </button>
                    )}
                    {snapshot.cards.map((card) => (
                      <details key={card.id} className="session-card">
                        <summary>{card.front}</summary>
                        <p>{card.back}</p>
                        {editingCard === card.id ? (
                          <form
                            className="session-form"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void action({
                                action: "update_card",
                                card_id: card.id,
                                patch: { front: cardFront, back: cardBack },
                              }).then((ok) => {
                                if (ok) setEditingCard(null);
                              });
                            }}
                          >
                            <label>
                              Question
                              <input
                                required
                                maxLength={1000}
                                value={cardFront}
                                onChange={(e) => setCardFront(e.target.value)}
                              />
                            </label>
                            <label>
                              Answer
                              <textarea
                                required
                                maxLength={5000}
                                value={cardBack}
                                onChange={(e) => setCardBack(e.target.value)}
                              />
                            </label>
                            <button disabled={busy}>Save card</button>
                            <button
                              type="button"
                              onClick={() => setEditingCard(null)}
                            >
                              Cancel
                            </button>
                          </form>
                        ) : (
                          <button
                            onClick={() => {
                              setEditingCard(card.id);
                              setCardFront(card.front);
                              setCardBack(card.back);
                            }}
                          >
                            Edit card
                          </button>
                        )}
                        {refs(card.segment_ids)}
                        <small>
                          Due {new Date(card.due_at).toLocaleDateString()}
                        </small>
                        <div className="session-actions">
                          {["Again", "Difficult", "Good", "Confident"].map(
                            (label, confidence) => (
                              <button
                                key={label}
                                onClick={() =>
                                  void action({
                                    action: "review_card",
                                    card_id: card.id,
                                    confidence,
                                  })
                                }
                              >
                                {label}
                              </button>
                            ),
                          )}
                          <button
                            onClick={() =>
                              void action({
                                action: "delete_card",
                                card_id: card.id,
                              })
                            }
                          >
                            Delete card
                          </button>
                        </div>
                      </details>
                    ))}
                  </section>
                )}
                {tab === "personal" && (
                  <section className="session-form">
                    <h2>Your private annotations</h2>
                    <label>
                      Folder / subject
                      <input
                        value={folder}
                        onChange={(e) => setFolder(e.target.value)}
                        maxLength={120}
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={bookmarked}
                        onChange={(e) => setBookmarked(e.target.checked)}
                      />
                      Bookmark this session
                    </label>
                    <label>
                      Personal notes
                      <textarea
                        value={personal}
                        onChange={(e) => setPersonal(e.target.value)}
                        maxLength={12000}
                      />
                    </label>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void action({
                          action: "annotate",
                          data: { body: personal, folder, bookmarked },
                        })
                      }
                    >
                      Save personal notes
                    </button>
                  </section>
                )}
                {snapshot.capabilities.ai && (
                  <section className="session-form">
                    <h2>Ask Syrka AI</h2>
                    <label>
                      Question or topic
                      <input
                        aria-label="Ask about this transcript"
                        value={question}
                        onChange={(e) => setQuestion(e.target.value)}
                        maxLength={2500}
                      />
                    </label>
                    <div className="session-actions">
                      {[
                        ["ask", "Ask"],
                        ["explain", "Quick Explain"],
                        ["teach", "Teach Me"],
                        ["followup", "Draft follow-up"],
                        ["translate", "Translate passages"],
                      ].map(([kind, label]) => (
                        <button
                          key={kind}
                          disabled={
                            busy ||
                            !question.trim() ||
                            !snapshot.segments.length
                          }
                          onClick={() =>
                            void action({
                              action: "process",
                              kind,
                              question,
                              request_id: crypto.randomUUID(),
                            })
                          }
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p>
                      Keyword retrieval uses only authorized transcript
                      passages. Added educational explanations are distinguished
                      from the speaker’s words. Translation output is separate
                      from the original.
                    </p>
                  </section>
                )}
                <section className="session-jobs" aria-label="Processing jobs">
                  {snapshot.jobs
                    .filter((j) => j.kind !== "stt")
                    .map((job: Job) => (
                      <article key={job.id}>
                        <strong>
                          {job.kind} · {job.state}
                        </strong>
                        {job.error && <p role="alert">{job.error}</p>}
                        {job.state === "running" &&
                          clock - Date.parse(job.created_at) > 300000 && (
                            <p>
                              Processing may have been interrupted. The original
                              transcript is unchanged; request a new job to
                              retry.
                            </p>
                          )}
                        {job.state === "done" && job.kind !== "notes" && (
                          <>
                            {typeof (job.output as { answer?: string })
                              ?.answer === "string" ? (
                              <p dir="auto">
                                {(job.output as { answer: string }).answer}
                                {(
                                  job.output as {
                                    external_explanation?: boolean;
                                  }
                                ).external_explanation && (
                                  <small>
                                    Contains educational explanation beyond the
                                    transcript.
                                  </small>
                                )}
                                {refs(
                                  (job.output as { segment_ids: string[] })
                                    .segment_ids || [],
                                )}
                              </p>
                            ) : job.kind === "study" ? (
                              (() => {
                                const result = studySchema.safeParse(
                                  job.output,
                                );
                                return result.success ? (
                                  <div>
                                    {result.data.flashcards.map((card, i) => (
                                      <div key={i}>
                                        <strong>{card.front}</strong>
                                        <p>{card.back}</p>
                                        {refs(card.segment_ids)}
                                        <button
                                          onClick={() =>
                                            void action({
                                              action: "card",
                                              data: card,
                                            })
                                          }
                                        >
                                          Save flashcard
                                        </button>
                                      </div>
                                    ))}
                                    {result.data.questions.map((q, i) => (
                                      <details key={i}>
                                        <summary>{q.prompt}</summary>
                                        {q.options.map((option) => (
                                          <p key={option}>{option}</p>
                                        ))}
                                        <p>{q.answer}</p>
                                        <p>{q.explanation}</p>
                                        {refs(q.segment_ids)}
                                      </details>
                                    ))}
                                  </div>
                                ) : null;
                              })()
                            ) : null}
                          </>
                        )}
                      </article>
                    ))}
                </section>
              </div>
            </details>
          </div>
          {busy && <p role="status">Working…</p>}
        </>
      )}
    </div>
  );
}
