"use client";
import { timestamp, type Segment } from "@/lib/sessions/model";

const templates: Record<string, unknown> = {
  overview: { text: "", segment_ids: [] },
  decisions: { text: "", segment_ids: [] },
  questions: { text: "", segment_ids: [] },
  details: { text: "", segment_ids: [] },
  topics: { title: "New topic", details: [] },
  actions: {
    text: "",
    owner: null,
    deadline: null,
    needs_confirmation: true,
    segment_ids: [],
  },
  concepts: { name: "", explanation: "", segment_ids: [] },
};
const label = (key: string) => key.replaceAll("_", " ");

/** Editing changes only the local draft; schema and source IDs are checked on save. */
export default function NotesReview({
  draft,
  onChange,
  segments,
}: {
  draft: string;
  onChange: (value: string) => void;
  segments: Segment[];
}) {
  let value: unknown;
  try {
    value = JSON.parse(draft);
  } catch {
    value = null;
  }
  function field(
    current: unknown,
    key: string,
    update: (next: unknown) => void,
    path: string,
  ): React.ReactNode {
    if (key === "segment_ids" && Array.isArray(current))
      return (
        <label key={path}>
          Source passages (select at least one)
          <select
            multiple
            size={Math.min(5, Math.max(2, segments.length))}
            value={current as string[]}
            onChange={(e) =>
              update(
                Array.from(e.target.selectedOptions, (option) => option.value),
              )
            }
          >
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {timestamp(s.start_ms)} ·{" "}
                {(s.edited_text ?? s.original_text).slice(0, 100)}
              </option>
            ))}
          </select>
        </label>
      );
    if (Array.isArray(current))
      return (
        <fieldset key={path}>
          <legend>{label(key)}</legend>
          {current.map((item, i) => (
            <div className="session-note-row" key={`${path}-${i}`}>
              {field(
                item,
                "",
                (next) =>
                  update(current.map((old, j) => (j === i ? next : old))),
                `${path}-${i}`,
              )}
              <button
                type="button"
                onClick={() => update(current.filter((_, j) => j !== i))}
              >
                Remove {label(key)}
              </button>
            </div>
          ))}
          {Boolean(templates[key]) && (
            <button
              type="button"
              disabled={current.length >= 20}
              onClick={() =>
                update([...current, structuredClone(templates[key])])
              }
            >
              Add {label(key)}
            </button>
          )}
        </fieldset>
      );
    if (current !== null && typeof current === "object")
      return (
        <div key={path}>
          {Object.entries(current).map(([name, item]) =>
            field(
              item,
              name,
              (next) => update({ ...current, [name]: next }),
              `${path}-${name}`,
            ),
          )}
        </div>
      );
    if (typeof current === "boolean")
      return (
        <label key={path}>
          <input
            type="checkbox"
            checked={current}
            onChange={(e) => update(e.target.checked)}
          />
          {label(key)}
        </label>
      );
    return (
      <label key={path}>
        {label(key)}
        <textarea
          rows={key === "text" || key === "explanation" ? 3 : 1}
          maxLength={8000}
          value={typeof current === "string" ? current : ""}
          placeholder={current === null ? "Not stated" : ""}
          onChange={(e) =>
            update(current === null && !e.target.value ? null : e.target.value)
          }
        />
      </label>
    );
  }
  return (
    <div>
      {value !== null &&
        field(
          value,
          "notes",
          (next) => onChange(JSON.stringify(next, null, 2)),
          "notes",
        )}
      <details>
        <summary>Advanced structured JSON</summary>
        <textarea
          aria-label="Structured notes"
          value={draft}
          onChange={(e) => onChange(e.target.value)}
        />
      </details>
    </div>
  );
}
