import { notFound } from "next/navigation";
import { ToolsShell } from "@/components/tools/shell";
import Meeting from "@/components/sessions/meeting";
export const metadata = { title: "Syrka Session — Private meeting" };
export default async function Session({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ source?: string; view?: string; start?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)
  )
    notFound();
  return (
    <ToolsShell application="sessions" cloudData title="Session">
      <Meeting
        key={id}
        id={id}
        autoStart={query.start === "1"}
        source={query.source === "campus" ? "campus" : "workspace"}
        notesView={query.view === "notes"}
      />
    </ToolsShell>
  );
}
