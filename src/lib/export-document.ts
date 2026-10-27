import { writePoints, wordColor } from "./write-units";
import type { JSONContent } from "@tiptap/core";
import { defaultWriteStyles, type WriteStyle } from "./write-styles";
import { pageSettings } from "./write-model";
import { embeddedImage } from "./export-file";
export function nodeText(node: JSONContent): string {
  if (node.type === "text") return node.text || "";
  if (node.type === "hardBreak") return "\n";
  if (node.type === "footnote")
    return `[${node.attrs?.number}: ${node.attrs?.text}]`;
  return (node.content || [])
    .map(nodeText)
    .join(
      [
        "doc",
        "bulletList",
        "orderedList",
        "listItem",
        "table",
        "tableRow",
      ].includes(node.type || "")
        ? "\n"
        : "",
    );
}
export function plainDocument(node: JSONContent): string {
  return (node.content || [])
    .map((n) =>
      n.type === "table"
        ? (n.content || [])
            .map((row) => (row.content || []).map(nodeText).join("\t"))
            .join("\n")
        : nodeText(n),
    )
    .join("\n\n");
}
const escapeMd = (text: string) => text.replace(/([\\`*_{}\[\]<>|])/g, "\\$1");
export async function documentMarkdown(
  node: JSONContent,
  depth = 0,
): Promise<string> {
  if (node.type === "text") {
    let text = escapeMd(node.text || "");
    for (const m of node.marks || []) {
      if (m.type === "bold") text = `**${text}**`;
      if (m.type === "italic") text = `*${text}*`;
      if (m.type === "strike") text = `~~${text}~~`;
      if (m.type === "code")
        text = "`" + (node.text || "").replace(/`/g, "\\`") + "`";
      if (m.type === "link" && /^(https?:|mailto:)/i.test(m.attrs?.href || ""))
        text = `[${text}](${String(m.attrs!.href).replace(/\)/g, "%29")})`;
    }
    return text;
  }
  if (node.type === "hardBreak") return "  \n";
  if (node.type === "footnote") return `^[${node.attrs?.text}]`;
  if (node.type === "image") {
    const alt = String(node.attrs?.alt || "");
    const source = alt.startsWith("asset:")
      ? alt.slice(6)
      : String(node.attrs?.src || "");
    return source ? `![Image](${await embeddedImage(source)})` : "";
  }
  if (node.type === "horizontalRule") return "\n---\n";
  if (node.type === "bulletList" || node.type === "orderedList") {
    const items = await Promise.all(
      (node.content || []).map(async (item, i) => {
        const text = (await documentMarkdown(item, depth + 1)).trim();
        const prefix =
          node.type === "orderedList"
            ? `${Number(node.attrs?.start || 1) + i}. `
            : "- ";
        return (
          "  ".repeat(depth) +
          prefix +
          text.replace(/\n/g, "\n" + "  ".repeat(depth) + "  ")
        );
      }),
    );
    return items.join("\n") + "\n";
  }
  if (node.type === "table") {
    const rows = await Promise.all(
      (node.content || []).map(
        async (row) =>
          "| " +
          (
            await Promise.all(
              (row.content || []).map(async (cell) =>
                (await documentMarkdown(cell, depth))
                  .trim()
                  .replace(/\n/g, "<br>"),
              ),
            )
          ).join(" | ") +
          " |",
      ),
    );
    if (rows.length)
      rows.splice(
        1,
        0,
        "| " +
          (node.content?.[0].content || []).map(() => "---").join(" | ") +
          " |",
      );
    return rows.join("\n") + "\n";
  }
  const values = await Promise.all(
    (node.content || []).map((c) => documentMarkdown(c, depth)),
  );
  const body = values.join(
    node.type === "doc"
      ? "\n\n"
      : node.type === "listItem" ||
          node.type === "tableCell" ||
          node.type === "tableHeader"
        ? "\n"
        : "",
  );
  if (node.type === "heading")
    return (
      "#".repeat(Math.max(1, Math.min(6, Number(node.attrs?.level) || 1))) +
      " " +
      body
    );
  if (node.type === "blockquote")
    return body
      .split("\n")
      .map((line) => "> " + line)
      .join("\n");
  if (node.type === "codeBlock") return "```\n" + nodeText(node) + "\n```";
  return body;
}
export async function imageData(node: JSONContent) {
  const alt = String(node.attrs?.alt || "");
  return embeddedImage(
    alt.startsWith("asset:") ? alt.slice(6) : String(node.attrs?.src || ""),
  );
}
export function binaryData(uri: string) {
  const text = atob(uri.split(",")[1]);
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}
export async function rasterAsset(path: string) {
  const data = await embeddedImage(path);
  const image = new Image();
  image.src = data;
  await image.decode();
  if (/^data:image\/(png|jpeg)/i.test(data))
    return {
      data,
      bytes: binaryData(data),
      width: image.naturalWidth,
      height: image.naturalHeight,
      type: (data.startsWith("data:image/png") ? "png" : "jpg") as
        | "png"
        | "jpg",
    };
  const canvas = document.createElement("canvas");
  try {
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d")!.drawImage(image, 0, 0);
    const png = canvas.toDataURL("image/png");
    return {
      data: png,
      bytes: binaryData(png),
      width: image.naturalWidth,
      height: image.naturalHeight,
      type: "png" as const,
    };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}
export async function buildDocx(content: JSONContent, name: string) {
  const D = await import("docx");
  type Inline =
    | InstanceType<typeof D.TextRun>
    | InstanceType<typeof D.ExternalHyperlink>
    | InstanceType<typeof D.ImageRun>
    | InstanceType<typeof D.FootnoteReferenceRun>;
  type Block = InstanceType<typeof D.Paragraph> | InstanceType<typeof D.Table>;
  type NumberingDefinition = NonNullable<
    ConstructorParameters<typeof D.Document>[0]["numbering"]
  >["config"][number];
  const numbering: { config: NumberingDefinition[] } = { config: [] };
  const footnotes: Record<
    string,
    { children: InstanceType<typeof D.Paragraph>[] }
  > = {};
  let noteId = 0;
  let listId = 0;
  async function inline(nodes: JSONContent[]): Promise<Inline[]> {
    const result: Inline[] = [];
    for (const node of nodes) {
      if (node.type === "footnote") {
        const id = ++noteId;
        footnotes[String(id)] = {
          children: [new D.Paragraph(String(node.attrs?.text || ""))],
        };
        result.push(new D.FootnoteReferenceRun(id));
      } else if (node.type === "text") {
        const marks = node.marks || [];
        const style = marks.find((m) => m.type === "textStyle")?.attrs || {};
        const run = new D.TextRun({
          size: style.fontSize
            ? Math.round(writePoints(style.fontSize) * 2)
            : undefined,
          color: style.color ? wordColor(style.color) : undefined,
          superScript: marks.some((m) => m.type === "superscript"),
          subScript: marks.some((m) => m.type === "subscript"),
          shading: marks.find((m) => m.type === "highlight")
            ? {
                fill: wordColor(
                  marks.find((m) => m.type === "highlight")?.attrs?.color ||
                    "#FFFF00",
                ),
              }
            : undefined,
          text: node.text || "",
          bold: marks.some((m) => m.type === "bold"),
          italics: marks.some((m) => m.type === "italic"),
          strike: marks.some((m) => m.type === "strike"),
          underline: marks.some((m) => m.type === "underline") ? {} : undefined,
          font: marks.some((m) => m.type === "code")
            ? "Courier New"
            : style.fontFamily || undefined,
        });
        const link = marks.find((m) => m.type === "link");
        result.push(
          link && /^(https?:|mailto:)/i.test(link.attrs?.href || "")
            ? new D.ExternalHyperlink({
                link: String(link.attrs!.href),
                children: [run],
              })
            : run,
        );
      } else if (node.type === "hardBreak")
        result.push(new D.TextRun({ break: 1 }));
      else if (node.type === "image") {
        const alt = String(node.attrs?.alt || "");
        const asset = await rasterAsset(
          alt.startsWith("asset:")
            ? alt.slice(6)
            : String(node.attrs?.src || ""),
        );
        const ratio = Math.min(
          1,
          (Number(node.attrs?.width) || 600) / asset.width,
          (Number(node.attrs?.height) || 700) / asset.height,
        );
        result.push(
          new D.ImageRun({
            data: asset.bytes,
            type: asset.type,
            transformation: {
              width: asset.width * ratio,
              height: asset.height * ratio,
            },
          }),
        );
      } else result.push(...(await inline(node.content || [])));
    }
    return result;
  }
  async function blocks(
    nodes: JSONContent[],
    depth = 0,
    list?: { reference?: string; bullet?: boolean },
  ): Promise<Block[]> {
    const result: Block[] = [];
    for (const node of nodes) {
      if (node.type === "bulletList" || node.type === "orderedList") {
        const reference = `list-${listId++}`;
        if (node.type === "orderedList")
          numbering.config.push({
            reference,
            levels: Array.from({ length: 9 }, (_, level) => ({
              level,
              format: D.LevelFormat.DECIMAL,
              text: `%${level + 1}.`,
              alignment: D.AlignmentType.LEFT,
              start: Number(node.attrs?.start) || 1,
              style: {
                paragraph: {
                  indent: { left: 720 * (level + 1), hanging: 260 },
                },
              },
            })),
          });
        for (const item of node.content || [])
          result.push(
            ...(await blocks(item.content || [], list ? depth + 1 : depth, {
              bullet: node.type === "bulletList",
              reference: node.type === "orderedList" ? reference : undefined,
            })),
          );
      } else if (node.type === "table") {
        const rows = [];
        for (const row of node.content || []) {
          const cells = [];
          for (const cell of row.content || [])
            cells.push(
              new D.TableCell({
                children: await blocks(cell.content || []),
                columnSpan: Number(cell.attrs?.colspan) || 1,
                rowSpan: Number(cell.attrs?.rowspan) || 1,
                shading: cell.attrs?.backgroundColor
                  ? {
                      fill: wordColor(cell.attrs.backgroundColor),
                    }
                  : cell.type === "tableHeader"
                    ? { fill: "EDF2E9" }
                    : undefined,
              }),
            );
          rows.push(new D.TableRow({ children: cells }));
        }
        if (rows.length)
          result.push(
            new D.Table({
              rows,
              width: { size: 100, type: D.WidthType.PERCENTAGE },
            }),
          );
      } else if (node.type === "blockquote")
        result.push(...(await blocks(node.content || [], depth + 1)));
      else {
        const alignments = {
          center: D.AlignmentType.CENTER,
          right: D.AlignmentType.RIGHT,
          justify: D.AlignmentType.JUSTIFIED,
        };
        const alignment =
          alignments[node.attrs?.textAlign as keyof typeof alignments];
        const heading = {
          "1": D.HeadingLevel.HEADING_1,
          "2": D.HeadingLevel.HEADING_2,
          "3": D.HeadingLevel.HEADING_3,
          "4": D.HeadingLevel.HEADING_4,
          "5": D.HeadingLevel.HEADING_5,
          "6": D.HeadingLevel.HEADING_6,
        }[String(node.attrs?.level) as "1"];
        result.push(
          new D.Paragraph({
            children: [
              ...(node.type === "heading" && node.attrs?.headingNumber
                ? [new D.TextRun(node.attrs.headingNumber + " ")]
                : []),
              ...(await inline(
                node.type === "image" ? [node] : node.content || [],
              )),
            ],
            style: node.type !== "heading" ? node.attrs?.styleName : undefined,
            heading: node.type === "heading" ? heading : undefined,
            alignment,
            bullet: list?.bullet ? { level: Math.min(depth, 8) } : undefined,
            numbering: list?.reference
              ? { reference: list.reference, level: Math.min(depth, 8) }
              : undefined,
            shading: node.attrs?.background
              ? { fill: wordColor(node.attrs.background) }
              : undefined,
            bidirectional: node.attrs?.direction === "rtl",
            pageBreakBefore: node.type === "pageBreak",
            keepNext: node.type === "heading",
            spacing: {
              after: Number(node.attrs?.spaceAfter ?? 8) * 20,
              line: Number(node.attrs?.lineHeight || 1.5) * 240,
            },
            indent: Number(node.attrs?.indent)
              ? { left: Number(node.attrs?.indent) * 20 }
              : depth && !list
                ? { left: 360 * depth }
                : undefined,
          }),
        );
      }
    }
    return result;
  }
  const children = await blocks(content.content || []);
  const page = pageSettings(content);
  const sizes = {
    A4: [11906, 16838],
    LETTER: [12240, 15840],
    LEGAL: [12240, 20160],
  };
  const doc = new D.Document({
    title: name,
    creator: "Syrka Write",
    numbering,
    footnotes,
    styles: {
      paragraphStyles: Object.entries(
        (content.attrs?.styles || defaultWriteStyles) as Record<
          string,
          WriteStyle
        >,
      ).map(([id, style]) => ({
        id,
        name: id,
        run: {
          font: style.paragraphFont,
          size: style.paragraphSize * 2,
          bold: style.paragraphBold,
          italics: style.paragraphItalic,
        },
        paragraph: {
          spacing: {
            line: style.lineHeight * 240,
            after: style.spaceAfter * 20,
          },
        },
      })),
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: sizes[page.size][0],
              height: sizes[page.size][1],
              orientation: page.landscape
                ? D.PageOrientation.LANDSCAPE
                : D.PageOrientation.PORTRAIT,
            },
            margin: {
              top: page.margin * 20,
              right: page.margin * 20,
              bottom: page.margin * 20,
              left: page.margin * 20,
            },
          },
        },
        headers: {
          default: new D.Header({ children: [new D.Paragraph(page.header)] }),
        },
        footers: {
          default: new D.Footer({
            children: [
              new D.Paragraph({
                children: [
                  new D.TextRun(page.footer),
                  ...(page.numbers
                    ? [new D.TextRun({ children: [D.PageNumber.CURRENT] })]
                    : []),
                ],
              }),
            ],
          }),
        },
        children: children.length ? children : [new D.Paragraph("")],
      },
    ],
  });
  return D.Packer.toBlob(doc);
}
