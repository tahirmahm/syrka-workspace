import type { Segment, GeneratedNotes } from "./model";
import { timestamp, segmentText } from "./model";
export function parseTranscript(text: string, format: string) {
  const lines = text.replace(/\r/g, "").trim();
  if (lines.length > 1000000)
    throw Error("Transcript imports must be under one million characters.");
  if (format === "txt")
    return lines
      .split(/\n+/)
      .filter(Boolean)
      .flatMap((line) => line.match(/[\s\S]{1,12000}/g) || [])
      .map((original_text, i) => ({
        start_ms: i * 1000,
        end_ms: i * 1000 + 999,
        original_text,
        speaker_name: "Unknown (imported)",
        language: "und",
        speaker_id: null,
        source_kind: "manual",
      }));
  const clock = (s: string) => {
    const m = s.trim().match(/^(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})$/);
    if (!m) throw Error("Invalid caption timestamp.");
    return (
      (Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000 +
      Number(m[4])
    );
  };
  return lines
    .replace(/^WEBVTT[^\n]*\n/, "")
    .split(/\n\s*\n/)
    .flatMap((block) => {
      const parts = block.split("\n");
      const index = parts.findIndex((line) => line.includes("-->"));
      if (index < 0) return [];
      const [a, b] = parts[index].split("-->");
      const start_ms = clock(a);
      const end_ms = clock(b.trim().split(/\s+/)[0]);
      if (end_ms <= start_ms) throw Error("Caption end must follow its start.");
      const caption = parts
        .slice(index + 1)
        .join("\n")
        .replace(/<[^>]*>/g, "");
      if (caption.length > 16000)
        throw Error(
          "A caption exceeds 16,000 characters; split it before importing.",
        );
      return [
        {
          start_ms,
          end_ms,
          original_text: caption,
          speaker_name: "Unknown (imported)",
          language: "und",
          speaker_id: null,
          source_kind: "manual",
        },
      ];
    });
}
export function notesDocument(
  title: string,
  body: GeneratedNotes,
  segments: Segment[],
) {
  const paragraph = (text: string) => ({
    type: "paragraph",
    content: [{ type: "text", text }],
  });
  const heading = (text: string, level = 2) => ({
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }],
  });
  const referenced = (claim: { text: string; segment_ids: string[] }) => {
    const refs = claim.segment_ids
      .map((id) => segments.find((s) => s.id === id))
      .filter(Boolean)
      .map((s) => timestamp(s!.start_ms))
      .join(", ");
    return paragraph(`${claim.text}${refs ? ` [${refs}]` : ""}`);
  };
  return {
    type: "doc",
    content: [
      heading(title, 1),
      paragraph(
        "Session notes — review against the source transcript. Fictional examples are not real university or company records.",
      ),
      heading("Overview"),
      ...body.overview.map(referenced),
      ...body.topics.flatMap((t) => [
        heading(t.title),
        ...t.details.map(referenced),
      ]),
      heading("Decisions"),
      ...body.decisions.map(referenced),
      heading("Action items"),
      ...body.actions.map((a) =>
        referenced({
          text: `${a.text} · Owner: ${a.owner || "unconfirmed"} · Deadline: ${a.deadline || "not stated"}${a.needs_confirmation ? " · Confirm responsibility" : ""}`,
          segment_ids: a.segment_ids,
        }),
      ),
      heading("Transcript"),
      ...segments.map((s) =>
        paragraph(
          `[${timestamp(s.start_ms)}] ${s.speaker_name}: ${segmentText(s)}`,
        ),
      ),
    ],
  };
}
