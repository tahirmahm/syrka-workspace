"use client";
import { useEffect } from "react";
import { useWorkspaceCall, type MeetingRouteInfo } from "./call-context";
export default function MeetingRoute(props: MeetingRouteInfo) {
  const { register, currentId, active, restore } = useWorkspaceCall();
  const { id, source, notesView, autoStart } = props;
  useEffect(
    () => register({ id, source, notesView, autoStart }),
    [register, id, source, notesView, autoStart],
  );
  if (active && currentId !== id)
    return (
      <main className="session-form">
        <h1>Another meeting is active</h1>
        <p>Leave your current call before joining another meeting.</p>
        <button onClick={restore}>Return to call</button>
      </main>
    );
  return (
    <p className="sr-only" role="status">
      Opening meeting
    </p>
  );
}
