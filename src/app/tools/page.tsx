import type { Metadata } from "next";
import Catalogue from "@/components/tools/catalogue";
import { ToolsShell } from "@/components/tools/shell";
export const metadata: Metadata = {
  title: "Tools — Syrka Workspace",
  description:
    "Eight free, private tools for PDFs, images, writing and QR codes. Process files locally in your browser.",
};
export default function ToolsPage() {
  return (
    <ToolsShell>
      <Catalogue />
    </ToolsShell>
  );
}
