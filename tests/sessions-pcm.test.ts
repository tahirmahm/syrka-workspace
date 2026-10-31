import { afterEach, expect, test, vi } from "vitest";
import { capturePcm } from "../src/lib/sessions/pcm";
function browser(state: AudioContextState = "suspended", rate = 16000) {
  const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
  const source = { connect: vi.fn(), disconnect: vi.fn() },
    silent = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
  const context = {
    sampleRate: rate,
    state,
    onstatechange: null as null | (() => void),
    audioWorklet: { addModule: vi.fn().mockResolvedValue(undefined) },
    destination: {},
    createMediaStreamSource: vi.fn(() => source),
    createGain: vi.fn(() => silent),
    resume: vi.fn(() => new Promise<void>(() => {})),
    close: vi.fn(async () => {
      context.state = "closed";
    }),
  };
  const processor = {
    port: {
      onmessage: null as
        | null
        | ((event: {
            data: {
              buffer: ArrayBuffer;
              startSample: number;
              endSample: number;
            };
          }) => void),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        return context;
      }
    },
  );
  vi.stubGlobal("MediaStream", class {});
  vi.stubGlobal(
    "AudioWorkletNode",
    class {
      constructor() {
        return processor;
      }
    },
  );
  return { track, context, processor, source, silent };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
test("suspended audio returns cleanup and an explicit resume action without stopping the LiveKit track", async () => {
  const b = browser();
  const states: AudioContextState[] = [];
  let resume: (() => void) | undefined;
  const stop = await capturePcm(
    b.track,
    vi.fn(),
    new Date().toISOString(),
    (state, action) => {
      states.push(state);
      resume = action;
    },
  );
  expect(states).toEqual(["suspended"]);
  expect(b.context.resume).toHaveBeenCalledOnce();
  b.context.resume.mockImplementation(async () => {
    b.context.state = "running";
    b.context.onstatechange?.();
  });
  resume!();
  expect(states).toContain("running");
  stop();
  stop();
  expect(b.context.close).toHaveBeenCalledOnce();
  expect(b.track.stop).not.toHaveBeenCalled();
  expect(b.processor.port.onmessage).toBeNull();
  expect(b.context.onstatechange).toBeNull();
});
test("worklet frames become PCM16 batches with meeting-relative millisecond times", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-31T00:00:02Z"));
  const b = browser("running");
  const send = vi.fn();
  const stop = await capturePcm(b.track, send, "2026-10-31T00:00:00Z");
  b.processor.port.onmessage!({
    data: {
      buffer: new Int16Array(64000).buffer,
      startSample: 0,
      endSample: 64000,
    },
  });
  expect(send).toHaveBeenCalledWith(expect.any(Blob), 2000, 6000);
  expect(send.mock.calls[0][0].size).toBe(128000);
  expect(send.mock.calls[0][0].type).toBe("audio/pcm");
  expect(b.silent.gain.value).toBe(0);
  stop();
});
test("unsupported sample rate fails safely rather than uploading mislabeled PCM", async () => {
  const b = browser("running", 48000);
  await expect(
    capturePcm(b.track, vi.fn(), new Date().toISOString()),
  ).rejects.toThrow("16 kHz");
  expect(b.context.close).toHaveBeenCalledOnce();
  expect(b.track.stop).not.toHaveBeenCalled();
});
