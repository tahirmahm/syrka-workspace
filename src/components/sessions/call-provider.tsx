"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ToolsShell } from "@/components/tools/shell";
import { CallContext, type MeetingRouteInfo } from "./call-context";
const Meeting = dynamic(() => import("./meeting"));
export default function WorkspaceCallProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname(),
    router = useRouter();
  const [meeting, setMeeting] = useState<MeetingRouteInfo | null>(null);
  const [active, setActive] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );
  const surface = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const onRoute =
    !!meeting &&
    pathname.replace(/^\/workspace(?=\/|$)/, "").replace(/\/$/, "") ===
      `/sessions/meeting/${meeting.id}`;
  const minimized = active && !onRoute;
  const register = useCallback(
    (next: MeetingRouteInfo) => {
      setMeeting((old) =>
        active && old
          ? old
          : old?.id === next.id && old.source === next.source
            ? old
            : next,
      );
    },
    [active],
  );
  const restore = useCallback(() => {
    if (meeting)
      router.push(
        `/sessions/meeting/${meeting.id}${meeting.source === "campus" ? "?source=campus" : ""}`,
      );
  }, [meeting, router]);
  const minimize = useCallback(() => router.push("/"), [router]);
  useEffect(() => {
    if (meeting && !onRoute && !active)
      setMeeting((current) => (current?.id === meeting.id ? null : current));
  }, [meeting, onRoute, active]);
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
  const clamp = useCallback((x: number, y: number) => {
    const rect = surface.current?.getBoundingClientRect();
    return {
      x: Math.max(8, Math.min(x, innerWidth - (rect?.width || 300) - 8)),
      y: Math.max(8, Math.min(y, innerHeight - (rect?.height || 230) - 8)),
    };
  }, []);
  useEffect(() => {
    const resize = () => setPosition((p) => (p ? clamp(p.x, p.y) : p));
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [clamp]);
  useEffect(() => {
    if (
      (!active || minimized) &&
      document.fullscreenElement === surface.current
    )
      void document.exitFullscreen().catch(() => {});
  }, [active, minimized]);
  const value = useMemo(
    () => ({ register, currentId: meeting?.id, active, restore }),
    [register, meeting?.id, active, restore],
  );
  return (
    <CallContext.Provider value={value}>
      {children}
      {meeting && (
        <div
          ref={surface}
          data-persistent-call={
            active ? (minimized ? "mini" : "full") : "lobby"
          }
          className={`persistent-call ${active ? "is-active" : "is-lobby"} ${minimized ? "is-mini" : ""}`}
          style={
            minimized && position
              ? {
                  left: position.x,
                  top: position.y,
                  right: "auto",
                  bottom: "auto",
                }
              : undefined
          }
        >
          {minimized && (
            <button
              className="call-drag-handle"
              aria-label="Move call window"
              title="Drag to move, or use arrow keys"
              onPointerDown={(e) => {
                const r = surface.current!.getBoundingClientRect();
                drag.current = {
                  x: e.clientX,
                  y: e.clientY,
                  left: r.left,
                  top: r.top,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerMove={(e) => {
                const d = drag.current;
                if (d)
                  setPosition(
                    clamp(d.left + e.clientX - d.x, d.top + e.clientY - d.y),
                  );
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onKeyDown={(e) => {
                const delta: Record<string, number[]> = {
                  ArrowLeft: [-20, 0],
                  ArrowRight: [20, 0],
                  ArrowUp: [0, -20],
                  ArrowDown: [0, 20],
                };
                if (delta[e.key]) {
                  e.preventDefault();
                  const r = surface.current!.getBoundingClientRect();
                  setPosition(
                    clamp(r.left + delta[e.key][0], r.top + delta[e.key][1]),
                  );
                }
              }}
            >
              Move call window
            </button>
          )}
          <ToolsShell application="sessions" cloudData title="Session">
            <Meeting
              key={`${meeting.source}:${meeting.id}`}
              {...meeting}
              onActiveChange={setActive}
              callPresentation={{
                minimized,
                onMinimize: minimize,
                onRestore: restore,
              }}
            />
          </ToolsShell>
        </div>
      )}
    </CallContext.Provider>
  );
}
