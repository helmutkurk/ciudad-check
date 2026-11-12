import type { Profile as ProfileData } from "../lib/storage.js";
import { S } from "../lib/messages.js";
import { Button, Group, Row } from "../ui/index.js";
import { AddressCopy } from "./AddressCopy.js";

/** Up to two initials from the local name, for the avatar fallback. No photos. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}

/** Profile tab: local name, payout address, privacy status and edit. */
export function Profile(props: {
  profile: ProfileData | null;
  consented: boolean;
  onEdit: () => void;
}) {
  const name = props.profile?.name.trim() ?? "";
  return (
    <section className="tab-section" aria-labelledby="profile-title">
      <div className="page-head">
        <h1 id="profile-title">Profile</h1>
      </div>

      <div className="profile-head">
        <span className="avatar" aria-hidden="true">
          {initialsOf(name)}
        </span>
        <p className="profile-name">{name || "No name set"}</p>
      </div>

      <Group label="Account">
        <Row
          title="Payout address"
          trailing={props.profile ? <AddressCopy address={props.profile.address} /> : "Not set"}
        />
        <Row
          title="Privacy text"
          secondary={
            props.consented
              ? `Accepted (${S.consentVersion})`
              : "Not accepted. You can only look around."
          }
        />
      </Group>
      <div className="profile-actions">
        <Button variant="plain" onClick={props.onEdit}>
          Edit name and payout address
        </Button>
      </div>
    </section>
  );
}
