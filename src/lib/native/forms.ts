import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
export const questionTypes = [
  "short",
  "long",
  "single",
  "multiple",
  "dropdown",
  "checkboxes",
  "yesno",
  "number",
  "email",
  "url",
  "date",
  "time",
  "datetime",
  "rating",
  "scale",
  "likert",
  "grid",
  "checkgrid",
  "section",
  "information",
  "consent",
  "acknowledgement",
  "ranking",
  "file",
] as const;
export const ruleSchema = z.object({
  question: z.uuid(),
  operator: z.enum(["equals", "not_equals", "contains", "greater", "less"]),
  value: z.union([z.string().max(500), z.number(), z.boolean()]),
});
export const questionSchema = z.object({
  id: z.uuid(),
  type: z.enum(questionTypes),
  title: z.string().trim().min(1).max(500),
  description: z.string().max(3000).default(""),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1).max(200)).max(50).default([]),
  rows: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  min: z.number().nullable().default(null),
  max: z.number().nullable().default(null),
  show_if: ruleSchema.nullable().default(null),
  correct: z.unknown().optional(),
  points: z.number().min(0).max(1000).default(0),
});
export type Question = z.infer<typeof questionSchema>;
export const formSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().max(5000).default(""),
  questions: z.array(questionSchema).min(1).max(100),
  confirmation: z
    .string()
    .max(1000)
    .default("Thank you. Your response has been saved."),
  quiz: z.boolean().default(false),
});
export type FormSchema = z.infer<typeof formSchema>;
export type FormRecord = {
  id: string;
  owner_id: string;
  title: string;
  draft: FormSchema;
  revision: number;
  status: "draft" | "published" | "closed" | "archived";
  public_token: string;
  current_version: string | null;
  access: "public" | "authenticated";
  closes_at: string | null;
  max_responses: number | null;
  one_per_user: boolean;
  updated_at: string;
  deleted_at: string | null;
};
export type Answer =
  string | number | boolean | string[] | Record<string, string | string[]>;
