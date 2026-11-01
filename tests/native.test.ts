import { describe, test, expect } from "vitest";
import {
  validateEvent,
  expandEvent,
  zoned,
  conflicts,
  freeSlots,
  timedLayout,
  moveDisplayedOccurrence,
} from "../src/lib/native/calendar";
import {
  blankForm,
  blankQuestion,
  validateForm,
  validateAnswers,
  visibleQuestions,
  publicSchema,
  score,
  csv,
} from "../src/lib/native/forms";
import { exportICS, importICS } from "../src/lib/native/ics";
import ICAL from "ical.js";
const id = "10000000-0000-4000-8000-000000000001",
  cal = "10000000-0000-4000-8000-000000000002";
const base = () =>
  validateEvent({
    id,
    calendar_id: cal,
    title: "Economics seminar",
    start_local: "2026-10-19T09:00",
    end_local: "2026-10-19T10:00",
    time_zone: "Europe/Prague",
    recurrence: {
      freq: "weekly",
      interval: 1,
      weekdays: [1],
      count: 4,
      until: null,
    },
  });
describe("Calendar dates, recurrence and interoperability", () => {
  test("keeps local class time over Prague DST and applies one-occurrence exception", () => {
    const e = base();
    const ex = [
      {
        event_id: id,
        original_start: "2026-10-26T09:00",
        cancelled: false,
        override: {
          start_local: "2026-10-26T11:00",
          end_local: "2026-10-26T12:00",
        },
      },
    ];
    const a = expandEvent(
      e,
      ex,
      "2026-10-01T00:00:00Z",
      "2026-12-01T00:00:00Z",
    );
    expect(a).toHaveLength(4);
    expect(a[0].start).toBe("2026-10-19T07:00:00Z");
    expect(a[1].start).toBe("2026-10-26T10:00:00Z");
    expect(a[2].start).toBe("2026-11-02T08:00:00Z");
    expect(e.start_local).toBe("2026-10-19T09:00");
  });
  test("rejects invalid dates, gaps and durations; disambiguates folds explicitly", () => {
    expect(() => zoned("2026-03-29T02:30", "Europe/Prague")).toThrow(
      "does not exist",
    );
    expect(
      zoned("2026-10-25T02:30", "Europe/Prague", "later").epochMilliseconds -
        zoned("2026-10-25T02:30", "Europe/Prague", "earlier").epochMilliseconds,
    ).toBe(3600000);
    expect(() =>
      validateEvent({ ...base(), end_local: "2026-02-30T10:00" }),
    ).toThrow();
    expect(() =>
      validateEvent({ ...base(), end_local: "2026-10-19T08:00" }),
    ).toThrow();
  });
  test("monthly rules skip missing month days; cancellation is not an independent event", () => {
    const e = validateEvent({
      ...base(),
      start_local: "2026-01-31T09:00",
      end_local: "2026-01-31T10:00",
      recurrence: { freq: "monthly", interval: 1, weekdays: [], count: 3 },
    });
    const a = expandEvent(
      e,
      [
        {
          event_id: id,
          original_start: "2026-03-31T09:00",
          cancelled: true,
          override: null,
        },
      ],
      "2026-01-01T00:00:00Z",
      "2026-07-01T00:00:00Z",
    );
    expect(a.map((x) => x.start_local.slice(0, 10))).toEqual([
      "2026-01-31",
      "2026-05-31",
    ]);
  });
  test("exports parsed ICS with recurrence and imports the supported subset", () => {
    const text = exportICS(base());
    const parsed = new ICAL.Component(ICAL.parse(text));
    expect(
      parsed.getFirstSubcomponent("vevent")?.getFirstPropertyValue("summary"),
    ).toBe("Economics seminar");
    const imported = importICS(text, cal, "UTC");
    expect(imported[0].recurrence?.count).toBe(4);
    expect(imported[0].time_zone).toBe("Europe/Prague");
  });
  test("detects conflicts and avoids busy periods in local suggestions", () => {
    const a = expandEvent(
      base(),
      [],
      "2026-10-19T00:00:00Z",
      "2026-10-20T00:00:00Z",
    );
    expect(conflicts([...a, { ...a[0], key: "second" }])).toHaveLength(1);
    expect(freeSlots(a, "2026-10-19", "Europe/Prague")[0].start_local).toBe(
      "2026-10-19T10:00",
    );
  });
});
describe("Forms schema, answers, branching and exports", () => {
  test("rejects forward references, cycles and duplicate stable IDs", () => {
    const a = blankQuestion(),
      b = blankQuestion();
    a.show_if = { question: b.id, operator: "equals", value: "Student" };
    expect(() => validateForm({ ...blankForm(), questions: [a, b] })).toThrow(
      "cycles",
    );
    expect(() => validateForm({ ...blankForm(), questions: [b, b] })).toThrow(
      "unique",
    );
  });
  test("hidden required questions are not stored; evaluates numeric branches", () => {
    const a = { ...blankQuestion("number"), title: "Score" },
      b = {
        ...blankQuestion(),
        required: true,
        show_if: { question: a.id, operator: "greater" as const, value: 5 },
      };
    const f = validateForm({ ...blankForm(), questions: [a, b] });
    expect(visibleQuestions(f, { [a.id]: 3 })).toHaveLength(1);
    expect(validateAnswers(f, { [a.id]: 3, [b.id]: "not permitted" })).toEqual({
      [a.id]: 3,
    });
    expect(() => validateAnswers(f, { [a.id]: 6 })).toThrow("required");
  });
  test("validates type, choice, required consent, URL and numeric bounds", () => {
    for (const q of [
      { ...blankQuestion("email"), required: true },
      { ...blankQuestion("number"), min: 1, max: 5 },
      { ...blankQuestion("single") },
      { ...blankQuestion("consent"), required: true },
      { ...blankQuestion("url") },
    ]) {
      const f = { ...blankForm(), questions: [q] };
      const wrong =
        q.type === "number"
          ? 99
          : q.type === "consent"
            ? false
            : q.type === "url"
              ? "javascript:alert(1)"
              : "not an option or email";
      expect(() => validateAnswers(f, { [q.id]: wrong })).toThrow();
    }
  });
  test("preserves Unicode, escapes CSV formulas and hides answer keys", () => {
    const q = { ...blankQuestion("single"), correct: "Option 1", points: 2 };
    const f = {
      ...blankForm("English / اردو / العربية"),
      questions: [q],
      quiz: true,
    };
    expect(publicSchema(f).questions[0].correct).toBeUndefined();
    expect(score(f, { [q.id]: "Option 1" })).toEqual({
      earned: 2,
      max: 2,
      practice: true,
    });
    expect(csv([["=1+1", 'A,"B"', "اردو\nالعربية"]])).toContain("'=1+1");
    expect(csv([['A,"B"']])).toContain('"A,""B"""');
  });
  test("multiple choices, grid and ranking validate real structures", () => {
    const q = { ...blankQuestion("checkgrid"), required: true };
    const f = { ...blankForm(), questions: [q] };
    expect(() =>
      validateAnswers(f, { [q.id]: { "Row 1": ["Option 1"] } }),
    ).toThrow();
    const answers = {
      [q.id]: { "Row 1": ["Option 1"], "Row 2": ["Option 2"] },
    };
    expect(validateAnswers(f, answers)).toEqual(answers);
  });
});

