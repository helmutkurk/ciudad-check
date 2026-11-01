import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type {
  ClaimLocation,
  ClaimResponse,
  ConfigResponse,
  Outcome,
  SubmissionView,
  TaskListItem,
} from "@shelfie/core/browser";
import { useDeps } from "../deps.js";
import { DEFAULT_EXPLORER_TX_BASE } from "../lib/format.js";
import { readCoarseLocation } from "../lib/geo.js";
import { describeError, S } from "../lib/messages.js";
import {
  addHistory,
  clearConsent,
  hasConsent,
  loadHistory,
  loadProfile,
  locationHint,
  saveConsent,
  saveLocationHint,
  saveProfile,
} from "../lib/storage.js";
import type { HistoryEntry, Profile } from "../lib/storage.js";
import { ExplorerProvider, Toast } from "../ui/index.js";
import { ActiveClaimCard } from "./ActiveClaim.js";
import type { ActiveClaim } from "./ActiveClaim.js";
import { AppHeader } from "./AppHeader.js";
import { CameraSheet } from "./CameraSheet.js";
import type { SubmittedInfo } from "./CameraSheet.js";
import { Claimed } from "./Claimed.js";
import { Feed } from "./Feed.js";
import type { LocationState } from "./Feed.js";
import { Home } from "./Home.js";
import { MapTab } from "./MapTab.js";
import { Onboarding } from "./Onboarding.js";
import { Profile as ProfileTab } from "./Profile.js";
import { Result } from "./Result.js";
import { TabBar } from "./TabBar.js";
import type { Tab } from "./TabBar.js";
import { TaskDetail } from "./TaskDetail.js";
import { Wallet } from "./Wallet.js";
import type { SessionResult } from "./Wallet.js";

/**
 * View state, not routes. `from` remembers the tab a screen was opened from so Back returns there.
 * The claim itself lives in `active`, outside this union, so switching tabs never drops it.
 */
type Screen =
  | { name: "tab"; tab: Tab }
  | { name: "onboarding"; from: Tab }
  | { name: "detail"; task: TaskListItem; from: Tab }
  | { name: "claimed" }
  | { name: "result"; task: TaskListItem; info: SubmittedInfo };

const CLAIM_LOST = "Claim expired, take the task again.";

/** Back link on task detail: names the screen the task was opened from. */
function backLabelFor(from: Tab): string {
  switch (from) {
    case "home":
      return "Home";
    case "map":
      return "Map";
    default:
      return "Tasks";
  }
}

