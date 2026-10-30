import type { Metadata } from "next";
import "./globals.css";
import WorkspaceCallProvider from "@/components/sessions/call-provider";
import { suiteName } from "@/lib/model";
export const metadata: Metadata = {
  title: `${suiteName} — A little space for big ideas`,
  applicationName: suiteName,
  description:
    "Write documents with Syrka Write, organize spreadsheets with Syrka Tables, and tell your story with Syrka Present. Together in Syrka Workspace.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <WorkspaceCallProvider>{children}</WorkspaceCallProvider>
      </body>
    </html>
  );
}
