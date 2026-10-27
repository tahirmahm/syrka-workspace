/** CSS absolute lengths normalized to the points used by PDF and DOCX. */
export function writePoints(value: unknown, fallback = 12) {
  const text = String(value || "").trim();
  const match = text.match(/^([\d.]+)\s*(pt|px|in|cm|mm)?$/i);
  if (!match) return fallback;
  const factor: Record<string, number> = {
    pt: 1,
    px: 0.75,
    in: 72,
    cm: 72 / 2.54,
    mm: 72 / 25.4,
  };
  return (
    Math.max(
      1,
      Math.min(
        300,
        Number(match[1]) * (factor[(match[2] || "pt").toLowerCase()] || 1),
      ),
    ) || fallback
  );
}
export function wordColor(value: unknown) {
  const text = String(value || "");
  if (/^#[0-9a-f]{6}$/i.test(text)) return text.slice(1).toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(text))
    return text
      .slice(1)
      .split("")
      .map((c) => c + c)
      .join("")
      .toUpperCase();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) return "000000";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 1, 1);
  context.fillStyle = "#000000";
  context.fillStyle = text;
  context.fillRect(0, 0, 1, 1);
  return [...context.getImageData(0, 0, 1, 1).data]
    .slice(0, 3)
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}
