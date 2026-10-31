import { notFound } from "next/navigation";
import MeetingRoute from "@/components/sessions/meeting-route";
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
    <MeetingRoute
      key={id}
      id={id}
      autoStart={query.start === "1"}
      source={query.source === "campus" ? "campus" : "workspace"}
      notesView={query.view === "notes"}
    />
  );
}
