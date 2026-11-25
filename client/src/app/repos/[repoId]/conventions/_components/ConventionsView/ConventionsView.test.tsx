import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate, ConventionList, ExtractionResult } from "@devdigest/shared";
import { NAV } from "@devdigest/ui";
import conventions from "../../../../../../../messages/en/conventions.json";
import common from "../../../../../../../messages/en/common.json";
import shell from "../../../../../../../messages/en/shell.json";
import { ToastProvider } from "@/lib/toast";
import { ApiError } from "@/lib/api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useParams: () => ({ repoId: "r1" }),
  useSearchParams: () => new URLSearchParams(""),
  usePathname: () => "/repos/r1/conventions",
}));
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repos: [{ id: "r1", full_name: "o/r" }], reposLoaded: true, activeRepo: null }),
  useRepoNotFound: () => false,
}));
// The skill modal is T13's; stub it to a marker.
vi.mock("../CreateSkillModal", () => ({
  CreateSkillModal: () => <div data-testid="create-skill-modal" />,
}));

type ListState = {
  data?: ConventionList;
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
};
let list: ListState = {};
const refetch = vi.fn();
const extractMutate = vi.fn();
let extractPending = false;

vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({ isLoading: false, isError: false, refetch, ...list }),
  useExtractConventions: () => ({ mutate: extractMutate, isPending: extractPending }),
  usePatchConvention: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { ConventionsView } from "./ConventionsView";

let seq = 0;
const cand = (o: Partial<ConventionCandidate> = {}): ConventionCandidate => {
  seq += 1;
  return {
    id: `c${seq}`,
    rule: `Rule number ${seq}`,
    original_rule: `Rule number ${seq}`,
    category: "api layer",
    evidence_path: "src/api.ts",
    evidence_snippet: "export const api = client;",
    evidence_start_line: 3,
    evidence_end_line: 3,
    confidence: 0.6,
    status: "pending",
    ...o,
  };
};
const SCAN = { scanned_at: "2026-11-26T10:00:00Z", sample_count: 12 };

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  list = {};
  extractPending = false;
  extractMutate.mockReset();
  refetch.mockReset();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-26T10:19:00Z"));
});

const renderView = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions, common, shell }}>
      <ToastProvider>
        <ConventionsView />
      </ToastProvider>
    </NextIntlClientProvider>,
  );

