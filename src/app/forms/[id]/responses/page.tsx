import FormsApp from "@/components/native/forms";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FormsApp formId={id} responses />;
}
