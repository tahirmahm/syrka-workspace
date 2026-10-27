"use client";
import { useState } from "react";
import type { Editor, JSONContent } from "@tiptap/core";
import { Button } from "../ui/button";
import type { PageSettings } from "@/lib/write-model";
type Props = {
  editor: Editor;
  page: PageSettings;
  setPage: (attrs: Record<string, unknown>) => void;
  setError: (message: string) => void;
};
import {
  academicTemplates,
  citation,
  bibliography,
  type Source,
} from "@/lib/write-assistance";
export default function WriteReferences({ editor, setPage }: Props) {
  const [source, setSource] = useState<Source>({
    author: "",
    title: "",
    year: "",
    publisher: "",
    doi: "",
    url: "",
  });
  const [citationStyle, setCitationStyle] = useState("APA");
  const sources: Source[] = Array.isArray(editor.state.doc.attrs.sources)
    ? editor.state.doc.attrs.sources
    : [];
  return (
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
                  content: academicTemplates[e.target.value].flatMap((text) => [
                    {
                      type: "heading",
                      attrs: { level: 1 },
                      content: [{ type: "text", text }],
                    },
                    { type: "paragraph" },
                  ]),
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
        {(["author", "title", "year", "publisher", "doi", "url"] as const).map(
          (key) => (
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
          ),
        )}
        <Button
          variant="outline"
          disabled={!source.author || !source.title || !source.year}
          onClick={() => {
            const next = [...sources, source];
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
          Basic author–date formatting; verify institutional style requirements.
        </span>
      </div>
      <div className="toolbar">
        <Button
          variant="outline"
          onClick={() => {
            const text = prompt("Footnote text");
            if (!text) return;
            let number = 1;
            editor.state.doc.descendants((n) => {
              if (n.type.name === "footnote")
                number = Math.max(number, Number(n.attrs.number) + 1);
            });
            editor
              .chain()
              .focus()
              .insertContent({
                type: "footnote",
                attrs: { number, text },
              })
              .run();
          }}
        >
          Insert footnote
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const headings: JSONContent[] = [];
            editor.state.doc.descendants((n) => {
              if (n.type.name === "heading")
                headings.push({
                  type: "paragraph",
                  attrs: { indent: (n.attrs.level - 1) * 12 },
                  content: [{ type: "text", text: n.textContent }],
                });
            });
            if (headings.length)
              editor
                .chain()
                .focus()
                .insertContent([
                  {
                    type: "heading",
                    attrs: { level: 1 },
                    content: [{ type: "text", text: "Contents" }],
                  },
                  ...headings,
                ])
                .run();
          }}
        >
          Insert contents snapshot
        </Button>
        <span>Contents snapshots do not update automatically.</span>
        {(() => {
          const notes: { pos: number; number: number; text: string }[] = [];
          editor.state.doc.descendants((n, pos) => {
            if (n.type.name === "footnote")
              notes.push({ pos, number: n.attrs.number, text: n.attrs.text });
          });
          return notes.map((note) => (
            <Button
              variant="ghost"
              key={note.pos}
              onClick={() => {
                const text = prompt(
                  "Edit footnote (blank removes it)",
                  note.text,
                );
                if (text === null) return;
                if (!text)
                  editor
                    .chain()
                    .focus()
                    .deleteRange({ from: note.pos, to: note.pos + 1 })
                    .run();
                else
                  editor.view.dispatch(
                    editor.state.tr.setNodeMarkup(note.pos, undefined, {
                      number: note.number,
                      text,
                    }),
                  );
              }}
            >
              Edit note {note.number}
            </Button>
          ));
        })()}
        <label>
          <input
            type="checkbox"
            checked={!!editor.state.doc.attrs.headingNumbering}
            onChange={(e) => setPage({ headingNumbering: e.target.checked })}
          />
          Automatic heading numbers
        </label>
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
  );
}
