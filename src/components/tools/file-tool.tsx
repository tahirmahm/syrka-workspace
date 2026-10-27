"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ToolSlug } from "@/lib/tools/registry";
import {
  bytes,
  encodeImage,
  nextFrame,
  parsePages,
  readImage,
  toolError,
  validatePdf,
} from "@/lib/tools/utils";
import {
  FileQueue,
  LocalImage,
  OutputDownload,
  Processing,
  UploadArea,
} from "./shared";
import type { RenderedPage } from "@/lib/tools/pdf";
type Result = { blob: Blob; name: string };
function PdfPreview({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const value = URL.createObjectURL(blob);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [blob]);
  return url ? (
    <a
      className="tool-preview-link"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      Preview PDF ↗
    </a>
  ) : null;
}
export default function FileTool({ slug }: { slug: ToolSlug }) {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [range, setRange] = useState("");
  const [size, setSize] = useState("a4");
  const [landscape, setLandscape] = useState(false);
  const [scale, setScale] = useState("1.5");
  const [quality, setQuality] = useState(0.8);
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [format, setFormat] = useState("image/png");
  const [result, setResult] = useState<Result | null>(null);
  const [rendered, setRendered] = useState<RenderedPage[]>([]);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const pdfInput = ["merge-pdf", "split-pdf", "pdf-to-images"].includes(slug);
  const multiple = slug === "merge-pdf" || slug === "images-to-pdf";
  const imageOperation = slug === "compress-image" || slug === "convert-image";
  const accept = pdfInput
    ? "application/pdf,.pdf"
    : slug === "images-to-pdf"
      ? "image/jpeg,image/png"
      : "image/jpeg,image/png,image/webp";
  function clearOutput() {
    setResult(null);
    setRendered([]);
    setError("");
  }
  function change(files: File[]) {
    clearOutput();
    setFiles(files);
    if (!files.length) setPageCount(0);
  }
  async function receive(incoming: File[]) {
    setBusy(true);
    setError("");
    setStatus("Checking files…");
    try {
      for (const file of incoming) {
        if (!file.size) throw Error(`${file.name} is empty.`);
        if (pdfInput) await validatePdf(file);
        else {
          if (
            slug === "images-to-pdf" &&
            !["image/jpeg", "image/png"].includes(file.type)
          )
            throw Error("Choose JPG or PNG images for this tool.");
          const image = await readImage(file);
          image.src = "";
        }
      }
      if (slug === "split-pdf" || slug === "pdf-to-images") {
        const { loadPdf } = await import("@/lib/tools/pdf");
        const pdf = await loadPdf(incoming[0]);
        if (mounted.current) setPageCount(pdf.getPageCount());
      }
      if (mounted.current) {
        change(multiple ? [...files, ...incoming] : incoming);
        setRange("");
      }
    } catch (e) {
      if (mounted.current) setError(toolError(e));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function process() {
    setBusy(true);
    clearOutput();
    setStatus("Preparing your files…");
    try {
      await nextFrame();
      const base = files[0].name.replace(/\.[^.]+$/, "") || "output";
      if (pdfInput || slug === "images-to-pdf") {
        const pdf = await import("@/lib/tools/pdf");
        const progress = (value: string) => {
          if (mounted.current) setStatus(value);
        };
        let blob: Blob;
        if (slug === "merge-pdf") {
          blob = await pdf.mergePdfs(files, progress);
          if (mounted.current) setResult({ blob, name: "merged.pdf" });
        } else if (slug === "split-pdf") {
          parsePages(range, pageCount);
          blob = await pdf.splitPdf(files[0], range, progress);
          if (mounted.current)
            setResult({ blob, name: `${base}-extracted.pdf` });
        } else if (slug === "images-to-pdf") {
          blob = await pdf.imagesToPdf(files, size, landscape, progress);
          if (mounted.current) setResult({ blob, name: "images.pdf" });
        } else {
          parsePages(range, pageCount);
          const pages = await pdf.pdfToImages(
            files[0],
            range,
            Number(scale),
            progress,
          );
          if (mounted.current) setRendered(pages);
          if (pages.length === 1) {
            if (mounted.current)
              setResult({ blob: pages[0].blob, name: pages[0].name });
          } else {
            progress("Packing your images…");
            const { default: JSZip } = await import("jszip");
            const zip = new JSZip();
            for (const page of pages) zip.file(page.name, page.blob);
            const blob = await zip.generateAsync({ type: "blob" }, (meta) =>
              progress(`Packing images… ${Math.round(meta.percent)}%`),
            );
            if (mounted.current) setResult({ blob, name: `${base}-pages.zip` });
          }
        }
      } else {
        for (const [label, value] of [
          ["Width", width],
          ["Height", height],
        ])
          if (
            value &&
            (!Number.isFinite(Number(value)) ||
              Number(value) < 1 ||
              !Number.isInteger(Number(value)))
          )
            throw Error(`${label} must be a positive whole number.`);
        setStatus("Encoding image…");
        const output = (
          slug === "compress-image"
            ? files[0].type === "image/jpeg"
              ? "image/jpeg"
              : "image/webp"
            : format
        ) as "image/jpeg" | "image/png" | "image/webp";
        const blob = await encodeImage(
          files[0],
          output,
          quality,
          width ? Number(width) : undefined,
          height ? Number(height) : undefined,
        );
        if (mounted.current)
          setResult({
            blob,
            name: `${base}${slug === "compress-image" ? "-compressed" : ""}.${output === "image/jpeg" ? "jpg" : output.split("/")[1]}`,
          });
      }
    } catch (e) {
      if (mounted.current) {
        setResult(null);
        setRendered([]);
        setError(toolError(e));
      }
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  const action = (
    {
      "merge-pdf": "Merge PDFs",
      "split-pdf": "Extract pages",
      "images-to-pdf": "Create PDF",
      "pdf-to-images": "Convert pages",
      "compress-image": "Compress image",
      "convert-image": "Convert image",
    } as Record<string, string>
  )[slug];
  return (
    <div className="tool-panel">
      <div className="tool-step">
        <span>1</span>
        <h2>
          Choose your {pdfInput ? "PDF" : "image"}
          {multiple ? "s" : ""}
        </h2>
      </div>
      <UploadArea
        accept={accept}
        multiple={multiple}
        disabled={busy}
        onFiles={receive}
      />
      {files.length > 0 && (
        <>
          <FileQueue
            files={files}
            onChange={change}
            disabled={busy}
            images={!pdfInput}
          />
          <fieldset className="tool-config" disabled={busy}>
            <legend>2 · Make it yours</legend>
            {slug === "merge-pdf" && (
              <p>
                Files merge from top to bottom. Drag to reorder, or use the
                arrow buttons.
              </p>
            )}
            {(slug === "split-pdf" || slug === "pdf-to-images") && (
              <>
                <p>
                  <strong>{pageCount} pages</strong> in this PDF. Leave the
                  selection blank to include all pages.
                </p>
                <label>
                  Pages to include
                  <input
                    value={range}
                    placeholder="e.g. 1-3, 5, 8-10"
                    onChange={(e) => {
                      clearOutput();
                      setRange(e.target.value);
                    }}
                  />
                </label>
                <small>
                  Pages appear in the order entered. Repeated page numbers are
                  included once.
                </small>
              </>
            )}
            {slug === "images-to-pdf" && (
              <>
                <p>
                  Images appear in the order above. Drag or use the arrows to
                  change it.
                </p>
                <div className="tool-fields">
                  <label>
                    Page size
                    <select
                      value={size}
                      onChange={(e) => {
                        clearOutput();
                        setSize(e.target.value);
                      }}
                    >
                      <option value="a4">A4</option>
                      <option value="letter">Letter</option>
                      <option value="fit">Fit to Image</option>
                    </select>
                  </label>
                  {size !== "fit" && (
                    <label>
                      Orientation
                      <select
                        value={landscape ? "landscape" : "portrait"}
                        onChange={(e) => {
                          clearOutput();
                          setLandscape(e.target.value === "landscape");
                        }}
                      >
                        <option value="portrait">Portrait</option>
                        <option value="landscape">Landscape</option>
                      </select>
                    </label>
                  )}
                </div>
              </>
            )}
            {slug === "pdf-to-images" && (
              <label>
                Resolution
                <select
                  value={scale}
                  onChange={(e) => {
                    clearOutput();
                    setScale(e.target.value);
                  }}
                >
                  <option value="1">Standard · 72 DPI</option>
                  <option value="1.5">Clear · 108 DPI</option>
                  <option value="2">High · 144 DPI</option>
                  <option value="3">Print · 216 DPI</option>
                </select>
              </label>
            )}
            {imageOperation && (
              <>
                {slug === "convert-image" && (
                  <label>
                    Output format
                    <select
                      value={format}
                      onChange={(e) => {
                        clearOutput();
                        setFormat(e.target.value);
                      }}
                    >
                      <option value="image/png">
                        PNG · supports transparency
                      </option>
                      <option value="image/jpeg">JPG · white background</option>
                      <option value="image/webp">
                        WebP · supports transparency
                      </option>
                    </select>
                  </label>
                )}
                {(slug === "compress-image" || format !== "image/png") && (
                  <label>
                    Quality · {Math.round(quality * 100)}%
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      value={quality}
                      onChange={(e) => {
                        clearOutput();
                        setQuality(Number(e.target.value));
                      }}
                    />
                  </label>
                )}
                {slug === "compress-image" && (
                  <>
                    <p>
                      JPEGs stay JPEG. PNG and WebP inputs use WebP for
                      adjustable compression and transparency.
                    </p>
                    <div className="tool-fields">
                      <label>
                        Maximum width (optional)
                        <input
                          type="number"
                          min="1"
                          step="1"
                          placeholder="Original size"
                          value={width}
                          onChange={(e) => {
                            clearOutput();
                            setWidth(e.target.value);
                          }}
                        />
                      </label>
                      <label>
                        Maximum height (optional)
                        <input
                          type="number"
                          min="1"
                          step="1"
                          placeholder="Original size"
                          value={height}
                          onChange={(e) => {
                            clearOutput();
                            setHeight(e.target.value);
                          }}
                        />
                      </label>
                    </div>
                    <small>
                      Aspect ratio is preserved. Images are never enlarged.
                    </small>
                  </>
                )}
                {slug === "convert-image" && format === "image/jpeg" && (
                  <p>
                    JPEG does not support transparency. Transparent areas become
                    white.
                  </p>
                )}
              </>
            )}
          </fieldset>
          <div className="tool-actions">
            <Button
              disabled={
                busy ||
                (slug === "merge-pdf" && files.length < 2) ||
                !files.length
              }
              onClick={() => void process()}
            >
              {busy ? "Processing…" : action}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                change([]);
                setRange("");
                setPageCount(0);
              }}
            >
              Reset
            </Button>
          </div>
          {slug === "merge-pdf" && files.length < 2 && (
            <p className="tool-hint">Add at least two PDFs to merge them.</p>
          )}
        </>
      )}
      {busy && <Processing message={status} />}
      <p className="tool-hint">
        Large files need more browser memory. For best results on mobile,
        process fewer pages or use a lower resolution.
      </p>
      {error && (
        <div className="tool-error" role="alert">
          {error}
        </div>
      )}
      {result && (
        <section className="tool-results" aria-label="Result">
          <h2>Ready to save.</h2>
          {result.blob.type === "application/pdf" && (
            <PdfPreview blob={result.blob} />
          )}
          <OutputDownload blob={result.blob} name={result.name} />
          {imageOperation && (
            <>
              {slug === "compress-image" && (
                <div className="tool-size-comparison">
                  <span>
                    Before <strong>{bytes(files[0].size)}</strong>
                  </span>
                  <span>
                    After <strong>{bytes(result.blob.size)}</strong>
                  </span>
                  <strong>
                    {result.blob.size < files[0].size
                      ? `${((1 - result.blob.size / files[0].size) * 100).toFixed(1)}% smaller`
                      : result.blob.size === files[0].size
                        ? "Same file size"
                        : `${((result.blob.size / files[0].size - 1) * 100).toFixed(1)}% larger`}
                  </strong>
                </div>
              )}
              {slug === "compress-image" &&
                result.blob.size >= files[0].size && (
                  <p className="tool-hint">
                    This image did not become smaller. Try a lower quality or
                    smaller dimensions; an already optimized file may not shrink
                    further.
                  </p>
                )}
              <LocalImage blob={result.blob} alt="Processed image preview" />
            </>
          )}
          {rendered.length > 0 && (
            <div className="rendered-pages">
              {rendered.map((page) => (
                <article key={page.name}>
                  <LocalImage blob={page.blob} alt={page.name} />
                  <small>
                    {page.width} × {page.height}
                  </small>
                  <OutputDownload blob={page.blob} name={page.name} />
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
