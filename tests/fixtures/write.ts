import type { JSONContent } from "@tiptap/core";
const p = (text: string, attrs: Record<string, unknown> = {}): JSONContent => ({
  type: "paragraph",
  attrs,
  content: [{ type: "text", text }],
});
const h = (text: string): JSONContent => ({
  type: "heading",
  attrs: { level: 2 },
  content: [{ type: "text", text }],
});
const image =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jT0kAAAAASUVORK5CYII=";
export const writeFixtures: { name: string; content: JSONContent }[] = [
  {
    name: "Reader’s Diary",
    content: {
      type: "doc",
      attrs: { header: "Reader’s Diary", numbers: true },
      content: [
        h("Reading details"),
        p("Title, author and date."),
        h("Summary"),
        p("A concise account of the reading."),
        h("Critical reflection"),
        p("Questions, connections and evaluation."),
      ],
    },
  },
  {
    name: "University essay",
    content: {
      type: "doc",
      content: Array.from({ length: 45 }, (_, i) => [
        h(`Section ${i + 1}`),
        p(
          "Evidence supports the argument. This representative paragraph tests pagination and spacing. ".repeat(
            5,
          ),
        ),
      ]).flat(),
    },
  },
  {
    name: "Research paper",
    content: {
      type: "doc",
      content: [
        h("Research question"),
        p("Representative evidence (Smith, 2026)."),
        {
          type: "paragraph",
          content: [
            { type: "text", text: "An explanatory note" },
            {
              type: "footnote",
              attrs: {
                number: 1,
                text: "A source note, not a fabricated research claim.",
              },
            },
          ],
        },
        h("References"),
        p("Smith (2026). Example reference record."),
      ],
    },
  },
  {
    name: "Tables and images",
    content: {
      type: "doc",
      content: [
        h("Results"),
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  attrs: { colspan: 2, backgroundColor: "#edf2f9" },
                  content: [p("Merged heading")],
                },
              ],
            },
            {
              type: "tableRow",
              content: [
                { type: "tableCell", content: [p("Value α")] },
                { type: "tableCell", content: [p("42")] },
              ],
            },
          ],
        },
        {
          type: "image",
          attrs: {
            src: image,
            alt: "Test illustration",
            width: 150,
            height: 150,
          },
        },
        p("Figure 1. Test illustration."),
      ],
    },
  },
  {
    name: "Multilingual",
    content: {
      type: "doc",
      attrs: { language: "ur" },
      content: [
        h("Languages"),
        p("English — Café — Français — Deutsch."),
        p("یہ ایک تعلیمی دستاویز ہے۔", { direction: "rtl" }),
        p("هذه وثيقة أكاديمية.", { direction: "rtl" }),
        p("यह एक शैक्षणिक दस्तावेज़ है।"),
      ],
    },
  },
  {
    name: "Pages and headers",
    content: {
      type: "doc",
      attrs: {
        size: "LETTER",
        margin: 54,
        header: "University assignment",
        footer: "Syrka Write",
        numbers: true,
      },
      content: [
        h("First page"),
        p("First page content."),
        { type: "pageBreak" },
        h("Second page"),
        p("Second page content."),
        { type: "pageBreak" },
        h("Third page"),
        p("Third page content."),
      ],
    },
  },
];
