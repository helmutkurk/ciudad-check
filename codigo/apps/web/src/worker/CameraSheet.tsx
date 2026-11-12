import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CaptureLocation,
  ClaimResponse,
  Outcome,
  RevealChallengeResponse,
  TaskListItem,
} from "@shelfie/core/browser";
import { isAppError } from "@shelfie/core/browser";
import { useDeps } from "../deps.js";
import { CameraError, startCamera, stopStream } from "../lib/camera.js";
import type { CapturedPhoto } from "../lib/camera.js";
import { GeoError, readFreshFix } from "../lib/geo.js";
import { describeError, S } from "../lib/messages.js";
import { Banner, Button, Countdown, Icon, Sheet, TextButton } from "../ui/index.js";

type LocStatus = "reading" | "ok" | "weak" | "off";
const ACCURACY_WEAK_M = 100; // contracts ACCURACY_CAP_M default; the engine decides

export interface SubmittedInfo {
  submissionId: string;
  queuePosition: number;
}

/**
 * W4: live camera only. No file input, no gallery. Over HTTP (no secure context) the sheet is
 * replaced by a notice and nothing can be submitted.
 */
export function CameraSheet(props: {
  open: boolean;
  mode: Outcome;
  onModeChange: (mode: Outcome) => void;
  claim: ClaimResponse;
  task: TaskListItem;
  onClose: () => void;
  onSubmitted: (info: SubmittedInfo) => void;
  onClaimLost: () => void;
}) {
  const title = props.mode === "OUT_OF_STOCK" ? "Empty shelf spot" : "Price photo";
  return (
    <Sheet open={props.open} title={title} onClose={props.onClose} camera>
      <CameraBody {...props} title={title} />
    </Sheet>
  );
}

