import { Extension, Node, InputRule } from "@tiptap/core";
import { defaultPage } from "./write-model";
export const WriteAttributes = Extension.create({
  name: "writeAttributes",
  addGlobalAttributes() {
    return [
      {
        types: ["doc"],
        attributes: Object.fromEntries(
          Object.entries({
            ...defaultPage,
            sources: [],
            versions: [],
            autocorrect: false,
          }).map(([name, value]) => [name, { default: value }]),
        ),
      },
      {
        types: ["paragraph", "heading"],
        attributes: {
          lineHeight: {
            default: 1.5,
            parseHTML: (e) => Number(e.style.lineHeight) || 1.5,
            renderHTML: (a) => ({ style: `line-height:${a.lineHeight}` }),
          },
          spaceAfter: {
            default: 8,
            parseHTML: (e) => parseFloat(e.style.marginBottom) || 8,
            renderHTML: (a) => ({ style: `margin-bottom:${a.spaceAfter}pt` }),
          },
          indent: {
            default: 0,
            parseHTML: (e) => parseFloat(e.style.marginLeft) || 0,
            renderHTML: (a) => ({ style: `margin-left:${a.indent}pt` }),
          },
          direction: {
            default: "ltr",
            parseHTML: (e) => e.dir || "ltr",
            renderHTML: (a) => ({ dir: a.direction }),
          },
          background: {
            default: null,
            parseHTML: (e) => e.style.backgroundColor || null,
            renderHTML: (a) =>
              a.background ? { style: `background-color:${a.background}` } : {},
          },
        },
      },
    ];
  },
});
export const PageBreak = Node.create({
  name: "pageBreak",
  group: "block",
  atom: true,
  parseHTML() {
    return [{ tag: "div[data-page-break]" }];
  },
  renderHTML() {
    return [
      "div",
      { "data-page-break": "true", class: "write-page-break" },
      "Page break",
    ];
  },
});

/** Space-triggered corrections participate in ProseMirror history and undoInputRule. */
export const WriteAutocorrect = Extension.create({
  name: "writeAutocorrect",
  addInputRules() {
    return [
      new InputRule({
        find: /(?:^|\s)(i|teh|recieve|seperate|definately) $/,
        handler: ({ state, range, match }) => {
          if (
            !state.doc.attrs.autocorrect ||
            !String(state.doc.attrs.language).startsWith("en")
          )
            return null;
          const $pos = state.doc.resolve(range.from);
          if (
            $pos.parent.type.spec.code ||
            $pos.marks().some((m) => ["code", "link"].includes(m.type.name))
          )
            return null;
          const replacements: Record<string, string> = {
            i: "I",
            teh: "the",
            recieve: "receive",
            seperate: "separate",
            definately: "definitely",
          };
          const leading = match[0].startsWith(" ") ? " " : "";
          state.tr.insertText(
            leading + replacements[match[1]] + " ",
            range.from,
            range.to,
          );
        },
      }),
    ];
  },
});
