import type { JSONContent } from "@tiptap/core";
import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import { imageData, nodeText, rasterAsset } from "./export-document";
import type { Worksheet } from "./export-spreadsheet";
import { sheetMatrix } from "./export-spreadsheet";
async function makePdf(definition: TDocumentDefinitions): Promise<Blob> {
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  pdfMake.vfs = fonts as unknown as Record<string, string>;
  return new Promise((resolve, reject) => {
    try {
      const stream = pdfMake.createPdf(definition).getStream();
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      stream.on("data", (chunk: Uint8Array) =>
        chunks.push(new Uint8Array(chunk)),
      );
      stream.on("error", reject);
      stream.on("end", () =>
        resolve(new Blob(chunks, { type: "application/pdf" })),
      );
      stream.end();
    } catch (e) {
      reject(e);
    }
  });
}
export async function buildDocumentPdf(root: JSONContent, name: string) {
  async function convert(node: JSONContent): Promise<Content> {
    if (node.type === "text") {
      const marks = node.marks || [];
      const href = marks.find((m) => m.type === "link")?.attrs?.href;
      return {
        text: node.text || "",
        bold: marks.some((m) => m.type === "bold"),
        italics: marks.some((m) => m.type === "italic"),
        decoration: marks.some((m) => m.type === "underline")
          ? "underline"
          : marks.some((m) => m.type === "strike")
            ? "lineThrough"
            : undefined,
        link: /^(https?:|mailto:)/i.test(href || "") ? href : undefined,
      };
    }
    if (node.type === "hardBreak") return { text: "\n" };
    if (node.type === "image")
      return {
        image: (await rasterAsset(await imageData(node))).data,
        fit: [480, 650],
        margin: [0, 10, 0, 10],
      };
    if (node.type === "table") {
      const rows = await Promise.all(
        (node.content || []).map((row) =>
          Promise.all((row.content || []).map((cell) => convert(cell))),
        ),
      );
      if (!rows.length) return { text: "" };
      const count = Math.max(...rows.map((r) => r.length));
      for (const row of rows) while (row.length < count) row.push({ text: "" });
      return {
        table: {
          headerRows: node.content?.[0]?.content?.every(
            (c) => c.type === "tableHeader",
          )
            ? 1
            : 0,
          widths: Array.from({ length: count }, () => "*"),
          body: rows,
        },
        margin: [0, 10, 0, 10],
      };
    }
    if (node.type === "bulletList" || node.type === "orderedList") {
      const children = await Promise.all((node.content || []).map(convert));
      return node.type === "bulletList"
        ? { ul: children, margin: [0, 5, 0, 10] }
        : {
            ol: children,
            start: Number(node.attrs?.start) || 1,
            margin: [0, 5, 0, 10],
          };
    }
    const children = await Promise.all((node.content || []).map(convert));
    if (["paragraph", "heading"].includes(node.type || "")) {
      return {
        text: children,
        fontSize:
          node.type === "heading"
            ? ({ 1: 26, 2: 21, 3: 17 } as Record<number, number>)[
                Number(node.attrs?.level)
              ] || 14
            : 11,
        bold: node.type === "heading",
        alignment: ["left", "center", "right", "justify"].includes(
          node.attrs?.textAlign,
        )
          ? node.attrs!.textAlign
          : "left",
        margin: [0, 0, 0, node.type === "heading" ? 14 : 9],
      };
    }
    if (node.type === "codeBlock")
      return {
        text: nodeText(node),
        fontSize: 10,
        background: "#f4f4f4",
        margin: [0, 8, 0, 12],
      };
    if (node.type === "horizontalRule")
      return {
        canvas: [
          { type: "line", x1: 0, y1: 0, x2: 480, y2: 0, lineColor: "#bbbbbb" },
        ],
        margin: [0, 10, 0, 10],
      };
    return {
      stack: children.length ? children : [{ text: "" }],
      margin: node.type === "blockquote" ? [16, 4, 0, 12] : undefined,
    };
  }
  const content = await Promise.all((root.content || []).map(convert));
  return makePdf({
    info: { title: name, author: "Syrka Write" },
    pageSize: "A4",
    pageMargins: [44, 44, 44, 44],
    content: content.length ? content : [{ text: "" }],
    defaultStyle: { font: "Roboto" },
  });
}
export async function buildSheetPdf(sheet: Worksheet, name: string) {
  const values = sheetMatrix(sheet);
  const content: Content[] = [];
  const columns = values[0].length;
  for (let start = 0; start < columns; start += 10) {
    const end = Math.min(columns, start + 10);
    content.push({
      text: `${sheet.name}${columns > 10 ? ` · columns ${start + 1}–${end}` : ""}`,
      fontSize: 17,
      margin: [0, 0, 0, 15],
      pageBreak: start ? "before" : undefined,
    });
    const body = values.map((row) =>
      row
        .slice(start, end)
        .map((value) => ({ text: String(value), fontSize: 8 })),
    );
    content.push({
      table: { widths: Array.from({ length: end - start }, () => "*"), body },
      layout: "lightHorizontalLines",
    });
  }
  return makePdf({
    info: { title: `${name} — ${sheet.name}`, author: "Syrka Tables" },
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [25, 30, 25, 30],
    content,
  });
}
