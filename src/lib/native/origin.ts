/** Compare against the incoming host/protocol: Next may normalize req.url to localhost. */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (origin) {
    let supplied: URL;
    try {
      supplied = new URL(origin);
    } catch {
      throw Error("Invalid request origin.");
    }
    const incomingHost = req.headers.get("host") || new URL(req.url).host;
    const protocol =
      req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ||
      new URL(req.url).protocol.slice(0, -1);
    if (supplied.origin !== `${protocol}://${incomingHost}`)
      throw Error("Cross-origin requests are not allowed.");
  }
  if (req.headers.get("sec-fetch-site") === "cross-site")
    throw Error("Open the form directly to submit.");
}
