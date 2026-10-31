"use client";
import type { Member } from "@/lib/sessions/model";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";
export type PeopleManagement = {
  members: Member[];
  ownerId: string;
  isHost: boolean;
  busy: boolean;
  manage: (member: Member, patch: Record<string, unknown>) => void;
  mute: (member: Member) => void;
  refresh: () => void;
};
export type ConnectedPerson = {
  identity: string;
  name?: string;
  isLocal: boolean;
  isMicrophoneEnabled: boolean;
  isCameraEnabled: boolean;
};
export default function PeoplePanel({
  management,
  participants,
  source = "workspace",
}: {
  management?: PeopleManagement;
  participants: ConnectedPerson[];
  source?: string;
}) {
  const waiting = management?.isHost
    ? management.members.filter((m) => m.status === "waiting")
    : [];
  const active =
    management?.members.filter((m) => m.status === "approved") || [];
  const identity = (m: Member) =>
    m.guest_identity
      ? `workspace:guest:${m.user_id}`
      : `${source}:${m.user_id}`;
  const known = new Set(active.map(identity));
  return (
    <div className="call-people-content">
      {management?.isHost && (
        <section
          className="call-waiting-room"
          aria-label="Waiting for admission"
        >
          <h4>
            Waiting to join <span>{waiting.length}</span>
          </h4>
          {!waiting.length && <p>No guests waiting.</p>}
          {waiting.map((member) => (
            <article
              key={member.user_id}
              className="session-member call-waiting-person"
              data-member-id={member.user_id}
            >
              <strong>{member.display_name}</strong>
              <small>Requesting admission</small>
              <div className="call-person-actions">
                <button
                  className="call-admit"
                  disabled={management.busy}
                  onClick={() =>
                    management.manage(member, { status: "approved" })
                  }
                >
                  Admit
                </button>
                <button
                  className="call-deny"
                  disabled={management.busy}
                  onClick={() =>
                    management.manage(member, { status: "removed" })
                  }
                >
                  Deny
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
      <section aria-label="Admitted participants">
        <h4>
          Participants <span>{active.length || participants.length}</span>
        </h4>
        {active.map((member) => {
          const connected = participants.find(
            (p) => p.identity === identity(member),
          );
          return (
            <article
              key={member.user_id}
              className="session-member call-admitted-person"
              data-member-id={member.user_id}
            >
              <strong>
                {member.display_name}
                {member.user_id === management?.ownerId ? " · Host" : ""}
                {connected?.isLocal ? " (you)" : ""}
              </strong>
              <small>
                {connected ? "Connected" : "Admitted · connecting"}
                {member.is_guest ? " · Guest" : ""}
              </small>
              {connected && (
                <span className="call-person-media">
                  {connected.isMicrophoneEnabled ? (
                    <Mic size={15} aria-label="Microphone on" />
                  ) : (
                    <MicOff size={15} aria-label="Microphone off" />
                  )}
                  {connected.isCameraEnabled ? (
                    <Video size={15} aria-label="Camera on" />
                  ) : (
                    <VideoOff size={15} aria-label="Camera off" />
                  )}
                </span>
              )}
              {management?.isHost && member.user_id !== management.ownerId && (
                <>
                  <div className="call-person-actions">
                    <button
                      disabled={management.busy}
                      onClick={() => management.mute(member)}
                    >
                      Mute microphone
                    </button>
                    <button
                      className="call-deny"
                      disabled={management.busy}
                      onClick={() =>
                        management.manage(member, { status: "removed" })
                      }
                    >
                      Remove
                    </button>
                  </div>
                  <details>
                    <summary>Participant permissions</summary>
                    <label>
                      <input
                        type="checkbox"
                        checked={member.can_share_screen !== false}
                        disabled={management.busy}
                        onChange={(e) =>
                          management.manage(member, {
                            can_share_screen: e.target.checked,
                          })
                        }
                      />
                      Allow screen sharing
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={member.can_publish}
                        disabled={management.busy}
                        onChange={(e) =>
                          management.manage(member, {
                            can_publish: e.target.checked,
                          })
                        }
                      />
                      Allow microphone, camera and sharing
                    </label>
                  </details>
                </>
              )}
            </article>
          );
        })}
        {participants
          .filter((p) => !known.has(p.identity))
          .map((p) => (
            <article className="call-admitted-person" key={p.identity}>
              <strong>
                {p.name || "Participant"}
                {p.isLocal ? " (you)" : ""}
              </strong>
              <small>Connected · syncing membership</small>
            </article>
          ))}
        {!active.length && !participants.length && (
          <p>Admitted participants will appear here.</p>
        )}
      </section>
    </div>
  );
}
