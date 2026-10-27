import { download, type OfficeFile, type Slide } from "./model";
import { pageSettings } from "./write-model";
import { resolveImage } from "./storage";
import type { JSONContent } from "@tiptap/core";
export function safeFileName(name: string) {
  return (
    name
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/[. ]+$/, "")
      .slice(0, 120) || "Untitled"
  );
}
export async function embeddedImage(path: string): Promise<string> {
  if (/^data:image\/(png|jpeg|webp|gif);base64,/i.test(path)) return path;
  const response = await fetch(await resolveImage(path));
  if (!response.ok)
    throw Error("An image could not be downloaded. Please try again.");
  const blob = await response.blob();
  if (
    !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(blob.type)
  )
    throw Error("Unsupported image type in download.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error("Image could not be read."));
    reader.readAsDataURL(blob);
  });
}
export async function exportBackup(file: OfficeFile) {
  const content = structuredClone(file.content);
  async function embed(value: unknown): Promise<void> {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      await Promise.all(value.map(embed));
      return;
    }
    const obj = value as Record<string, unknown>;
    if (obj.type === "image" && typeof obj.asset === "string")
      obj.asset = await embeddedImage(obj.asset);
    if (obj.type === "image" && obj.attrs && typeof obj.attrs === "object") {
      const attrs = obj.attrs as Record<string, unknown>;
      if (typeof attrs.alt === "string" && attrs.alt.startsWith("asset:")) {
        attrs.src = await embeddedImage(attrs.alt.slice(6));
        attrs.alt = "Image";
      }
    }
    await Promise.all(Object.values(obj).map(embed));
  }
  await embed(content);
  download(
    JSON.stringify(
      {
        format: "syrka-workspace",
        version: 1,
        name: file.name,
        kind: file.kind,
        content,
      },
      null,
      2,
    ),
    `${safeFileName(file.name)}.syrka.json`,
    "application/json",
  );
}
export async function exportHtml(file: Pick<OfficeFile, "content" | "name">) {
  const doc = document.implementation.createHTMLDocument(file.name);
  const page = pageSettings(file.content);
  doc.documentElement.lang = page.language;
  const charset = doc.createElement("meta");
  charset.setAttribute("charset", "utf-8");
  doc.head.prepend(charset);
  const viewport = doc.createElement("meta");
  viewport.name = "viewport";
  viewport.content = "width=device-width, initial-scale=1";
  doc.head.append(viewport);
  const style = doc.createElement("style");
  style.textContent =
    "body{max-width:800px;margin:40px auto;padding:0 24px;font-family:Arial,sans-serif;line-height:1.7;color:#202020}img{max-width:100%;height:auto}table{width:100%;border-collapse:collapse}td,th{border:1px solid #bbb;padding:8px}th{background:#f1f1f1}blockquote{border-left:3px solid #bbb;padding-left:16px}pre{white-space:pre-wrap}";
  doc.head.append(style);
  async function node(value: JSONContent): Promise<Node> {
    if (value.type === "footnote") {
      const sup = doc.createElement("sup");
      const a = doc.createElement("a");
      a.href = "#note-" + value.attrs?.number;
      a.textContent = String(value.attrs?.number || "");
      a.title = String(value.attrs?.text || "");
      sup.append(a);
      return sup;
    }
    if (value.type === "pageBreak") {
      const div = doc.createElement("div");
      div.style.breakAfter = "page";
      return div;
    }
    if (value.type === "text") {
      let text: Node = doc.createTextNode(value.text || "");
      for (const mark of value.marks || []) {
        const names: Record<string, string> = {
          bold: "strong",
          italic: "em",
          underline: "u",
          strike: "s",
          code: "code",
          superscript: "sup",
          subscript: "sub",
          highlight: "mark",
        };
        const tag = names[mark.type] || (mark.type === "link" ? "a" : "span");
        const wrap = doc.createElement(tag);
        if (mark.type === "textStyle") {
          if (mark.attrs?.fontFamily)
            wrap.style.fontFamily = String(mark.attrs.fontFamily);
          if (mark.attrs?.fontSize)
            wrap.style.fontSize = String(mark.attrs.fontSize);
          if (mark.attrs?.color) wrap.style.color = String(mark.attrs.color);
        }
        if (mark.type === "highlight")
          wrap.style.backgroundColor = String(mark.attrs?.color || "#ffff00");
        if (
          mark.type === "link" &&
          /^(https?:\/\/|mailto:)/i.test(String(mark.attrs?.href))
        ) {
          wrap.setAttribute("href", String(mark.attrs!.href));
          wrap.setAttribute("rel", "noopener noreferrer");
        }
        wrap.append(text);
        text = wrap;
      }
      return text;
    }
    const tags: Record<string, string> = {
      paragraph: "p",
      bulletList: "ul",
      orderedList: "ol",
      listItem: "li",
      blockquote: "blockquote",
      codeBlock: "pre",
      hardBreak: "br",
      horizontalRule: "hr",
      table: "table",
      tableRow: "tr",
      tableCell: "td",
      tableHeader: "th",
    };
    const tag =
      value.type === "heading"
        ? `h${Math.max(1, Math.min(6, Number(value.attrs?.level) || 1))}`
        : value.type === "image"
          ? "img"
          : tags[value.type || ""] || "div";
    const el = doc.createElement(tag);
    const attrs = value.attrs || {};
    if (attrs.lineHeight) el.style.lineHeight = String(attrs.lineHeight);
    if (attrs.spaceAfter !== undefined)
      el.style.marginBottom = String(attrs.spaceAfter) + "pt";
    if (attrs.indent) el.style.marginLeft = String(attrs.indent) + "pt";
    if (attrs.direction) el.dir = String(attrs.direction);
    if (attrs.background) el.style.backgroundColor = String(attrs.background);
    if (attrs.paragraphFont) el.style.fontFamily = String(attrs.paragraphFont);
    if (attrs.paragraphSize)
      el.style.fontSize = String(attrs.paragraphSize) + "pt";
    if (attrs.paragraphBold) el.style.fontWeight = "bold";
    if (attrs.paragraphItalic) el.style.fontStyle = "italic";
    if (attrs.backgroundColor)
      el.style.backgroundColor = String(attrs.backgroundColor);
    if (value.type === "heading" && attrs.headingNumber)
      el.append(doc.createTextNode(attrs.headingNumber + " "));
    if (
      ["left", "center", "right", "justify"].includes(
        String(value.attrs?.textAlign),
      )
    )
      el.style.textAlign = String(value.attrs!.textAlign);
    if (value.type === "orderedList" && value.attrs?.start)
      el.setAttribute("start", String(Number(value.attrs.start) || 1));
    if (value.type === "tableCell" || value.type === "tableHeader") {
      for (const attr of ["colspan", "rowspan"])
        if (Number(value.attrs?.[attr]) > 1)
          el.setAttribute(
            attr,
            String(Math.min(1000, Number(value.attrs![attr]))),
          );
    }
    if (value.type === "image") {
      const alt = String(value.attrs?.alt || "");
      const path = alt.startsWith("asset:")
        ? alt.slice(6)
        : String(value.attrs?.src || "");
      if (path) el.setAttribute("src", await embeddedImage(path));
      el.setAttribute("alt", alt.startsWith("asset:") ? "Image" : alt);
      if (attrs.width) el.setAttribute("width", String(Number(attrs.width)));
      if (attrs.height) el.setAttribute("height", String(Number(attrs.height)));
      if (attrs.wrap) el.style.float = String(attrs.alignment || "left");
      else if (attrs.alignment === "center") {
        el.style.display = "block";
        el.style.marginLeft = "auto";
        el.style.marginRight = "auto";
      }
    }
    for (const child of value.content || []) el.append(await node(child));
    return el;
  }
  const header = doc.createElement("header");
  header.textContent = page.header;
  doc.body.append(header);
  for (const child of (file.content as JSONContent).content || [])
    doc.body.append(await node(child));
  const visit = (n: JSONContent) => {
    if (n.type === "footnote") {
      const note = doc.createElement("p");
      note.id = "note-" + n.attrs?.number;
      note.textContent = `${n.attrs?.number}. ${n.attrs?.text}`;
      doc.body.append(note);
    }
    n.content?.forEach(visit);
  };
  visit(file.content);
  const footer = doc.createElement("footer");
  footer.textContent = page.footer;
  doc.body.append(footer);
  style.textContent += `@page{size:${page.size === "LETTER" ? "letter" : page.size === "LEGAL" ? "legal" : "A4"} ${page.landscape ? "landscape" : "portrait"};margin:${page.margin}pt}`;
  download(
    "<!doctype html>\n" + doc.documentElement.outerHTML,
    `${safeFileName(file.name)}.html`,
    "text/html;charset=utf-8",
  );
}
export async function exportPptx(name: string, slides: Slide[]) {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Syrka Present";
  pptx.title = name;
  for (const source of slides) {
    const out = pptx.addSlide();
    out.background = { color: source.background.slice(1) };
    for (const el of source.elements) {
      const options = {
        x: el.x / 72,
        y: el.y / 72,
        w: el.w / 72,
        h: el.h / 72,
      };
      if (el.type === "text")
        out.addText(el.text, {
          ...options,
          color: el.color.slice(1),
          fontSize: el.fontSize * 0.75,
          fontFace: "Arial",
          margin: 0,
          valign: "top",
        });
      if (el.type === "shape")
        out.addShape(pptx.ShapeType.rect, {
          ...options,
          fill: { color: el.color.slice(1) },
          line: { color: el.color.slice(1) },
        });
      if (el.type === "image" && el.asset) {
        const { rasterAsset } = await import("./export-document");
        const image = await rasterAsset(el.asset);
        const ratio = Math.min(
          options.w / image.width,
          options.h / image.height,
        );
        const w = image.width * ratio,
          h = image.height * ratio;
        out.addImage({
          ...options,
          x: options.x + (options.w - w) / 2,
          y: options.y + (options.h - h) / 2,
          w,
          h,
          data: image.data,
        });
      }
    }
  }
  await pptx.writeFile({ fileName: `${safeFileName(name)}.pptx` });
}
