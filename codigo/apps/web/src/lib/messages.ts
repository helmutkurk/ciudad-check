import { isAppError } from "@shelfie/core/browser";

// One message catalogue (webapps.md section 2.6): English now, German/Spanish later.
// Situations and wording follow webapps.md section 2.5 and ui-design.md section 5.

export function describeError(err: unknown): string {
  if (!isAppError(err)) return "Something went wrong. Try again.";
  const d = err.details;
  switch (err.code) {
    case "task_not_open":
      return "Another worker was faster.";
    case "claim_already_active":
      return "Finish or give back your current task first.";
    case "location_mismatch": {
      const m = typeof d["distanceM"] === "number" ? Math.round(d["distanceM"]) : undefined;
      return m === undefined
        ? "You are too far from the store. Move closer and shoot again."
        : `You are about ${m} m from the store. Move closer and shoot again.`;
    }
    case "location_inaccurate":
      return "Weak location signal. Wait a few seconds or step outside, then shoot again.";
    case "capture_mode_not_allowed":
      return "Use the in-app camera.";
    case "invalid_payout_address":
      return "That is not a Cardano preprod address. It starts with addr_test1.";
    case "rate_limited":
      return "Too many requests, wait a moment.";
    case "claim_expired":
      return "Claim expired, take the task again.";
    case "location_required":
      return "Allow location (city level) to take this task. It is only used to check the city.";
    case "wrong_city":
      return typeof d["storeCity"] === "string"
        ? `This task is in ${d["storeCity"]}; you appear to be elsewhere.`
        : "This task is in another city; you appear to be elsewhere.";
    case "claim_window_closed":
      return "Too late to start this task.";
    case "challenge_not_revealed":
      return "Open the camera first to see your hand sign.";
    case "already_submitted":
      return "This task already has a photo.";
    case "image_too_large":
    case "image_not_decodable":
      return "The photo could not be used. Retake it.";
    case "duplicate_image":
      return "This photo was already used.";
    case "dependency_unavailable":
    case "vision_unavailable":
      return "Service busy, your task is kept; try again.";
    case "unauthorized":
      return "The operator token was not accepted.";
    case "brand_token_missing":
      return "Enter your brand access code.";
    case "brand_token_invalid":
      return "That brand access code was not accepted.";
    case "input_schema_violation":
    case "intake_rejected":
      return err.message;
    default:
      return err.message.length > 0 ? err.message : "Something went wrong. Try again.";
  }
}

export const S = {
  appName: "Shelfie",
  feedTitle: "Tasks in Munich",
  feedEmpty: "No tasks in Munich right now. New ones appear here as they arrive.",
  feedHint: "New tasks appear here. When someone else takes one, it leaves your list.",
  locationOff: "Allow location to see tasks in your city.",
  tooSlow: "Another worker was faster.",
  // Task detail steps per challenge mode (ADR-19). Gesture copy never names a count or a side.
  stepsHandwritten: [
    "Find the product",
    "Write the code on paper",
    "Hold it next to the price tag",
    "Take one photo with the in-app camera",
  ],
  stepsGesture: [
    "Find the product",
    "Take the task",
    "Open the camera. Your hand sign is revealed there.",
    "Take one photo of the price tag with the in-app camera",
  ],
  stepsNeutral: [
    "Find the product",
    "Take the task",
    "Take one photo of the price tag with the in-app camera",
  ],
  handSignNote: "Your hand sign is revealed when the camera opens.",
  walletNote: "Payouts are sent in test ADA (tADA) on the Cardano preprod test network.",
  walletEarningsNote:
    "Earnings count the photos taken on this phone. The explorer shows everything this address holds.",
  walletHistoryNote:
    "Your photos are the last ones taken on this phone; another phone or a cleared browser starts empty.",
  noSecureContext: "Open the secure link to take the photo.",
  noSecureContextHelp:
    "This page is not on a secure connection, so the camera is off. You can read tasks here, but the photo cannot be taken or uploaded.",
  cameraDenied:
    "The camera is blocked. Allow the camera for this site in the browser settings, then open the camera again. There is no upload alternative.",
  cameraMissing: "No camera was found on this device.",
  shelvesOnly: "Shelves only. No people in photos.",
  consentVersion: "consent-v1",
  consentText:
    "Shelfie checks shelf prices for a hackathon demo. If you continue: (1) your phone location is read when you claim a task and when you take the photo, only to check you are in the store's city and near the store; exact coordinates are not saved. (2) Your photo is sent to our server and to an AI vision service (Google or OpenAI) to read the price tag; photograph shelves and price tags only, no people. (3) Your payout address is stored to send your test payment and is visible on the public Cardano preprod ledger. Photos are deleted after the event. Contact: Helmut.",
} as const;
