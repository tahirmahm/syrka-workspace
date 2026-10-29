import { test, expect } from "vitest";
import { parseTranscript } from "../src/lib/sessions/transcripts";
import {
  segmentChunks,
  transcriptCaptions,
  validateReferences,
  nextReview,
  type Segment,
} from "../src/lib/sessions/model";
import {
  retrieve,
  capabilities,
  runIntelligence,
  permittedAiConfiguration,
} from "../src/lib/sessions/providers";
const segment: Segment = {
  id: "10000000-0000-4000-8000-000000000001",
  room_id: "20000000-0000-4000-8000-000000000001",
  speaker_id: null,
  speaker_name: "Unknown",
  start_ms: 1100000,
  end_ms: 1105000,
  language: "ur",
  original_text: "Institutional models and evidence.",
  edited_text: null,
  important: false,
  created_at: "2026-10-29T00:00:00Z",
};
test("SRT/VTT preserve timestamps and safely import unknown speakers", () => {
  const srt = transcriptCaptions([segment], "srt");
  const parsed = parseTranscript(srt, "srt");
  expect(parsed[0].start_ms).toBe(1100000);
  expect(parsed[0].original_text).toContain("Institutional");
  expect(parsed[0].speaker_id).toBeNull();
  expect(transcriptCaptions([segment], "vtt")).toMatch(/^WEBVTT/);
  expect(() =>
    parseTranscript("1\n00:02:00,000 --> 00:01:00,000\nBad", "srt"),
  ).toThrow();
});
test("retrieval, chunking and citations do not fabricate source IDs", () => {
  expect(retrieve([segment], "models")).toEqual([segment]);
  expect(retrieve([segment], "unrelated")).toEqual([]);
  expect(
    segmentChunks(
      Array.from({ length: 4 }, (_, i) => ({
        ...segment,
        id: String(i),
        original_text: "x".repeat(6000),
      })),
      12000,
    ),
  ).toHaveLength(4);
  expect(() =>
    validateReferences({ segment_ids: ["forged"] }, [segment]),
  ).toThrow();
  expect(() =>
    validateReferences({ topics: [{ segment_ids: [segment.id] }] }, [segment]),
  ).not.toThrow();
});
test("free-tier provider gates fail closed, without fabricating AI results", async () => {
  expect(capabilities().recording).toBe(false);
  expect(capabilities().ai).toBe(false);
  await expect(runIntelligence("study", [segment], "models")).rejects.toThrow(
    /not configured/,
  );
  const result = await runIntelligence("ask", [segment], "unrelated");
  expect(result).toMatchObject({ absent: true, segment_ids: [] });
});
test("spaced review schedules difficult cards sooner", () => {
  const now = new Date("2026-10-29T00:00:00Z");
  expect(nextReview(0, 8, now).interval_days).toBe(1);
  expect(nextReview(3, 8, now).interval_days).toBe(24);
});
test("large transcript imports preserve every character instead of silently truncating", () => {
  const text = "x".repeat(50000);
  expect(
    parseTranscript(text, "txt")
      .map((s) => s.original_text)
      .join(""),
  ).toBe(text);
  expect(() =>
    parseTranscript(
      "WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n" + "x".repeat(16001),
      "vtt",
    ),
  ).toThrow(/split/);
});

test("Coding Plan endpoints and keys cannot be used by the application backend", () => {
  const oldKey = process.env.QWEN_API_KEY,
    oldUrl = process.env.QWEN_BASE_URL;
  try {
    process.env.QWEN_API_KEY = "sk-sp-test-not-a-real-key";
    expect(permittedAiConfiguration()).toBe(false);
    delete process.env.QWEN_API_KEY;
    process.env.QWEN_BASE_URL = "https://coding-intl.dashscope.aliyuncs.com/v1";
    expect(permittedAiConfiguration()).toBe(false);
  } finally {
    if (oldKey === undefined) delete process.env.QWEN_API_KEY;
    else process.env.QWEN_API_KEY = oldKey;
    if (oldUrl === undefined) delete process.env.QWEN_BASE_URL;
    else process.env.QWEN_BASE_URL = oldUrl;
  }
});
