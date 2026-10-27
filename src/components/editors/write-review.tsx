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
import { writingSuggestions } from "@/lib/write-assistance";
export default function WriteReview({
  editor,
  page,
  setPage,
  setError,
}: Props) {
  const [ignoredOnce, setIgnoredOnce] = useState<string[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [find, setFind] = useState("");
  const [replacement, setReplacement] = useState("");
  return (
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
          Browser spelling: use the browser context menu for corrections and
          personal dictionary.
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
                .insertContent(
                  replacement ? { type: "text", text: replacement } : [],
                )
                .run();
            else setError("No matching text found.");
          }}
        >
          Replace first
        </Button>
        <Button
          variant="outline"
          disabled={!find}
          onClick={() => {
            const hits: { from: number; to: number }[] = [];
            editor.state.doc.descendants((n, p) => {
              if (!n.isText) return;
              let offset = 0;
              while ((offset = n.text!.indexOf(find, offset)) >= 0) {
                hits.push({
                  from: p + offset,
                  to: p + offset + find.length,
                });
                offset += find.length;
              }
            });
            const next =
              hits.find((h) => h.from >= editor.state.selection.to) || hits[0];
            if (next)
              editor
                .chain()
                .focus()
                .setTextSelection(next)
                .scrollIntoView()
                .run();
            else setError("No matching text found.");
          }}
        >
          Find next
        </Button>
        <Button
          variant="outline"
          disabled={!find}
          onClick={() => {
            const hits: { from: number; to: number }[] = [];
            editor.state.doc.descendants((n, p) => {
              if (!n.isText) return;
              let offset = 0;
              while ((offset = n.text!.indexOf(find, offset)) >= 0) {
                hits.push({
                  from: p + offset,
                  to: p + offset + find.length,
                });
                offset += find.length;
              }
            });
            const tr = editor.state.tr;
            for (const h of hits.reverse()) {
              if (replacement) tr.insertText(replacement, h.from, h.to);
              else tr.delete(h.from, h.to);
            }
            if (hits.length) editor.view.dispatch(tr);
            else setError("No matching text found.");
          }}
        >
          Replace all
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
          Autocorrect common English typos and standalone i when typing a space
          (undoable)
        </label>
        <label>
          <input
            type="checkbox"
            checked={editor.state.doc.attrs.smartQuotes === true}
            onChange={(e) => setPage({ smartQuotes: e.target.checked })}
          />
          Smart double quotes in English (undoable)
        </label>
        <Button
          variant="outline"
          onClick={() => {
            const from = prompt(
              "Replace this lowercase word when followed by a space",
            );
            if (!from || !/^[a-z][a-z0-9_-]{0,40}$/.test(from)) {
              if (from) setError("Use a single lowercase word.");
              return;
            }
            const to = prompt("With this text (blank removes the custom rule)");
            if (to === null) return;
            const replacements = {
              ...editor.state.doc.attrs.replacements,
            };
            if (to) replacements[from] = to.slice(0, 200);
            else delete replacements[from];
            setPage({ replacements });
          }}
        >
          Custom autocorrect rule
        </Button>
        <span>
          {Object.entries(editor.state.doc.attrs.replacements || {})
            .map(([from, to]) => `${from} → ${to}`)
            .join("; ")}
        </span>
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
        <small>Up to 10 named snapshots, saved within this document.</small>
        <p>
          Conservative English rules. Suggestions may be wrong; your text stays
          on this device.
        </p>
        {(() => {
          const items: {
            from: number;
            to: number;
            original: string;
            replacement: string;
            reason: string;
          }[] = [];
          editor.state.doc.descendants((n, pos, parent) => {
            if (
              n.isText &&
              parent?.type.name !== "codeBlock" &&
              !n.marks.some((m) => ["code", "link"].includes(m.type.name))
            ) {
              for (const suggestion of writingSuggestions(
                n.textContent,
                page.language,
              )) {
                if (
                  !ignored.includes(suggestion.original) &&
                  !ignoredOnce.includes(
                    `${pos + suggestion.from}:${suggestion.original}`,
                  )
                )
                  items.push({
                    ...suggestion,
                    from: pos + suggestion.from,
                    to: pos + suggestion.to,
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
              <Button
                variant="ghost"
                onClick={() =>
                  setIgnoredOnce([
                    ...ignoredOnce,
                    `${item.from}:${item.original}`,
                  ])
                }
              >
                Ignore once
              </Button>
            </div>
          ));
        })()}
      </div>
    </>
  );
}
