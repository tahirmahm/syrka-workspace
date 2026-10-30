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
import { capturePcm } from "@/lib/sessions/pcm";
import type { SessionSource } from "@/lib/sessions/model";
function SpeechCapture({
  enabled,
  source,
  roomId,
  language,
  startedAt,
  speechFormat,
  onError,
}: {
  enabled: boolean;
  source: SessionSource;
  roomId: string;
  language: string;
  startedAt: string;
  onError: (message: string) => void;
  speechFormat: "pcm" | "encoded";
}) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const errorRef = useRef(onError);
  errorRef.current = onError;
  useEffect(() => {
    if (!enabled || !isMicrophoneEnabled) return;
    const track = localParticipant.getTrackPublication(Track.Source.Microphone)
      ?.track?.mediaStreamTrack;
    if (!track) return;
    if (speechFormat === "pcm") {
      let active = true,
        pending = 0;
      let stop: (() => void) | undefined;
      const controller = new AbortController();
      void capturePcm(
        track,
        (blob, start, end) => {
          if (!active) return;
          if (pending >= 2) {
            errorRef.current(
              "Speech processing is falling behind. A batch was skipped; audio is not retained.",
            );
            return;
          }
          pending++;
          const form = new FormData();
          form.append("roomId", roomId);
          form.append("start_ms", String(start));
          form.append("end_ms", String(end));
          form.append("language", language);
          form.append("request_id", crypto.randomUUID());
          form.append("audio", blob, "microphone.pcm");
          void sessionHeaders(source)
            .then((headers) =>
              fetch(endpoint(source), {
                method: "POST",
                headers,
                body: form,
                credentials: "same-origin",
                signal: AbortSignal.any([
                  controller.signal,
                  AbortSignal.timeout(40000),
                ]),
              }),
            )
            .then(async (response) => {
              if (!response.ok) {
                const result = await response.json();
                throw Error(result.error || "Live speech failed.");
              }
            })
            .catch((e) => {
              if (active)
                errorRef.current(
                  e instanceof Error ? e.message : "Live speech failed.",
                );
            })
            .finally(() => pending--);
        },
        startedAt,
      )
        .then((cleanup) => {
          if (!active) cleanup();
          else stop = cleanup;
        })
        .catch((e) => {
          if (active)
            errorRef.current(
              e instanceof Error
                ? e.message
                : "Microphone speech capture failed.",
            );
        });
      return () => {
        active = false;
        controller.abort();
        stop?.();
      };
    }
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
    speechFormat,
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
  speechFormat = "encoded",
  speechLanguages = ["en", "hi", "ur", "ar", "fr", "de", "zh", "es"],
  onDisconnect,
}: {
  token: string;
  url: string;
  source: SessionSource;
  roomId: string;
  transcribing: boolean;
  startedAt: string;
  onDisconnect: () => void;
  speechLanguages?: string[];
  speechFormat?: "pcm" | "encoded";
}) {
  const [language, setLanguage] = useState("en");
  const [error, setError] = useState("");
  return (
    <section className="session-live">
      <div className="session-live-info">
        <strong>
          {transcribing
            ? speechFormat === "pcm"
              ? "Transcription active — near-real-time, 4-second batches using Qwen Realtime"
              : "Transcription active — near-real-time, 20-second chunks"
            : "Transcription off"}
        </strong>
        <label>
          Speech language
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {speechLanguages.map((l) => (
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
            speechFormat={speechFormat}
            enabled={transcribing}
            onError={setError}
          />
        </LiveKitRoom>
      </div>
    </section>
  );
}