test("Sections skip their children and invalid calendar dates cannot be submitted", () => {
  const role = {
    ...blankQuestion("single"),
    title: "Role",
    options: ["Student", "Employer"],
  };
  const section = {
    ...blankQuestion("section"),
    show_if: {
      question: role.id,
      operator: "equals" as const,
      value: "Student",
    },
  };
  const detail = { ...blankQuestion(), required: true };
  const next = blankQuestion("section");
  const date = blankQuestion("date");
  const f = validateForm({
    ...blankForm(),
    questions: [role, section, detail, next, date],
  });
  expect(
    visibleQuestions(f, { [role.id]: "Employer" }).map((q) => q.id),
  ).toEqual([role.id, next.id, date.id]);
  expect(() =>
    validateAnswers(f, { [role.id]: "Employer", [date.id]: "2026-02-30" }),
  ).toThrow();
});

test("ICS end dates preserve western timezones and reject unsupported daily weekday filters", () => {
  const e = validateEvent({
    ...base(),
    time_zone: "America/New_York",
    start_local: "2026-11-01T09:00",
    end_local: "2026-11-01T10:00",
    recurrence: {
      freq: "daily",
      interval: 1,
      weekdays: [],
      count: null,
      until: "2026-11-05",
    },
  });
  const text = exportICS(e);
  expect(importICS(text, cal, "UTC")[0].recurrence?.until).toBe("2026-11-05");
  expect(
    importICS(
      text.replace(/UNTIL=\d+T\d+Z/, "UNTIL=20261105T120000Z"),
      cal,
      "UTC",
    )[0].recurrence?.until,
  ).toBe("2026-11-04");
  expect(() =>
    importICS(text.replace("FREQ=DAILY", "FREQ=DAILY;BYDAY=MO"), cal, "UTC"),
  ).toThrow("Unsupported");
});
test("Rating defaults enforce 1–5 and numeric CSV negatives retain their value", () => {
  const q = blankQuestion("rating");
  expect(() =>
    validateAnswers({ ...blankForm(), questions: [q] }, { [q.id]: 99 }),
  ).toThrow("range");
  expect(csv([[-5]])).toBe('\uFEFF"-5"');
});

test("Week/day layout places overlapping appointments in separate lanes and clips overnight events", () => {
  const first = expandEvent(
    { ...base(), recurrence: null },
    [],
    "2026-10-18T00:00:00Z",
    "2026-10-21T00:00:00Z",
  )[0];
  const other = {
    ...first,
    key: "second",
    start: "2026-10-19T07:30:00Z",
    end: "2026-10-19T08:30:00Z",
  };
  const map = timedLayout([first, other], "2026-10-19", "Europe/Prague");
  expect(map[first.key].count).toBe(2);
  expect(map[first.key].lane).not.toBe(map.second.lane);
  expect(map[first.key].start).toBe(540);
  const overnight = {
    ...first,
    key: "overnight",
    start: "2026-10-18T21:00:00Z",
    end: "2026-10-19T01:00:00Z",
  };
  expect(
    timedLayout([overnight], "2026-10-19", "Europe/Prague").overnight.start,
  ).toBe(0);
});

test("Dragging uses the displayed timezone, including across a DST boundary", () => {
  const item = expandEvent(
    base(),
    [],
    "2026-10-01T00:00:00Z",
    "2026-11-01T00:00:00Z",
  )[0];
  expect(
    moveDisplayedOccurrence(item, "2026-11-02", "UTC", 10).start_local,
  ).toBe("2026-11-02T11:00");
});
