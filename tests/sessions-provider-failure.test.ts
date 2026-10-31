import { test, expect, vi } from "vitest";
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ai")>()),
  generateText: vi
    .fn()
    .mockRejectedValue(new Error("Simulated unavailable provider")),
}));
import { generateText } from "ai";
import { generateNotes } from "../src/lib/sessions/providers";
import type { Segment } from "../src/lib/sessions/model";
test("provider failure is bounded, recoverable and preserves the original source", async () => {
  const keys = {
    SYRKA_FREE_TIER_CONFIRMED: "true",
    SYRKA_AI_DAILY_BUDGET: "0",
    SYRKA_AI_PROVIDER: "qwen",
    SYRKA_AI_MODEL: "qwen3.8-flash",
    SYRKA_AI_API_KEY: "not-a-real-key",
    SYRKA_AI_BASE_URL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    SYRKA_AI_FREE_QUOTA_ONLY_CONFIRMED: "true",
  };
  const old = Object.fromEntries(
    Object.keys(keys).map((k) => [k, process.env[k]]),
  );
  Object.assign(process.env, keys);
  const segments: Segment[] = [
    {
      id: "10000000-0000-4000-8000-000000000001",
      room_id: "20000000-0000-4000-8000-000000000001",
      speaker_id: null,
      speaker_name: "Unknown",
      start_ms: 0,
      end_ms: 1000,
      language: "en",
      original_text: "Retain the source on failure.",
      edited_text: null,
      important: false,
      created_at: "2026-10-29T00:00:00Z",
    },
  ];
  const original = structuredClone(segments);
  try {
    await expect(generateNotes(segments, "meeting")).rejects.toThrow(
      /Retry after checking provider availability/,
    );
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(segments).toEqual(original);
  } finally {
    for (const [key, value] of Object.entries(old)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
