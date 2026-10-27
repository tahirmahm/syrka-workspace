import { writePoints } from "../src/lib/write-units";
import { describe, it, expect } from "vitest";
import {
  defaultPage,
  pageSettings,
  pageDimensions,
  inspectWriteDocument,
} from "../src/lib/write-model";
import {
  writingSuggestions,
  citation,
  bibliography,
  academicTemplates,
} from "../src/lib/write-assistance";
describe("Write compatible model", () => {
  it("reads legacy documents without mutating them", () => {
    const doc = { type: "doc", content: [{ type: "paragraph" }] };
    expect(pageSettings(doc)).toEqual(defaultPage);
    expect(doc).not.toHaveProperty("attrs");
    expect(inspectWriteDocument(doc)).toEqual([]);
  });
  it("protects unknown nodes and bounds settings", () => {
    expect(
      inspectWriteDocument({
        type: "doc",
        content: [{ type: "futureEquation" }],
      }),
    ).toEqual(["futureEquation"]);
    expect(
      inspectWriteDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Future",
                marks: [{ type: "unknownFormat" }],
              },
            ],
          },
        ],
      }),
    ).toEqual(["mark:unknownFormat"]);
    expect(pageSettings({ attrs: { margin: 900, size: "wrong" } }).margin).toBe(
      144,
    );
    expect(pageDimensions({ ...defaultPage, landscape: true })).toEqual([
      841.89, 595.28,
    ]);
  });
  it("keeps non-English prose untouched", () => {
    expect(writingSuggestions("i teh teh", "ur")).toEqual([]);
    expect(
      writingSuggestions("i recieved teh book", "en-GB").some(
        (x) => x.replacement === "I",
      ),
    ).toBe(true);
  });
  it("uses structured sources without fabricated content", () => {
    const source = {
      author: "Smith",
      title: "Test",
      year: "2026",
      publisher: "Press",
      doi: "10.123/test",
      url: "",
    };
    expect(citation(source, "APA")).toBe("(Smith, 2026)");
    expect(bibliography(source, "APA")).toContain(
      "https://doi.org/10.123/test",
    );
    expect(Object.keys(academicTemplates)).toHaveLength(8);
  });
});

it("normalizes imported CSS lengths for Office and PDF", () => {
  expect(writePoints("16px")).toBe(12);
  expect(writePoints("18pt")).toBe(18);
  expect(writePoints("1in")).toBe(72);
  expect(writePoints("bad")).toBe(12);
});
