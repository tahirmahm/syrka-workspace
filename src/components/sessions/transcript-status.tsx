"use client";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { Snapshot } from "@/lib/sessions/model";
import { segmentText } from "@/lib/sessions/model";
import type { SpeechProgress } from "@/lib/sessions/speech-progress";
export default function TranscriptStatus({
  snapshot,
  progress,
  host,
  guest,
  busy,
  inCall,
  visible,
  onToggle,
  onNotes,
  children,
}: {
  children?: ReactNode;
  snapshot: Snapshot;
  progress: SpeechProgress;
  host: boolean;
  guest: boolean;
  busy: boolean;
  inCall: boolean;
  visible: boolean;
  onToggle: () => void;
  onNotes: () => void;
}) {
  const log = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const tail = snapshot.segments.at(-1)?.id;
  useEffect(() => {
    if (visible && follow.current && log.current)
      log.current.scrollTop = log.current.scrollHeight;
  }, [tail, visible]);
  const members = snapshot.members.filter((m) => m.status === "approved");
  const pending = members.filter((m) => !m.consent);
  const lastJob = snapshot.jobs.find((j) => j.kind === "stt");
  const noteJob = snapshot.jobs.find((j) => j.kind === "notes");
  const off =
    !snapshot.room.transcribing ||
    pending.length > 0 ||
    !inCall ||
    snapshot.room.status === "ended";
  const state = !snapshot.capabilities.stt
    ? "error"
    : off
      ? "off"
      : lastJob?.state === "failed"
        ? "error"
        : lastJob?.state === "running" || lastJob?.state === "queued"
          ? "processing"
          : progress.state;
  const detail = !snapshot.capabilities.stt
    ? "Speech recognition is unavailable in this deployment. Calling still works."
    : pending.length
      ? `${pending.length} admitted participant${pending.length === 1 ? " needs" : "s need"} to explicitly consent below.`
      : !snapshot.room.transcribing
        ? "The host must enable transcription after everyone consents. Audio is not being sent."
        : !inCall
          ? "Join the call and unmute your microphone to contribute speech."
          : state === "error" && lastJob?.state === "failed"
            ? lastJob.error ||
              "The last speech request failed. Existing transcript is preserved."
            : progress.detail;
  const time = (ms: number) =>
    `${Math.floor(ms / 60000)
      .toString()
      .padStart(
        2,
        "0",
      )}:${Math.floor(ms / 1000) % 60 < 10 ? "0" : ""}${Math.floor(ms / 1000) % 60}`;
  return (
    <section
      className="session-transcription-status"
      aria-label="Live transcription"
    >
      <header>
        <h2>Live Transcript</h2>
        <span
          className={`speech-state is-${state}`}
          role="status"
          aria-live="polite"
        >
          {
            {
              off: "Off",
              listening: "Listening",
              processing: "Processing",
              error: "Error",
            }[state]
          }
        </span>
      </header>
      <p>{detail}</p>
      <details
        className="speech-consent-details"
        open={pending.length > 0 || !snapshot.room.transcribing}
      >
        <summary>
          Consent and participants · {members.length - pending.length}/
          {members.length} consented
        </summary>
        {children}
        <ul
          className="speech-consents"
          aria-label="Participant transcription consent"
        >
          {members.map((m) => (
            <li key={m.user_id}>
              <span>{m.display_name}</span>
              <strong>{m.consent ? "Consented" : "Needs consent"}</strong>
            </li>
          ))}
        </ul>
        <p>
          Each person must opt in; the host cannot consent on their behalf.
          Microphone audio is sent to Qwen only while enabled and consented.
          This does not record the video call.
        </p>
      </details>
      {host && (
        <button
          disabled={
            busy ||
            (!snapshot.room.transcribing &&
              (!snapshot.capabilities.stt ||
                !!pending.length ||
                snapshot.room.status === "ended"))
          }
          onClick={onToggle}
        >
          {snapshot.room.transcribing
            ? "Stop transcription"
            : "Enable transcription"}
        </button>
      )}
      {!off && progress.resume && (
        <button onClick={progress.resume}>Resume speech processing</button>
      )}
      {progress.bytes !== undefined && (
        <details className="speech-batch-diagnostics">
          <summary>Audio batch diagnostics</summary>
          <p className="speech-diagnostics">
            Local batch: {progress.bytes.toLocaleString()} bytes
            {progress.receivedBytes !== undefined
              ? ` · server received ${progress.receivedBytes} bytes`
              : ""}
            {progress.characters !== undefined
              ? ` · ${progress.characters} recognized characters`
              : ""}
            {progress.savedSegments !== undefined
              ? ` · ${progress.savedSegments} saved segments`
              : ""}
            . Completed local batches: {progress.batches || 0}.
          </p>
        </details>
      )}
      {!snapshot.capabilities.stt && (
        <details>
          <summary>Configuration diagnostics</summary>
          <ul>
            {snapshot.capabilities.missing.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </details>
      )}
      {guest ? (
        <p>
          Guest access contributes consented audio, but the existing privacy
          policy keeps transcripts and Workspace Notes with the host. Guest
          transcript content is not exposed here.
        </p>
      ) : (
        <>
          {!host && !snapshot.room.transcript_published && (
            <p>The host has not shared transcript access with participants.</p>
          )}
          <div
            className="speech-live-segments"
            ref={log}
            onScroll={(event) => {
              const node = event.currentTarget;
              follow.current =
                node.scrollHeight - node.scrollTop - node.clientHeight < 32;
            }}
            role="log"
            aria-label="Live transcript segments"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {snapshot.segments.slice(-8).map((s) => (
              <article key={s.id}>
                <header>
                  <strong>{s.speaker_name || "Unknown speaker"}</strong>
                  <time>
                    {time(s.start_ms)}–{time(s.end_ms)}
                  </time>
                </header>
                <p dir="auto">{segmentText(s)}</p>
              </article>
            ))}
          </div>
          {!snapshot.segments.length && (
            <p>
              No recognized speech saved yet. When processing succeeds, segments
              appear here automatically.
            </p>
          )}
          <p>
            Speaker labels identify the microphone owner, not automatic
            separation of multiple people speaking into one microphone. Times
            identify audio batches; they are not word-level timings.
          </p>
          {host && (
            <button
              disabled={
                busy ||
                !snapshot.capabilities.ai ||
                !snapshot.segments.length ||
                ["running", "queued"].includes(noteJob?.state || "")
              }
              onClick={onNotes}
            >
              Generate notes from transcript
            </button>
          )}
          {noteJob && (
            <p role="status">
              Notes: {noteJob.state}
              {noteJob.error ? ` — ${noteJob.error}` : ""}
            </p>
          )}
          {snapshot.note && (
            <p>
              Structured notes are saved. Open the Notes tab to review them.
            </p>
          )}
        </>
      )}
    </section>
  );
}
