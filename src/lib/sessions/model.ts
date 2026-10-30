import { z } from "zod";
export const languages = [
  "en",
  "hi",
  "ur",
  "ar",
  "fr",
  "de",
  "zh",
  "es",
] as const;
export type SessionSource = "workspace" | "campus";
export const roomInput = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().max(4000).default(""),
  starts_at: z.iso.datetime({ offset: true }),
  timezone: z.string().max(80),
  kind: z.enum(["meeting", "lecture"]).default("meeting"),
  offering_id: z.uuid().nullable().default(null),
  institution_id: z.uuid().nullable().default(null),
  project: z.string().max(120).default(""),
  recurrence: z.enum(["none", "weekly"]).default("none"),
  occurrences: z.number().int().min(1).max(12).default(1),
});
export type SessionRoom = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  starts_at: string;
  started_at?: string | null;
  timezone: string;
  kind: "meeting" | "lecture";
  institution_id: string | null;
  offering_id: string | null;
  project: string;
  status: "scheduled" | "live" | "ended";
  locked: boolean;
  transcribing: boolean;
  transcript_published: boolean;
  created_at: string;
  retention_days: number;
};
export type Member = {
  room_id: string;
  user_id: string;
  display_name: string;
  status: "waiting" | "approved" | "removed";
  consent: boolean;
  can_publish: boolean;
};
export type Segment = {
  id: string;
  room_id: string;
  speaker_id: string | null;
  speaker_name: string;
  start_ms: number;
  end_ms: number;
  language: string;
  original_text: string;
  edited_text: string | null;
  important: boolean;
  created_at: string;
};
export const claim = z.object({
  text: z.string().max(8000),
  segment_ids: z.array(z.uuid()).min(1).max(40),
});
export const notesSchema = z.object({
  overview: z.array(claim).max(20),
  topics: z
    .array(
      z.object({ title: z.string().max(200), details: z.array(claim).max(30) }),
    )
    .max(30),
  decisions: z.array(claim).max(30),
  actions: z
    .array(
      z.object({
        text: z.string().max(2000),
        owner: z.string().nullable(),
        deadline: z.string().nullable(),
        segment_ids: z.array(z.uuid()).min(1).max(20),
        needs_confirmation: z.boolean(),
      }),
    )
    .max(40),
  concepts: z
    .array(
      z.object({
        name: z.string().max(200),
        explanation: z.string().max(3000),
        segment_ids: z.array(z.uuid()).min(1).max(20),
      }),
    )
    .max(40),
  questions: z.array(claim).max(30),
});
export type GeneratedNotes = z.infer<typeof notesSchema>;
export const answerSchema = z.object({
  answer: z.string().max(12000),
  segment_ids: z.array(z.uuid()).max(40),
  absent: z.boolean(),
  external_explanation: z.boolean(),
});
export const studySchema = z.object({
  flashcards: z
    .array(
      z.object({
        front: z.string().max(1500),
        back: z.string().max(4000),
        segment_ids: z.array(z.uuid()).min(1).max(20),
      }),
    )
    .max(240),
  questions: z
    .array(
      z.object({
        prompt: z.string().max(2000),
        kind: z.enum([
          "multiple_choice",
          "short_answer",
          "conceptual",
          "essay",
        ]),
        options: z.array(z.string().max(1000)).max(6),
        answer: z.string().max(4000),
        explanation: z.string().max(4000),
        segment_ids: z.array(z.uuid()).min(1).max(20),
      }),
    )
    .max(180),
});
export type SessionNote = {
  room_id: string;
  body: GeneratedNotes;
  published: boolean;
  ai_generated: boolean;
  updated_at: string;
};
export type Job = {
  id: string;
  room_id: string;
  kind: string;
  state: "queued" | "running" | "done" | "failed";
  error: string | null;
  output: unknown;
  created_at: string;
};
export type Card = {
  id: string;
  room_id: string;
  front: string;
  back: string;
  confidence: number;
  due_at: string;
  interval_days: number;
  segment_ids: string[];
};
export type Capabilities = {
  speechFormat?: "pcm" | "encoded";
  speechLanguages?: string[];
  video: boolean;
  stt: boolean;
  ai: boolean;
  recording: false;
  missing: string[];
};
export type Snapshot = {
  room: SessionRoom;
  me: Member | null;
  members: Member[];
  segments: Segment[];
  note: SessionNote | null;
  jobs: Job[];
  cards: Card[];
  capabilities: Capabilities;
  user_id: string;
};
export function segmentText(s: Segment) {
  return s.edited_text ?? s.original_text;
}
export function timestamp(ms: number) {
  const n = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(n / 3600), Math.floor(n / 60) % 60, n % 60]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}
export function transcriptText(segments: Segment[]) {
  return segments
    .map(
      (s) => `[${timestamp(s.start_ms)}] ${s.speaker_name}: ${segmentText(s)}`,
    )
    .join("\n");
}
export function transcriptCaptions(segments: Segment[], format: "srt" | "vtt") {
  return (
    (format === "vtt" ? "WEBVTT\n\n" : "") +
    segments
      .map((s, i) => {
        const time = (ms: number) =>
          `${timestamp(ms)}${format === "srt" ? "," : "."}${String(Math.floor(ms) % 1000).padStart(3, "0")}`;
        return `${format === "srt" ? `${i + 1}\n` : ""}${time(s.start_ms)} --> ${time(s.end_ms)}\n${s.speaker_name}: ${segmentText(s).replace(/-->/g, "→")}\n`;
      })
      .join("\n")
  );
}
export function segmentChunks(segments: Segment[], max = 12000) {
  const chunks: Segment[][] = [];
  let current: Segment[] = [];
  let size = 0;
  for (const s of segments) {
    const length = segmentText(s).length + 150;
    if (size + length > max && current.length) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(s);
    size += length;
  }
  if (current.length) chunks.push(current);
  return chunks;
}
export function validateReferences(value: unknown, segments: Segment[]) {
  const ids = new Set(segments.map((s) => s.id));
  function walk(v: unknown) {
    if (!v || typeof v !== "object") return;
    for (const [key, x] of Object.entries(v)) {
      if (
        key === "segment_ids" &&
        Array.isArray(x) &&
        x.some((id) => !ids.has(id))
      )
        throw Error(
          "The AI returned a transcript reference that does not exist.",
        );
      if (key !== "segment_ids") {
        if (Array.isArray(x)) x.forEach(walk);
        else walk(x);
      }
    }
  }
  walk(value);
}
export function nextReview(
  confidence: number,
  interval: number,
  now = new Date(),
) {
  const days =
    confidence < 2
      ? 1
      : confidence === 2
        ? Math.max(2, interval * 2)
        : Math.max(4, interval * 3);
  return {
    interval_days: Math.min(days, 365),
    due_at: new Date(
      now.getTime() + Math.min(days, 365) * 86400000,
    ).toISOString(),
  };
}
export function meetingLink(source: SessionSource, id: string) {
  return `/workspace/tools/sessions/meeting/${id}${source === "campus" ? "?source=campus" : ""}`;
}

export type SearchHit = {
  room_id: string;
  title: string;
  kind: string;
  snippet: string;
  segment_id: string | null;
  start_ms: number | null;
};
