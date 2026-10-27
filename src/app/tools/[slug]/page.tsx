import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { tools } from "@/lib/tools/registry";
import { ToolsShell } from "@/components/tools/shell";
import { ToolPictogram } from "@/components/tools/pictogram";
import ToolClient from "@/components/tools/tool-client";
export function generateStaticParams() {
  return tools.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = tools.find((t) => t.slug === slug);
  return { title: tool ? `${tool.name} — Syrka Tools` : "Tool not found" };
}
export default async function ToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = tools.find((t) => t.slug === slug);
  if (!tool) notFound();
  return (
    <ToolsShell title={tool.name}>
      <Link className="tools-back" href="/tools">
        ← All tools
      </Link>
      <div className="tool-page-heading">
        <span className={`tool-icon category-${tool.category.toLowerCase()}`}>
          <ToolPictogram name={tool.slug} size={30} />
        </span>
        <div>
          <h1>{tool.name}</h1>
          <p>{tool.description}</p>
        </div>
      </div>
      <ToolClient slug={tool.slug} />
      <p className="tools-local-note">
        Only on your device. Files aren’t uploaded, saved to your account, or
        stored by Syrka.
      </p>
    </ToolsShell>
  );
}
