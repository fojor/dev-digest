import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import conventions from "../../../../../../../messages/en/conventions.json";
import { ToastProvider } from "@/lib/toast";
import { ApiError } from "@/lib/api";

const mutate = vi.fn();
vi.mock("@/lib/hooks/conventions", () => ({
  usePatchConvention: () => ({ mutate, isPending: false }),
}));

import { CandidateCard } from "./CandidateCard";

const CAND: ConventionCandidate = {
  id: "c1",
  rule: "Errors are surfaced via toast",
  original_rule: "Errors are surfaced via toast",
  category: "error handling",
  evidence_path: "client/src/context/AppContext.jsx",
  evidence_snippet: "toast.error(error.message)",
  evidence_start_line: 25,
  evidence_end_line: 27,
  evidence_commit_sha: "abc123",
  confidence: 0.6,
  status: "pending",
};

afterEach(cleanup);
beforeEach(() => {
  mutate.mockReset();
});

const REPO = { full_name: "acme/shop", default_branch: "main" };

const renderCard = (
  o: Partial<ConventionCandidate> = {},
  readOnly = false,
  repo: { full_name: string; default_branch: string } | null = REPO,
) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions }}>
      <ToastProvider>
        <CandidateCard repoId="r1" candidate={{ ...CAND, ...o }} readOnly={readOnly} repo={repo} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );

describe("CandidateCard (AC-06, AC-09..AC-12, AC-04b)", () => {
  it("pending: rule, category, evidence header with lines, fragment, confidence %", () => {
    renderCard();
    expect(screen.getByText("Errors are surfaced via toast")).toBeInTheDocument();
    expect(screen.getByText("error handling")).toBeInTheDocument();
    expect(screen.getByText("client/src/context/AppContext.jsx:25-27")).toBeInTheDocument();
    expect(screen.getByText("toast.error(error.message)")).toBeInTheDocument();
    expect(screen.getByText("60% confidence")).toBeInTheDocument();
    expect(screen.queryByText("Accepted")).toBeNull();
    expect(screen.queryByText("Rejected")).toBeNull();
  });

  it("accept sends status accepted; accepted card is marked", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Accept/ }));
    expect(mutate).toHaveBeenCalledWith({ id: "c1", patch: { status: "accepted" } }, expect.anything());
    cleanup();
    renderCard({ status: "accepted" });
    expect(screen.getByTestId("candidate-card")).toHaveAttribute("data-status", "accepted");
    expect(screen.getByText("Accepted")).toBeInTheDocument();
  });

  it("reject sends status rejected; rejected card stays, dimmed and marked", () => {
    renderCard({ status: "accepted" });
    fireEvent.click(screen.getByRole("button", { name: /Reject/ }));
    expect(mutate).toHaveBeenCalledWith({ id: "c1", patch: { status: "rejected" } }, expect.anything());
    cleanup();
    renderCard({ status: "rejected" });
    const card = screen.getByTestId("candidate-card");
    expect(card).toHaveAttribute("data-status", "rejected");
    expect(card.style.opacity).not.toBe("");
    expect(screen.getByText("Rejected")).toBeInTheDocument();
  });

  it("inline edit: counter, save sends the trimmed rule; cancel restores", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Edit rule/ }));
    const box = screen.getByRole("textbox");
    fireEvent.change(box, { target: { value: "  Use toast for API errors  " } });
    expect(screen.getByText("28 / 1000")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mutate).toHaveBeenCalledWith({ id: "c1", patch: { rule: "Use toast for API errors" } }, expect.anything());

    cleanup();
    mutate.mockClear();
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Edit rule/ }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "changed" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Errors are surfaced via toast")).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it.each([["   "], ["x".repeat(1001)]])("invalid rule is refused with the limit, previous text kept (AC-12)", (value) => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Edit rule/ }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByText("The rule must be between 1 and 1000 characters.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Errors are surfaced via toast")).toBeInTheDocument();
  });

  it("server refusal shows a toast (AC-04b)", () => {
    mutate.mockImplementation((_v: unknown, o: { onError: (e: unknown) => void }) =>
      o.onError(new ApiError("x", 409, "conventions_scan_in_progress")),
    );
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: /Accept/ }));
    expect(screen.getByText("A scan is already running for this repo.")).toBeInTheDocument();
  });

  it("read-only while scanning: accept, reject and edit disabled", () => {
    renderCard({}, true);
    expect(screen.getByRole("button", { name: /Accept/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Reject/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Edit rule/ })).toBeDisabled();
  });
});

describe("EvidenceSnippet", () => {
  it("single-line range shows one line number; copy writes the fragment", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    renderCard({ evidence_start_line: 25, evidence_end_line: 25 });
    expect(screen.getByText("client/src/context/AppContext.jsx:25")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy fragment" }));
    expect(writeText).toHaveBeenCalledWith("toast.error(error.message)");
  });

  it("the evidence header links to the lines on GitHub, pinned to the verified commit, in a new tab", () => {
    renderCard();
    const link = screen.getByRole("link", { name: /client\/src\/context\/AppContext\.jsx:25-27/ });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/shop/blob/abc123/client/src/context/AppContext.jsx#L25-L27",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("without a verified commit the link falls back to the default branch", () => {
    renderCard({ evidence_commit_sha: null, evidence_start_line: 25, evidence_end_line: 25 });
    expect(screen.getByRole("link", { name: /AppContext\.jsx:25/ })).toHaveAttribute(
      "href",
      "https://github.com/acme/shop/blob/main/client/src/context/AppContext.jsx#L25",
    );
  });

  it("while the repo is unknown the header is plain text", () => {
    renderCard({}, false, null);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("client/src/context/AppContext.jsx:25-27")).toBeInTheDocument();
  });
});
