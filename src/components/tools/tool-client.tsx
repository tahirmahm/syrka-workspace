"use client";
import dynamic from "next/dynamic";
import type { ToolSlug } from "@/lib/tools/registry";
const FileTool = dynamic(() => import("./file-tool"), {
  ssr: false,
  loading: () => <div className="loading">Opening your tool…</div>,
});
const WordCounter = dynamic(
  () => import("./text-tools").then((module) => module.WordCounter),
  { ssr: false },
);
const QRGenerator = dynamic(
  () => import("./text-tools").then((module) => module.QRGenerator),
  { ssr: false },
);
export default function ToolClient({ slug }: { slug: ToolSlug }) {
  return slug === "word-counter" ? (
    <WordCounter />
  ) : slug === "qr-code-generator" ? (
    <QRGenerator />
  ) : (
    <FileTool key={slug} slug={slug} />
  );
}
