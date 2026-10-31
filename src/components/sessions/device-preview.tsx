"use client";
import { useEffect, useRef, useState } from "react";
import { Video, VideoOff } from "lucide-react";
export type CallDevices = { microphone?: string; camera?: string };
export default function DevicePreview({
  devices,
  onChange,
}: {
  devices: CallDevices;
  onChange: (devices: CallDevices) => void;
}) {
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    generation = useRef(0);
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]),
    [previewing, setPreviewing] = useState(false),
    [error, setError] = useState("");
  useEffect(
    () => () => {
      generation.current++;
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  function stop() {
    generation.current++;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setPreviewing(false);
  }
  async function preview() {
    stop();
    const attempt = generation.current;
    setError("");
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw Error(
          "Camera and microphone preview require HTTPS and a supported browser.",
        );
      const media = await navigator.mediaDevices.getUserMedia({
        audio: devices.microphone
          ? { deviceId: { exact: devices.microphone } }
          : true,
        video: devices.camera ? { deviceId: { exact: devices.camera } } : true,
      });
      if (attempt !== generation.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      if (video.current) video.current.srcObject = media;
      setPreviewing(true);
      setInputs(await navigator.mediaDevices.enumerateDevices());
    } catch {
      setError(
        "Preview could not open your devices. Check camera/microphone permissions or continue with devices off.",
      );
    }
  }
  return (
    <section
      className="session-device-preview"
      aria-label="Camera and microphone preview"
    >
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        hidden={!previewing}
        aria-label="Your local camera preview"
      />
      {previewing && (
        <p role="status">
          Camera and microphone available locally. Preview audio is muted and is
          not sent to anyone.
        </p>
      )}
      <button
        type="button"
        onClick={() => (previewing ? stop() : void preview())}
      >
        {previewing ? <VideoOff size={16} /> : <Video size={16} />}{" "}
        {previewing ? "Stop device preview" : "Preview camera and microphone"}
      </button>
      {inputs.length > 0 && (
        <div className="session-device-selects">
          {(
            [
              ["audioinput", "microphone", "Microphone"],
              ["videoinput", "camera", "Camera"],
            ] as const
          ).map(([kind, key, label]) => (
            <label key={key}>
              {label}
              <select
                aria-label={`Pre-call ${label.toLowerCase()}`}
                value={devices[key] || ""}
                onChange={(e) => {
                  stop();
                  onChange({ ...devices, [key]: e.target.value });
                }}
              >
                <option value="">System default</option>
                {inputs
                  .filter((d) => d.kind === kind)
                  .map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `${label} ${i + 1}`}
                    </option>
                  ))}
              </select>
            </label>
          ))}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
