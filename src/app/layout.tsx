import type { Metadata } from "next";
import "./globals.css";
import "./native.css";
import WorkspaceCallProvider from "@/components/sessions/call-provider";
import { suiteName } from "@/lib/model";
export const metadata: Metadata = {
  title: `${suiteName} — A little space for big ideas`,
  applicationName: suiteName,
  description:
    "Write documents with Syrka Write, organize spreadsheets with Syrka Tables, tell your story with Syrka Present, plan with Calendar and collect answers with Forms. Together in Syrka Workspace.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{__html:`try{document.documentElement.dataset.nativeTheme=localStorage.getItem("syrka-native-theme")||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light")}catch{}`}}/>
        <WorkspaceCallProvider>{children}</WorkspaceCallProvider>
      </body>
    </html>
  );
}
