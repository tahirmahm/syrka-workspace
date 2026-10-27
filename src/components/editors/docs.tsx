"use client";
import { writePoints } from "@/lib/write-units";
import { useEffect, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { JSONContent } from "@tiptap/core";
import {
  Table,
  TableRow,
  TableHeader,
  TableCell,
} from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  Undo,
  Redo,
  Link as LinkIcon,
  ImagePlus,
  Table2,
  Printer,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";
import {
  TextStyle,
  FontFamily,
  FontSize,
  Color,
} from "@tiptap/extension-text-style";
import Highlight from "@tiptap/extension-highlight";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import {
  WriteAttributes,
  PageBreak,
  WriteAutocorrect,
  Footnote,
  HeadingNumbers,
} from "@/lib/write-extensions";
import {
  writeFonts,
  pageSettings,
  pageDimensions,
  inspectWriteDocument,
} from "@/lib/write-model";
import { defaultWriteStyles, type WriteStyle } from "@/lib/write-styles";
import { sanitizeWriteHtml } from "@/lib/write-import";
import WriteReview from "./write-review";
import WriteReferences from "./write-references";
import WritePreview from "./write-preview";
import { Button } from "../ui/button";
import { uploadImage, resolveImage } from "@/lib/storage";
export default function WriteEditor({
  content,
  onChange,
}: {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}) {
  const [preview, setPreview] = useState<{
    html: string;
    page: ReturnType<typeof pageSettings>;
  } | null>(null);
  const [error, setError] = useState("");
  const [paint, setPaint] = useState<{
    attrs: Record<string, unknown>;
    marks: { type: string; attrs?: Record<string, unknown> }[];
  } | null>(null);
  const [tab, setTab] = useState("Home");
  const [zoom, setZoom] = useState(100);
  const [importing, setImporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [, refresh] = useState(0);
  const editor = useEditor({
    extensions: [
      WriteAttributes,
      WriteAutocorrect,
      Footnote,
      HeadingNumbers,
      PageBreak,
      TextStyle,
      FontFamily,
      FontSize,
      Color,
      Highlight.configure({ multicolor: true }),
      Subscript,
      Superscript,
      StarterKit.configure({
        link: { openOnClick: false, protocols: ["http", "https", "mailto"] },
      }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({
        allowBase64: true,
        resize: {
          enabled: true,
          minWidth: 32,
          minHeight: 32,
          alwaysPreserveAspectRatio: true,
        },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: inspectWriteDocument(content).length
      ? { type: "doc", content: [{ type: "paragraph" }] }
      : content,
    editable: inspectWriteDocument(content).length === 0,
    immediatelyRender: false,
    editorProps: { transformPastedHTML: sanitizeWriteHtml },
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      function clean(node: JSONContent) {
        if (node.type === "image" && node.attrs?.alt?.startsWith("asset:"))
          node.attrs.src = "";
        node.content?.forEach(clean);
      }
      clean(json);
      onChange(json as Record<string, unknown>);
    },
    onSelectionUpdate: () => refresh((v) => v + 1),
  });
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    const jobs: { pos: number; attrs: Record<string, unknown> }[] = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === "image" && node.attrs.alt?.startsWith("asset:"))
        jobs.push({ pos, attrs: node.attrs });
    });
    void Promise.all(
      jobs.map(async ({ pos, attrs }) => {
        const src = await resolveImage(String(attrs.alt).slice(6));
        if (!cancelled && editor.state.doc.nodeAt(pos)?.attrs.alt === attrs.alt)
          editor.view.dispatch(
            editor.state.tr.setNodeMarkup(pos, undefined, { ...attrs, src }),
          );
      }),
    ).catch((e) => setError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [editor]);
  if (inspectWriteDocument(content).length)
    return (
      <div className="error" role="alert">
        This document contains unsupported content. Editing is disabled to
        protect the original. Download a Syrka backup from the File menu.
      </div>
    );
  if (!editor) return <div className="loading">Loading document…</div>;
  const page = pageSettings(editor.getJSON());
  const [pageWidth, pageHeight] = pageDimensions(page);
  const setPage = (attrs: Record<string, unknown>) => {
    editor.view.dispatch(
      editor.state.tr.setDocAttribute(
        Object.keys(attrs)[0],
        Object.values(attrs)[0],
      ),
    );
  };
  const paragraph = (attrs: Record<string, unknown>) =>
    editor
      .chain()
      .focus()
      .updateAttributes(
        editor.isActive("heading") ? "heading" : "paragraph",
        attrs,
      )
      .run();
  const tools = [
    {
      label: "Bold",
      Icon: Bold,
      active: editor.isActive("bold"),
      run: () => editor.chain().focus().toggleBold().run(),
    },
    {
      label: "Italic",
      Icon: Italic,
      active: editor.isActive("italic"),
      run: () => editor.chain().focus().toggleItalic().run(),
    },
    {
      label: "Underline",
      Icon: Underline,
      active: editor.isActive("underline"),
      run: () => editor.chain().focus().toggleUnderline().run(),
    },
    {
      label: "Strikethrough",
      Icon: Strikethrough,
      active: editor.isActive("strike"),
      run: () => editor.chain().focus().toggleStrike().run(),
    },
    {
      label: "Bullet list",
      Icon: List,
      active: editor.isActive("bulletList"),
      run: () => editor.chain().focus().toggleBulletList().run(),
    },
    {
      label: "Numbered list",
      Icon: ListOrdered,
      active: editor.isActive("orderedList"),
      run: () => editor.chain().focus().toggleOrderedList().run(),
    },
    {
      label: "Align left",
      Icon: AlignLeft,
      run: () => editor.chain().focus().setTextAlign("left").run(),
    },
    {
      label: "Align center",
      Icon: AlignCenter,
      run: () => editor.chain().focus().setTextAlign("center").run(),
    },
    {
      label: "Align right",
      Icon: AlignRight,
      run: () => editor.chain().focus().setTextAlign("right").run(),
    },
  ];
  return (
    <>
      {preview && (
        <WritePreview
          html={preview.html}
          page={preview.page}
          onClose={() => setPreview(null)}
        />
      )}
      <div className="write-tabs" role="tablist" aria-label="Write ribbon">
        {["Home", "Insert", "Layout", "References", "Review"].map((t) => (
          <button
            role="tab"
            aria-selected={tab === t}
            key={t}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="write-ribbon">
        {tab === "Home" && (
          <div className="toolbar">
            <label>
              Paragraph preset
              <select
                aria-label="Paragraph preset"
                value={
                  editor.getAttributes(
                    editor.isActive("heading") ? "heading" : "paragraph",
                  ).styleName || "Normal"
                }
                onChange={(e) => {
                  const styles =
                    editor.state.doc.attrs.styles || defaultWriteStyles;
                  const preset =
                    styles[e.target.value] ||
                    defaultWriteStyles[e.target.value];
                  editor
                    .chain()
                    .focus()
                    .setParagraph()
                    .updateAttributes("paragraph", {
                      styleName: e.target.value,
                      ...preset,
                    })
                    .unsetAllMarks()
                    .run();
                }}
              >
                {Object.keys(defaultWriteStyles).map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <Button
              variant="ghost"
              onClick={() => {
                const attrs = editor.getAttributes(
                  editor.isActive("heading") ? "heading" : "paragraph",
                );
                const name = attrs.styleName || "Normal";
                const text = editor.getAttributes("textStyle");
                const preset: WriteStyle = {
                  paragraphFont:
                    text.fontFamily || attrs.paragraphFont || "Noto Sans",
                  paragraphSize: text.fontSize
                    ? writePoints(text.fontSize)
                    : attrs.paragraphSize || 12,
                  paragraphBold: editor.isActive("bold") || attrs.paragraphBold,
                  paragraphItalic:
                    editor.isActive("italic") || attrs.paragraphItalic,
                  lineHeight: attrs.lineHeight || 1.5,
                  spaceAfter: attrs.spaceAfter ?? 8,
                };
                const styles = {
                  ...editor.state.doc.attrs.styles,
                  [name]: preset,
                };
                const tr = editor.state.tr.setDocAttribute("styles", styles);
                editor.state.doc.descendants((n, pos) => {
                  if (
                    ["paragraph", "heading"].includes(n.type.name) &&
                    n.attrs.styleName === name
                  )
                    tr.setNodeMarkup(pos, undefined, { ...n.attrs, ...preset });
                });
                editor.view.dispatch(tr);
              }}
            >
              Update preset from selection
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (!paint) {
                  const attrs = editor.getAttributes(
                    editor.isActive("heading") ? "heading" : "paragraph",
                  );
                  const marks = (
                    editor.state.storedMarks ||
                    editor.state.selection.$from.marks()
                  )
                    .filter((m) => m.type.name !== "link")
                    .map((m) => ({ type: m.type.name, attrs: m.attrs }));
                  setPaint({ attrs, marks });
                } else {
                  editor
                    .chain()
                    .focus()
                    .unsetAllMarks()
                    .updateAttributes(
                      editor.isActive("heading") ? "heading" : "paragraph",
                      paint.attrs,
                    )
                    .run();
                  for (const mark of paint.marks)
                    editor.commands.setMark(mark.type, mark.attrs);
                  setPaint(null);
                }
              }}
            >
              {paint ? "Apply copied format" : "Copy format"}
            </Button>
            <label>
              Paragraph shading
              <input
                aria-label="Paragraph shading"
                type="color"
                defaultValue="#edf2f9"
                onChange={(e) => paragraph({ background: e.target.value })}
              />
            </label>
            <Button
              variant="ghost"
              disabled={!editor.can().sinkListItem("listItem")}
              onClick={() =>
                editor.chain().focus().sinkListItem("listItem").run()
              }
            >
              Nest list
            </Button>
            <Button
              variant="ghost"
              disabled={!editor.can().liftListItem("listItem")}
              onClick={() =>
                editor.chain().focus().liftListItem("listItem").run()
              }
            >
              Unnest list
            </Button>
            <label>
              Font
              <select
                aria-label="Font family"
                value={
                  editor.getAttributes("textStyle").fontFamily ||
                  editor.getAttributes(
                    editor.isActive("heading") ? "heading" : "paragraph",
                  ).paragraphFont ||
                  "Arial"
                }
                onChange={(e) =>
                  editor.chain().focus().setFontFamily(e.target.value).run()
                }
              >
                {writeFonts.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <label>
              Size
              <select
                aria-label="Font size"
                value={
                  editor.getAttributes("textStyle").fontSize ||
                  `${editor.getAttributes(editor.isActive("heading") ? "heading" : "paragraph").paragraphSize || 12}pt`
                }
                onChange={(e) =>
                  editor.chain().focus().setFontSize(e.target.value).run()
                }
              >
                {[8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72].map(
                  (n) => (
                    <option key={n} value={`${n}pt`}>
                      {n}
                    </option>
                  ),
                )}
              </select>
            </label>
            <Button
              variant="ghost"
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .setFontSize(
                    `${Math.min(96, (parseFloat(editor.getAttributes("textStyle").fontSize) || 12) + 1)}pt`,
                  )
                  .run()
              }
            >
              A+
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .setFontSize(
                    `${Math.max(6, (parseFloat(editor.getAttributes("textStyle").fontSize) || 12) - 1)}pt`,
                  )
                  .run()
              }
            >
              A−
            </Button>
            <label>
              Text colour
              <input
                aria-label="Text colour"
                type="color"
                onChange={(e) =>
                  editor.chain().focus().setColor(e.target.value).run()
                }
              />
            </label>
            <label>
              Highlight
              <input
                aria-label="Highlight colour"
                type="color"
                defaultValue="#fff1a8"
                onChange={(e) =>
                  editor
                    .chain()
                    .focus()
                    .toggleHighlight({ color: e.target.value })
                    .run()
                }
              />
            </label>
            <Button
              variant="ghost"
              onClick={() => editor.chain().focus().toggleSuperscript().run()}
            >
              Superscript
            </Button>
            <Button
              variant="ghost"
              onClick={() => editor.chain().focus().toggleSubscript().run()}
            >
              Subscript
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                editor.chain().focus().unsetAllMarks().clearNodes().run()
              }
            >
              Clear formatting
            </Button>
          </div>
        )}
        {tab === "Layout" && (
          <div className="toolbar">
            <label>
              Page size
              <select
                aria-label="Page size"
                value={page.size}
                onChange={(e) => setPage({ size: e.target.value })}
              >
                {["A4", "LETTER", "LEGAL"].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Orientation
              <select
                aria-label="Orientation"
                value={String(page.landscape)}
                onChange={(e) =>
                  setPage({ landscape: e.target.value === "true" })
                }
              >
                <option value="false">Portrait</option>
                <option value="true">Landscape</option>
              </select>
            </label>
            <label>
              Margins (pt)
              <input
                aria-label="Margins"
                type="number"
                min="18"
                max="144"
                value={page.margin}
                onChange={(e) => setPage({ margin: Number(e.target.value) })}
              />
            </label>
            <label>
              Line spacing
              <select
                aria-label="Line spacing"
                onChange={(e) =>
                  paragraph({ lineHeight: Number(e.target.value) })
                }
                value={
                  editor.getAttributes(
                    editor.isActive("heading") ? "heading" : "paragraph",
                  ).lineHeight || 1.5
                }
              >
                {[1, 1.15, 1.5, 2, 2.5, 3].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              After paragraph (pt)
              <input
                aria-label="Paragraph spacing"
                type="number"
                min="0"
                max="72"
                defaultValue="8"
                onChange={(e) =>
                  paragraph({ spaceAfter: Number(e.target.value) })
                }
              />
            </label>
            <Button
              variant="ghost"
              onClick={() =>
                paragraph({
                  indent: Math.min(
                    144,
                    (editor.getAttributes("paragraph").indent || 0) + 18,
                  ),
                })
              }
            >
              Indent
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                paragraph({
                  indent: Math.max(
                    0,
                    (editor.getAttributes("paragraph").indent || 0) - 18,
                  ),
                })
              }
            >
              Outdent
            </Button>
            <Button
              variant="ghost"
              onClick={() => paragraph({ direction: "rtl" })}
            >
              Right to left
            </Button>
            <Button
              variant="ghost"
              onClick={() => paragraph({ direction: "ltr" })}
            >
              Left to right
            </Button>
          </div>
        )}
        {tab === "Insert" && (
          <div className="toolbar">
            <Button
              variant="outline"
              onClick={() => editor.chain().focus().setHorizontalRule().run()}
            >
              Horizontal rule
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .insertContent({ type: "pageBreak" })
                  .run()
              }
            >
              Page break
            </Button>
            <label>
              Header
              <input
                aria-label="Header"
                value={page.header}
                onChange={(e) => setPage({ header: e.target.value })}
              />
            </label>
            <label>
              Footer
              <input
                aria-label="Footer"
                value={page.footer}
                onChange={(e) => setPage({ footer: e.target.value })}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={page.numbers}
                onChange={(e) => setPage({ numbers: e.target.checked })}
              />
              Page numbers (exports)
            </label>
            <label className="upload-button">
              Open DOCX / HTML / TXT
              <input
                type="file"
                aria-label="Import document"
                disabled={importing}
                accept=".docx,.html,.htm,.txt"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setImporting(true);
                  try {
                    let html = "";
                    if (f.name.toLowerCase().endsWith(".docx")) {
                      const { importWriteDocx } = await import(
                        "@/lib/write-docx-import"
                      );
                      const result = await importWriteDocx(
                        await f.arrayBuffer(),
                      );
                      html = result.html;
                    } else if (f.name.toLowerCase().endsWith(".txt")) {
                      const el = document.createElement("div");
                      el.textContent = await f.text();
                      html =
                        "<p>" + el.innerHTML.replace(/\n/g, "</p><p>") + "</p>";
                    } else html = await f.text();
                    const clean = sanitizeWriteHtml(html);
                    if (
                      confirm(
                        "Replace this document’s content with the imported file? Undo remains available. Unsupported Word layout, references and fonts may be lost. Download a backup first.",
                      )
                    ) {
                      editor.commands.setContent(clean);
                    } else return;
                    setError(
                      "Import complete. Review formatting: unsupported Word features may be omitted.",
                    );
                  } catch (err) {
                    setError(String(err));
                  } finally {
                    setImporting(false);
                    e.target.value = "";
                  }
                }}
              />
            </label>
          </div>
        )}
        <div hidden={tab !== "References"}>
          <WriteReferences
            editor={editor}
            page={page}
            setPage={setPage}
            setError={setError}
          />
        </div>
        <div hidden={tab !== "Review"}>
          <WriteReview
            editor={editor}
            page={page}
            setPage={setPage}
            setError={setError}
          />
        </div>
      </div>
      <div className="toolbar">
        <Button
          variant="ghost"
          size="icon"
          title="Undo"
          aria-label="Undo"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo size={17} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Redo"
          aria-label="Redo"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo size={17} />
        </Button>
        <span className="divider" />
        <select
          aria-label="Text style"
          value={
            editor.isActive("heading", { level: 1 })
              ? "1"
              : editor.isActive("heading", { level: 2 })
                ? "2"
                : editor.isActive("heading", { level: 3 })
                  ? "3"
                  : editor.isActive("heading", { level: 4 })
                    ? "4"
                    : editor.isActive("heading", { level: 5 })
                      ? "5"
                      : editor.isActive("heading", { level: 6 })
                        ? "6"
                        : "0"
          }
          onChange={(e) => {
            const n = Number(e.target.value);
            if (!n) editor.chain().focus().setParagraph().run();
            else
              editor
                .chain()
                .focus()
                .toggleHeading({ level: n as 1 | 2 | 3 | 4 | 5 | 6 })
                .run();
          }}
        >
          <option value="0">Normal text</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
          {[4, 5, 6].map((n) => (
            <option key={n} value={n}>
              Heading {n}
            </option>
          ))}
        </select>
        {tools.map(({ label, Icon, active, run }) => (
          <Button
            variant="ghost"
            size="icon"
            key={label}
            title={label}
            aria-label={label}
            className={active ? "tool-active" : ""}
            onClick={run}
          >
            <Icon size={17} />
          </Button>
        ))}
        <span className="divider" />
        <Button
          variant="ghost"
          size="icon"
          title="Insert link"
          aria-label="Insert link"
          onClick={() => {
            const url = prompt(
              "Link URL (https://…) or leave blank to remove",
              editor.getAttributes("link").href || "https://",
            );
            if (url === null) return;
            if (!url) {
              editor.chain().focus().unsetLink().run();
              return;
            }
            if (!/^(https?:\/\/|mailto:)/i.test(url)) {
              setError("Use an http, https or mailto link.");
              return;
            }
            editor.chain().focus().setLink({ href: url }).run();
          }}
        >
          <LinkIcon size={17} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Insert table"
          aria-label="Insert table"
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        >
          <Table2 size={17} />
        </Button>
        <label className="upload-button" title="Insert image">
          <ImagePlus size={17} />
          <input
            type="file"
            aria-label="Insert image"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={uploading}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              try {
                const path = await uploadImage(file);
                const src = await resolveImage(path);
                editor
                  .chain()
                  .focus()
                  .setImage({
                    src,
                    alt: path.startsWith("data:") ? "Image" : `asset:${path}`,
                  })
                  .run();
              } catch (err) {
                setError(String(err));
              } finally {
                setUploading(false);
                e.target.value = "";
              }
            }}
          />
        </label>
        <Button
          variant="ghost"
          size="icon"
          title="Print"
          aria-label="Print"
          onClick={() =>
            setPreview({
              html: editor.getHTML(),
              page: pageSettings(editor.getJSON()),
            })
          }
        >
          <Printer size={17} />
        </Button>
        {editor.isActive("image") && (
          <>
            <label>
              Image width (px)
              <input
                aria-label="Image width"
                type="number"
                min="32"
                max="1000"
                value={editor.getAttributes("image").width || 400}
                onChange={(e) => {
                  const attrs = editor.getAttributes("image");
                  const width = Math.max(
                    32,
                    Math.min(1000, Number(e.target.value)),
                  );
                  editor
                    .chain()
                    .focus()
                    .updateAttributes("image", {
                      width,
                      height:
                        attrs.width && attrs.height
                          ? Math.round((width * attrs.height) / attrs.width)
                          : null,
                    })
                    .run();
                }}
              />
            </label>
            <Button
              variant="outline"
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes("image", { alignment: "center" })
                  .run()
              }
            >
              Centre image
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes("image", { alignment: "left", wrap: true })
                  .run()
              }
            >
              Wrap left
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes("image", { alignment: "right", wrap: true })
                  .run()
              }
            >
              Wrap right
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes("image", { wrap: false })
                  .run()
              }
            >
              Inline layout
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const text = prompt("Image caption");
                if (text)
                  editor
                    .chain()
                    .focus()
                    .insertContentAt(editor.state.selection.to, {
                      type: "paragraph",
                      content: [
                        { type: "text", text, marks: [{ type: "italic" }] },
                      ],
                    })
                    .run();
              }}
            >
              Add caption
            </Button>
          </>
        )}
        {editor.isActive("table") && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => editor.chain().focus().addRowAfter().run()}
            >
              + Row
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
            >
              + Column
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => editor.chain().focus().deleteTable().run()}
            >
              Delete table
            </Button>
            <label>
              Cell shading
              <input
                aria-label="Cell shading"
                type="color"
                onChange={(e) =>
                  editor
                    .chain()
                    .focus()
                    .setCellAttribute("backgroundColor", e.target.value)
                    .run()
                }
              />
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => editor.chain().focus().deleteRow().run()}
            >
              Delete row
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => editor.chain().focus().deleteColumn().run()}
            >
              Delete column
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!editor.can().mergeCells()}
              onClick={() => editor.chain().focus().mergeCells().run()}
            >
              Merge cells
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!editor.can().splitCell()}
              onClick={() => editor.chain().focus().splitCell().run()}
            >
              Split cell
            </Button>
          </>
        )}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
        </div>
      )}
      {importing && (
        <div role="status" className="demo-notice">
          Importing document…
        </div>
      )}
      {uploading && (
        <div role="status" className="demo-notice">
          Uploading image…
        </div>
      )}
      <div className="write-view-controls">
        <label>
          Zoom{" "}
          <select
            aria-label="Zoom"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            {[50, 75, 100, 125, 150].map((n) => (
              <option key={n} value={n}>
                {n}%
              </option>
            ))}
          </select>
        </label>
        <span>
          Print layout · explicit page breaks · automatic PDF pagination
        </span>
      </div>
      <div className="doc-workspace">
        <div
          className="doc-page write-page"
          style={{
            width: `${(pageWidth * 96) / 72}px`,
            minHeight: `${(pageHeight * 96) / 72}px`,
            padding: `${(page.margin * 96) / 72}px`,
            zoom: zoom / 100,
          }}
        >
          <div className="write-running-header">{page.header}</div>
          <EditorContent editor={editor} lang={page.language} spellCheck />
          <div className="write-notes">
            {(() => {
              const notes: { number: number; text: string }[] = [];
              editor.state.doc.descendants((n) => {
                if (n.type.name === "footnote")
                  notes.push(n.attrs as { number: number; text: string });
              });
              return notes.map((n, i) => (
                <p key={i}>
                  <sup>{n.number}</sup> {n.text}
                </p>
              ));
            })()}
          </div>
          <div className="write-running-footer">{page.footer}</div>
        </div>
      </div>
      <div className="editor-footer">
        {editor.getText().split(/\s+/).filter(Boolean).length} words ·{" "}
        {editor.getText().length} characters ·{" "}
        {Math.max(1, Math.ceil(editor.getText().split(/\s+/).length / 200))} min
        read <span>Personal document · Autosave on</span>
      </div>
    </>
  );
}
