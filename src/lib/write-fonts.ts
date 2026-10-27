import { workspacePath } from "./paths";
export const pdfFontFamily = (name: string) =>
  /mono|courier/i.test(name)
    ? "NotoMono"
    : /serif|georgia|times/i.test(name) && !/sans/i.test(name)
      ? "NotoSerif"
      : "NotoSans";
let fontData: Promise<Record<string, string>> | undefined;
export function loadWriteFonts() {
  if (!fontData)
    fontData = (async () => {
      const entries = await Promise.all(
        ["NotoSans", "NotoSerif", "NotoSansMono"].flatMap((family) =>
          (family === "NotoSansMono"
            ? ["Regular", "Bold"]
            : ["Regular", "Bold", "Italic", "BoldItalic"]
          ).map(async (style) => {
            const name = `${family}-${style}.ttf`;
            const response = await fetch(workspacePath(`/fonts/${name}`));
            if (!response.ok)
              throw Error(
                "Document fonts could not load. Check your connection and try again.",
              );
            const bytes = new Uint8Array(await response.arrayBuffer());
            let binary = "";
            for (let start = 0; start < bytes.length; start += 8192)
              binary += String.fromCharCode(
                ...bytes.subarray(start, start + 8192),
              );
            return [name, btoa(binary)];
          }),
        ),
      );
      return Object.fromEntries(entries);
    })().catch((e) => {
      fontData = undefined;
      throw e;
    });
  return fontData;
}
export const writePdfFonts = {
  NotoSans: {
    normal: "NotoSans-Regular.ttf",
    bold: "NotoSans-Bold.ttf",
    italics: "NotoSans-Italic.ttf",
    bolditalics: "NotoSans-BoldItalic.ttf",
  },
  NotoSerif: {
    normal: "NotoSerif-Regular.ttf",
    bold: "NotoSerif-Bold.ttf",
    italics: "NotoSerif-Italic.ttf",
    bolditalics: "NotoSerif-BoldItalic.ttf",
  },
  NotoMono: {
    normal: "NotoSansMono-Regular.ttf",
    bold: "NotoSansMono-Bold.ttf",
    italics: "NotoSansMono-Regular.ttf",
    bolditalics: "NotoSansMono-Bold.ttf",
  },
};
export function writeFontFaceCss() {
  return ["Noto Sans", "Noto Serif", "Noto Sans Mono"]
    .flatMap((family) =>
      (family === "Noto Sans Mono"
        ? ["Regular", "Bold"]
        : ["Regular", "Bold", "Italic", "BoldItalic"]
      ).map(
        (style) =>
          `@font-face{font-family:"${family}";font-weight:${style.includes("Bold") ? 700 : 400};font-style:${style.includes("Italic") ? "italic" : "normal"};src:url("${workspacePath(`/fonts/${family.replaceAll(" ", "")}-${style}.ttf`)}") format("truetype");}`,
      ),
    )
    .join("\n");
}