describe("ConventionsView — SCR-01 states", () => {
  it("loading shows skeletons", () => {
    list = { isLoading: true };
    renderView();
    expect(screen.getByTestId("conventions-loading")).toBeInTheDocument();
  });

  it("empty (never scanned) offers Run extraction, which starts a run (AC-07, AC-01)", () => {
    list = { data: { scan: null, scanning: false, candidates: [] } };
    renderView();
    expect(screen.getByText("No conventions extracted yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Run extraction/ }));
    expect(extractMutate).toHaveBeenCalledTimes(1);
  });

  it("empty after a run that verified none says so (AC-07)", () => {
    list = { data: { scan: SCAN, scanning: false, candidates: [] } };
    renderView();
    expect(screen.getByText(/No convention could be backed by evidence/)).toBeInTheDocument();
  });

  it("default header: repo, sample count, time ago, N of M accepted, and the rules (AC-06)", () => {
    list = {
      data: {
        scan: SCAN,
        scanning: false,
        candidates: [cand({ status: "accepted", rule: "Alpha rule" }), cand({ status: "accepted" }), cand({ status: "rejected" })],
      },
    };
    renderView();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Conventions in o/r");
    expect(screen.getByText("Detected from 12 sample files · last scan 19m ago")).toBeInTheDocument();
    expect(screen.getByText("2 of 3 accepted")).toBeInTheDocument();
    expect(screen.getByText("Alpha rule")).toBeInTheDocument();
  });

  it("scanning: Re-scan shows Scanning… and is disabled, Create skill disabled (AC-01, AC-04b)", () => {
    list = { data: { scan: SCAN, scanning: true, candidates: [cand({ status: "accepted" })] } };
    renderView();
    expect(screen.getByRole("button", { name: /Scanning…/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Create skill/ })).toBeDisabled();
  });

  it("Create skill is unavailable with no accepted candidates, with the reason (AC-16)", () => {
    list = { data: { scan: SCAN, scanning: false, candidates: [cand()] } };
    renderView();
    expect(screen.getByRole("button", { name: /Create skill/ })).toBeDisabled();
    expect(screen.getByText("Accept at least one candidate first")).toBeInTheDocument();
  });

  it("Create skill opens the skill modal (AC-15)", () => {
    list = { data: { scan: SCAN, scanning: false, candidates: [cand({ status: "accepted" })] } };
    renderView();
    expect(screen.queryByTestId("create-skill-modal")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Create skill/ }));
    expect(screen.getByTestId("create-skill-modal")).toBeInTheDocument();
  });

  it("a re-scan that stored nothing new shows the notice (AC-07)", () => {
    list = { data: { scan: SCAN, scanning: false, candidates: [cand({ status: "accepted" })] } };
    extractMutate.mockImplementation((_v: unknown, o: { onSuccess: (r: ExtractionResult) => void }) =>
      o.onSuccess({ ...list.data!, new_count: 0 }),
    );
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Re-scan/ }));
    expect(screen.getByText("No new conventions found")).toBeInTheDocument();
  });

  it.each([
    [new ApiError("x", 502, "conventions_extraction_failed", { reason: "timeout" }), /did not answer within 120 seconds/],
    [new ApiError("x", 502, "conventions_extraction_failed", { reason: "no_credentials" }), /no API key/],
    [new ApiError("x", 409, "conventions_repo_not_indexed", { reason: "not_indexed" }), /Index the repo first/],
    [new ApiError("x", 409, "conventions_repo_not_indexed", { reason: "no_sample_files" }), /no source files to analyse/],
    [new ApiError("x", 409, "conventions_scan_in_progress"), /A scan is already running/],
  ])("a failed run shows the reason above the kept list (AC-02, AC-03, AC-04) — %#", (err, text) => {
    list = { data: { scan: SCAN, scanning: false, candidates: [cand({ rule: "Kept rule", status: "accepted" })] } };
    extractMutate.mockImplementation((_v: unknown, o: { onError: (e: unknown) => void }) => o.onError(err));
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Re-scan/ }));
    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent(text);
    expect(screen.getByText("Kept rule")).toBeInTheDocument();
  });

  it("load error shows a retry", () => {
    list = { isError: true, error: new ApiError("boom", 500) };
    renderView();
    expect(screen.getByText("Could not load conventions.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry/ }));
    expect(refetch).toHaveBeenCalled();
  });

  it("a foreign or unknown repo renders the repo-not-found view, no candidate data (AC-08)", () => {
    list = { isError: true, error: new ApiError("Repo not found", 404, "repo_not_found") };
    renderView();
    expect(screen.getByText(common.repoNotFound.title)).toBeInTheDocument();
    expect(screen.queryByText("Could not load conventions.")).toBeNull();
  });
});

describe("Re-scan confirmation — SCR-02 (AC-14)", () => {
  const withPending = () => {
    list = {
      data: {
        scan: SCAN,
        scanning: false,
        candidates: [
          cand({ status: "pending" }),
          cand({ status: "pending", rule: "Edited", original_rule: "Original" }),
          cand({ status: "accepted" }),
        ],
      },
    };
  };

  it("asks first, naming pending and edited counts; cancel changes nothing", () => {
    withPending();
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Re-scan/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("2 pending candidates will be replaced — 1 of them has edited text that will be lost.");
    expect(dialog).toHaveTextContent("Accept a candidate to keep it.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(extractMutate).not.toHaveBeenCalled();
  });

  it("confirm starts the run", () => {
    withPending();
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Re-scan/ }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Re-scan/ }));
    expect(extractMutate).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("with no pending candidates the run starts without asking", () => {
    list = { data: { scan: SCAN, scanning: false, candidates: [cand({ status: "accepted" })] } };
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Re-scan/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(extractMutate).toHaveBeenCalledTimes(1);
  });
});

describe("sidebar", () => {
  it("lists Conventions under SKILLS LAB", () => {
    const lab = NAV.find((g) => g.section === "SKILLS LAB")!;
    expect(lab.items.find((i) => i.key === "conventions")).toMatchObject({ href: "/repos/:repoId/conventions" });
  });
});
