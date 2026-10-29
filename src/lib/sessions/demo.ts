import type { SessionRoom, Segment, GeneratedNotes, Snapshot } from "./model";
const actor = "00000000-0000-4000-8000-000000000001";
const roomId = "00000000-0000-4000-8000-000000000010";
const secondId = "00000000-0000-4000-8000-000000000011";
const key = "syrka-sessions-demo-v1";
type Local = { rooms: SessionRoom[]; snapshots: Record<string, Snapshot> };
export function demoStore(): Local {
  const raw = localStorage.getItem(key);
  if (raw) return JSON.parse(raw);
  const room: SessionRoom = {
    id: roomId,
    owner_id: actor,
    title: "Fictional seminar: institutions and public policy",
    description:
      "Fictional 90-minute seminar. These are illustrative excerpts, not a real university recording.",
    starts_at: new Date().toISOString(),
    timezone: "Europe/Prague",
    kind: "lecture",
    institution_id: null,
    offering_id: null,
    project: "Fictional economics course",
    status: "ended",
    locked: false,
    transcribing: false,
    transcript_published: true,
    created_at: new Date().toISOString(),
    retention_days: 30,
  };
  const segments: Segment[] = [
    [
      "Instructor",
      "Institutions shape incentives. In this fictional seminar we compare rules, enforcement and the limits of policy models.",
      0,
    ],
    [
      "Instructor",
      "A model helps isolate assumptions; it does not by itself establish a causal effect.",
      1100000,
    ],
    [
      "Student",
      "How would we distinguish a correlation from a causal explanation?",
      2300000,
    ],
    [
      "Instructor",
      "Compare research designs and identify the assumptions required. Keep uncertainty visible.",
      3500000,
    ],
    [
      "Instructor",
      "For revision, explain how institutional context changes the interpretation of an economic model.",
      5100000,
    ],
  ].map(([speaker, text, start], i) => ({
    id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    room_id: roomId,
    speaker_id: null,
    speaker_name: String(speaker) + " (fictional)",
    start_ms: Number(start),
    end_ms: Number(start) + 30000,
    language: "en",
    original_text: String(text),
    edited_text: null,
    important: false,
    created_at: new Date().toISOString(),
  }));
  const body: GeneratedNotes = {
    overview: [
      {
        text: "The fictional discussion compares institutions, model assumptions and causal claims.",
        segment_ids: [segments[0].id, segments[1].id],
      },
    ],
    topics: [
      {
        title: "Models and evidence",
        details: [
          {
            text: "Model assumptions should be separated from empirical evidence and uncertainty.",
            segment_ids: [segments[1].id, segments[3].id],
          },
        ],
      },
    ],
    decisions: [],
    actions: [],
    concepts: [
      {
        name: "Causal inference",
        explanation:
          "The example distinguishes model assumptions from evidence for causal effects.",
        segment_ids: [segments[2].id, segments[3].id],
      },
    ],
    questions: [
      {
        text: "How do research designs distinguish correlation and causation?",
        segment_ids: [segments[2].id],
      },
    ],
  };
  const snapshot: Snapshot = {
    room,
    me: {
      room_id: roomId,
      user_id: actor,
      display_name: "You (demo)",
      status: "approved",
      consent: false,
      can_publish: true,
    },
    members: [],
    segments,
    note: {
      room_id: roomId,
      body,
      published: true,
      ai_generated: false,
      updated_at: new Date().toISOString(),
    },
    jobs: [],
    cards: [
      {
        id: crypto.randomUUID(),
        room_id: roomId,
        front: "Does an economic model alone establish causation?",
        back: "No. Evidence and identification assumptions must be evaluated.",
        confidence: 0,
        due_at: new Date().toISOString(),
        interval_days: 1,
        segment_ids: [segments[1].id],
      },
    ],
    user_id: actor,
    capabilities: {
      video: false,
      ai: false,
      stt: false,
      recording: false,
      missing: [
        "Fictional local demo. Live calling, speech recognition and AI are not simulated.",
      ],
    },
  };
  const professional = {
    ...room,
    id: secondId,
    title: "Fictional Syrka product planning",
    kind: "meeting" as const,
    description: "Fictional professional meeting; not a company record.",
    project: "Example product project",
  };
  const proSegments: Segment[] = [
    {
      ...segments[0],
      id: crypto.randomUUID(),
      room_id: secondId,
      speaker_name: "Product lead (fictional)",
      original_text:
        "We agree to review the mobile navigation before the next planning meeting.",
    },
    {
      ...segments[1],
      id: crypto.randomUUID(),
      room_id: secondId,
      speaker_name: "Designer (fictional)",
      original_text:
        "I can prepare a navigation review. We have not agreed a deadline.",
    },
  ];
  const proBody: GeneratedNotes = {
    overview: [
      {
        text: "The fictional team discussed mobile navigation.",
        segment_ids: [proSegments[0].id],
      },
    ],
    topics: [],
    decisions: [
      {
        text: "Review mobile navigation before the next planning meeting.",
        segment_ids: [proSegments[0].id],
      },
    ],
    actions: [
      {
        text: "Prepare a navigation review.",
        owner: "Designer (fictional)",
        deadline: null,
        needs_confirmation: false,
        segment_ids: [proSegments[1].id],
      },
    ],
    concepts: [],
    questions: [],
  };
  const proSnap = {
    ...snapshot,
    room: professional,
    segments: proSegments,
    cards: [],
    note: { ...snapshot.note!, room_id: secondId, body: proBody },
  };
  const data = {
    rooms: [room, professional],
    snapshots: { [roomId]: snapshot, [secondId]: proSnap },
  };
  localStorage.setItem(key, JSON.stringify(data));
  return data;
}
export function saveDemo(data: Local) {
  localStorage.setItem(key, JSON.stringify(data));
}