function CameraBody(props: Parameters<typeof CameraSheet>[0] & { title: string }) {
  const deps = useDeps();
  const secure = deps.isSecureContext();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAt = useRef<number>(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [loc, setLoc] = useState<{ status: LocStatus; accuracyM?: number }>({ status: "reading" });
  const [shot, setShot] = useState<{
    photo: CapturedPhoto;
    fix: CaptureLocation;
    at: number;
  } | null>(null);
  const [busy, setBusy] = useState<"shutter" | "upload" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const gestureMode = props.claim.challenge.mode === "gesture";
  const [reveal, setReveal] = useState<RevealChallengeResponse | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);

  // Gesture mode: the engine reveals the hand sign now and starts the answer window (ADR-19).
  // The call is idempotent, so re-opening the sheet shows the same sign and the same deadline.
  const claimId = props.claim.claim.id;
  const { onClaimLost } = props;
  useEffect(() => {
    if (!secure || !gestureMode) return;
    let cancelled = false;
    deps.api
      .revealChallenge(claimId)
      .then((r) => {
        if (!cancelled) setReveal(r);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (isAppError(err) && (err.code === "claim_expired" || err.code === "already_submitted")) {
          onClaimLost();
          return;
        }
        setRevealError(describeError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [secure, gestureMode, claimId, deps, onClaimLost]);
  const answerBy = reveal
    ? new Date(
        Math.min(
          new Date(reveal.revealedAt).getTime() + reveal.answerWithinSec * 1000,
          new Date(props.claim.claim.expiresAt).getTime(),
        ),
      ).toISOString()
    : null;
  const waitingForSign = gestureMode && reveal === null;

  // Camera stream, only in a secure context.
  useEffect(() => {
    if (!secure) return;
    let cancelled = false;
    startCamera(deps.mediaDevices)
      .then((stream) => {
        if (cancelled) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        startedAt.current = deps.now().getTime();
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCameraError(
          err instanceof CameraError && err.kind === "missing" ? S.cameraMissing : S.cameraDenied,
        );
      });
    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [secure, deps]);

  // Location status line (fresh fix on open; again at the shutter).
  useEffect(() => {
    if (!secure) return;
    let cancelled = false;
    readFreshFix(deps.geolocation, deps.now)
      .then((fix) => {
        if (!cancelled)
          setLoc({
            status: fix.accuracyM > ACCURACY_WEAK_M ? "weak" : "ok",
            accuracyM: fix.accuracyM,
          });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setLoc({ status: err instanceof GeoError && err.kind === "denied" ? "off" : "weak" });
      });
    return () => {
      cancelled = true;
    };
  }, [secure, deps]);

  // Release the preview URL when the photo is dropped or the sheet closes.
  useEffect(() => {
    const url = shot?.photo.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [shot]);

  const shutter = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    setBusy("shutter");
    setMessage(null);
    try {
      const fix = await readFreshFix(deps.geolocation, deps.now);
      setLoc({ status: fix.accuracyM > ACCURACY_WEAK_M ? "weak" : "ok", accuracyM: fix.accuracyM });
      const photo = await deps.capturePhoto(video);
      setShot({ photo, fix, at: deps.now().getTime() });
    } catch (err) {
      if (err instanceof GeoError) {
        setLoc({ status: err.kind === "denied" ? "off" : "weak" });
        setMessage(
          err.kind === "denied"
            ? "Location is off. Allow it in the browser settings, then shoot again."
            : "Weak location signal. Wait a few seconds or step outside, then shoot again.",
        );
      } else {
        setMessage("The photo could not be taken. Try again.");
      }
    } finally {
      setBusy(null);
    }
  }, [deps]);

  const upload = useCallback(async () => {
    if (!shot) return;
    setBusy("upload");
    setMessage(null);
    try {
      const track = streamRef.current?.getVideoTracks()[0];
      const location: CaptureLocation = {
        ...shot.fix,
        fixAgeMs: shot.fix.fixAgeMs + Math.max(0, deps.now().getTime() - shot.at),
      };
      const res = await deps.api.submit(props.task.id, {
        claimId: props.claim.claim.id,
        outcome: props.mode,
        imageBase64: shot.photo.base64,
        mimeType: shot.photo.mimeType,
        location,
        clientMeta: {
          captureMode: "getUserMedia",
          width: shot.photo.width,
          height: shot.photo.height,
          userAgent: navigator.userAgent,
          streamStartedToShutterMs: Math.max(0, shot.at - startedAt.current),
          deviceLabelPresent: Boolean(track && track.label.length > 0),
        },
      });
      props.onSubmitted({
        submissionId: res.submission.id,
        queuePosition: res.submission.queuePosition,
      });
    } catch (err) {
      if (isAppError(err) && (err.code === "claim_expired" || err.code === "already_submitted")) {
        props.onClaimLost();
        return;
      }
      // Location refusals keep the sheet open: no fee, no attempt used (webapps.md 2.5).
      setShot(null);
      setMessage(describeError(err));
    } finally {
      setBusy(null);
    }
  }, [shot, deps, props]);

  const oos = props.mode === "OUT_OF_STOCK";

  if (!secure) {
    return (
      <div className="camera">
        <div className="camera-bar">
          <TextButton onClick={props.onClose}>Cancel</TextButton>
          <span className="camera-title">{props.title}</span>
          <span />
        </div>
        <div className="camera-notice">
          <Banner tone="warning" title={S.noSecureContext}>
            {S.noSecureContextHelp}
          </Banner>
        </div>
      </div>
    );
  }

  return (
    <div className="camera">
      <div className="camera-bar">
        <TextButton onClick={props.onClose}>Cancel</TextButton>
        <span className="camera-title">{props.title}</span>
        <span />
      </div>
      <div className="camera-stage">
        {shot ? (
          <img
            className="camera-preview"
            src={shot.photo.previewUrl}
            alt="Your photo, not yet sent"
          />
        ) : (
          <video
            ref={videoRef}
            className="camera-video"
            autoPlay
            playsInline
            muted
            aria-label="Camera preview"
          />
        )}
        {!shot ? <div className="frame-guide" aria-hidden="true" /> : null}
        {!shot ? (
          <p className="camera-hint">
            {gestureMode
              ? oos
                ? "Show the shelf label, the empty space above it and your hand."
                : "Keep the price tag and your hand in frame."
              : oos
                ? "Show the shelf label and the empty space above it."
                : "Keep the price tag and the paper in frame."}
          </p>
        ) : null}
      </div>
      {cameraError ? (
        <p className="camera-error" role="alert">
          {cameraError}
        </p>
      ) : null}
      {message ? (
        <p className="camera-error" role="alert">
          {message}
        </p>
      ) : null}
      {revealError ? (
        <p className="camera-error" role="alert">
          {revealError}
        </p>
      ) : null}
      <div className="camera-controls">
        {gestureMode ? (
          <div className="camera-meta">
            {reveal ? (
              <GestureChip gesture={reveal.gesture} oos={oos} />
            ) : (
              <span className="gesture-chip">Loading your hand sign…</span>
            )}
            <Countdown
              expiresAt={answerBy ?? props.claim.claim.expiresAt}
              onExpire={props.onClaimLost}
            />
          </div>
        ) : (
          <div className="camera-meta">
            <span translate="no" className="mono camera-code">
              {props.claim.challenge.code}
            </span>
            <Countdown expiresAt={props.claim.claim.expiresAt} onExpire={props.onClaimLost} />
          </div>
        )}
        <LocationLine status={loc.status} accuracyM={loc.accuracyM} />
        {shot ? (
          <div className="camera-actions">
            <TextButton disabled={busy !== null} onClick={() => setShot(null)}>
              Retake
            </TextButton>
            <Button disabled={busy !== null} onClick={() => void upload()}>
              {busy === "upload" ? "Sending…" : "Use photo"}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            className="shutter"
            aria-label="Take photo"
            disabled={
              busy !== null || loc.status === "off" || cameraError !== null || waitingForSign
            }
            onClick={() => void shutter()}
          />
        )}
        {!shot ? (
          <TextButton onClick={() => props.onModeChange(oos ? "OBSERVED" : "OUT_OF_STOCK")}>
            {oos ? "Back to price photo" : "Product not on the shelf"}
          </TextButton>
        ) : null}
      </div>
    </div>
  );
}

/** The revealed hand sign: big finger count plus the side of the tag (ADR-19). */
function GestureChip(props: { gesture: RevealChallengeResponse["gesture"]; oos: boolean }) {
  const { fingers, side } = props.gesture;
  const target = props.oos ? "label" : "price tag";
  return (
    <span
      className="gesture-chip"
      data-testid="gesture-sign"
      aria-label={`Hold up ${fingers} fingers to the ${side} of the ${target}`}
    >
      {side === "left" ? <span aria-hidden="true">←</span> : null}
      <strong className="gesture-count">{fingers}</strong>
      <span>
        fingers {side} of the {target}
      </span>
      {side === "right" ? <span aria-hidden="true">→</span> : null}
    </span>
  );
}

function LocationLine(props: { status: LocStatus; accuracyM: number | undefined }) {
  let text: string;
  let cls = "";
  switch (props.status) {
    case "reading":
      text = "Getting location…";
      break;
    case "ok":
      text = `Location ok, accuracy ${props.accuracyM ?? "?"} m`;
      cls = "success-text";
      break;
    case "weak":
      text = "Weak signal, wait a moment";
      cls = "warning-text";
      break;
    case "off":
      text = "Location off. Allow it in browser settings";
      cls = "error-text";
      break;
  }
  return (
    <p
      className={`location-line location-${props.status} ${cls}`}
      role="status"
      data-testid="location-status"
    >
      <Icon name={props.status === "ok" ? "check" : props.status === "reading" ? "pin" : "alert"} />{" "}
      {text}
    </p>
  );
}
