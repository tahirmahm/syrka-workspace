import { z } from "zod";
import { referenceSchema } from "./calendar";
export const calendarActionSchema = z.object({
  contract: z.literal("syrka.calendar-action.v1"),
  source: z.enum([
    "mail",
    "campus",
    "sessions",
    "dashboard",
    "roadmaps",
    "passport",
    "manual",
  ]),
  idempotency_key: z.string().min(8).max(200),
  issued_at: z.iso.datetime(),
  event: z.object({
    title: z.string().min(1).max(180),
    description: z.string().max(10000).default(""),
    start_local: z.string(),
    end_local: z.string(),
    time_zone: z.string(),
    category: z.string().default("other"),
    references: z.array(referenceSchema).max(20).default([]),
  }),
  requires_review: z.literal(true),
});
export type CalendarAction = z.infer<typeof calendarActionSchema>;
export const gradeProposalSchema = z.object({
  contract: z.literal("syrka.grade-proposal.v1"),
  form_id: z.uuid(),
  version_id: z.uuid(),
  response_id: z.uuid(),
  course_reference: z.string().max(200).nullable(),
  score: z.number().nullable(),
  maximum: z.number(),
  status: z.literal("unverified_practice_result"),
  requires_instructor_review: z.literal(true),
  authoritative: z.literal(false),
  exported_at: z.iso.datetime(),
});
export const passportProposalSchema = z.object({
  contract: z.literal("syrka.assessment-proposal.v1"),
  source: z.literal("forms"),
  form_id: z.uuid(),
  response_id: z.uuid(),
  target: z.enum(["passport", "roadmaps"]),
  kind: z.literal("self_assessment"),
  verified: z.literal(false),
  requires_user_approval: z.literal(true),
  exported_at: z.iso.datetime(),
});
export interface CalendarProviderAdapter {
  provider: "google" | "outlook" | "ical" | "caldav";
  mode: "static_import" | "oauth_sync";
  listCalendars(): Promise<{ id: string; name: string }[]>;
  pull(
    calendarId: string,
    cursor?: string,
  ): Promise<{ events: unknown[]; cursor?: string }>;
  push?(
    calendarId: string,
    event: unknown,
    etag?: string,
  ): Promise<{ id: string; etag: string }>;
}
export const integrationContracts = {
  calendar: "syrka.calendar-action.v1",
  grade: "syrka.grade-proposal.v1",
  assessment: "syrka.assessment-proposal.v1",
  dashboard: "syrka.workspace-summary.v1",
  responses: "syrka.form-response-table.v1",
  attachments: "syrka.attachment-scan.v1",
} as const;
