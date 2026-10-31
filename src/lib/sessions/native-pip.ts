/** Native video APIs only; never clones a stream or creates an audio renderer. */
export type PipVideo = HTMLVideoElement & {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
};
export type NativePipKind = "standard" | "webkit";
export function nativePipKind(
  video: PipVideo,
  doc: Document = document,
): NativePipKind | null {
  if (
    doc.pictureInPictureEnabled &&
    typeof video.requestPictureInPicture === "function"
  )
    return "standard";
  try {
    if (
      typeof video.webkitSetPresentationMode === "function" &&
      typeof video.webkitSupportsPresentationMode === "function" &&
      video.webkitSupportsPresentationMode("picture-in-picture")
    )
      return "webkit";
  } catch {}
  return null;
}
export function activeNativePip(video: PipVideo, doc: Document = document) {
  return (
    doc.pictureInPictureElement === video ||
    video.webkitPresentationMode === "picture-in-picture"
  );
}
export async function exitNativePip(video: PipVideo, doc: Document = document) {
  try {
    if (
      doc.pictureInPictureElement === video &&
      typeof doc.exitPictureInPicture === "function"
    )
      await Promise.resolve(doc.exitPictureInPicture());
    if (
      video.webkitPresentationMode === "picture-in-picture" &&
      typeof video.webkitSetPresentationMode === "function"
    )
      video.webkitSetPresentationMode("inline");
  } catch {
    /* Browser-owned presentation must never break a call or navigation. */
  }
}
export async function enterNativePip(
  video: PipVideo,
  doc: Document = document,
): Promise<NativePipKind> {
  if (video.readyState < 2 || !video.videoWidth)
    throw Error("No playable participant video is available yet.");
  video.playsInline = true;
  const kind = nativePipKind(video, doc);
  if (!kind)
    throw Error(
      "This browser or MediaStream does not support native video Picture-in-Picture.",
    );
  // Invoked immediately from the click stack, before the first await (Safari gesture requirement).
  if (kind === "standard") await video.requestPictureInPicture();
  else {
    const changed = new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        video.removeEventListener("webkitpresentationmodechanged", done);
        resolve();
      };
      const timer = setTimeout(done, 700);
      video.addEventListener("webkitpresentationmodechanged", done, {
        once: true,
      });
    });
    video.webkitSetPresentationMode!("picture-in-picture");
    await changed;
  }
  if (!activeNativePip(video, doc))
    throw Error("The browser did not enter native Picture-in-Picture.");
  return kind;
}
