import { writePoints } from "./write-units";
import { Plugin } from "@tiptap/pm/state";
import { Extension, Node, InputRule } from "@tiptap/core";
import { defaultWriteStyles } from "./write-styles";
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
            styles: defaultWriteStyles,
            versions: [],
            headingNumbering: false,
            autocorrect: false,
            smartQuotes: false,
            replacements: {},
          }).map(([name, value]) => [name, { default: value }]),
        ),
      },
      {
        types: ["tableCell", "tableHeader"],
        attributes: {
          backgroundColor: {
            default: null,
            parseHTML: (e) => e.style.backgroundColor || null,
            renderHTML: (a) =>
              a.backgroundColor
                ? { style: `background-color:${a.backgroundColor}` }
                : {},
          },
        },
      },
      {
        types: ["image"],
        attributes: {
          alignment: {
            default: "left",
            parseHTML: (e) => e.style.textAlign || "left",
            renderHTML: (a) => ({
              style:
                a.alignment === "center"
                  ? "display:block;margin-left:auto;margin-right:auto"
                  : `float:${a.wrap ? a.alignment : "none"}`,
            }),
          },
          wrap: { default: false },
        },
      },
      {
        types: ["heading"],
        attributes: {
          headingNumber: {
            default: "",
            renderHTML: (a) =>
              a.headingNumber ? { "data-heading-number": a.headingNumber } : {},
          },
        },
      },
      {
        types: ["paragraph", "heading"],
        attributes: {
          styleName: {
            default: "Normal",
            parseHTML: (e) => e.dataset.writeStyle || "Normal",
            renderHTML: (a) => ({ "data-write-style": a.styleName }),
          },
          paragraphFont: {
            default: null,
            parseHTML: (e) => e.style.fontFamily || null,
            renderHTML: (a) =>
              a.paragraphFont
                ? { style: `font-family:${a.paragraphFont}` }
                : {},
          },
          paragraphSize: {
            default: null,
            parseHTML: (e) =>
              e.style.fontSize ? writePoints(e.style.fontSize) : null,
            renderHTML: (a) =>
              a.paragraphSize
                ? { style: `font-size:${a.paragraphSize}pt` }
                : {},
          },
          paragraphBold: {
            default: false,
            parseHTML: (e) => e.style.fontWeight === "bold",
            renderHTML: (a) =>
              a.paragraphBold ? { style: "font-weight:bold" } : {},
          },
          paragraphItalic: {
            default: false,
            parseHTML: (e) => e.style.fontStyle === "italic",
            renderHTML: (a) =>
              a.paragraphItalic ? { style: "font-style:italic" } : {},
          },
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
        find: /(?:^|\s)([a-z][a-z0-9_-]{0,40}) $/,
        handler: ({ state, range, match }) => {
          if (
            !state.doc.attrs.autocorrect ||
            !String(state.doc.attrs.language).startsWith("en")
          )
            return null;
          const $pos = state.doc.resolve(
            Math.max(
              range.from,
              Math.min(state.doc.content.size, range.to - 2),
            ),
          );
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
          const custom = state.doc.attrs.replacements || {};
          const replacement = Object.prototype.hasOwnProperty.call(
            custom,
            match[1],
          )
            ? String(custom[match[1]])
            : replacements[match[1]];
          if (!replacement) return null;
          const leading = match[0].startsWith(" ") ? " " : "";
          state.tr.insertText(
            leading + replacement + " ",
            range.from,
            range.to,
          );
        },
      }),
      new InputRule({
        find: /"([^"\n]+)"$/,
        handler: ({ state, range, match }) => {
          if (
            !state.doc.attrs.smartQuotes ||
            !String(state.doc.attrs.language).startsWith("en")
          )
            return null;
          const pos = state.doc.resolve(range.from);
          if (
            /(?:https?:\/\/|www\.)\S*$/.test(
              state.doc.textBetween(pos.start(), range.from, "", ""),
            )
          )
            return null;
          if (
            pos.parent.type.spec.code ||
            pos.marks().some((m) => ["code", "link"].includes(m.type.name))
          )
            return null;
          state.tr.insertText(`“${match[1]}”`, range.from, range.to);
        },
      }),
    ];
  },
});

export const Footnote = Node.create({
  name: "footnote",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      number: {
        default: 1,
        parseHTML: (e) => Number(e.getAttribute("data-number")) || 1,
      },
      text: {
        default: "",
        parseHTML: (e) => e.getAttribute("data-footnote") || "",
      },
    };
  },
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          let number = 0;
          const tr = state.tr;
          state.doc.descendants((n, pos) => {
            if (n.type.name === "footnote") {
              number++;
              if (n.attrs.number !== number)
                tr.setNodeMarkup(pos, undefined, { ...n.attrs, number });
            }
          });
          return tr.steps.length ? tr : null;
        },
      }),
    ];
  },
  parseHTML() {
    return [{ tag: "sup[data-footnote]" }];
  },
  renderHTML({ node }) {
    return [
      "sup",
      {
        "data-footnote": node.attrs.text,
        "data-number": node.attrs.number,
        title: node.attrs.text,
        contenteditable: "false",
      },
      String(node.attrs.number),
    ];
  },
});

export const HeadingNumbers = Extension.create({
  name: "headingNumbers",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _old, state) {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          const counts = [0, 0, 0, 0, 0, 0];
          const tr = state.tr;
          state.doc.descendants((n, pos) => {
            if (n.type.name !== "heading") return;
            const level = n.attrs.level;
            counts[level - 1]++;
            counts.fill(0, level);
            const headingNumber = state.doc.attrs.headingNumbering
              ? counts
                  .slice(0, level)
                  .map((v) => v || 1)
                  .join(".")
              : "";
            if (n.attrs.headingNumber !== headingNumber)
              tr.setNodeMarkup(pos, undefined, { ...n.attrs, headingNumber });
          });
          return tr.steps.length ? tr : null;
        },
      }),
    ];
  },
});
