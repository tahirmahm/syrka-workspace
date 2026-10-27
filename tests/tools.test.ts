import { describe, it, expect } from "vitest";
import { PDFDocument, rgb } from "pdf-lib";
import { parsePages, wordStats } from "../src/lib/tools/utils";
import { mergePdfs, splitPdf } from "../src/lib/tools/pdf";
import { buildXlsx } from "../src/lib/export-spreadsheet";
import {
  buildDocx,
  documentMarkdown,
  plainDocument,
} from "../src/lib/export-document";
import JSZip from "jszip";
async function fixture(widths: number[]) {
  const pdf = await PDFDocument.create();
  for (const width of widths) {
    const page = pdf.addPage([width, 200]);
    page.drawRectangle({
      x: 10,
      y: 10,
      width: 30,
      height: 30,
      color: rgb(0.2, 0.5, 0.7),
    });
  }
  return new File([new Uint8Array(await pdf.save())], "fixture.pdf", {
    type: "application/pdf",
  });
}
describe("Tools processing", () => {
  it("validates ordered page selections without duplicating pages", () => {
    expect(parsePages("3, 1-2, 2", 3)).toEqual([2, 0, 1]);
    expect(parsePages("", 2)).toEqual([0, 1]);
    for (const range of ["0", "4", "2-1", "1,", "NaN"])
      expect(() => parsePages(range, 3)).toThrow();
  });
  it("counts words, unicode characters, sentences and paragraphs", () => {
    expect(wordStats("Café world!\n\nŽluťoučký kůň.")).toMatchObject({
      words: 4,
      sentences: 2,
      paragraphs: 2,
      readingMinutes: 1,
    });
    expect(wordStats("")).toMatchObject({
      words: 0,
      characters: 0,
      sentences: 0,
      paragraphs: 0,
    });
    expect(wordStats("a 😀").characters).toBe(3);
  });
  it("merges all pages in exact input order", async () => {
    const blob = await mergePdfs(
      [await fixture([101, 102]), await fixture([203])],
      () => {},
    );
    const doc = await PDFDocument.load(await blob.arrayBuffer());
    expect(doc.getPages().map((p) => p.getWidth())).toEqual([101, 102, 203]);
  });
  it("extracts exact pages in requested order and rejects malformed PDFs", async () => {
    const blob = await splitPdf(
      await fixture([101, 102, 103]),
      "3,1",
      () => {},
    );
    const doc = await PDFDocument.load(await blob.arrayBuffer());
    expect(doc.getPages().map((p) => p.getWidth())).toEqual([103, 101]);
    await expect(
      splitPdf(new File(["not pdf"], "broken.pdf"), "1", () => {}),
    ).rejects.toThrow("not a valid PDF");
  });
});
describe("Office export structures", () => {
  it("creates editable DOCX content, headings, links, tables and unicode", async () => {
    const root = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [
            { type: "text", text: "Café Žluťoučký", marks: [{ type: "bold" }] },
          ],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Website",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Data" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const blob = await buildDocx(root, "Test");
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Café Žluťoučký");
    expect(xml).toContain("w:tbl");
    expect(xml).toContain("w:hyperlink");
    expect(
      await zip.file("word/_rels/document.xml.rels")!.async("string"),
    ).toContain("https://example.com");
    expect(plainDocument(root)).toContain("Data");
    expect(await documentMarkdown(root)).toContain("# **Café Žluťoučký**");
  });
  it("creates a real multi-sheet XLSX with numeric cells, formula and formatting", async () => {
    const blob = await buildXlsx(
      {
        sheetOrder: ["a", "b"],
        sheets: {
          a: {
            name: "Rozpočet",
            cellData: {
              0: {
                0: { v: 42, s: { bl: 1, bg: { rgb: "#ff0000" } } },
                1: { f: "=A1*2", v: 84 },
              },
              1: { 0: { f: "=B1", si: "shared", v: 84 } },
              2: { 0: { si: "shared", v: 0 } },
            },
          },
          b: { name: "Second sheet", cellData: { 0: { 0: { v: "Café" } } } },
        },
      },
      "Test",
    );
    const ExcelJS = await import("exceljs");
    const book = new ExcelJS.default.Workbook();
    await book.xlsx.load(await blob.arrayBuffer());
    expect(book.worksheets.map((s) => s.name)).toEqual([
      "Rozpočet",
      "Second sheet",
    ]);
    expect(book.worksheets[0].getCell("A1").value).toBe(42);
    expect(book.worksheets[0].getCell("B1").formula).toBe("A1*2");
    expect(book.worksheets[0].getCell("A1").font.bold).toBe(true);
    expect(book.worksheets[0].getCell("A3").formula).toBe("B2");
  });
  it("exports empty models as valid DOCX and XLSX packages", async () => {
    const doc = await buildDocx({ type: "doc", content: [] }, "Empty");
    expect(
      (await JSZip.loadAsync(await doc.arrayBuffer())).file(
        "word/document.xml",
      ),
    ).not.toBeNull();
    expect(
      (await buildXlsx({ sheetOrder: [], sheets: {} }, "Empty")).size,
    ).toBeGreaterThan(0);
  });
});
