"use client";
import { useEffect, useRef, useState } from "react";
import type { PageSettings } from "@/lib/write-model";
import { pageDimensions } from "@/lib/write-model";
import { writeFontFaceCss } from "@/lib/write-fonts";
import { workspacePath } from "@/lib/paths";
import { Button } from "../ui/button";
type PreviewWindow = Window & {
  Paged?: {
    Previewer: new () => {
      preview: (
        html: string,
        styles: Record<string, string>[],
        element: HTMLElement,
      ) => Promise<{ total: number }>;
    };
  };
};
export default function WritePreview({
  html,
  page,
  onClose,
}: {
  html: string;
  page: PageSettings;
  onClose: () => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState("Laying out pages…");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const iframe = frame.current;
    if (!iframe) return;
    let cancelled = false;
    const doc = iframe.contentDocument;
    const win = iframe.contentWindow as PreviewWindow;
    if (!doc) return;
    doc.open();
    doc.write(
      '<!doctype html><html><head><meta charset="utf-8"><title>Syrka Write — Print preview</title></head><body><main></main></body></html>',
    );
    doc.close();
    doc.title = document.title;
    const screen = doc.createElement("style");
    screen.textContent =
      "html,body{margin:0;background:#eef0ed}.pagedjs_page{background:white;margin:18px auto;box-shadow:0 2px 10px #0001}@media print{html,body{background:white}.pagedjs_page{margin:0;box-shadow:none;break-after:page}.pagedjs_page:last-child{break-after:auto}}";
    doc.head.append(screen);
    const script = doc.createElement("script");
    script.src = workspacePath("/paged.js");
    script.onerror = () =>
      setStatus("Print preview could not load. Close and try again.");
    script.onload = async () => {
      try {
        const [w, h] = pageDimensions(page);
        const quoted = (s: string) => JSON.stringify(s).replace(/</g, "\\3c ");
        const fontStyle = doc.createElement("style");
        fontStyle.textContent = writeFontFaceCss();
        doc.head.append(fontStyle);
        await Promise.all(
          ["Noto Sans", "Noto Serif", "Noto Sans Mono"]
            .filter((f) => html.includes(f))
            .flatMap((f) => [
              doc.fonts.load(`12pt "${f}"`),
              doc.fonts.load(`bold 12pt "${f}"`),
              doc.fonts.load(`italic 12pt "${f}"`),
            ]),
        );
        let css = `@page{size:${w}pt ${h}pt;margin:${page.margin}pt;@footnote{border-top:1px solid #aaa;padding-top:8pt;}@top-center{content:${quoted(page.header)};font:9pt Arial;}@bottom-center{content:${quoted(page.footer)} ${page.numbers ? '"  " counter(page) " / " counter(pages)' : ""};font:9pt Arial;}}body{margin:0;background:#eef0ed;font:12pt Arial;line-height:1.5;color:#222}.pagedjs_page{background:white;margin:18px auto;box-shadow:0 2px 10px #0001}[data-heading-number]::before{content:attr(data-heading-number) " ";}p{margin:0 0 8pt}h1,h2,h3,h4,h5,h6{break-after:avoid}img{max-width:100%;height:auto}table{border-collapse:collapse;width:100%;table-layout:fixed}td,th{border:1px solid #bbb;padding:6px;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}pre{white-space:pre-wrap}blockquote{margin-left:20pt}.write-forced-page{break-before:page}.write-page-break{break-after:page;visibility:hidden;height:0;margin:0}.write-footnote{float:footnote;font-size:9pt}.write-footnote::footnote-call{content:counter(footnote);vertical-align:super;font-size:75%}.write-footnote::footnote-marker{content:counter(footnote) ". ";}sup{font-size:75%}@media print{body{background:white}.pagedjs_page{margin:0;box-shadow:none;break-after:page}.pagedjs_page:last-child{break-after:auto}}`;
        const source = doc.createElement("div");
        source.innerHTML = html;
        source
          .querySelectorAll("script,iframe,object,embed")
          .forEach((el) => el.remove());
        source.querySelectorAll("[data-page-break]").forEach((marker) => {
          let next = marker.nextElementSibling;
          while (next?.hasAttribute("data-page-break"))
            next = next.nextElementSibling;
          if (next) next.classList.add("write-forced-page");
          marker.remove();
        });
        source.querySelectorAll("sup[data-footnote]").forEach((el) => {
          const note = doc.createElement("span");
          note.className = "write-footnote";
          note.textContent = el.getAttribute("data-footnote");
          el.replaceWith(note);
        });
        // Paged.js 0.4.x misclassifies styled nodes as hidden; use equivalent scoped rules.
        source.querySelectorAll<HTMLElement>("[style]").forEach((el, index) => {
          const name = `write-print-${index}`;
          css += `.${name}{${el.style.cssText}}`;
          el.removeAttribute("style");
          el.classList.add(name);
        });
        const result = await new win.Paged!.Previewer().preview(
          source.innerHTML,
          [{ [window.location.origin]: css }],
          doc.querySelector("main")!,
        );
        if (!cancelled) {
          setReady(true);
          setStatus(
            `${result.total} page${result.total === 1 ? "" : "s"} · Browser print can save a PDF with device fonts.`,
          );
        }
      } catch (e) {
        if (!cancelled)
          setStatus(
            `Preview failed: ${e instanceof Error ? e.message : String(e)}`,
          );
      }
    };
    doc.head.append(script);
    return () => {
      cancelled = true;
    };
  }, [html, page]);
  return (
    <section
      role="dialog"
      aria-modal="true"
      aria-label="Print preview"
      className="write-preview"
    >
      <div className="toolbar">
        <Button variant="outline" onClick={onClose}>
          Close preview
        </Button>
        <Button
          disabled={!ready}
          onClick={() => {
            frame.current?.contentWindow?.focus();
            frame.current?.contentWindow?.print();
          }}
        >
          Print / Save PDF
        </Button>
        <span role="status">{status}</span>
      </div>
      <iframe ref={frame} title="Paginated document" />
    </section>
  );
}