export type Answers = Record<string, Answer>;
export function validateForm(input: unknown) {
  const schema = formSchema.parse(input);
  const ids = new Set(schema.questions.map((q) => q.id));
  if (ids.size !== schema.questions.length)
    throw Error("Question IDs must be unique.");
  const seen = new Set<string>();
  for (const q of schema.questions) {
    if (q.show_if) {
      if (!ids.has(q.show_if.question))
        throw Error("A logic rule refers to a missing question.");
      if (!seen.has(q.show_if.question))
        throw Error(
          "Logic must refer to an earlier question; cycles and forward references are not allowed.",
        );
    }
    seen.add(q.id);
    if (
      [
        "single",
        "multiple",
        "dropdown",
        "checkboxes",
        "likert",
        "grid",
        "checkgrid",
        "ranking",
      ].includes(q.type)
    ) {
      if (q.options.length < 2 || new Set(q.options).size !== q.options.length)
        throw Error("Choice questions need at least two unique options.");
    }
    if (["grid", "checkgrid"].includes(q.type) && !q.rows.length)
      throw Error("Grid questions need rows.");
    if (q.min !== null && q.max !== null && q.min > q.max)
      throw Error("Minimum must not exceed maximum.");
  }
  return schema;
}
export function visibleQuestions(schema: FormSchema, answers: Answers) {
  const visible = new Set<string>();
  let sectionVisible = true;
  const matches = (q: Question) => {
    const r = q.show_if;
    if (!r) return true;
    if (!visible.has(r.question)) return false;
    const a = answers[r.question];
    if (
      a === undefined ||
      a === null ||
      a === "" ||
      (Array.isArray(a) && !a.length)
    )
      return false;
    return r.operator === "equals"
      ? String(a) === String(r.value)
      : r.operator === "not_equals"
        ? String(a) !== String(r.value)
        : r.operator === "contains"
          ? Array.isArray(a)
            ? a.includes(String(r.value))
            : String(a).includes(String(r.value))
          : r.operator === "greater"
            ? Number(a) > Number(r.value)
            : Number(a) < Number(r.value);
  };
  return schema.questions.filter((q) => {
    if (q.type === "section") sectionVisible = matches(q);
    const show = sectionVisible && (q.type === "section" || matches(q));
    if (show) visible.add(q.id);
    return show;
  });
}
export function validateAnswers(schema: FormSchema, input: unknown): Answers {
  const raw = z.record(z.string(), z.unknown()).parse(input),
    out: Answers = {};
  for (const q of visibleQuestions(schema, raw as Answers)) {
    if (["section", "information"].includes(q.type)) continue;
    const v = raw[q.id];
    const empty =
      v === undefined ||
      v === null ||
      v === "" ||
      (Array.isArray(v) && !v.length);
    if (empty) {
      if (q.required) throw Error(`${q.title}: an answer is required.`);
      continue;
    }
    let a: Answer;
    switch (q.type) {
      case "file":
        a = z.uuid().parse(v);
        break;
      case "number":
      case "rating":
      case "scale":
        a = z.number().finite().parse(v);
        if (
          ["rating", "scale"].includes(q.type) &&
          (a < (q.min ?? 1) || a > (q.max ?? 5))
        )
          throw Error(`${q.title}: outside the allowed range.`);
        if ((q.min !== null && a < q.min) || (q.max !== null && a > q.max))
          throw Error(`${q.title}: outside the allowed range.`);
        break;
      case "consent":
      case "acknowledgement":
      case "yesno":
        a = z.boolean().parse(v);
        if (q.required && q.type !== "yesno" && !a)
          throw Error(`${q.title}: confirmation is required.`);
        break;
      case "multiple":
      case "checkboxes":
      case "ranking":
        a = z
          .array(z.enum(q.options as [string, ...string[]]))
          .max(q.options.length)
          .parse(v);
        if (new Set(a).size !== a.length)
          throw Error("Duplicate choices are not allowed.");
        break;
      case "grid":
      case "checkgrid":
        a = z
          .record(
            z.string(),
            q.type === "grid" ? z.string() : z.array(z.string()),
          )
          .parse(v);
        for (const [row, val] of Object.entries(a))
          if (
            !q.rows.includes(row) ||
            (Array.isArray(val)
              ? val.some((x) => !q.options.includes(x))
              : !q.options.includes(val))
          )
            throw Error("Invalid grid answer.");
        const grid = a as Record<string, string | string[]>;
        if (
          q.required &&
          q.rows.some(
            (row) =>
              !grid[row] || (Array.isArray(grid[row]) && !grid[row].length),
          )
        )
          throw Error(`${q.title}: complete every row.`);
        break;
      default:
        a = z
          .string()
          .max(q.type === "long" ? 10000 : 2000)
          .parse(v);
        if (
          ["single", "dropdown", "likert"].includes(q.type) &&
          !q.options.includes(a)
        )
          throw Error("Invalid choice.");
        if (q.type === "email") z.email().parse(a);
        if (q.type === "url") {
          const u = new URL(a);
          if (!["https:", "http:"].includes(u.protocol))
            throw Error("Use an HTTP or HTTPS website.");
        }
        if (["date", "datetime", "time"].includes(q.type)) {
          const pattern =
            q.type === "date"
              ? /^\d{4}-\d{2}-\d{2}$/
              : q.type === "time"
                ? /^\d{2}:\d{2}$/
                : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
          if (!pattern.test(a)) throw Error("Invalid date or time.");
          if (q.type === "date") Temporal.PlainDate.from(a);
          else if (q.type === "time") Temporal.PlainTime.from(a);
          else Temporal.PlainDateTime.from(a);
        }
        if (
          (q.min !== null && a.length < q.min) ||
          (q.max !== null && a.length > q.max)
        )
          throw Error(`${q.title}: incorrect text length.`);
    }
    out[q.id] = a;
  }
  return out;
}
export function blankQuestion(type: Question["type"] = "short"): Question {
  return {
    id: crypto.randomUUID(),
    type,
    title: type === "section" ? "New section" : "Untitled question",
    description: "",
    required: false,
    options: ["Option 1", "Option 2"],
    rows: ["Row 1", "Row 2"],
    min: null,
    max: null,
    show_if: null,
    points: 0,
  };
}
export function blankForm(title = "Untitled form"): FormSchema {
  return {
    title,
    description: "",
    questions: [blankQuestion()],
    confirmation: "Thank you. Your response has been saved.",
    quiz: false,
  };
}
export function publicSchema(schema: FormSchema): FormSchema {
  return {
    ...schema,
    questions: schema.questions.map((q) => {
      const copy = { ...q };
      delete copy.correct;
      return copy;
    }),
  };
}
export function score(schema: FormSchema, answers: Answers) {
  let earned = 0,
    max = 0;
  for (const q of visibleQuestions(schema, answers)) {
    if (q.correct === undefined || !q.points) continue;
    max += q.points;
    const a = answers[q.id];
    const normalize = (v: unknown) =>
      Array.isArray(v) ? JSON.stringify([...v].sort()) : JSON.stringify(v);
    if (normalize(a) === normalize(q.correct)) earned += q.points;
  }
  return { earned, max, practice: true };
}
export function responseRows(
  schema: FormSchema,
  responses: {
    id: string;
    created_at: string;
    answers: Answers;
    version_id: string;
  }[],
) {
  const qs = schema.questions.filter(
    (q) => !["section", "information"].includes(q.type),
  );
  return [
    [
      "Response ID",
      "Submitted at",
      "Schema version",
      ...qs.map((q) => `${q.title} [${q.id.slice(0, 8)}]`),
    ],
    ...responses.map((r) => [
      r.id,
      r.created_at,
      r.version_id,
      ...qs.map((q) => {
        const a = r.answers[q.id];
        return typeof a === "object" ? JSON.stringify(a) : (a ?? "");
      }),
    ]),
  ];
}
export function csv(rows: (string | number | boolean)[][]) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((cell) => {
            const v = String(cell);
            return (
              '"' +
              (typeof cell === "string" && /^[=+@\-\t\r]/.test(v) ? "'" : "") +
              v.replaceAll('"', '""') +
              '"'
            );
          })
          .join(","),
      )
      .join("\r\n")
  );
}
