"use client";
import { useState } from "react";
import {
  visibleQuestions,
  type FormSchema,
  type Answers,
  type Answer,
  type Question,
} from "@/lib/native/forms";
export function Questions({
  schema,
  answers,
  setAnswers,
  upload,
}: {
  schema: FormSchema;
  answers: Answers;
  setAnswers: (value: Answers) => void;
  upload?: (q: Question, file: File) => Promise<string>;
}) {
  return (
    <div className="native-stack">
      {visibleQuestions(schema, answers).map((q, i) => (
        <QuestionInput
          key={q.id}
          question={q}
          upload={upload}
          index={i}
          value={answers[q.id]}
          change={(v) => setAnswers({ ...answers, [q.id]: v })}
        />
      ))}
    </div>
  );
}
function QuestionInput({
  question: q,
  index,
  value,
  change,
  upload,
}: {
  question: Question;
  index: number;
  value: Answer | undefined;
  change: (v: Answer) => void;
  upload?: (q: Question, file: File) => Promise<string>;
}) {
  const [uploading, setUploading] = useState(false),
    [fileName, setFileName] = useState(""),
    [error, setError] = useState("");
  const name = "question-" + q.id;
  const selected = Array.isArray(value) ? value : [];
  const toggle = (option: string) =>
    change(
      selected.includes(option)
        ? selected.filter((x) => x !== option)
        : [...selected, option],
    );
  const title = (
    <>
      {index + 1}. {q.title}
      {q.required && <span aria-label="required"> *</span>}
    </>
  );
  if (q.type === "section")
    return <h2 className="native-section-heading">{q.title}</h2>;
  if (q.type === "information")
    return (
      <div className="native-info">
        <h3>{q.title}</h3>
        <p>{q.description}</p>
      </div>
    );
  return (
    <fieldset className="native-question-input">
      <legend>{title}</legend>
      {q.description && <p id={name + "-help"}>{q.description}</p>}
      {q.type === "file" ? (
        <div className="native-stack">
          <input
            aria-label={q.title}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.txt"
            disabled={!upload || uploading}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file || !upload) return;
              setUploading(true);
              setError("");
              try {
                const id = await upload(q, file);
                change(id);
                setFileName(file.name);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Upload failed.");
              } finally {
                setUploading(false);
              }
            }}
          />
          <small role="status">
            {uploading
              ? "Uploading privately…"
              : fileName
                ? "Uploaded: " + fileName
                : upload
                  ? "PDF, PNG, JPEG or text, up to 2 MB."
                  : "Uploads are available on the published response page."}{" "}
            Files are not malware scanned.
          </small>
          {error && <p role="alert">{error}</p>}
        </div>
      ) : [
          "short",
          "long",
          "email",
          "url",
          "number",
          "date",
          "time",
          "datetime",
          "rating",
          "scale",
        ].includes(q.type) ? (
        q.type === "long" ? (
          <textarea
            aria-label={q.title}
            value={String(value ?? "")}
            onChange={(e) => change(e.target.value)}
            maxLength={q.max || 10000}
          />
        ) : (
          <input
            aria-label={q.title}
            aria-describedby={q.description ? name + "-help" : undefined}
            type={
              ["number", "rating", "scale"].includes(q.type)
                ? "number"
                : q.type === "datetime"
                  ? "datetime-local"
                  : ["email", "url", "date", "time"].includes(q.type)
                    ? q.type
                    : "text"
            }
            min={
              q.min ?? (["rating", "scale"].includes(q.type) ? 1 : undefined)
            }
            max={
              q.max ?? (["rating", "scale"].includes(q.type) ? 5 : undefined)
            }
            value={
              typeof value === "number" || typeof value === "string"
                ? value
                : ""
            }
            onChange={(e) =>
              change(
                ["number", "rating", "scale"].includes(q.type)
                  ? e.target.value === ""
                    ? ""
                    : Number(e.target.value)
                  : e.target.value,
              )
            }
          />
        )
      ) : ["single", "likert"].includes(q.type) ? (
        q.options.map((o) => (
          <label className="native-choice" key={o}>
            <input
              type="radio"
              name={name}
              checked={value === o}
              onChange={() => change(o)}
            />
            {o}
          </label>
        ))
      ) : q.type === "dropdown" ? (
        <select
          aria-label={q.title}
          value={String(value ?? "")}
          onChange={(e) => change(e.target.value)}
        >
          <option value="">Choose an option</option>
          {q.options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : ["multiple", "checkboxes"].includes(q.type) ? (
        q.options.map((o) => (
          <label className="native-choice" key={o}>
            <input
              type="checkbox"
              checked={selected.includes(o)}
              onChange={() => toggle(o)}
            />
            {o}
          </label>
        ))
      ) : q.type === "yesno" ? (
        ["Yes", "No"].map((o, i) => (
          <label className="native-choice" key={o}>
            <input
              type="radio"
              name={name}
              checked={value === (i === 0)}
              onChange={() => change(i === 0)}
            />
            {o}
          </label>
        ))
      ) : ["consent", "acknowledgement"].includes(q.type) ? (
        <label className="native-choice">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => change(e.target.checked)}
          />
          {q.type === "consent" ? "I consent" : "I acknowledge"}
          {q.type === "acknowledgement" && (
            <small> An acknowledgement, not an electronic signature.</small>
          )}
        </label>
      ) : q.type === "ranking" ? (
        <div className="native-stack">
          {(selected.length ? selected : q.options).map((o, i, all) => (
            <div className="native-row" key={o}>
              <span>
                {i + 1}. {o}
              </span>
              <button
                type="button"
                disabled={!i}
                aria-label={`Move ${o} up`}
                onClick={() => {
                  const next = [...all];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  change(next);
                }}
              >
                Up
              </button>
              <button
                type="button"
                disabled={i === all.length - 1}
                aria-label={`Move ${o} down`}
                onClick={() => {
                  const next = [...all];
                  [next[i + 1], next[i]] = [next[i], next[i + 1]];
                  change(next);
                }}
              >
                Down
              </button>
            </div>
          ))}
        </div>
      ) : ["grid", "checkgrid"].includes(q.type) ? (
        <div className="native-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                {q.options.map((o) => (
                  <th key={o}>{o}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.rows.map((row) => {
                const grid =
                  typeof value === "object" && !Array.isArray(value)
                    ? value
                    : {};
                return (
                  <tr key={row}>
                    <th>{row}</th>
                    {q.options.map((o) => (
                      <td key={o}>
                        <input
                          type={q.type === "grid" ? "radio" : "checkbox"}
                          name={name + row}
                          aria-label={`${row}: ${o}`}
                          checked={
                            q.type === "grid"
                              ? grid[row] === o
                              : Array.isArray(grid[row]) &&
                                grid[row].includes(o)
                          }
                          onChange={() => {
                            const old = Array.isArray(grid[row])
                              ? (grid[row] as string[])
                              : [];
                            change({
                              ...grid,
                              [row]:
                                q.type === "grid"
                                  ? o
                                  : old.includes(o)
                                    ? old.filter((x) => x !== o)
                                    : [...old, o],
                            });
                          }}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </fieldset>
  );
}
