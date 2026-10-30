import { test, expect, vi, afterEach } from "vitest";
import {
  submitFileTranscription,
  pollFileTranscription,
  parseFileTranscript,
  signFileBinding,
  verifyFileBinding,
} from "../src/lib/sessions/qwen-filetrans";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function setup() {
  for (const [key, value] of Object.entries({
    SYRKA_FREE_TIER_CONFIRMED: "true",
    SYRKA_AI_DAILY_BUDGET: "0",
    SYRKA_AI_API_KEY: "sk-test-fixture",
    SYRKA_AI_BASE_URL:
      "https://test.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
    SYRKA_AI_FREE_QUOTA_ONLY_CONFIRMED: "true",
    SYRKA_STT_FREE_QUOTA_ONLY_CONFIRMED: "true",
    SYRKA_STT_MODEL: "qwen3-asr-flash-realtime",
  }))
    vi.stubEnv(key, value);
}
const task = "10000000-0000-4000-8000-000000000001";
test("filetrans uses asynchronous single file_url request and retains actual sentence offsets", async () => {
  setup();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ output: { task_id: task } }));
  vi.stubGlobal("fetch", fetcher);
  expect(
    await submitFileTranscription("https://private.example/audio-signed", "en"),
  ).toBe(task);
  expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({
    model: "qwen3-asr-flash-filetrans",
    input: { file_url: "https://private.example/audio-signed" },
    parameters: { language: "en", enable_words: true },
  });
  expect(fetcher.mock.calls[0][1].headers["X-DashScope-Async"]).toBe("enable");
  fetcher
    .mockResolvedValueOnce(
      Response.json({
        output: {
          task_status: "SUCCEEDED",
          result: {
            transcription_url:
              "https://dashscope-result.oss-ap-southeast-1.aliyuncs.com/test.json",
          },
        },
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        transcripts: [
          {
            sentences: [
              {
                begin_time: 240,
                end_time: 6720,
                text: "नमस्ते — source words",
                language: "hi",
              },
            ],
          },
        ],
      }),
    );
  const result = await pollFileTranscription(task, "en");
  expect(result.state).toBe("done");
  if (result.state === "done")
    expect(result.segments[0]).toMatchObject({
      start_ms: 240,
      end_ms: 6720,
      language: "hi",
      speaker_id: null,
      original_text: "नमस्ते — source words",
    });
});
test("editable job metadata cannot be used to read another provider task or arbitrary result host", async () => {
  setup();
  const binding = {
    task_id: task,
    audio_path: "actor/room/file.wav",
    language: "en",
    expires: Date.now() + 10000,
  };
  const signature = signFileBinding(binding, "job", "room", "actor");
  expect(
    verifyFileBinding({ binding, signature }, "job", "room", "actor"),
  ).toEqual(binding);
  expect(() =>
    verifyFileBinding(
      {
        binding: {
          ...binding,
          task_id: "20000000-0000-4000-8000-000000000001",
        },
        signature,
      },
      "job",
      "room",
      "actor",
    ),
  ).toThrow(/invalid/);
  expect(() =>
    verifyFileBinding({ binding, signature }, "job", "room", "other"),
  ).toThrow(/invalid/);
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      output: {
        task_status: "SUCCEEDED",
        result: { transcription_url: "http://127.0.0.1/private" },
      },
    }),
  );
  vi.stubGlobal("fetch", fetcher);
  await expect(pollFileTranscription(task, "en")).rejects.toThrow(/host/);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(() =>
    parseFileTranscript(
      {
        transcripts: [
          { sentences: [{ begin_time: 20, end_time: 10, text: "bad" }] },
        ],
      },
      "en",
    ),
  ).toThrow(/timestamps/);
});
