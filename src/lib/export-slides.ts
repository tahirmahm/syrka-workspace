import type { Slide } from "./model";
import { embeddedImage, safeFileName } from "./export-file";
function wrapText(ctx: CanvasRenderingContext2D, text: string, width: number) {
  const result: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (line && ctx.measureText(line + " " + word).width > width) {
        result.push(line);
        line = word;
      } else line += (line ? " " : "") + word;
    }
    result.push(line);
  }
  return result;
}
export async function renderSlide(
  slide: Slide,
  mime: "image/png" | "image/jpeg",
  scale = 2,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 960 * scale;
  canvas.height = 540 * scale;
  try {
    const ctx = canvas.getContext("2d")!;
    ctx.scale(scale, scale);
    ctx.fillStyle = slide.background;
    ctx.fillRect(0, 0, 960, 540);
    for (const element of slide.elements) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(element.x, element.y, element.w, element.h);
      ctx.clip();
      if (element.type === "shape") {
        ctx.fillStyle = element.color;
        ctx.fillRect(element.x, element.y, element.w, element.h);
      }
      if (element.type === "text") {
        ctx.fillStyle = element.color;
        ctx.font = `${element.fontSize}px Arial`;
        ctx.textBaseline = "top";
        const lines = wrapText(ctx, element.text, element.w);
        lines.forEach((line, i) =>
          ctx.fillText(
            line,
            element.x,
            element.y + i * element.fontSize * 1.15,
          ),
        );
      }
      if (element.type === "image" && element.asset) {
        const image = new Image();
        image.src = await embeddedImage(element.asset);
        await image.decode();
        const ratio = Math.min(
          element.w / image.naturalWidth,
          element.h / image.naturalHeight,
        );
        const w = image.naturalWidth * ratio,
          h = image.naturalHeight * ratio;
        ctx.drawImage(
          image,
          element.x + (element.w - w) / 2,
          element.y + (element.h - h) / 2,
          w,
          h,
        );
      }
      ctx.restore();
    }
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(Error("The browser could not render this slide.")),
        mime,
        0.92,
      ),
    );
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
export async function slidesPdf(slides: Slide[], name: string) {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  pdf.setTitle(name);
  pdf.setAuthor("Syrka Present");
  for (const slide of slides) {
    const image = await pdf.embedPng(
      await (await renderSlide(slide, "image/png")).arrayBuffer(),
    );
    const page = pdf.addPage([960, 540]);
    page.drawImage(image, { x: 0, y: 0, width: 960, height: 540 });
  }
  return new Blob([new Uint8Array(await pdf.save())], {
    type: "application/pdf",
  });
}
export async function slidesImages(
  slides: Slide[],
  indices: number[],
  name: string,
  mime: "image/png" | "image/jpeg",
) {
  const ext = mime === "image/png" ? "png" : "jpg";
  if (slides.length === 1)
    return {
      blob: await renderSlide(slides[0], mime),
      name: `${safeFileName(name)}-slide-${indices[0] + 1}.${ext}`,
    };
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (let i = 0; i < slides.length; i++)
    zip.file(
      `slide-${indices[i] + 1}.${ext}`,
      await renderSlide(slides[i], mime),
    );
  return {
    blob: await zip.generateAsync({ type: "blob" }),
    name: `${safeFileName(name)}-${ext}.zip`,
  };
}
