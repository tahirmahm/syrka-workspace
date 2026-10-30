import { ToolsShell } from "@/components/tools/shell";
import SessionsDashboard from "@/components/sessions/dashboard";
export const metadata = { title: "Syrka Notes — Meeting & lecture knowledge" };
export default async function Notes({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const { source } = await searchParams;
  return (
    <ToolsShell cloudData title="Notes">
      <SessionsDashboard
        mode="notes"
        source={source === "campus" ? "campus" : "workspace"}
      />
    </ToolsShell>
  );
}
