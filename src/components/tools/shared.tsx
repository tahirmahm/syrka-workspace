"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Upload, X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { bytes, triggerDownload } from "@/lib/tools/utils";
export function LocalImage({ blob, alt }: { blob: Blob; alt: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const value = URL.createObjectURL(blob);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [blob]);
  return url ? (
    <img draggable={false} className="tool-image-preview" src={url} alt={alt} />
  ) : null;
}
export function UploadArea({
  accept,
  multiple = false,
  onFiles,
  disabled,
}: {
  accept: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  function receive(files: FileList | null) {
    if (files?.length && !disabled)
      onFiles(multiple ? Array.from(files) : [files[0]]);
  }
  return (
    <div
      className={`tool-upload ${over ? "drag-over" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        receive(e.dataTransfer.files);
      }}
    >
      <Upload size={25} />
      <strong>Drop {multiple ? "your files" : "a file"} here</strong>
      <span>or choose from your device</span>
      <Button
        variant="outline"
        disabled={disabled}
        onClick={() => input.current?.click()}
      >
        Choose {multiple ? "files" : "file"}
      </Button>
      <input
        ref={input}
        type="file"
        aria-label="Upload files"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        onChange={(e) => {
          receive(e.target.files);
          e.target.value = "";
        }}
      />
      <small>
        {accept.includes("pdf")
          ? "PDF documents"
          : accept.includes("webp")
            ? "JPG, PNG or WebP images"
            : "JPG or PNG images"}{" "}
        · stays on your device
      </small>
    </div>
  );
}
export function FileQueue({
  files,
  onChange,
  disabled,
  images,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  disabled: boolean;
  images: boolean;
}) {
  const drag = useRef<number | null>(null);
  function move(index: number, to: number) {
    if (disabled || to < 0 || to >= files.length) return;
    const next = [...files];
    const [file] = next.splice(index, 1);
    next.splice(to, 0, file);
    onChange(next);
  }
  return (
    <ol className="tool-files">
      {files.map((file, index) => (
        <li
          key={`${file.name}-${file.size}-${index}`}
          draggable={!disabled && files.length > 1}
          onDragStart={() => {
            drag.current = index;
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (drag.current !== null) move(drag.current, index);
            drag.current = null;
          }}
        >
          {images && <LocalImage blob={file} alt={`Preview of ${file.name}`} />}
          <span className="tool-file-position">{index + 1}</span>
          <div>
            <strong>{file.name}</strong>
            <small>{bytes(file.size)}</small>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Move ${file.name} up`}
            disabled={disabled || index === 0}
            onClick={() => move(index, index - 1)}
          >
            <ArrowUp size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Move ${file.name} down`}
            disabled={disabled || index === files.length - 1}
            onClick={() => move(index, index + 1)}
          >
            <ArrowDown size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove ${file.name}`}
            disabled={disabled}
            onClick={() => onChange(files.filter((_, i) => i !== index))}
          >
            <X size={16} />
          </Button>
        </li>
      ))}
    </ol>
  );
}
export function OutputDownload({
  blob,
  name,
  children,
}: {
  blob: Blob;
  name: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="tool-output">
      <div>
        <strong>{name}</strong>
        <small>{bytes(blob.size)}</small>
      </div>
      {children}
      <Button onClick={() => triggerDownload(blob, name)}>
        <Download size={16} />
        Download
      </Button>
    </div>
  );
}
export function Processing({ message }: { message: string }) {
  return (
    <div className="tool-processing" role="status">
      <span className="tool-spinner" />
      {message}
    </div>
  );
}
