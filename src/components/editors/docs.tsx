"use client";
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
  writingSuggestions,
  academicTemplates,
  citation,
  bibliography,
  type Source,
} from "@/lib/write-assistance";
import {
  WriteAttributes,
  PageBreak,
  WriteAutocorrect,
} from "@/lib/write-extensions";
import {
  writeFonts,
  pageSettings,
  pageDimensions,
  inspectWriteDocument,
} from "@/lib/write-model";
import { Button } from "../ui/button";
import { uploadImage, resolveImage } from "@/lib/storage";
export default function WriteEditor({
  content,
  onChange,
}: {
  content: Record<string, unknown>;
  onChange: (content: Record<string, unknown>) => void;
}) {
  const [error, setError] = useState("");
  const [ignored, setIgnored] = useState<string[]>([]);
  const [source, setSource] = useState<Source>({
    author: "",
    title: "",
    year: "",
    publisher: "",
    doi: "",
    url: "",
  });
  const [citationStyle, setCitationStyle] = useState("APA");
  const [sources, setSources] = useState<Source[]>(() =>
    Array.isArray(
      content.attrs && (content.attrs as Record<string, unknown>).sources,
    )
      ? (content.attrs as { sources: Source[] }).sources
      : [],
  );
  const [tab, setTab] = useState("Home");
  const [zoom, setZoom] = useState(100);
  const [find, setFind] = useState("");
  const [replacement, setReplacement] = useState("");
  const [uploading, setUploading] = useState(false);
  const [, refresh] = useState(0);
  const editor = useEditor({
    extensions: [
      WriteAttributes,
      WriteAutocorrect,
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
      Image.configure({ allowBase64: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content:inspectWriteDocument(content).length?{type:"doc",content:[{type:"paragraph"}]}:content,
    editable:inspectWriteDocument(content).length===0,
    immediatelyRender: false,
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
  const [pageWidth] = pageDimensions(page);
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
              Font
              <select
                aria-label="Font family"
                value={editor.getAttributes("textStyle").fontFamily || "Arial"}
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
                value={editor.getAttributes("textStyle").fontSize || "12pt"}
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
                accept=".docx,.html,.htm,.txt"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  try {
                    let html = "";
                    if (f.name.toLowerCase().endsWith(".docx")) {
                      const mammoth = await import("mammoth");
                      const result = await mammoth.convertToHtml({
                        arrayBuffer: await f.arrayBuffer(),
                      });
                      html = result.value;
                    } else if (f.name.toLowerCase().endsWith(".txt")) {
                      const el = document.createElement("div");
                      el.textContent = await f.text();
                      html =
                        "<p>" + el.innerHTML.replace(/\n/g, "</p><p>") + "</p>";
                    } else html = await f.text();
                    const { default: DOMPurify } = await import("dompurify");
                    const clean = DOMPurify.sanitize(html, {
                      FORBID_TAGS: ["style", "script", "iframe"],
                      FORBID_ATTR: ["srcset"],
                    });
                    const parsed = new DOMParser().parseFromString(
                      clean,
                      "text/html",
                    );
                    parsed.querySelectorAll("img").forEach((img) => {
                      if (
                        !/^data:image\/(png|jpeg|gif|webp);base64,/i.test(
                          img.src,
                        )
                      )
                        img.remove();
                    });
                    if (
                      confirm(
                        "Replace this document’s content with the imported file? Undo remains available. Unsupported Word layout, references and fonts may be lost. Download a backup first.",
                      )
                    )
                      editor.commands.setContent(parsed.body.innerHTML);
                    setError(
                      "Import complete. Review formatting: unsupported Word features may be omitted.",
                    );
                  } catch (err) {
                    setError(String(err));
                  } finally {
                    e.target.value = "";
                  }
                }}
              />
            </label>
          </div>
        )}
        {tab === "References" && (
          <>
            <div className="toolbar">
              <label>
                Template
                <select
                  aria-label="Academic template"
                  defaultValue=""
                  onChange={(e) => {
                    if (!e.target.value) return;
                    if (
                      confirm(
                        "Replace content with a blank academic structure? Undo is available.",
                      )
                    ) {
                      editor.commands.setContent({
                        type: "doc",
                        attrs: editor.getJSON().attrs,
                        content: academicTemplates[e.target.value].flatMap(
                          (text) => [
                            {
                              type: "heading",
                              attrs: { level: 1 },
                              content: [{ type: "text", text }],
                            },
                            { type: "paragraph" },
                          ],
                        ),
                      });
                    }
                  }}
                >
                  <option value="">Choose blank structure…</option>
                  {Object.keys(academicTemplates).map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label>
                Citation style
                <select
                  value={citationStyle}
                  onChange={(e) => setCitationStyle(e.target.value)}
                >
                  {["APA", "MLA", "Chicago", "Harvard"].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              {(
                ["author", "title", "year", "publisher", "doi", "url"] as const
              ).map((key) => (
                <label key={key}>
                  {key}
                  <input
                    aria-label={`Source ${key}`}
                    value={source[key]}
                    onChange={(e) =>
                      setSource({ ...source, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              <Button
                variant="outline"
                disabled={!source.author || !source.title || !source.year}
                onClick={() => {
                  const next = [...sources, source];
                  setSources(next);
                  setPage({ sources: next });
                  editor
                    .chain()
                    .focus()
                    .insertContent({
                      type: "text",
                      text: citation(source, citationStyle),
                    })
                    .run();
                }}
              >
                Insert citation &amp; save source
              </Button>
              <Button
                variant="outline"
                disabled={!sources.length}
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .insertContent([
                      {
                        type: "heading",
                        attrs: { level: 1 },
                        content: [{ type: "text", text: "References" }],
                      },
                      ...sources.map((src) => ({
                        type: "paragraph",
                        content: [
                          {
                            type: "text",
                            text: bibliography(src, citationStyle),
                          },
                        ],
                      })),
                    ])
                    .run()
                }
              >
                Insert bibliography
              </Button>
              <span>
                Basic author–date formatting; verify institutional style
                requirements.
              </span>
            </div>
            <div className="toolbar">
              <span>Document outline</span>
              {(() => {
                const headings: { text: string; pos: number }[] = [];
                editor.state.doc.descendants((n, pos) => {
                  if (n.type.name === "heading")
                    headings.push({ text: n.textContent, pos });
                });
                return headings.map((h) => (
                  <Button
                    variant="ghost"
                    key={h.pos}
                    onClick={() =>
                      editor
                        .chain()
                        .focus()
                        .setTextSelection(h.pos + 1)
                        .scrollIntoView()
                        .run()
                    }
                  >
                    {h.text || "Untitled heading"}
                  </Button>
                ));
              })()}
            </div>
          </>
        )}
        {tab === "Review" && (
          <>
            <div className="toolbar">
              <label>
                Language
                <select
                  aria-label="Document language"
                  value={page.language}
                  onChange={(e) => setPage({ language: e.target.value })}
                >
                  {Object.entries({
                    "en-GB": "English (UK)",
                    "en-US": "English (US)",
                    hi: "Hindi",
                    ur: "Urdu",
                    ar: "Arabic",
                    fr: "French",
                    de: "German",
                  }).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <span>
                Browser spelling: use the browser context menu for corrections
                and personal dictionary.
              </span>
              <label>
                Find
                <input
                  aria-label="Find text"
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                />
              </label>
              <label>
                Replace
                <input
                  aria-label="Replacement text"
                  value={replacement}
                  onChange={(e) => setReplacement(e.target.value)}
                />
              </label>
              <Button
                variant="outline"
                disabled={!find}
                onClick={() => {
                  let match: { from: number; to: number } | undefined;
                  editor.state.doc.descendants((n, p) => {
                    const i = n.isText ? n.text!.indexOf(find) : -1;
                    if (i >= 0 && !match)
                      match = { from: p + i, to: p + i + find.length };
                  });
                  if (match)
                    editor
                      .chain()
                      .focus()
                      .setTextSelection(match)
                      .insertContent(replacement)
                      .run();
                  else setError("No matching text found.");
                }}
              >
                Replace first
              </Button>
            </div>
            <div className="write-suggestions">
              <strong>Local writing checks</strong>
              <label>
                <input
                  type="checkbox"
                  checked={editor.state.doc.attrs.autocorrect === true}
                  onChange={(e) => setPage({ autocorrect: e.target.checked })}
                />
                Autocorrect common English typos and standalone i when typing a
                space (undoable)
              </label>
              <Button
                variant="outline"
                onClick={() => {
                  const name = prompt("Name this version");
                  if (!name) return;
                  const snapshot = editor.getJSON();
                  const { versions: previous, ...attrs } = snapshot.attrs || {};
                  const versions = Array.isArray(previous) ? previous : [];
                  setPage({
                    versions: [
                      ...versions,
                      {
                        name: name.slice(0, 80),
                        created: new Date().toISOString(),
                        document: { ...snapshot, attrs },
                      },
                    ].slice(-10),
                  });
                }}
              >
                Save named version
              </Button>
              {(Array.isArray(editor.state.doc.attrs.versions)
                ? editor.state.doc.attrs.versions
                : []
              ).map(
                (
                  v: { name: string; created: string; document: JSONContent },
                  i: number,
                ) => (
                  <Button
                    variant="ghost"
                    key={i}
                    onClick={() => {
                      if (
                        confirm(
                          `Restore ${v.name}? Current edits can be recovered with Undo.`,
                        )
                      ) {
                        const versions = editor.state.doc.attrs.versions;
                        editor.commands.setContent({
                          ...v.document,
                          attrs: { ...v.document.attrs, versions },
                        });
                      }
                    }}
                  >
                    Restore {v.name}
                  </Button>
                ),
              )}
              <small>
                Up to 10 named snapshots, saved within this document.
              </small>
              <p>
                Conservative English rules. Suggestions may be wrong; your text
                stays on this device.
              </p>
              {(() => {
                const items: {
                  from: number;
                  to: number;
                  original: string;
                  replacement: string;
                  reason: string;
                }[] = [];
                editor.state.doc.descendants((n, pos) => {
                  if (
                    ["paragraph", "heading"].includes(n.type.name) &&
                    !n.marks.some((m) => m.type.name === "code")
                  ) {
                    for (const suggestion of writingSuggestions(
                      n.textContent,
                      page.language,
                    )) {
                      if (!ignored.includes(suggestion.original))
                        items.push({
                          ...suggestion,
                          from: pos + 1 + suggestion.from,
                          to: pos + 1 + suggestion.to,
                        });
                    }
                  }
                });
                return items.slice(0, 15).map((item, i) => (
                  <div key={`${item.from}-${i}`}>
                    <span>
                      {item.reason}: “{item.original}” → “{item.replacement}”
                    </span>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        editor
                          .chain()
                          .focus()
                          .insertContentAt(
                            { from: item.from, to: item.to },
                            item.replacement,
                          )
                          .run()
                      }
                    >
                      Accept
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setIgnored([...ignored, item.original])}
                    >
                      Ignore all
                    </Button>
                  </div>
                ));
              })()}
            </div>
          </>
        )}
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
          onClick={() => window.print()}
        >
          <Printer size={17} />
        </Button>
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
          </>
        )}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={() => setError("")}>Dismiss</button>
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
            padding: `${(page.margin * 96) / 72}px`,
            zoom: zoom / 100,
          }}
        >
          <div className="write-running-header">{page.header}</div>
          <EditorContent editor={editor} lang={page.language} spellCheck />
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
