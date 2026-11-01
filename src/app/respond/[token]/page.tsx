import Respond from "@/components/native/respond";
export const metadata = {
  title: "Respond — Syrka Forms",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <Respond token={token} />;
}
