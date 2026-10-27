import type { JSONContent } from "@tiptap/core";
import type { OfficeFile, Slide } from "./model";
import { download } from "./model";
import {
  exportBackup,
  exportHtml,
  exportPptx,
  safeFileName,
} from "./export-file";
import { parsePages } from "./tools/utils";
import type { Workbook } from "./export-spreadsheet";
export const exportFormats = {
  doc: [
    ["docx", "Word document (.docx)"],
    ["pdf", "PDF document (.pdf)"],
    ["txt", "Plain text (.txt)"],
    ["html", "Download document (.html)"],
    ["md", "Markdown (.md)"],
  ],
  sheet: [
    ["xlsx", "Excel workbook (.xlsx)"],
    ["csv", "Worksheet CSV (.csv)"],
    ["tsv", "Worksheet TSV (.tsv)"],
    ["pdf", "Worksheet PDF (.pdf)"],
    ["json", "Workbook JSON (.json)"],
  ],
  slides: [
    ["pptx", "Download PowerPoint (.pptx)"],
    ["pdf", "Presentation PDF (.pdf)"],
    ["png", "Slide images (.png)"],
    ["jpg", "Slide images (.jpg)"],
  ],
} as const;
export type ExportFormat =
  | "docx"
  | "pdf"
  | "txt"
  | "html"
  | "md"
  | "xlsx"
  | "csv"
  | "tsv"
  | "json"
  | "pptx"
  | "png"
  | "jpg"
  | "backup";
export async function exportFile(
  file: OfficeFile,
  format: ExportFormat,
  { sheetId, slideRange = "" }: { sheetId?: string; slideRange?: string } = {},
) {
  const name = safeFileName(file.name);
  const save = (blob: Blob, ext: string) =>
    download(blob, `${name}.${ext}`, blob.type);
  if (format === "backup") {
    await exportBackup(file);
    return;
  }
  if (file.kind === "doc") {
    const root = file.content as JSONContent;
    if (format === "html") {
      await exportHtml(file);
      return;
    }
    const document = await import("./export-document");
    if (format === "docx") {
      save(await document.buildDocx(root, file.name), "docx");
      return;
    }
    if (format === "txt") {
      save(
        new Blob([document.plainDocument(root)], {
          type: "text/plain;charset=utf-8",
        }),
        "txt",
      );
      return;
    }
    if (format === "md") {
      save(
        new Blob([await document.documentMarkdown(root)], {
          type: "text/markdown;charset=utf-8",
        }),
        "md",
      );
      return;
    }
    if (format === "pdf") {
      const { buildDocumentPdf } = await import("./export-pdf");
      save(await buildDocumentPdf(root, file.name), "pdf");
      return;
    }
  }
  if (file.kind === "sheet") {
    const model = file.content as unknown as Workbook;
    const chosen = sheetId || model.sheetOrder[0];
    const sheet = model.sheets[chosen];
    if (format === "xlsx") {
      const { buildXlsx } = await import("./export-spreadsheet");
      save(await buildXlsx(model, file.name), "xlsx");
      return;
    }
    if (format === "json") {
      save(
        new Blob([JSON.stringify(model, null, 2)], {
          type: "application/json",
        }),
        "json",
      );
      return;
    }
    if (!sheet) throw Error("Choose a worksheet to export.");
    if (format === "csv" || format === "tsv") {
      const [{ default: Papa }, { sheetMatrix }] = await Promise.all([
        import("papaparse"),
        import("./export-spreadsheet"),
      ]);
      download(
        "\uFEFF" +
          Papa.unparse(sheetMatrix(sheet), {
            delimiter: format === "tsv" ? "\t" : ",",
            escapeFormulae: true,
          }),
        `${name}-${safeFileName(sheet.name)}.${format}`,
        "text/plain;charset=utf-8",
      );
      return;
    }
    if (format === "pdf") {
      const { buildSheetPdf } = await import("./export-pdf");
      download(
        await buildSheetPdf(sheet, file.name),
        `${name}-${safeFileName(sheet.name)}.pdf`,
        "application/pdf",
      );
      return;
    }
  }
  if (file.kind === "slides") {
    const all = file.content.slides as Slide[];
    const indices = parsePages(slideRange, all.length);
    const slides = indices.map((i) => all[i]);
    if (format === "pptx") {
      await exportPptx(file.name, slides);
      return;
    }
    const rendering = await import("./export-slides");
    if (format === "pdf") {
      save(await rendering.slidesPdf(slides, file.name), "pdf");
      return;
    }
    if (format === "png" || format === "jpg") {
      const result = await rendering.slidesImages(
        slides,
        indices,
        file.name,
        format === "png" ? "image/png" : "image/jpeg",
      );
      download(result.blob, result.name, result.blob.type);
      return;
    }
  }
  throw Error("This export format is not available for this file.");
}
