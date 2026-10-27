"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { wordStats, triggerDownload } from "@/lib/tools/utils";
export function WordCounter() {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const stats = wordStats(text);
  return (
    <div className="tool-panel">
      <label className="tool-text-label">
        Your text
        <textarea
          aria-label="Your text"
          className="word-input"
          placeholder="Paste or type your text here…"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setMessage("");
          }}
        />
      </label>
      <div className="word-stats" aria-live="polite">
        {[
          ["Words", stats.words],
          ["Characters", stats.characters],
          ["Without spaces", stats.noSpaces],
          ["Sentences", stats.sentences],
          ["Paragraphs", stats.paragraphs],
          ["Reading time", `${stats.readingMinutes} min`],
        ].map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p className="tool-hint">
        Reading time estimates 200 words per minute. Paragraphs are separated by
        blank lines; sentence counts are approximate.
      </p>
      <div className="tool-actions">
        <Button
          disabled={!text}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setMessage("Copied to clipboard.");
            } catch {
              setMessage(
                "Clipboard access is unavailable. Select and copy the text manually.",
              );
            }
          }}
        >
          Copy text
        </Button>
        <Button
          variant="outline"
          disabled={!text}
          onClick={() => {
            setText("");
            setMessage("");
          }}
        >
          Clear
        </Button>
      </div>
      <p role="status">{message}</p>
    </div>
  );
}
export function QRGenerator() {
  const [text, setText] = useState("");
  const [mode, setMode] = useState("url");
  const [size, setSize] = useState(512);
  const [output, setOutput] = useState<{ png: string; svg: string } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setOutput(null);
    setError("");
    if (!text.trim()) {
      setGenerating(false);
      return;
    }
    setGenerating(true);
    const timer = setTimeout(async () => {
      try {
        if (mode === "url") {
          const parsed = new URL(text.trim());
          if (!["https:", "http:"].includes(parsed.protocol))
            throw Error("Use a complete http:// or https:// URL.");
        }
        const QR = await import("qrcode");
        const options = {
          width: size,
          margin: 4,
          errorCorrectionLevel: "M" as const,
          color: { dark: "#173f35", light: "#ffffff" },
        };
        const [png, svg] = await Promise.all([
          QR.toDataURL(text, options),
          QR.toString(text, { ...options, type: "svg" }),
        ]);
        if (!cancelled) setOutput({ png, svg });
      } catch (e) {
        if (!cancelled)
          setError(
            mode === "url" && e instanceof TypeError
              ? "Enter a complete URL, such as https://example.com."
              : e instanceof Error
                ? e.message
                : "This content could not be encoded. Try shorter text.",
          );
      } finally {
        if (!cancelled) setGenerating(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [text, mode, size]);
  return (
    <div className="tool-panel qr-layout">
      <div>
        <label className="tool-text-label">
          Content type
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="url">Website URL</option>
            <option value="text">Plain text</option>
          </select>
        </label>
        <label className="tool-text-label">
          {mode === "url" ? "Website URL" : "Text to encode"}
          <textarea
            aria-label={mode === "url" ? "Website URL" : "Text to encode"}
            value={text}
            placeholder={
              mode === "url" ? "https://example.com" : "Type your text…"
            }
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <label className="tool-text-label">
          Image size
          <select
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          >
            {[256, 512, 1024, 2048].map((value) => (
              <option key={value} value={value}>
                {value} × {value} pixels
              </option>
            ))}
          </select>
        </label>
        <p className="tool-hint">
          A four-module quiet zone is included for reliable scanning. Detailed
          codes may need a larger image.
        </p>
        <Button variant="outline" onClick={() => setText("")} disabled={!text}>
          Reset
        </Button>
      </div>
      <div className="qr-preview">
        {output ? (
          <>
            <img src={output.png} alt="Generated QR code" />
            <div className="tool-actions">
              <Button
                onClick={async () => {
                  const blob = await (await fetch(output.png)).blob();
                  triggerDownload(blob, "syrka-qr.png");
                }}
              >
                Download PNG
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  triggerDownload(
                    new Blob([output.svg], { type: "image/svg+xml" }),
                    "syrka-qr.svg",
                  )
                }
              >
                Download SVG
              </Button>
            </div>
          </>
        ) : (
          <p>
            {generating
              ? "Generating your code…"
              : "Your QR code will appear here."}
          </p>
        )}
        {error && (
          <div className="tool-error" role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
