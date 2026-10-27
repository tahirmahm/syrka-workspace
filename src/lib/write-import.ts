import DOMPurify from "dompurify";
/** Client-only import boundary. Remote images are removed so pasted HTML cannot track readers. */
export function sanitizeWriteHtml(html: string) {
  const clean = DOMPurify.sanitize(html, {
    FORBID_TAGS: [
      "script",
      "style",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "button",
    ],
    FORBID_ATTR: ["srcset"],
    ADD_ATTR: [
      "data-footnote",
      "data-number",
      "data-page-break",
      "data-write-style",
    ],
  });
  const parsed = new DOMParser().parseFromString(clean, "text/html");
  parsed.querySelectorAll("img").forEach((img) => {
    if (
      !/^data:image\/(png|jpeg|gif|webp);base64,/i.test(
        img.getAttribute("src") || "",
      )
    )
      img.replaceWith(
        parsed.createTextNode(
          img.alt ? "[Image: " + img.alt + "]" : "[External image omitted]",
        ),
      );
  });
  return parsed.body.innerHTML;
}
