"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Visual lifetime is independent of the persistent assistive announcement. */
export default function CopyToast({ request }: { request: number }) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!request) return;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 1000);
    return () => clearTimeout(timer);
  }, [request]);
  if (!mounted) return null;
  return createPortal(
    <div className="call-copy-toast-host">
      <span
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span key={request}>{request ? "Link copied" : ""}</span>
      </span>
      {visible && (
        <span key={request} className="call-copy-toast" aria-hidden="true">
          Link copied
        </span>
      )}
    </div>,
    document.body,
  );
}
