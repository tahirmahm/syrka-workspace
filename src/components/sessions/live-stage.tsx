"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LiveKitRoom,
  ParticipantTile,
  VideoTrack,
  isTrackReference,
  RoomAudioRenderer,
  MediaDeviceSelect,
  useRoomContext,
  useConnectionState,
  useParticipants,
  useSpeakingParticipants,
  useLocalParticipantPermissions,
  useStartAudio,
  useTracks,
  useChat,
  useLocalParticipant,
} from "@livekit/components-react";
import { TrackSource } from "@livekit/protocol";
import { Track, ConnectionState, DisconnectReason } from "livekit-client";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  PhoneOff,
  Users,
  Copy,
  PanelRight,
  Volume2,
  Settings2,
  UserRound,
  MessageSquare,
  PictureInPicture2,
  Minimize2,
  Maximize2,
  Grid2X2,
  MoreHorizontal,
  X,
} from "lucide-react";
import "@livekit/components-styles";
import {
  endpoint,
  sessionHeaders,
  scopedGuestEndpoint,
} from "@/lib/sessions/client";
import { capturePcm } from "@/lib/sessions/pcm";
import type { CallPresentation } from "./call-context";
import type { CallDevices } from "./device-preview";
import type { SpeechProgress } from "@/lib/sessions/speech-progress";
import LiveComments from "./live-comments";
import PeoplePanel, { type PeopleManagement } from "./people-panel";
import {
  activeNativePip,
  enterNativePip,
  exitNativePip,
  type PipVideo,
} from "@/lib/sessions/native-pip";
import type { SessionSource } from "@/lib/sessions/model";
function SpeechCapture({
  guestAccess = false,
  enabled,
  source,
  roomId,
  language,
  startedAt,
  speechFormat,
  onError,
  onProgress,
}: {
  onProgress?: (progress: SpeechProgress) => void;
  guestAccess?: boolean;
  enabled: boolean;
  source: SessionSource;
  roomId: string;
  language: string;
  startedAt: string;
  onError: (message: string) => void;
  speechFormat: "pcm" | "encoded";
}) {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;
  const completed = useRef(0);
  const errorRef = useRef(onError);
  errorRef.current = onError;
  useEffect(() => {
    if (!enabled || !isMicrophoneEnabled) {
      progressRef.current?.({
        state: "off",
        detail: enabled
          ? "Unmute your microphone to contribute speech."
          : "Transcription is off; no new microphone audio is sent.",
      });
      return;
    }
    const track = localParticipant.getTrackPublication(Track.Source.Microphone)
      ?.track?.mediaStreamTrack;
    if (!track) {
      progressRef.current?.({
        state: "off",
        detail: "No local microphone track is available.",
      });
      return;
    }
    if (speechFormat === "pcm") {
      let active = true,
        pending = 0,
        capturing = false;
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
          progressRef.current?.({
            state: "processing",
            detail:
              "Sending a four-second microphone batch to the server and Qwen.",
            bytes: blob.size,
            batches: completed.current,
          });
          const form = new FormData();
          form.append("roomId", roomId);
          form.append("start_ms", String(start));
          form.append("end_ms", String(end));
          form.append("language", language);
          form.append("request_id", crypto.randomUUID());
          form.append("audio", blob, "microphone.pcm");
          void sessionHeaders(source)
            .then((headers) =>
              fetch(guestAccess ? scopedGuestEndpoint : endpoint(source), {
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
              const result = await response.json();
              if (active)
                progressRef.current?.({
                  state:
                    pending > 1
                      ? "processing"
                      : capturing
                        ? "listening"
                        : "off",
                  detail: result.characters
                    ? "Speech recognized and saved. Listening for the next batch."
                    : "Batch processed; no speech was recognized. Check microphone input and speech language.",
                  bytes: blob.size,
                  receivedBytes: result.audio_bytes,
                  characters: result.characters,
                  savedSegments: result.saved_segments,
                  batches: ++completed.current,
                });
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
        (state, resume) => {
          capturing = state === "running";
          if (active)
            progressRef.current?.({
              state: capturing ? "listening" : "off",
              detail: capturing
                ? "Listening to your microphone. Audio is processed in four-second batches."
                : "Your browser paused microphone processing. Tap Resume speech processing.",
              resume: state === "suspended" ? resume : undefined,
            });
        },
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
    const controller = new AbortController();
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
        progressRef.current?.({
          state: "processing",
          detail: "Sending a microphone batch to the speech service.",
        });
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
            fetch(guestAccess ? scopedGuestEndpoint : endpoint(source), {
              method: "POST",
              headers,
              body: form,
              credentials: "same-origin",
              signal: AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(45000),
              ]),
            }),
          )
          .then(async (response) => {
            if (!response.ok) {
              const data = await response.json();
              throw Error(data.error || "Transcription request failed.");
            }
            const result = await response.json();
            if (active)
              progressRef.current?.({
                state: "listening",
                detail: "Batch processed. Listening for speech.",
                bytes: blob.size,
                receivedBytes: result.audio_bytes,
                characters: result.characters,
                savedSegments: result.saved_segments,
                batches: ++completed.current,
              });
          })
          .catch((e) => {
            if (active)
              errorRef.current(String(e instanceof Error ? e.message : e));
          })
          .finally(() => pending--);
      };
      recorder.start();
      progressRef.current?.({
        state: "listening",
        detail:
          "Listening to your microphone; processing batches may take up to 20 seconds.",
      });
      timer = setTimeout(() => {
        if (recorder?.state === "recording") recorder.stop();
      }, 20000);
    };
    run();
    return () => {
      active = false;
      controller.abort();
      if (timer) clearTimeout(timer);
      if (recorder?.state === "recording") recorder.stop();
    };
  }, [
    enabled,
    guestAccess,
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
function CallCanvas({
  onInvite,
  onPanel,
  panelOpen,
  onError,
  onLeave,
  panelLabel,
  title,
  presentation,
  speechControls,
  peopleManagement,
  source,
}: {
  source: SessionSource;
  peopleManagement?: PeopleManagement;
  speechControls?: React.ReactNode;
  title: string;
  presentation?: CallPresentation;
  panelLabel: string;
  onLeave: () => void;
  onInvite: () => void;
  onPanel: () => void;
  panelOpen: boolean;
  onError: (message: string) => void;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLDetailsElement>(null);
  const [layout, setLayout] = useState<"auto" | "grid" | "speaker">("auto");
  const [pip, setPip] = useState(false);
  const [sharingFeedback, setSharingFeedback] = useState("");
  const [pipNotice, setPipNotice] = useState("");
  const pipVideo = useRef<PipVideo | null>(null);
  const pipListeners = useRef<() => void>(() => {});
  const room = useRoomContext();
  const state = useConnectionState();
  const participants = useParticipants();
  const speakers = useSpeakingParticipants();
  const permissions = useLocalParticipantPermissions();
  const {
    localParticipant,
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
  } = useLocalParticipant();
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);
  const screen = tracks.find((t) => t.source === Track.Source.ScreenShare);
  const focus =
    (layout === "auto" && screen) ||
    tracks.find(
      (t) =>
        t.source === Track.Source.Camera &&
        t.participant.identity === speakers[0]?.identity &&
        !t.participant.isLocal,
    ) ||
    tracks.find((t) => !t.participant.isLocal) ||
    tracks[0];
  const shareIdentity = screen
    ? `${screen.participant.identity}:${screen.publication?.trackSid || "screen"}`
    : undefined;
  const lastShare = useRef<string | undefined>(undefined);
  const layoutBeforeShare = useRef<"auto" | "grid" | "speaker">("auto");
  useEffect(() => {
    if (shareIdentity && shareIdentity !== lastShare.current) {
      if (!lastShare.current) layoutBeforeShare.current = layout;
      setLayout("auto");
    } else if (!shareIdentity && lastShare.current)
      setLayout(layoutBeforeShare.current);
    lastShare.current = shareIdentity;
  }, [shareIdentity, layout]);
  const focused =
    presentation?.minimized ||
    layout === "speaker" ||
    (layout === "auto" && (!!screen || participants.length <= 2));
  useEffect(
    () => () => {
      pipListeners.current();
      if (pipVideo.current) void exitNativePip(pipVideo.current);
    },
    [],
  );
  async function pictureInPicture() {
    if (pipVideo.current && activeNativePip(pipVideo.current)) {
      await exitNativePip(pipVideo.current);
      setPip(false);
      return;
    }
    const tiles = [
      ...(frame.current?.querySelectorAll<HTMLElement>(
        "[data-participant-identity]",
      ) || []),
    ];
    const selected =
      tracks.find(
        (t) =>
          !t.participant.isLocal &&
          t.source === Track.Source.Camera &&
          t.participant.identity === speakers[0]?.identity &&
          isTrackReference(t) &&
          t.publication.track &&
          !t.publication.isMuted,
      ) ||
      tracks.find(
        (t) =>
          !t.participant.isLocal &&
          isTrackReference(t) &&
          t.publication.track &&
          !t.publication.isMuted,
      ) ||
      focus;
    const tile = tiles.find(
      (t) =>
        t.dataset.participantIdentity === selected?.participant.identity &&
        t.dataset.sessionSource === selected?.source,
    );
    const video = tile?.querySelector<PipVideo>("video");
    try {
      if (!video)
        throw Error("No playable participant video is available yet.");
      pipListeners.current();
      pipVideo.current = video;
      const update = () => {
        const active = activeNativePip(video);
        setPip(active);
        if (!active) setPipNotice("");
      };
      const events = [
        "enterpictureinpicture",
        "leavepictureinpicture",
        "webkitpresentationmodechanged",
      ];
      events.forEach((event) => video.addEventListener(event, update));
      pipListeners.current = () =>
        events.forEach((event) => video.removeEventListener(event, update));
      await enterNativePip(video);
      setPip(true);
      setPipNotice(
        "System Picture-in-Picture is active. Background playback is controlled by your browser and operating system.",
      );
    } catch (error) {
      setPip(false);
      setPipNotice(
        `${error instanceof Error ? error.message : "Native Picture-in-Picture was blocked."} Workspace floating mode is active inside this tab only.`,
      );
      presentation?.onMinimize();
    }
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else
        await (
          frame.current?.closest<HTMLElement>(".persistent-call") ||
          frame.current
        )?.requestFullscreen();
    } catch {
      onError(
        "Fullscreen could not open in this browser. The call remains connected.",
      );
    }
  }
  const { canPlayAudio } = useStartAudio({ props: {} });
  const incomingAudio = useTracks(
    [Track.Source.Microphone, Track.Source.ScreenShareAudio],
    { onlySubscribed: true },
  ).some(
    (t) =>
      !t.participant.isLocal && !!t.publication.track && !t.publication.isMuted,
  );
  const [enablingAudio, setEnablingAudio] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [devicesOpen, setDevicesOpen] = useState(false);
  const waitingCount = peopleManagement?.isHost
    ? peopleManagement.members.filter((m) => m.status === "waiting").length
    : 0;
  async function enableAudio() {
    setEnablingAudio(true);
    setAudioError("");
    try {
      await room.startAudio();
      if (!room.canPlaybackAudio)
        setAudioError(
          "Your browser still blocks playback. Tap Enable Audio again and check device output/volume.",
        );
    } catch {
      setAudioError(
        "Audio playback could not start. Tap Enable Audio to retry.",
      );
    } finally {
      setEnablingAudio(false);
    }
  }
  function openPeople() {
    if (panelOpen) onPanel();
    setChat(false);
    setDevicesOpen(false);
    if (!people) peopleManagement?.refresh();
    setPeople(!people);
  }
  function openChat() {
    if (panelOpen) onPanel();
    setPeople(false);
    setDevicesOpen(false);
    setChat(true);
    setLiveChat(true);
  }
  function openNotes() {
    setPeople(false);
    setChat(false);
    setDevicesOpen(false);
    onPanel();
  }
  function openDevices() {
    if (panelOpen) onPanel();
    setPeople(false);
    setChat(false);
    setDevicesOpen(!devicesOpen);
  }
  function leave() {
    if (pipVideo.current) void exitNativePip(pipVideo.current);
    void room.disconnect(true);
    onLeave();
  }

  const [people, setPeople] = useState(false);
  const [chat, setChat] = useState(false);
  const [liveChat, setLiveChat] = useState(true);
  const [hideComments, setHideComments] = useState(false);
  const { chatMessages, send, isSending } = useChat();
  const [working, setWorking] = useState(false);
  const [slowConnection, setSlowConnection] = useState(false);
  const connected = state === ConnectionState.Connected;
  const mediaVisible =
    connected ||
    state === ConnectionState.Reconnecting ||
    state === ConnectionState.SignalReconnecting;
  useEffect(() => {
    if (connected) return;
    const timer = setTimeout(() => setSlowConnection(true), 15000);
    return () => clearTimeout(timer);
  }, [connected]);
  const publishing = connected && permissions?.canPublish !== false;
  async function toggle(kind: "microphone" | "camera" | "screen") {
    setWorking(true);
    try {
      if (kind === "microphone")
        await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
      if (kind === "camera")
        await localParticipant.setCameraEnabled(!isCameraEnabled);
      if (kind === "screen") {
        await localParticipant.setScreenShareEnabled(!isScreenShareEnabled, {
          audio: true,
          systemAudio: "include",
          surfaceSwitching: "include",
          selfBrowserSurface: "exclude",
          suppressLocalAudioPlayback: true,
        });
        if (!isScreenShareEnabled)
          setSharingFeedback(
            localParticipant.getTrackPublication(Track.Source.ScreenShareAudio)
              ?.track
              ? "Screen and supported presentation audio are shared."
              : "Screen is shared. This capture has no audio track; your browser or selected surface may not support audio sharing.",
          );
        else setSharingFeedback("");
      }
    } catch (error) {
      onError(
        error instanceof Error && error.name === "NotAllowedError"
          ? "Permission was declined or sharing was cancelled. Allow access in your browser to use this device."
          : "The device could not start. Check that it is connected, available and permitted by your browser.",
      );
    } finally {
      setWorking(false);
    }
  }
  const supportsShare =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getDisplayMedia;
  function renderShare(extra = "") {
    return supportsShare ? (
      <button
        className={extra}
        aria-label={
          isScreenShareEnabled ? "Stop sharing screen" : "Share screen"
        }
        aria-pressed={isScreenShareEnabled}
        disabled={
          working ||
          (!isScreenShareEnabled &&
            (!publishing ||
              (!!permissions?.canPublishSources?.length &&
                !permissions.canPublishSources.includes(
                  TrackSource.SCREEN_SHARE,
                ))))
        }
        onClick={() => void toggle("screen")}
      >
        <MonitorUp size={19} />
        <span>
          {isScreenShareEnabled
            ? "Stop sharing"
            : extra
              ? "Share"
              : "Share screen"}
        </span>
      </button>
    ) : null;
  }
  function renderChat(extra = "") {
    return (
      <button
        className={extra}
        aria-label="Open meeting chat"
        aria-expanded={chat}
        onClick={openChat}
      >
        <MessageSquare size={19} />
        <span>Chat</span>
      </button>
    );
  }
  function renderPip(extra = "") {
    return (
      <button
        className={extra}
        aria-label={pip ? "Exit Picture-in-Picture" : "Picture-in-Picture"}
        aria-pressed={pip}
        onClick={() => void pictureInPicture()}
      >
        <PictureInPicture2 size={19} />
        <span>
          {extra ? "PiP" : pip ? "Exit system PiP" : "Picture-in-Picture"}
        </span>
      </button>
    );
  }
  function renderLeave(extra = "") {
    return (
      <button
        className={`session-call-leave ${extra}`}
        aria-label="Leave meeting"
        onClick={leave}
      >
        <PhoneOff size={19} />
        <span>{extra ? "Leave" : "Leave meeting"}</span>
      </button>
    );
  }
  return (
    <div ref={frame} className="session-call-frame" data-call-state={state}>
      <div className="session-call-status">
        <strong className="call-meeting-title">{title}</strong>
        {presentation?.minimized && (
          <small className="call-mini-mode">Workspace floating</small>
        )}
        {presentation && (
          <button
            className="call-return"
            aria-label={
              presentation.minimized ? "Return to call" : "Minimize call"
            }
            onClick={
              presentation.minimized
                ? presentation.onRestore
                : presentation.onMinimize
            }
          >
            {presentation.minimized ? (
              <Maximize2 size={17} />
            ) : (
              <Minimize2 size={17} />
            )}
            <span>
              {presentation.minimized ? "Return to call" : "Minimize"}
            </span>
          </button>
        )}
        <span role="status">
          <span className={`call-status-dot ${connected ? "connected" : ""}`} />
          {state === ConnectionState.Connected
            ? "Connected"
            : state === ConnectionState.Reconnecting ||
                state === ConnectionState.SignalReconnecting
              ? "Reconnecting — keep this page open"
              : "Connecting audio and video…"}
        </span>
        <span>
          {mediaVisible
            ? `${participants.length} ${participants.length === 1 ? "participant" : "participants"}`
            : "Joining session"}
        </span>
      </div>
      {slowConnection && !connected && (
        <p className="session-call-network" role="status">
          Taking longer than expected. Your network may block WebRTC media. You
          can leave and rejoin using another network or VPN; AI and
          transcription consent are not required for calling.
        </p>
      )}
      <div className="session-call-body">
        <div
          className={`session-call-grid ${focused ? "call-focused" : ""}`}
          aria-label="Meeting video stage"
        >
          {mediaVisible && tracks.length ? (
            tracks.map((track) => (
              <ParticipantTile
                key={`${track.participant.identity}:${track.source}`}
                trackRef={track}
                className={
                  focused && track === focus
                    ? "call-primary-tile"
                    : focused
                      ? "call-secondary-tile"
                      : ""
                }
                data-session-source={track.source}
                data-call-local={track.participant.isLocal ? "true" : "false"}
                data-participant-identity={track.participant.identity}
              >
                {isTrackReference(track) &&
                track.publication.track &&
                !track.publication.isMuted ? (
                  <VideoTrack trackRef={track} />
                ) : (
                  <div className="session-tile-placeholder">
                    <UserRound size={48} />
                    <span>{track.participant.name || "Participant"}</span>
                    <small>
                      {track.source === Track.Source.ScreenShare
                        ? "Screen sharing paused"
                        : "Camera off"}
                    </small>
                  </div>
                )}
                <div className="session-tile-label">
                  {track.participant.isMicrophoneEnabled ? (
                    <Mic size={14} />
                  ) : (
                    <MicOff size={14} />
                  )}
                  <span>
                    {track.participant.name || "Participant"}
                    {track.participant.isLocal ? " (you)" : ""}
                    {track.source === Track.Source.ScreenShare
                      ? " · screen"
                      : ""}
                  </span>
                </div>
              </ParticipantTile>
            ))
          ) : (
            <div className="session-call-placeholder">
              <Video size={38} />
              <strong>Connecting your secure call</strong>
              <span>Camera and microphone stay off until you enable them.</span>
            </div>
          )}
        </div>
        {people && (
          <aside className="session-people" aria-label="People">
            <h3>
              People
              <button
                aria-label="Close participants"
                onClick={() => setPeople(false)}
              >
                <X size={15} />
              </button>
            </h3>
            <PeoplePanel
              management={peopleManagement}
              participants={mediaVisible ? participants : []}
              source={source}
            />
          </aside>
        )}
        {chat && (
          <aside
            className="session-people session-chat"
            aria-label="Meeting chat"
          >
            <h3>
              Chat
              <button aria-label="Close chat" onClick={() => setChat(false)}>
                <X size={15} />
              </button>
            </h3>
            <p>Messages stay in this call and are not saved.</p>
            <div
              className="session-chat-messages"
              role="log"
              aria-label="Call messages"
            >
              {chatMessages.map((message, index) => (
                <article key={`${message.timestamp}:${index}`}>
                  <strong>{message.from?.name || "Participant"}</strong>
                  <p>{message.message}</p>
                </article>
              ))}
            </div>
          </aside>
        )}
      </div>
      <LiveComments
        messages={chatMessages}
        active={
          liveChat &&
          !people &&
          !panelOpen &&
          !devicesOpen &&
          !presentation?.minimized
        }
        hidden={hideComments}
        compact={!!presentation?.minimized}
        obstructed={people || chat || panelOpen || devicesOpen || !!screen}
        connected={connected}
        sending={isSending}
        canSend={permissions?.canPublishData !== false}
        send={send}
        onHistory={() => {
          if (presentation?.minimized) presentation.onRestore();
          if (panelOpen) onPanel();
          setPeople(false);
          setDevicesOpen(false);
          setChat(true);
          setLiveChat(true);
        }}
        onClose={() => setLiveChat(false)}
        onError={onError}
      />
      {sharingFeedback && isScreenShareEnabled && (
        <p className="call-share-feedback" role="status">
          {sharingFeedback}
        </p>
      )}
      {screen && (
        <p className="call-presenter" role="status">
          {screen.participant.name || "Participant"} is presenting
        </p>
      )}
      {mediaVisible && incomingAudio && !canPlayAudio && (
        <div className="call-audio-unlock" role="status">
          <Volume2 size={17} />
          <span>
            {audioError ||
              "Your browser needs permission to play incoming audio."}
          </span>
          <button disabled={enablingAudio} onClick={() => void enableAudio()}>
            {enablingAudio ? "Enabling…" : "Enable Audio"}
          </button>
        </div>
      )}

      {permissions?.canPublish === false && (
        <p className="session-call-permission" role="status">
          The host has disabled your microphone, camera and screen sharing. You
          can still listen and watch.
        </p>
      )}
      <div
        className="session-call-toolbar"
        role="toolbar"
        aria-label="Meeting controls"
      >
        <button
          data-primary-control="mic"
          aria-label={
            isMicrophoneEnabled ? "Mute microphone" : "Unmute microphone"
          }
          aria-pressed={isMicrophoneEnabled}
          disabled={working || (!publishing && !isMicrophoneEnabled)}
          onClick={() => void toggle("microphone")}
        >
          {isMicrophoneEnabled ? <Mic size={19} /> : <MicOff size={19} />}
          <span>Mic</span>
        </button>
        <button
          data-primary-control="camera"
          aria-label={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
          aria-pressed={isCameraEnabled}
          disabled={working || (!publishing && !isCameraEnabled)}
          onClick={() => void toggle("camera")}
        >
          {isCameraEnabled ? <Video size={19} /> : <VideoOff size={19} />}
          <span>Camera</span>
        </button>
        {renderShare("call-desktop-control")}
        <button
          data-primary-control="people"
          aria-label="Show participants"
          aria-describedby={waitingCount ? "call-waiting-count" : undefined}
          aria-expanded={people}
          onClick={openPeople}
        >
          <Users size={19} />
          <span>People</span>
          {waitingCount > 0 && (
            <span
              id="call-waiting-count"
              className="call-waiting-count"
              aria-label={`${waitingCount} waiting guests`}
            >
              {waitingCount}
            </span>
          )}
        </button>

        {renderPip("call-desktop-control")}
        <details ref={more} className="call-more" data-primary-control="more">
          <summary aria-label="More call options">
            <MoreHorizontal size={19} />
            <span>More</span>
          </summary>
          <div
            onClick={(event) => {
              if (
                (event.target as HTMLElement).closest("button") &&
                more.current
              )
                more.current.open = false;
            }}
          >
            <button aria-label="Copy meeting invitation" onClick={onInvite}>
              <Copy size={17} />
              Copy invitation
            </button>
            {renderShare() || (
              <p>
                Screen capture is unavailable in this browser. You can still
                view presentations.
              </p>
            )}
            {renderPip()}
            {pipNotice && (
              <p className="call-pip-feedback" role="status">
                {pipNotice}
              </p>
            )}
            {renderChat()}
            <button
              onClick={() => setHideComments(!hideComments)}
              aria-pressed={hideComments}
            >
              {hideComments ? "Show live comments" : "Hide live comments"}
            </button>
            <button
              aria-label={
                panelLabel === "Consent"
                  ? "Toggle transcription consent"
                  : "Toggle transcript and notes"
              }
              aria-expanded={panelOpen}
              onClick={openNotes}
            >
              <PanelRight size={17} />
              Notes / Transcription
            </button>
            <button
              aria-label="Audio and camera settings"
              onClick={openDevices}
            >
              <Settings2 size={17} />
              Audio & camera settings
            </button>
            {peopleManagement?.isHost && (
              <button onClick={openNotes}>
                <Settings2 size={17} />
                Meeting settings
              </button>
            )}
            <button
              aria-label={
                layout === "grid" ? "Focus speaker" : "Show grid view"
              }
              onClick={() => setLayout(layout === "grid" ? "speaker" : "grid")}
            >
              <Grid2X2 size={17} />
              {layout === "grid" ? "Focus speaker" : "Grid view"}
            </button>
            {screen && (
              <button onClick={() => setLayout("auto")}>
                <MonitorUp size={17} />
                Focus presentation
              </button>
            )}
            {typeof document !== "undefined" &&
              typeof document.documentElement.requestFullscreen ===
                "function" && (
                <button onClick={() => void fullscreen()}>
                  <Maximize2 size={17} />
                  Full Screen
                </button>
              )}
            {speechControls}
            {presentation && (
              <button onClick={presentation.onMinimize}>
                <Minimize2 size={17} />
                Minimize to Workspace
              </button>
            )}
            {renderLeave()}
          </div>
        </details>
        {renderLeave("call-desktop-control")}
      </div>
      {devicesOpen && (
        <aside
          className="session-people call-device-sheet"
          aria-label="Audio and camera settings"
        >
          <h3>
            Audio & camera
            <button
              aria-label="Close device settings"
              onClick={() => setDevicesOpen(false)}
            >
              <X size={16} />
            </button>
          </h3>
          {connected && permissions?.canPublish !== false ? (
            <>
              <section aria-label="Microphone devices">
                <h4>Microphone</h4>
                <MediaDeviceSelect
                  kind="audioinput"
                  onError={() =>
                    onError("Microphone selection failed. Check permissions.")
                  }
                />
              </section>
              <section aria-label="Camera devices">
                <h4>Camera</h4>
                <MediaDeviceSelect
                  kind="videoinput"
                  onError={() =>
                    onError("Camera selection failed. Check permissions.")
                  }
                />
              </section>
            </>
          ) : (
            <p>
              Input devices become available after connection with publication
              permission.
            </p>
          )}
          <p>
            Speaker output and volume are controlled by your browser and device.
            A connected room does not prove sound is playing.
          </p>
          {connected &&
            typeof HTMLMediaElement.prototype.setSinkId === "function" && (
              <section aria-label="Speaker devices">
                <h4>Speaker output</h4>
                <MediaDeviceSelect
                  kind="audiooutput"
                  onError={() =>
                    onError(
                      "Speaker output could not be changed in this browser.",
                    )
                  }
                />
              </section>
            )}
        </aside>
      )}
      <RoomAudioRenderer />
    </div>
  );
}
export default function LiveStage({
  token,
  url,
  title = "Syrka Session",
  presentation,
  source,
  roomId,
  transcribing,
  onSpeechProgress,
  startedAt,
  speechFormat = "encoded",
  speechLanguages = ["en", "hi", "ur", "ar", "fr", "de", "zh", "es"],
  panelOpen,
  onTogglePanel,
  onInvite,
  onDisconnect,
  onConnected,
  devices = {},
  panelLabel = "Notes",
  guestAccess = false,
  peopleManagement,
}: {
  peopleManagement?: PeopleManagement;
  title?: string;
  presentation?: CallPresentation;
  guestAccess?: boolean;
  devices?: CallDevices;
  panelLabel?: string;
  onConnected: () => void;
  token: string;
  url: string;
  source: SessionSource;
  roomId: string;
  transcribing: boolean;
  onSpeechProgress?: (progress: SpeechProgress) => void;
  startedAt: string;
  onDisconnect: (reason?: string) => void;
  onInvite: () => void;
  onTogglePanel: () => void;
  panelOpen: boolean;
  speechLanguages?: string[];
  speechFormat?: "pcm" | "encoded";
}) {
  const captureOptions = useMemo(
    () => ({
      audioCaptureDefaults: { deviceId: devices.microphone },
      videoCaptureDefaults: { deviceId: devices.camera },
    }),
    [devices.microphone, devices.camera],
  );
  const [language, setLanguage] = useState("en");
  const [error, setError] = useState("");
  const handleConnectionError = useCallback(
    () =>
      setError(
        "Audio/video could not connect. Check browser permissions and your network or VPN, then leave and rejoin. Calling does not require transcription consent.",
      ),
    [],
  );
  return (
    <section className="session-live">
      {error && (
        <p role="alert" className="error">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </p>
      )}
      <div data-lk-theme="default">
        <LiveKitRoom
          options={captureOptions}
          token={token}
          serverUrl={url}
          connect
          audio={false}
          video={false}
          connectOptions={{
            peerConnectionTimeout: 15000,
            websocketTimeout: 10000,
            maxRetries: 2,
          }}
          onDisconnected={(reason) =>
            onDisconnect(
              reason === DisconnectReason.CLIENT_INITIATED
                ? "You left the meeting. You can join again while it is open."
                : reason === DisconnectReason.DUPLICATE_IDENTITY
                  ? "This account joined from another tab or device. Use a separate account for each participant."
                  : reason === DisconnectReason.PARTICIPANT_REMOVED
                    ? "The host removed you from the meeting."
                    : reason === DisconnectReason.ROOM_DELETED
                      ? "The host ended the meeting."
                      : "The media connection ended. Check your network and rejoin; your saved notes are safe.",
            )
          }
          onConnected={onConnected}
          onError={handleConnectionError}
        >
          <CallCanvas
            source={source}
            peopleManagement={peopleManagement}
            speechControls={
              <label>
                Speech language
                <select
                  aria-label="Speech language"
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                >
                  {speechLanguages.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
                <small>
                  {transcribing
                    ? "Meeting transcription is enabled. Open Notes / Transcription for actual microphone and processing status."
                    : "Transcription is off. Consent controls are in the notes panel."}
                </small>
              </label>
            }
            title={title}
            presentation={presentation}
            panelLabel={panelLabel}
            onLeave={() =>
              onDisconnect(
                "You left the meeting. You can join again while it is open.",
              )
            }
            onInvite={onInvite}
            onPanel={onTogglePanel}
            panelOpen={panelOpen}
            onError={setError}
          />
          <SpeechCapture
            guestAccess={guestAccess}
            source={source}
            roomId={roomId}
            language={language}
            startedAt={startedAt}
            speechFormat={speechFormat}
            enabled={transcribing}
            onProgress={onSpeechProgress}
            onError={(message) =>
              onSpeechProgress?.({ state: "error", detail: message })
            }
          />
        </LiveKitRoom>
      </div>
    </section>
  );
}
