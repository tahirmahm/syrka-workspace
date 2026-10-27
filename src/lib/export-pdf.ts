import { writePoints } from "./write-units";
import { loadWriteFonts, pdfFontFamily, writePdfFonts } from "./write-fonts";
import { pageSettings, pageDimensions } from "./write-model";
import type { JSONContent } from "@tiptap/core";
import type {
  Content,
  TableCell,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import { imageData, nodeText, rasterAsset } from "./export-document";
import type { Worksheet } from "./export-spreadsheet";
import { sheetMatrix } from "./export-spreadsheet";
async function makePdf(definition: TDocumentDefinitions): Promise<Blob> {
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  const extra =
    definition.defaultStyle?.font === "NotoSans" ? await loadWriteFonts() : {};
  const vfs = { ...(fonts as unknown as Record<string, string>), ...extra };
  const fontDefinitions = {
    Roboto: {
      normal: "Roboto-Regular.ttf",
      bold: "Roboto-Medium.ttf",
      italics: "Roboto-Italic.ttf",
      bolditalics: "Roboto-MediumItalic.ttf",
    },
    ...writePdfFonts,
  };
  return new Promise((resolve, reject) => {
    try {
      const stream = pdfMake
        .createPdf(definition, undefined, fontDefinitions, vfs)
        .getStream();
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
  const page = pageSettings(root);
  const [width, height] = pageDimensions(page);
  async function convert(node: JSONContent): Promise<Content> {
    if (node.type === "footnote")
      return { text: `[${node.attrs?.number}]`, fontSize: 8 };
    if (node.type === "text") {
      const marks = node.marks || [];
      const style = marks.find((m) => m.type === "textStyle")?.attrs || {};
      const href = marks.find((m) => m.type === "link")?.attrs?.href;
      return {
        text: node.text || "",
        font: style.fontFamily ? pdfFontFamily(style.fontFamily) : undefined,
        fontSize: style.fontSize ? writePoints(style.fontSize) : undefined,
        color: style.color || undefined,
        background:
          marks.find((m) => m.type === "highlight")?.attrs?.color || undefined,
        sup: marks.some((m) => m.type === "superscript"),
        sub: marks.some((m) => m.type === "subscript"),
        bold: marks.some((m) => m.type === "bold") || undefined,
        italics: marks.some((m) => m.type === "italic") || undefined,
        decoration: marks.some((m) => m.type === "underline")
          ? "underline"
          : marks.some((m) => m.type === "strike")
            ? "lineThrough"
            : undefined,
        link: /^(https?:|mailto:)/i.test(href || "") ? href : undefined,
      };
    }
    if (node.type === "pageBreak") return { text: "", pageBreak: "after" };
    if (node.type === "hardBreak") return { text: "\n" };
    if (node.type === "image")
      return {
        image: (await rasterAsset(await imageData(node))).data,
        width: node.attrs?.width
          ? Math.min(Number(node.attrs.width) * 0.75, width - page.margin * 2)
          : undefined,
        fit: node.attrs?.width
          ? undefined
          : [width - page.margin * 2, height - page.margin * 2 - 30],
        alignment:
          node.attrs?.alignment === "center"
            ? "center"
            : node.attrs?.alignment === "right"
              ? "right"
              : "left",
        margin: [0, 10, 0, 10],
      };
    if (node.type === "table") {
      const input = node.content || [];
      const rows: TableCell[][] = Array.from(
        { length: input.length },
        () => [],
      );
      for (let r = 0; r < input.length; r++) {
        let col = 0;
        for (const cell of input[r].content || []) {
          while (rows[r][col] !== undefined) col++;
          const colspan = Math.max(
            1,
            Math.min(64, Number(cell.attrs?.colspan) || 1),
          );
          const rowspan = Math.max(
            1,
            Math.min(input.length - r, Number(cell.attrs?.rowspan) || 1),
          );
          rows[r][col] = {
            stack: [await convert(cell)],
            colSpan: colspan,
            rowSpan: rowspan,
            fillColor:
              cell.attrs?.backgroundColor ||
              (cell.type === "tableHeader" ? "#edf2f9" : undefined),
          };
          for (let y = r; y < r + rowspan; y++)
            for (let x = col; x < col + colspan; x++)
              if (y !== r || x !== col) rows[y][x] = "";
          col += colspan;
        }
      }
      if (!rows.length) return { text: "" };
      const count = Math.max(...rows.map((r) => r.length));
      for (const row of rows)
        for (let i = 0; i < count; i++) if (row[i] === undefined) row[i] = "";
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
        text:
          node.type === "heading" && node.attrs?.headingNumber
            ? [{ text: node.attrs.headingNumber + " " }, ...children]
            : children,
        font: node.attrs?.paragraphFont
          ? pdfFontFamily(node.attrs.paragraphFont)
          : undefined,
        italics: node.attrs?.paragraphItalic || undefined,
        fontSize:
          node.attrs?.paragraphSize ||
          (node.type === "heading"
            ? ({ 1: 26, 2: 21, 3: 17 } as Record<number, number>)[
                Number(node.attrs?.level)
              ] || 14
            : 12),
        bold: node.type === "heading" || node.attrs?.paragraphBold,
        alignment: ["left", "center", "right", "justify"].includes(
          node.attrs?.textAlign,
        )
          ? node.attrs!.textAlign
          : "left",
        background: node.attrs?.background || undefined,
        lineHeight: Number(node.attrs?.lineHeight) || 1.5,
        margin: [
          Number(node.attrs?.indent) || 0,
          0,
          0,
          Number(node.attrs?.spaceAfter ?? (node.type === "heading" ? 14 : 8)),
        ],
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
  const notes: Content[] = [];
  const visit = (n: JSONContent) => {
    if (n.type === "footnote")
      notes.push({
        text: `${n.attrs?.number}. ${n.attrs?.text}`,
        fontSize: 9,
        margin: [0, 0, 0, 5],
      });
    n.content?.forEach(visit);
  };
  visit(root);
  if (notes.length)
    content.push(
      { text: "Notes", bold: true, margin: [0, 16, 0, 8] },
      ...notes,
    );
  return makePdf({
    info: { title: name, author: "Syrka Write" },
    pageSize: { width, height },
    pageMargins: [page.margin, page.margin, page.margin, page.margin],
    header: page.header
      ? { text: page.header, margin: [page.margin, 18, 0, 0], fontSize: 9 }
      : undefined,
    footer: (current, total) => ({
      text: [page.footer, page.numbers ? `${current} / ${total}` : ""]
        .filter(Boolean)
        .join("   "),
      alignment: "center",
      fontSize: 9,
    }),
    content: content.length ? content : [{ text: "" }],
    defaultStyle: { font: "NotoSans" },
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
