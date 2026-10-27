import type { ToolSlug } from "@/lib/tools/registry";
export function ToolPictogram({
  name,
  size = 24,
}: {
  name: ToolSlug | "tools";
  size?: number;
}) {
  const paths: Record<ToolSlug | "tools", React.ReactNode> = {
    tools: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <path d="M14 17.5h7m-3.5-3.5v7" />
      </>
    ),
    "merge-pdf": (
      <>
        <path d="M3 3h5v6H3zM16 3h5v6h-5zM5.5 9v3l6.5 3 6.5-3V9M9 17h6v5H9zM12 15v2" />
      </>
    ),
    "split-pdf": (
      <>
        <path d="M9 2h6v6H9zM12 8v3M5.5 15v-2l6.5-2 6.5 2v2M3 16h5v6H3zM16 16h5v6h-5z" />
      </>
    ),
    "images-to-pdf": (
      <>
        <rect x="2" y="3" width="10" height="9" rx="1" />
        <path d="m3 10 3-3 2 2 2-1M14 13h7v9h-7zM15 5h4v4M16 8l3 1 2-3M16 16h3m-3 3h3" />
      </>
    ),
    "pdf-to-images": (
      <>
        <path d="M3 2h7v10H3zM5 5h3M5 8h3M14 4h5v5M16 8l3 1 2-3" />
        <rect x="12" y="14" width="10" height="8" rx="1" />
        <path d="m13 20 3-3 2 2 2-1M5 16v3h4" />
      </>
    ),
    "compress-image": (
      <>
        <rect x="8" y="8" width="8" height="8" rx="1" />
        <path d="m9 14 2-2 3 2M2 2l4 4M3 6h3V3M22 2l-4 4m0-3v3h3M2 22l4-4m-3 0h3v3M22 22l-4-4m0 3v-3h3" />
      </>
    ),
    "convert-image": (
      <>
        <rect x="2" y="4" width="8" height="8" rx="1" />
        <rect x="14" y="12" width="8" height="8" rx="1" />
        <path d="m3 10 2-2 3 2m7 8 2-2 3 2M13 5h6v4m-3-2 3 2 2-2M11 19H5v-4m-2 2 2-2 2 2" />
      </>
    ),
    "word-counter": (
      <>
        <path d="M3 4h18M3 9h13M3 14h8M3 19h8M16 14l2-1v8M16 21h5" />
      </>
    ),
    "qr-code-generator": (
      <>
        <path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM13 13h4v4h4v4h-4M13 17v4M21 13h-1" />
        <path d="M5.5 6h1M17.5 6h1M5.5 18h1" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
