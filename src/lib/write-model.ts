import type { JSONContent } from "@tiptap/core";
export const writeFonts = [
  "Noto Sans",
  "Noto Serif",
  "Noto Sans Mono",
  "Arial",
  "Georgia",
  "Times New Roman",
  "Verdana",
  "Trebuchet MS",
  "Courier New",
  "system-ui",
  "serif",
  "sans-serif",
  "monospace",
];
export type PageSettings = {
  size: "A4" | "LETTER" | "LEGAL";
  landscape: boolean;
  margin: number;
  header: string;
  footer: string;
  numbers: boolean;
  language: string;
};
export const defaultPage: PageSettings = {
  size: "A4",
  landscape: false,
  margin: 54,
  header: "",
  footer: "",
  numbers: false,
  language: "en-GB",
};
export function pageSettings(doc: JSONContent): PageSettings {
  const a = doc.attrs || {};
  return {
    size: ["A4", "LETTER", "LEGAL"].includes(a.size) ? a.size : "A4",
    landscape: a.landscape === true,
    margin: Math.max(18, Math.min(144, Number(a.margin) || 54)),
    header: String(a.header || ""),
    footer: String(a.footer || ""),
    numbers: a.numbers === true,
    language: ["en-GB", "en-US", "hi", "ur", "ar", "fr", "de"].includes(
      a.language,
    )
      ? a.language
      : "en-GB",
  };
}
export function pageDimensions(p: PageSettings) {
  const sizes = {
    A4: [595.28, 841.89],
    LETTER: [612, 792],
    LEGAL: [612, 1008],
  };
  const [w, h] = sizes[p.size];
  return p.landscape ? [h, w] : [w, h];
}
export function inspectWriteDocument(doc: JSONContent) {
  const supported = new Set([
    "doc",
    "paragraph",
    "text",
    "heading",
    "bulletList",
    "orderedList",
    "listItem",
    "table",
    "tableRow",
    "tableCell",
    "tableHeader",
    "image",
    "hardBreak",
    "horizontalRule",
    "blockquote",
    "codeBlock",
    "pageBreak",
    "footnote",
  ]);
  const unknown = new Set<string>();
  function walk(n: JSONContent) {
    if (!supported.has(n.type || "")) unknown.add(n.type || "unknown");
    const marks = new Set([
      "bold",
      "italic",
      "underline",
      "strike",
      "code",
      "link",
      "textStyle",
      "highlight",
      "subscript",
      "superscript",
    ]);
    for (const mark of n.marks || [])
      if (!marks.has(mark.type)) unknown.add(`mark:${mark.type}`);
    n.content?.forEach(walk);
  }
  walk(doc);
  return [...unknown];
}
