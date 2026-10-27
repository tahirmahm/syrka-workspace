import { sanitizeWriteHtml } from "./write-import";
type Element = {
  type: string;
  children?: Element[];
  styleName?: string;
  styleId?: string;
  font?: string;
  fontSize?: number;
  highlight?: string;
  alignment?: string;
  indent?: { start?: string };
  numbering?: unknown;
};
/** Retain Mammoth's structural conversion and supplement its supported run/paragraph metadata. */
export async function importWriteDocx(data: ArrayBuffer) {
  const mammoth = await import("mammoth");
  const styleMap: string[] = [];
  const runs = new Map<
    string,
    { font?: string; size?: number; highlight?: string }
  >();
  const paragraphs = new Map<string, { alignment?: string; indent?: string }>();
  let id = 0;
  function transform(n: Element): Element {
    const next = { ...n, children: n.children?.map(transform) };
    if (n.type === "run" && (n.font || n.fontSize || n.highlight)) {
      const name = `syrka-run-${id++}`;
      styleMap.push(`r[style-name='${name}'] => span.${name}`);
      runs.set(name, {
        font: n.font,
        size: n.fontSize,
        highlight: n.highlight,
      });
      next.styleName = name;
    }
    if (
      n.type === "paragraph" &&
      !n.numbering &&
      (n.alignment || n.indent?.start)
    ) {
      const name = `syrka-paragraph-${id++}`;
      const level = Number(
        (n.styleName || n.styleId || "").match(/heading\s*(\d)/i)?.[1],
      );
      const tag = level >= 1 && level <= 6 ? `h${level}` : "p";
      styleMap.push(`p[style-name='${name}'] => ${tag}.${name}:fresh`);
      paragraphs.set(name, { alignment: n.alignment, indent: n.indent?.start });
      next.styleName = name;
    }
    return next;
  }
  const result = await mammoth.convertToHtml(
    { arrayBuffer: data },
    {
      styleMap,
      includeEmbeddedStyleMap: false,
      externalFileAccess: false,
      transformDocument: transform,
      ignoreEmptyParagraphs: false,
    },
  );
  const doc = new DOMParser().parseFromString(result.value, "text/html");
  for (const [name, style] of runs) {
    doc.querySelectorAll(`.${name}`).forEach((el) => {
      const span = el as HTMLElement;
      if (style.font) span.style.fontFamily = style.font;
      if (style.size)
        span.style.fontSize = `${Math.max(6, Math.min(96, style.size))}pt`;
      if (style.highlight) {
        const mark = doc.createElement("mark");
        mark.style.backgroundColor = style.highlight;
        while (span.firstChild) mark.append(span.firstChild);
        span.append(mark);
      }
    });
  }
  for (const [name, style] of paragraphs) {
    doc.querySelectorAll(`.${name}`).forEach((el) => {
      const p = el as HTMLElement;
      p.style.textAlign =
        style.alignment === "both" ? "justify" : style.alignment || "";
      if (style.indent)
        p.style.marginLeft = `${Math.max(0, Math.min(144, Number(style.indent) / 20))}pt`;
    });
  }
  return {
    html: sanitizeWriteHtml(doc.body.innerHTML),
    warnings: result.messages.map((m) => m.message),
  };
}