/** Worker app (`/w`): tabs (Home, Tasks, Wallet, Profile) over the claim, camera and verdict flow. */
export function WorkerApp() {
  const deps = useDeps();
  const { api, storage } = deps;

  const [profile, setProfile] = useState<Profile | null>(() => loadProfile(storage));
  const [consented, setConsented] = useState(() => hasConsent(storage, S.consentVersion));
  const [screen, setScreen] = useState<Screen>(() =>
    loadProfile(storage) && hasConsent(storage, S.consentVersion)
      ? { name: "tab", tab: "home" }
      : { name: "onboarding", from: "home" },
  );
  const [toast, setToast] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | undefined>(undefined);
  const [explorerBase, setExplorerBase] = useState(DEFAULT_EXPLORER_TX_BASE);
  const [challengeMode, setChallengeMode] = useState<ConfigResponse["challengeMode"] | null>(null);
  const [camera, setCamera] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<ActiveClaim | null>(null);
  const [sessionResult, setSessionResult] = useState<SessionResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory(storage));

  // Location (coarse) for the city feed; asked on a user gesture, or silently if allowed before.
  const [location, setLocation] = useState<ClaimLocation | undefined>(undefined);
  const [locState, setLocState] = useState<LocationState>("idle");
  const requestLocation = useCallback(() => {
    setLocState("reading");
    readCoarseLocation(deps.geolocation)
      .then((loc) => {
        setLocation(loc);
        setLocState("ok");
        saveLocationHint(storage);
      })
      .catch((err: unknown) => {
        setLocState(
          err instanceof Error && "kind" in err && err.kind === "denied" ? "denied" : "unavailable",
        );
      });
  }, [deps.geolocation, storage]);
  useEffect(() => {
    if (locationHint(storage)) requestLocation();
  }, [storage, requestLocation]);

  // Explorer base and challenge mode (copy only). Failure is not fatal.
  useEffect(() => {
    const controller = new AbortController();
    api
      .config(controller.signal)
      .then((cfg) => {
        setExplorerBase(cfg.explorerTxBase);
        setChallengeMode(cfg.challengeMode);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [api]);

  const toTab = useCallback((tab: Tab, message?: string) => {
    setCamera(null);
    setScreen({ name: "tab", tab });
    setNotice(undefined);
    if (message) setToast(message);
  }, []);

  const giveBack = async (claim: ClaimResponse) => {
    setBusy(true);
    try {
      await api.release(claim.claim.id);
      setActive(null);
      toTab("tasks", "Task given back");
    } catch (err) {
      setToast(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  // Expiry while the worker is on a tab: drop the claim and say so. No navigation.
  const claimEndedAway = useCallback(() => {
    setActive(null);
    setToast(CLAIM_LOST);
  }, []);

  // Expiry or a lost claim on the claim screen or in the camera: back to the task detail.
  const activeTask = active?.task;
  const claimLost = useCallback(() => {
    setCamera(null);
    setActive(null);
    setScreen(
      activeTask
        ? { name: "detail", task: activeTask, from: "tasks" }
        : { name: "tab", tab: "tasks" },
    );
    setToast(CLAIM_LOST);
  }, [activeTask]);

  const recordResult = useCallback((view: SubmissionView) => {
    setSessionResult((prev) => (prev && prev.submissionId === view.id ? { ...prev, view } : prev));
  }, []);

  const resumeClaim = () => setScreen({ name: "claimed" });

  const renderTab = (tab: Tab): ReactNode => {
    switch (tab) {
      case "home":
        return (
          <Home
            name={profile?.name ?? ""}
            location={location}
            locationState={locState}
            onRequestLocation={requestLocation}
            active={active}
            onResume={resumeClaim}
            onClaimEnded={claimEndedAway}
            onOpen={(task) => setScreen({ name: "detail", task, from: "home" })}
            onGo={toTab}
          />
        );
      case "tasks":
        return (
          <>
            {active ? (
              <ActiveClaimCard active={active} onResume={resumeClaim} onExpire={claimEndedAway} />
            ) : null}
            <Feed
              location={location}
              locationState={locState}
              onRequestLocation={requestLocation}
              onOpen={(task) => setScreen({ name: "detail", task, from: "tasks" })}
              notice={notice}
            />
          </>
        );
      case "map":
        return (
          <MapTab
            location={location}
            locationState={locState}
            onRequestLocation={requestLocation}
            onOpen={(task) => setScreen({ name: "detail", task, from: "map" })}
          />
        );
      case "wallet":
        return (
          <Wallet
            payoutAddress={profile?.address ?? null}
            result={sessionResult}
            history={history}
            onGoProfile={() => toTab("profile")}
          />
        );
      case "profile":
        return (
          <ProfileTab
            profile={profile}
            consented={consented}
            onEdit={() => setScreen({ name: "onboarding", from: "profile" })}
          />
        );
    }
  };

  let body: ReactNode;
  switch (screen.name) {
    case "tab":
      body = <main className="tab-body">{renderTab(screen.tab)}</main>;
      break;
    case "onboarding":
      body = (
        <Onboarding
          initial={profile}
          consented={consented}
          onSave={(p) => {
            saveProfile(storage, p);
            saveConsent(storage, S.consentVersion);
            setProfile(p);
            setConsented(true);
            setScreen({ name: "tab", tab: screen.from });
          }}
          onDecline={() => {
            clearConsent(storage);
            setConsented(false);
            setScreen({ name: "tab", tab: screen.from });
          }}
          onCancel={profile ? () => setScreen({ name: "tab", tab: screen.from }) : undefined}
        />
      );
      break;
    case "detail":
      body = (
        <TaskDetail
          task={screen.task}
          profile={profile}
          canClaim={consented}
          challengeMode={challengeMode}
          backLabel={backLabelFor(screen.from)}
          onBack={() => toTab(screen.from)}
          onNeedProfile={() => setScreen({ name: "onboarding", from: screen.from })}
          onClaimed={(claim) => {
            setActive({ task: screen.task, claim });
            setScreen({ name: "claimed" });
          }}
          onTooSlow={() => {
            toTab("tasks");
            setNotice(S.tooSlow);
          }}
        />
      );
      break;
    case "claimed":
      if (!active) {
        // Unreachable in practice: every path that clears the claim also leaves this screen.
        body = <main className="tab-body">{renderTab("tasks")}</main>;
        break;
      }
      body = (
        <>
          <Claimed
            claim={active.claim}
            busy={busy}
            onOpenCamera={() => setCamera("OBSERVED")}
            onOutOfStock={() => setCamera("OUT_OF_STOCK")}
            onGiveBack={() => void giveBack(active.claim)}
            onExpire={claimLost}
          />
          <CameraSheet
            open={camera !== null}
            mode={camera ?? "OBSERVED"}
            onModeChange={setCamera}
            claim={active.claim}
            task={active.task}
            onClose={() => setCamera(null)}
            onSubmitted={(info) => {
              setCamera(null);
              setSessionResult({ task: active.task, submissionId: info.submissionId, view: null });
              setHistory(
                addHistory(storage, {
                  submissionId: info.submissionId,
                  productName: active.task.productName,
                  storeName: active.task.storeName,
                  payoutAmount: active.task.payoutAmount,
                  at: new Date().toISOString(),
                }),
              );
              setActive(null);
              setScreen({ name: "result", task: active.task, info });
            }}
            onClaimLost={claimLost}
          />
        </>
      );
      break;
    case "result":
      body = (
        <Result
          submissionId={screen.info.submissionId}
          queuePosition={screen.info.queuePosition}
          payoutAmount={screen.task.payoutAmount}
          onNext={() => toTab("tasks")}
          onRetry={() => setScreen({ name: "detail", task: screen.task, from: "tasks" })}
          onView={recordResult}
        />
      );
      break;
  }

  return (
    <ExplorerProvider value={explorerBase}>
      <div className="worker-stage">
        <div className="app app-worker">
          {screen.name === "tab" ? <AppHeader /> : null}
          {body}
          {screen.name === "tab" ? (
            <TabBar current={screen.tab} onSelect={(t) => toTab(t)} />
          ) : null}
        </div>
      </div>
      <Toast message={toast} onDone={() => setToast(null)} />
    </ExplorerProvider>
  );
}
