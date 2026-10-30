import { afterEach, test, expect, vi } from "vitest";
import {
  qwenConfiguration,
  qwenReady,
  qwenSpeechReady,
  qwenSpeechRequest,
  transcribeQwen,
  parseQwenSpeech,
  providerFailure,
} from "../src/lib/sessions/qwen";
import { capabilities, generateNotes } from "../src/lib/sessions/providers";
import type { Segment } from "../src/lib/sessions/model";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function configured() {
  vi.stubEnv("SYRKA_AI_PROVIDER", "qwen");
  vi.stubEnv("SYRKA_AI_API_KEY", "sk-unit-test-not-a-real-key");
  vi.stubEnv(
    "SYRKA_AI_BASE_URL",
    "https://unit-workspace.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
  );
  vi.stubEnv("SYRKA_AI_FREE_QUOTA_ONLY_CONFIRMED", "true");
  vi.stubEnv("SYRKA_STT_FREE_QUOTA_ONLY_CONFIRMED", "true");
  vi.stubEnv("SYRKA_FREE_TIER_CONFIRMED", "true");
  vi.stubEnv("SYRKA_AI_DAILY_BUDGET", "0");
  vi.stubEnv("SYRKA_STT_PROVIDER", "qwen");
}
test("general-purpose Qwen aliases default to requested model and require Singapore free-only confirmation", () => {
  configured();
  expect(qwenConfiguration().model).toBe("qwen3.8-flash");
  expect(qwenReady()).toBe(true);
  expect(capabilities().ai).toBe(true);
  vi.stubEnv("SYRKA_AI_FREE_QUOTA_ONLY_CONFIRMED", "false");
  expect(qwenReady()).toBe(false);
  vi.stubEnv("SYRKA_AI_FREE_QUOTA_ONLY_CONFIRMED", "true");
  vi.stubEnv("SYRKA_AI_API_KEY", "sk-sp-not-permitted");
  expect(qwenReady()).toBe(false);
  vi.stubEnv("SYRKA_AI_API_KEY", "sk-valid-test");
  vi.stubEnv(
    "SYRKA_AI_BASE_URL",
    "https://untrusted.example/compatible-mode/v1",
  );
  expect(qwenReady()).toBe(false);
});
test("requested Audio 3.0 cannot incur a paid request even when global free flags are enabled", async () => {
  configured();
  vi.stubEnv("SYRKA_STT_MODEL", "qwen-audio-3.0-asr-flash");
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(qwenSpeechReady()).toBe(false);
  expect(capabilities().stt).toBe(false);
  await expect(
    transcribeQwen(new Blob(["audio"], { type: "audio/webm" }), "en"),
  ).rejects.toThrow(/no published free quota/);
  expect(fetcher).not.toHaveBeenCalled();
});
test("Audio 3.x uses native multimodal JSON and returns original transcript without fabricated diarization", async () => {
  configured();
  vi.stubEnv("SYRKA_STT_MODEL", "qwen-audio-3.1-asr-flash");
  const blob = new Blob(["audio-fixture"], { type: "audio/webm;codecs=opus" });
  const requested = await qwenSpeechRequest(
    blob,
    "hi",
    "qwen-audio-3.0-asr-flash",
  );
  expect(requested.url).toMatch(
    /api\/v1\/services\/aigc\/multimodal-generation\/generation$/,
  );
  expect(requested.body).toMatchObject({
    model: "qwen-audio-3.0-asr-flash",
    input: {
      messages: [
        {
          role: "user",
          content: [
            {
              type: "input_audio",
              input_audio: {
                data: expect.stringMatching(/^data:audio\/webm;base64,/),
              },
            },
          ],
        },
      ],
    },
    parameters: { format: "webm", language_hints: ["hi"] },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      Response.json({
        output: { text: "नमस्ते — مرحباً" },
        usage: { duration: 1 },
      }),
    ),
  );
  expect(await transcribeQwen(blob, "hi")).toEqual({
    text: "नमस्ते — مرحباً",
    language: "hi",
  });
  await expect(qwenSpeechRequest(blob, "ur")).rejects.toThrow(/Urdu/);
  expect(() =>
    parseQwenSpeech(
      { output: { text: "x".repeat(16001) } },
      "qwen-audio-3.1-asr-flash",
      "en",
    ),
  ).toThrow();
});
test("legacy Qwen ASR uses chat completions, and quota exhaustion is terminal", async () => {
  configured();
  vi.stubEnv("SYRKA_STT_MODEL", "qwen3-asr-flash");
  const request = await qwenSpeechRequest(
    new Blob(["a"], { type: "audio/wav" }),
    "en",
  );
  expect(request.url).toMatch(/chat\/completions$/);
  expect(request.body).toMatchObject({
    model: "qwen3-asr-flash",
    asr_options: { language: "en", enable_itn: false },
  });
  const fetcher = vi
    .fn()
    .mockResolvedValue(
      Response.json({ code: "AllocationQuota.FreeTierOnly" }, { status: 403 }),
    );
  vi.stubGlobal("fetch", fetcher);
  await expect(
    transcribeQwen(new Blob(["a"], { type: "audio/wav" }), "en"),
  ).rejects.toThrow(/no paid fallback/);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(
    providerFailure({
      statusCode: 429,
      responseBody: '{"error":{"code":"AllocationQuota.FreeTierOnly"}}',
    })?.quota,
  ).toBe(true);
});
test("LiveKit development credentials are usable in Preview but blocked in production", () => {
  vi.stubEnv("LIVEKIT_ENABLED", "true");
  vi.stubEnv("LIVEKIT_DEVELOPMENT_ONLY", "true");
  vi.stubEnv("LIVEKIT_URL", "wss://example.livekit.cloud");
  vi.stubEnv("LIVEKIT_API_KEY", "test");
  vi.stubEnv("LIVEKIT_API_SECRET", "test");
  vi.stubEnv("VERCEL_ENV", "preview");
  expect(capabilities().video).toBe(true);
  vi.stubEnv("VERCEL_ENV", "production");
  expect(capabilities().video).toBe(false);
});
test("AI SDK sends strict structured Qwen requests, disables thinking, and never retries quota exhaustion", async () => {
  configured();
  const segment: Segment = {
    id: "10000000-0000-4000-8000-000000000001",
    room_id: "20000000-0000-4000-8000-000000000001",
    speaker_id: null,
    speaker_name: "Test",
    start_ms: 0,
    end_ms: 1000,
    language: "en",
    original_text: "We agreed to test the draft.",
    edited_text: null,
    important: false,
    created_at: "2026-10-30T00:00:00Z",
  };
  const notes = {
    overview: [
      {
        text: "The meeting agreed to test a draft.",
        segment_ids: [segment.id],
      },
    ],
    topics: [],
    decisions: [],
    actions: [],
    concepts: [],
    questions: [],
  };
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      id: "chat-test",
      object: "chat.completion",
      created: 1,
      model: "qwen3.8-flash",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: JSON.stringify(notes) },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  const result = await generateNotes([segment], "meeting");
  expect(result.body).toEqual(notes);
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body.model).toBe("qwen3.8-flash");
  expect(body.response_format.type).toBe("json_schema");
  expect(body.response_format.json_schema.strict).toBe(true);
  expect(body.enable_thinking).toBe(false);
  fetcher.mockClear().mockResolvedValue(
    Response.json(
      {
        error: {
          message: "quota",
          type: "quota",
          code: "AllocationQuota.FreeTierOnly",
        },
      },
      { status: 403 },
    ),
  );
  await expect(generateNotes([segment], "meeting")).rejects.toThrow(
    /no paid fallback/,
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});
