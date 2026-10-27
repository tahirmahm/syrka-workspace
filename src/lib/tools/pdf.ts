import { PDFDocument } from "pdf-lib";
import {workspacePath} from "../paths";
import { nextFrame, parsePages, readImage, validatePdf } from "./utils";
export async function loadPdf(file: File) {
  await validatePdf(file);
  return PDFDocument.load(await file.arrayBuffer());
}
export async function mergePdfs(
  files: File[],
  progress: (value: string) => void,
) {
  const merged = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    progress(`Reading PDF ${i + 1} of ${files.length}…`);
    await nextFrame();
    const doc = await loadPdf(files[i]);
    for (const index of doc.getPageIndices()) {
      const [page] = await merged.copyPages(doc, [index]);
      merged.addPage(page);
      await nextFrame();
    }
  }
  return new Blob([new Uint8Array(await merged.save())], {
    type: "application/pdf",
  });
}
export async function splitPdf(
  file: File,
  selection: string,
  progress: (value: string) => void,
) {
  const source = await loadPdf(file);
  const pages = parsePages(selection, source.getPageCount());
  const out = await PDFDocument.create();
  for (let i = 0; i < pages.length; i++) {
    progress(`Extracting page ${i + 1} of ${pages.length}…`);
    await nextFrame();
    const [page] = await out.copyPages(source, [pages[i]]);
    out.addPage(page);
  }
  return new Blob([new Uint8Array(await out.save())], {
    type: "application/pdf",
  });
}
export async function imagesToPdf(
  files: File[],
  size: string,
  landscape: boolean,
  progress: (value: string) => void,
) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < files.length; i++) {
    progress(`Adding image ${i + 1} of ${files.length}…`);
    await nextFrame();
    if (!["image/png", "image/jpeg"].includes(files[i].type))
      throw Error("Images to PDF supports JPG and PNG files.");
    const image = await readImage(files[i]);
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context)
      throw Error(
        "Your browser could not prepare this image. Try a smaller image.",
      );
    context.drawImage(image, 0, 0);
    const normalized = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(Error("The browser could not encode this image.")),
        "image/png",
      ),
    );
    canvas.width = 0;
    canvas.height = 0;
    const embedded = await pdf.embedPng(await normalized.arrayBuffer());
    image.src = "";
    let dimensions = size === "letter" ? [612, 792] : [595.28, 841.89];
    if (size === "fit")
      dimensions = [embedded.width * 0.75, embedded.height * 0.75];
    else if (landscape) dimensions.reverse();
    const page = pdf.addPage(dimensions as [number, number]);
    const margin = size === "fit" ? 0 : 24;
    const scale = Math.min(
      (dimensions[0] - 2 * margin) / embedded.width,
      (dimensions[1] - 2 * margin) / embedded.height,
    );
    const w = embedded.width * scale,
      h = embedded.height * scale;
    page.drawImage(embedded, {
      x: (dimensions[0] - w) / 2,
      y: (dimensions[1] - h) / 2,
      width: w,
      height: h,
    });
  }
  return new Blob([new Uint8Array(await pdf.save())], {
    type: "application/pdf",
  });
}
export type RenderedPage = {
  blob: Blob;
  name: string;
  width: number;
  height: number;
};
export async function pdfToImages(
  file: File,
  selection: string,
  scale: number,
  progress: (value: string) => void,
): Promise<RenderedPage[]> {
  await validatePdf(file);
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workspacePath("/pdf.worker.min.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  let doc: Awaited<typeof task.promise> | undefined;
  try {
    doc = await task.promise;
    const selected = parsePages(selection, doc.numPages);
    const result: RenderedPage[] = [];
    for (let i = 0; i < selected.length; i++) {
      progress(`Rendering page ${i + 1} of ${selected.length}…`);
      await nextFrame();
      const page = await doc.getPage(selected[i] + 1);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      try {
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx)
          throw Error(
            "Your browser could not create a page canvas. Try a lower resolution.",
          );
        await page.render({
          canvas,
          canvasContext: ctx,
          viewport,
          background: "#fff",
        }).promise;
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (b) =>
              b
                ? resolve(b)
                : reject(
                    Error(
                      "This page is too large for the browser. Choose a lower resolution.",
                    ),
                  ),
            "image/png",
          ),
        );
        result.push({
          blob,
          name: `page-${selected[i] + 1}.png`,
          width: canvas.width,
          height: canvas.height,
        });
      } finally {
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }
    }
    return result;
  } finally {
    await task.destroy();
  }
}
