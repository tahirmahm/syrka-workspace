"use client";
import { createContext, useContext } from "react";
import type { SessionSource } from "@/lib/sessions/model";
export type MeetingRouteInfo = {
  id: string;
  source: SessionSource;
  notesView: boolean;
  autoStart: boolean;
};
export type CallPresentation = {
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
};
export const CallContext = createContext<{
  register: (meeting: MeetingRouteInfo) => void;
  currentId?: string;
  active: boolean;
  restore: () => void;
} | null>(null);
export function useWorkspaceCall() {
  const context = useContext(CallContext);
  if (!context) throw Error("Workspace call provider is missing.");
  return context;
}
