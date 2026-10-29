"use client";
import { useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  VideoConference,
  useLocalParticipant,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
import { endpoint, sessionHeaders } from "@/lib/sessions/client";
import type { SessionSource } from "@/lib/sessions/model";
function SpeechCapture({
  enabled,
  source,
  roomId,
  language,
  startedAt,
  onError,
}: {
  enabled: boolean;
  source: SessionSource;
  roomId: string;
  language: string;
  startedAt: string;
  onError: (message: string) => void;
}) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const errorRef = useRef(onError);
  errorRef.current = onError;
  useEffect(() => {
    if (!enabled || !isMicrophoneEnabled) return;
    const track = localParticipant.getTrackPublication(Track.Source.Microphone)
      ?.track?.mediaStreamTrack;
    if (!track) return;
    if (typeof MediaRecorder === "undefined") {
      errorRef.current(
        "This browser does not support audio capture for transcription.",
      );
      return;
    }
    let active = true;
    let recorder: MediaRecorder | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = 0;
    const mime = [
      "audio/webm;codecs=opus",
      "audio/mp4",
      "audio/ogg;codecs=opus",
    ].find((type) => MediaRecorder.isTypeSupported(type));
    if (!mime) {
      errorRef.current("This browser cannot create supported audio chunks.");
      return;
    }
    const run = () => {
      if (!active) return;
      const start = Math.max(0, Date.now() - Date.parse(startedAt));
      const chunks: Blob[] = [];
      recorder = new MediaRecorder(new MediaStream([track]), {
        mimeType: mime,
        audioBitsPerSecond: 32000,
      });
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.onstop = () => {
        const end = Math.max(start + 1, Date.now() - Date.parse(startedAt));
        if (active) run();
        if (!active || !chunks.length) return;
        if (pending >= 2) {
          errorRef.current(
            "Transcription is falling behind; a chunk was skipped. Audio is not retained.",
          );
          return;
        }
        pending++;
        const blob = new Blob(chunks, { type: mime });
        const form = new FormData();
        form.append("roomId", roomId);
        form.append("start_ms", String(start));
        form.append("end_ms", String(Math.min(end, start + 60000)));
        form.append("language", language);
        form.append("request_id", crypto.randomUUID());
        form.append("audio", blob, "track.webm");
        void sessionHeaders(source)
          .then((headers) =>
            fetch(endpoint(source), {
              method: "POST",
              headers,
              body: form,
              credentials: "same-origin",
              signal: AbortSignal.timeout(45000),
            }),
          )
          .then(async (response) => {
            if (!response.ok) {
              const data = await response.json();
              throw Error(data.error || "Transcription request failed.");
            }
          })
          .catch((e) =>
            errorRef.current(String(e instanceof Error ? e.message : e)),
          )
          .finally(() => pending--);
      };
      recorder.start();
      timer = setTimeout(() => {
        if (recorder?.state === "recording") recorder.stop();
      }, 20000);
    };
    run();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      if (recorder?.state === "recording") recorder.stop();
    };
  }, [
    enabled,
    isMicrophoneEnabled,
    localParticipant,
    source,
    roomId,
    language,
    startedAt,
  ]);
  return null;
}
export default function LiveStage({
  token,
  url,
  source,
  roomId,
  transcribing,
  startedAt,
  onDisconnect,
}: {
  token: string;
  url: string;
  source: SessionSource;
  roomId: string;
  transcribing: boolean;
  startedAt: string;
  onDisconnect: () => void;
}) {
  const [language, setLanguage] = useState("en");
  const [error, setError] = useState("");
  return (
    <section className="session-live">
      <div className="session-live-info">
        <strong>
          {transcribing
            ? "Transcription active — near-real-time, 20-second chunks"
            : "Transcription off"}
        </strong>
        <label>
          Speech language
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {["en", "hi", "ur", "ar", "fr", "de", "zh", "es"].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </label>
        <p>
          Only each consenting participant’s own microphone track is
          transcribed. Audio chunks go to the configured provider and are not
          recorded by Syrka.
        </p>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div data-lk-theme="default" className="session-video">
        <LiveKitRoom
          token={token}
          serverUrl={url}
          connect
          video={false}
          audio={false}
          onDisconnected={onDisconnect}
          onError={(e) => setError(e.message)}
        >
          <VideoConference />
          <SpeechCapture
            source={source}
            roomId={roomId}
            language={language}
            startedAt={startedAt}
            enabled={transcribing}
            onError={setError}
          />
        </LiveKitRoom>
      </div>
    </section>
  );
}
