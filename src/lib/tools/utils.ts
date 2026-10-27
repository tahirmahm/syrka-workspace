export function parsePages(input: string, total: number): number[] {
  if (!Number.isInteger(total) || total < 1)
    throw Error("This PDF has no readable pages.");
  if (!input.trim()) return Array.from({ length: total }, (_, i) => i);
  const pages: number[] = [];
  const seen = new Set<number>();
  for (const part of input.split(",")) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match)
      throw Error("Use page numbers and ranges, for example 1-3, 5, 8-10.");
    const first = Number(match[1]),
      last = Number(match[2] || first);
    if (first < 1 || last > total || last < first)
      throw Error(
        `Choose pages between 1 and ${total}, with ranges in ascending order.`,
      );
    for (let page = first; page <= last; page++)
      if (!seen.has(page)) {
        seen.add(page);
        pages.push(page - 1);
      }
  }
  return pages;
}
export function wordStats(text: string) {
  const trimmed = text.trim();
  const words = trimmed
    ? trimmed.split(/\s+/u).filter((t) => /[\p{L}\p{N}]/u.test(t)).length
    : 0;
  const sentences = trimmed
    ? (
        trimmed.match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/gu) || []
      ).filter((s) => /[\p{L}\p{N}]/u.test(s)).length
    : 0;
  return {
    words,
    characters: Array.from(text).length,
    noSpaces: Array.from(text.replace(/\s/gu, "")).length,
    sentences,
    paragraphs: trimmed ? trimmed.split(/\n\s*\n/u).filter(Boolean).length : 0,
    readingMinutes: words ? Math.max(1, Math.ceil(words / 200)) : 0,
  };
}
export function bytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 ** 2) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 ** 2).toFixed(1)} MB`;
}
export function nextFrame() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}
export function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/password|encrypt/i.test(message))
    return "This PDF is password-protected. Please unlock it before using this tool.";
  if (/memory|allocation|canvas.*size|rangeerror/i.test(message))
    return "Your browser ran out of memory. Try fewer pages, lower resolution, or a smaller image, or use a desktop browser.";
  return (
    message ||
    "This file could not be processed. Try another file or reset and try again."
  );
}
export function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export async function validatePdf(file: File) {
  const prefix = new TextDecoder().decode(
    await file.slice(0, 1024).arrayBuffer(),
  );
  if (!prefix.includes("%PDF-"))
    throw Error(`${file.name} is not a valid PDF file.`);
}
export async function readImage(file: File): Promise<HTMLImageElement> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error("Choose a JPG, PNG or WebP image.");
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = url;
    await image.decode();
    return image;
  } catch {
    throw Error(
      `${file.name} could not be opened. It may be corrupted or unsupported.`,
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
export async function encodeImage(
  file: File,
  format: "image/jpeg" | "image/png" | "image/webp",
  quality: number,
  maxWidth?: number,
  maxHeight?: number,
) {
  const image = await readImage(file);
  const scale = Math.min(
    1,
    maxWidth ? maxWidth / image.naturalWidth : 1,
    maxHeight ? maxHeight / image.naturalHeight : 1,
  );
  const canvas = document.createElement("canvas");
  try {
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx)
      throw Error(
        "Your browser could not create an image canvas. Try a smaller image.",
      );
    if (format === "image/jpeg") {
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) =>
          b
            ? resolve(b)
            : reject(
                Error(
                  "Your browser could not encode this image. Try smaller dimensions.",
                ),
              ),
        format,
        quality,
      ),
    );
    if (blob.type !== format)
      throw Error(
        "This browser does not support the selected output format. Try PNG or JPEG.",
      );
    return blob;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
    image.src = "";
  }
}
