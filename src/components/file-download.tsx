"use client";
import { useRef, useState } from "react";
import { Download, ChevronDown } from "lucide-react";
import { type OfficeFile } from "@/lib/model";
import { exportFormats, type ExportFormat } from "@/lib/universal-export";
import type { Workbook } from "@/lib/export-spreadsheet";
export function FileDownload({
  file,
  showLabel = false,
}: {
  file: OfficeFile;
  showLabel?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState("");
  const [range, setRange] = useState("");
  const details = useRef<HTMLDetailsElement>(null);
  const workbook =
    file.kind === "sheet" ? (file.content as unknown as Workbook) : null;
  async function run(format: ExportFormat) {
    setBusy(true);
    setError("");
    try {
      const { exportFile } = await import("@/lib/universal-export");
      await exportFile(file, format, {
        sheetId: sheet || undefined,
        slideRange: range,
      });
      details.current?.removeAttribute("open");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Download failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="file-download" ref={details}>
      <summary
        aria-label={`Download ${file.name}`}
        title={showLabel ? "File → Download as" : `Download ${file.name}`}
      >
        <Download size={16} />
        {showLabel && (
          <>
            <span className="download-label">File</span>
            <ChevronDown size={12} />
          </>
        )}
      </summary>
      <div className="download-options">
        <p className="export-menu-heading">File → Download as</p>
        {workbook && (
          <label>
            Worksheet for CSV, TSV and PDF
            <select
              aria-label="Worksheet to export"
              disabled={busy}
              value={sheet || workbook.sheetOrder[0]}
              onChange={(e) => setSheet(e.target.value)}
            >
              {workbook.sheetOrder.map((id) => (
                <option key={id} value={id}>
                  {workbook.sheets[id]?.name || id}
                </option>
              ))}
            </select>
          </label>
        )}
        {file.kind === "slides" && (
          <label>
            Slides to export
            <input
              aria-label="Slides to export"
              disabled={busy}
              value={range}
              placeholder="All slides, or 1-3, 5"
              onChange={(e) => setRange(e.target.value)}
            />
          </label>
        )}
        {exportFormats[file.kind].map(([format, label]) => (
          <button disabled={busy} key={format} onClick={() => run(format)}>
            {label}
          </button>
        ))}
        <button disabled={busy} onClick={() => run("backup")}>
          {file.kind === "sheet"
            ? "Download workbook (.syrka.json)"
            : "Download editable backup (.syrka.json)"}
        </button>
        {file.kind === "doc" && (
          <p>
            PDF embeds Noto fonts; system fonts use a matching Noto family. For
            Hindi, Urdu or Arabic and exact device fonts, use Write’s Print
            preview → Save PDF. Footnotes appear as endnotes in downloaded PDFs.
          </p>
        )}
        {file.kind === "sheet" && (
          <p>
            XLSX and JSON include all worksheets. Text formats export cell
            values from the chosen sheet, with spreadsheet-safe text escaping.
          </p>
        )}
        {file.kind === "slides" && (
          <p>
            PNG/JPG use a ZIP for multiple slides. PPTX retains editable text,
            shapes and images.
          </p>
        )}
        {busy && <p role="status">Preparing download…</p>}
        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  );
}
