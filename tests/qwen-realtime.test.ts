import { afterEach, expect, test, vi } from "vitest";
const wire = vi.hoisted(() => ({
  sent: [] as string[],
  fail: false,
  beforeCreated: [] as string[],
}));
vi.mock("ws", async () => {
  const { EventEmitter } = await import("node:events");
  return {
    default: class extends EventEmitter {
      constructor() {
        super();
        queueMicrotask(() => {
          this.emit("open");
          wire.beforeCreated = [...wire.sent];
          this.emit(
            "message",
            Buffer.from(JSON.stringify({ type: "session.created" })),
          );
        });
      }
      send(raw: string) {
        const event = JSON.parse(raw);
        wire.sent.push(event.type);
        const emit = (data: object) =>
          queueMicrotask(() =>
            this.emit("message", Buffer.from(JSON.stringify(data))),
          );
        if (event.type === "session.update") emit({ type: "session.updated" });
        if (event.type === "input_audio_buffer.commit") {
          if (wire.fail)
            emit({
              type: "conversation.item.input_audio_transcription.failed",
              error: { code: "FreeTierOnly" },
            });
          else emit({ type: "input_audio_buffer.committed" });
        }
        if (event.type === "session.finish") {
          emit({
            type: "conversation.item.input_audio_transcription.completed",
            transcript: "A real utterance.",
          });
          emit({ type: "session.finished" });
        }
      }
      terminate() {}
    },
  };
});
import { transcribeRealtimePcm } from "../src/lib/sessions/qwen-realtime";
function configure() {
  for (const [key, value] of Object.entries({
    SYRKA_AI_API_KEY: "sk-unit-only",
    SYRKA_AI_BASE_URL:
      "https://ap-southeast-1.maas.qwencloudapi.com/compatible-mode/v1",
    SYRKA_AI_MODEL: "qwen3.8-flash",
    SYRKA_FREE_TIER_CONFIRMED: "true",
    SYRKA_AI_FREE_QUOTA_ONLY_CONFIRMED: "true",
    SYRKA_STT_FREE_QUOTA_ONLY_CONFIRMED: "true",
    SYRKA_AI_DAILY_BUDGET: "0",
  }))
    vi.stubEnv(key, value);
}
afterEach(() => {
  vi.unstubAllEnvs();
  wire.sent = [];
  wire.fail = false;
  wire.beforeCreated = [];
});
test("manual audio commit is followed by session.finish before waiting for final recognition", async () => {
  configure();
  const result = await transcribeRealtimePcm(
    new Blob([new Uint8Array(3200)], { type: "audio/pcm" }),
    "en",
  );
  expect(result.text).toBe("A real utterance.");
  expect(wire.beforeCreated).toEqual([]);
  expect(wire.sent).toEqual([
    "session.update",
    "input_audio_buffer.append",
    "input_audio_buffer.commit",
    "session.finish",
  ]);
});
test("item-specific recognition failures stop immediately without a paid fallback", async () => {
  configure();
  wire.fail = true;
  await expect(
    transcribeRealtimePcm(
      new Blob([new Uint8Array(3200)], { type: "audio/pcm" }),
      "en",
    ),
  ).rejects.toThrow(/free quota.*no paid fallback/i);
  expect(wire.sent).not.toContain("session.finish");
});

test("provider diagnostics contain event counts and signal metadata, never speech or credentials", async () => {
  configure();
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  try {
    const result = await transcribeRealtimePcm(
      new Blob([new Uint8Array(3200).fill(1)], { type: "audio/pcm" }),
      "en",
    );
    expect(result.diagnostics.transport).toBe("outbound-websocket");
    expect(result.diagnostics.events["session.finished"]).toBe(1);
    expect(result.diagnostics.signal).toBe(true);
    const metadata = JSON.stringify(log.mock.calls);
    expect(metadata).not.toContain(result.text);
    expect(metadata).not.toContain("sk-unit-only");
    expect(metadata).not.toContain("Authorization");
  } finally {
    log.mockRestore();
  }
});
