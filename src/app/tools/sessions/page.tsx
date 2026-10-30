import { ToolsShell } from "@/components/tools/shell";
import SessionsDashboard from "@/components/sessions/dashboard";
export const metadata = { title: "Syrka Sessions — Meetings & classes" };
export default async function Sessions({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const { source } = await searchParams;
  return (
    <ToolsShell cloudData title="Sessions">
      <SessionsDashboard
        source={source === "campus" ? "campus" : "workspace"}
      />
    </ToolsShell>
  );
}
