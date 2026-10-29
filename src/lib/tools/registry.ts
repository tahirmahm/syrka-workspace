export const tools = [
  {
    slug: "merge-pdf",
    name: "Merge PDF",
    category: "PDF",
    description: "Bring multiple PDFs together, in the order you choose.",
  },
  {
    slug: "split-pdf",
    name: "Split PDF",
    category: "PDF",
    description: "Keep just the pages you need from a PDF.",
  },
  {
    slug: "images-to-pdf",
    name: "Images to PDF",
    category: "PDF",
    description: "Turn your JPG and PNG images into one tidy PDF.",
  },
  {
    slug: "pdf-to-images",
    name: "PDF to Images",
    category: "PDF",
    description: "Save PDF pages as crisp PNG images.",
  },
  {
    slug: "compress-image",
    name: "Compress Image",
    category: "Images",
    description: "Make images lighter for sharing and submitting.",
  },
  {
    slug: "convert-image",
    name: "Convert Image",
    category: "Images",
    description: "Switch between JPG, PNG, and WebP.",
  },
  {
    slug: "word-counter",
    name: "Word Counter",
    category: "Everyday",
    description: "Count words, characters, and a little more.",
  },
  {
    slug: "qr-code-generator",
    name: "QR Code Generator",
    category: "Everyday",
    description: "Make a scannable code for your link or text.",
  },
] as const;
export type ToolSlug = (typeof tools)[number]["slug"];
export const toolsColor = "#8b78a0";

export const knowledgeTools = [
  {
    slug: "sessions",
    name: "Sessions",
    category: "Meetings",
    description:
      "Host meetings, teach online classes, transcribe discussions and generate intelligent notes.",
  },
  {
    slug: "notes",
    name: "Notes",
    category: "Meetings",
    description:
      "Search transcripts, review summaries and organize meeting and lecture knowledge.",
  },
] as const;
