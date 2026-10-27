import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import Papa from "papaparse";
const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jT0kAAAAASUVORK5CYII=";
const rich = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Café Žluťoučký" }],
    },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Editable bold text", marks: [{ type: "bold" }] },
        {
          type: "text",
          text: " Link",
          marks: [{ type: "link", attrs: { href: "https://example.com" } }],
        },
      ],
    },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "A list item" }],
            },
          ],
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
                  content: [{ type: "text", text: "Cell value" }],
                },
              ],
            },
          ],
        },
      ],
    },
    { type: "image", attrs: { src: png, alt: "Picture" } },
  ],
};
const workbook = {
  id: "book",
  name: "Workbook",
  sheetOrder: ["a", "b"],
  sheets: {
    a: {
      id: "a",
      name: "Rozpočet",
      rowCount: 100,
      columnCount: 26,
      cellData: {
        0: {
          0: { v: "Café" },
          1: { v: 42, s: { bl: 1, bg: { rgb: "#ff0000" } } },
          2: { f: "=B1*2", v: 84 },
        },
        1: { 0: { v: 'comma, quote " and\nnewline' } },
      },
    },
    b: {
      id: "b",
      name: "Second sheet",
      rowCount: 100,
      columnCount: 26,
      cellData: { 0: { 0: { v: "Second" }, 1: { v: 7 } } },
    },
  },
};
const slides = {
  slides: [
    {
      id: "s1",
      background: "#ffffff",
      elements: [
        {
          id: "t1",
          type: "text",
          x: 50,
          y: 80,
          w: 700,
          h: 100,
          text: "Editable Café",
          color: "#173f35",
          fontSize: 36,
        },
        {
          id: "b1",
          type: "shape",
          x: 60,
          y: 230,
          w: 200,
          h: 100,
          text: "",
          color: "#cc6644",
          fontSize: 36,
        },
        {
          id: "i1",
          type: "image",
          x: 400,
          y: 230,
          w: 100,
          h: 100,
          text: "",
          color: "#000000",
          fontSize: 36,
          asset: png,
        },
      ],
    },
    {
      id: "s2",
      background: "#f4f4f4",
      elements: [
        {
          id: "t2",
          type: "text",
          x: 50,
          y: 80,
          w: 700,
          h: 100,
          text: "Second slide",
          color: "#173f35",
          fontSize: 36,
        },
      ],
    },
  ],
};
async function prepare(page: Page) {
  await page.goto("/");
  await page.evaluate(
    ({ rich, workbook, slides }) => {
      sessionStorage.setItem("syrka-workspace-demo", "true");
      localStorage.setItem(
        "syrka-office-v1",
        JSON.stringify(
          [
            { kind: "doc", content: rich, name: "Writing Café" },
            { kind: "sheet", content: workbook, name: "Numbers" },
            { kind: "slides", content: slides, name: "Story" },
          ].map((f, i) => ({
            ...f,
            id: `00000000-0000-4000-8000-00000000000${i}`,
            owner_id: "demo",
            updated_at: new Date().toISOString(),
            starred: false,
          })),
        ),
      );
    },
    { rich, workbook, slides },
  );
  await page.reload();
}
async function save(page: Page, label: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: label, exact: true }).click();
  const d = await pending;
  return {
    data: await readFile((await d.path())!),
    name: d.suggestedFilename(),
  };
}
test("Write exports real editable DOCX, Unicode PDF, TXT, HTML and Markdown", async ({
  page,
}) => {
  test.setTimeout(90000);
  await prepare(page);
  await page
    .getByRole("button", { name: "Open Writing Café", exact: true })
    .click();
  for (const [label, ext] of [
    ["Word document (.docx)", "docx"],
    ["PDF document (.pdf)", "pdf"],
    ["Plain text (.txt)", "txt"],
    ["Download document (.html)", "html"],
    ["Markdown (.md)", "md"],
  ]) {
    await page.getByLabel("Download Writing Café", { exact: true }).click();
    const output = await save(page, label);
    expect(output.name).toBe(`Writing Café.${ext}`);
    if (ext === "docx") {
      const zip = await JSZip.loadAsync(output.data);
      const xml = await zip.file("word/document.xml")!.async("string");
      expect(xml).toContain("Editable bold text");
      expect(xml).toContain("w:tbl");
      expect(xml).toContain("w:drawing");
      expect(xml).toContain("Café Žluťoučký");
    } else if (ext === "pdf")
      expect(
        (await PDFDocument.load(output.data)).getPageCount(),
      ).toBeGreaterThan(0);
    else {
      expect(output.data.toString()).toContain("Café Žluťoučký");
      if (ext === "html")
        expect(output.data.toString()).toContain("data:image/png");
      if (ext === "md")
        expect(output.data.toString()).toContain("# Café Žluťoučký");
    }
  }
  await expect(page.locator(".tiptap")).toContainText("Editable bold text");
});
test("Tables exports XLSX, selected-sheet CSV and TSV, PDF and full JSON", async ({
  page,
}) => {
  test.setTimeout(90000);
  await prepare(page);
  await page.getByLabel("Download Numbers", { exact: true }).click();
  const xlsx = await save(page, "Excel workbook (.xlsx)");
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(new Uint8Array(xlsx.data).buffer);
  expect(book.worksheets.map((s) => s.name)).toEqual([
    "Rozpočet",
    "Second sheet",
  ]);
  expect(book.worksheets[0].getCell("C1").formula).toBe("B1*2");
  expect(book.worksheets[0].getCell("B1").value).toBe(42);
  expect(book.worksheets[0].getCell("B1").font.bold).toBe(true);
  for (const [format, label, delimiter] of [
    ["csv", "Worksheet CSV (.csv)", ","],
    ["tsv", "Worksheet TSV (.tsv)", "\t"],
  ]) {
    await page.getByLabel("Download Numbers", { exact: true }).click();
    await page.getByLabel("Worksheet to export").selectOption("b");
    const out = await save(page, label);
    expect(out.name).toBe(`Numbers-Second sheet.${format}`);
    expect(
      Papa.parse(out.data.toString().replace(/^\uFEFF/, ""), { delimiter })
        .data,
    ).toEqual([["Second", "7"]]);
  }
  await page.getByLabel("Download Numbers", { exact: true }).click();
  const json = await save(page, "Workbook JSON (.json)");
  expect(JSON.parse(json.data.toString()).sheetOrder).toEqual(["a", "b"]);
  await page.getByLabel("Download Numbers", { exact: true }).click();
  const pdf = await save(page, "Worksheet PDF (.pdf)");
  expect((await PDFDocument.load(pdf.data)).getPageCount()).toBeGreaterThan(0);
});
test("Present PPTX has editable elements; PDF and slide image selections contain the requested slides", async ({
  page,
}) => {
  test.setTimeout(90000);
  await prepare(page);
  await page.getByLabel("Download Story", { exact: true }).click();
  const pptx = await save(page, "Download PowerPoint (.pptx)");
  const zip = await JSZip.loadAsync(pptx.data);
  expect(
    Object.keys(zip.files).filter((p) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(p),
    ),
  ).toHaveLength(2);
  const xml = await zip.file("ppt/slides/slide1.xml")!.async("string");
  expect(xml).toContain("Editable Café");
  expect(xml).toContain("<p:sp>");
  expect(xml).toContain("<p:pic>");
  await page.getByLabel("Download Story", { exact: true }).click();
  await page.getByLabel("Slides to export").fill("2");
  const pdf = await save(page, "Presentation PDF (.pdf)");
  expect((await PDFDocument.load(pdf.data)).getPageCount()).toBe(1);
  for (const [label, ext] of [
    ["Slide images (.png)", "png"],
    ["Slide images (.jpg)", "jpg"],
  ]) {
    await page.getByLabel("Download Story", { exact: true }).click();
    const out = await save(page, label);
    expect(out.name).toBe(`Story-slide-2.${ext}`);
    if (ext === "png") expect(out.data.subarray(1, 4).toString()).toBe("PNG");
    else expect([...out.data.subarray(0, 2)]).toEqual([255, 216]);
  }
  await page.getByLabel("Download Story", { exact: true }).click();
  await page.getByLabel("Slides to export").fill("1-2");
  const all = await save(page, "Slide images (.png)");
  expect(Object.keys((await JSZip.loadAsync(all.data)).files)).toEqual([
    "slide-1.png",
    "slide-2.png",
  ]);
});

test('empty editors still produce valid standard files',async({page})=>{
 await prepare(page);
 await page.evaluate(()=>{const files=JSON.parse(localStorage.getItem('syrka-office-v1')!);files[0].content={type:'doc',content:[]};for(const sheet of Object.values(files[1].content.sheets) as {cellData:object}[])sheet.cellData={};files[2].content.slides.forEach((slide:{elements:unknown[]})=>{slide.elements=[];});localStorage.setItem('syrka-office-v1',JSON.stringify(files));});
 await page.reload();
 await page.getByLabel('Download Writing Café',{exact:true}).click();const pdf=await save(page,'PDF document (.pdf)');expect((await PDFDocument.load(pdf.data)).getPageCount()).toBe(1);
 await page.getByLabel('Download Numbers',{exact:true}).click();const xlsx=await save(page,'Excel workbook (.xlsx)');const book=new ExcelJS.Workbook();await book.xlsx.load(new Uint8Array(xlsx.data).buffer);expect(book.worksheets).toHaveLength(2);
 await page.getByLabel('Download Story',{exact:true}).click();const pptx=await save(page,'Download PowerPoint (.pptx)');expect((await JSZip.loadAsync(pptx.data)).file('ppt/slides/slide1.xml')).not.toBeNull();
});
