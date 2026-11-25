import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, SkillStats, SkillVersion } from "@devdigest/shared";
import skills from "../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const createMutate = vi.fn();
const updateMutate = vi.fn();
const restoreMutate = vi.fn();
const push = vi.fn();
let tokens: number | undefined = 42;
let stats: SkillStats | undefined;
let versions: SkillVersion[] | undefined;

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/hooks/skills", () => ({
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false, isSuccess: false }),
  useDeleteSkill: () => ({ mutate: vi.fn(), isPending: false }),
  useSkillTokens: () => ({ data: tokens == null ? undefined : { tokens } }),
  useSkillStats: () => ({ data: stats, isLoading: false, isError: false, refetch: vi.fn() }),
  useSkillVersions: () => ({ data: versions, isLoading: false, isError: false, refetch: vi.fn() }),
  useRestoreSkillVersion: () => ({ mutate: restoreMutate, isPending: false }),
}));

import { SkillPanel } from "./SkillPanel";

afterEach(cleanup);
beforeEach(() => {
  createMutate.mockReset();
  updateMutate.mockReset();
  restoreMutate.mockReset();
  push.mockReset();
  tokens = 42;
});

const SKILL: Skill = {
  id: "s1",
  name: "edge-cases",
  description: "Flag missing corner cases.",
  type: "rubric",
  source: "manual",
  body: "# Edge cases\n- empty input",
  enabled: true,
  version: 2,
};

const renderPanel = (props: Partial<React.ComponentProps<typeof SkillPanel>> = {}) =>
  render(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={{ skills }}>
      <ToastProvider>
        <SkillPanel tab="config" onTab={() => {}} onCreated={() => {}} onDeleted={() => {}} {...props} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );

describe("SkillPanel — Config", () => {
  it("creates a skill from the form; Stats / Versions are hidden for a new skill", () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: /Stats/ })).toBeNull();
    expect(screen.getByText(/the agent reads it to decide when the rules apply/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("test-edge-cases"), { target: { value: "my-skill" } });
    fireEvent.change(screen.getByLabelText("Skill body (Markdown)"), { target: { value: "# Do this" } });
    expect(screen.getByText("my-skill.md")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Create skill/ }));
    expect(createMutate.mock.calls[0]![0]).toEqual({
      name: "my-skill",
      description: "",
      type: "custom",
      body: "# Do this",
    });
  });

  it("shows vN, the Configuration heading with Enabled, file header, tokens and line numbers", () => {
    renderPanel({ skill: SKILL });
    expect(screen.getAllByText("v2")).toHaveLength(2); // header + Configuration heading
    expect(screen.getByRole("heading", { name: "Configuration" })).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();
    expect(screen.getByText("edge-cases.md")).toBeInTheDocument();
    expect(screen.getByText("42 tokens")).toBeInTheDocument();
    expect(screen.queryByText("unsaved")).toBeNull();
    expect(screen.getByTestId("line-gutter").textContent).toBe("12");
  });

  it("marks the draft unsaved and saves with the optional note; Save needs a change", () => {
    renderPanel({ skill: SKILL });
    const save = screen.getByRole("button", { name: /^Save$/ });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Skill body (Markdown)"), { target: { value: "# Edge cases v2" } });
    expect(screen.getByText("unsaved")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("What changed?"), { target: { value: "  tighter wording " } });
    fireEvent.click(save);
    expect(updateMutate.mock.calls[0]![0]).toEqual({
      id: "s1",
      patch: {
        name: "edge-cases",
        description: "Flag missing corner cases.",
        type: "rubric",
        body: "# Edge cases v2",
        note: "tighter wording",
      },
    });
  });

  it("sends no note when the field is blank", () => {
    renderPanel({ skill: SKILL });
    fireEvent.change(screen.getByLabelText("Skill body (Markdown)"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
    expect(updateMutate.mock.calls[0]![0].patch).not.toHaveProperty("note");
  });

  it("toggles Enabled from the Configuration heading", () => {
    renderPanel({ skill: SKILL });
    fireEvent.click(screen.getByRole("switch", { name: /Enabled/ }));
    expect(updateMutate.mock.calls[0]![0]).toEqual({ id: "s1", patch: { enabled: false } });
  });
});

describe("SkillPanel — Preview", () => {
  it("renders exactly the prompt block the agent receives", () => {
    renderPanel({ skill: SKILL, tab: "preview" });
    expect(screen.getByRole("heading", { name: "Preview" })).toBeInTheDocument();
    expect(screen.getByText("Rendered as the reviewing agent receives it.")).toBeInTheDocument();
    expect(screen.getByTestId("skill-preview").getAttribute("data-block")).toBe(
      "### Skill: edge-cases\n_Flag missing corner cases._\n\n# Edge cases\n- empty input",
    );
    expect(screen.getByRole("heading", { name: "Skill: edge-cases" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Edge cases" })).toBeInTheDocument();
  });
});

describe("SkillPanel — Stats", () => {
  const STATS: SkillStats = {
    skill_id: "s1",
    used_by: 2,
    pull_rate: 0.75,
    accept_rate: 0.5,
    window_days: 30,
    findings: 6,
    runs_with_skill: 3,
    runs_total: 4,
    agents: [
      { id: "a1", name: "Test Quality Reviewer" },
      { id: "a2", name: "Security" },
    ],
    categories: [
      { category: "test", count: 4 },
      { category: "bug", count: 2 },
      { category: "style", count: 0 },
    ],
  };

  it("shows tiles, agents with Open, and a donut of non-zero categories", () => {
    stats = STATS;
    renderPanel({ skill: SKILL, tab: "stats" });
    expect(screen.getByText("2 agents")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("3 of 4 runs")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("FINDINGS (30D)")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("Test Quality Reviewer")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Open/ })[0]!);
    expect(push).toHaveBeenCalledWith("/agents/a1?tab=skills");
    const legend = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(legend).toEqual(["Test4", "Bug2"]);
  });

  it("renders the empty states: dashes, no agents, no findings", () => {
    stats = {
      ...STATS,
      used_by: 0,
      pull_rate: null,
      accept_rate: null,
      findings: 0,
      runs_with_skill: 0,
      runs_total: 0,
      agents: [],
      categories: [],
    };
    renderPanel({ skill: SKILL, tab: "stats" });
    expect(screen.getByText("0 agents")).toBeInTheDocument();
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getByText("No agent has this skill enabled.")).toBeInTheDocument();
    expect(screen.getByText("No findings attributed to this skill in the last 30 days.")).toBeInTheDocument();
  });
});

describe("SkillPanel — Versions", () => {
  const V: SkillVersion[] = [
    { version: 2, name: "edge-cases", description: "Flag missing corner cases.", type: "rubric", body: SKILL.body, note: "Edited body", kind: "edit", created_at: "2026-11-24T10:00:00Z", current: true },
    // A Phase 1 row: body only.
    { version: 1, body: "# Edge cases", created_at: "2026-11-20T10:00:00Z", current: false },
  ];

  it("lists versions newest first with Current; old rows fall back to a dash note", () => {
    versions = V;
    renderPanel({ skill: SKILL, tab: "versions" });
    expect(screen.getByRole("heading", { name: "Version history" })).toBeInTheDocument();
    expect(screen.getByText("2 versions")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
    expect(screen.getByText("Edited body")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Diff/ })).toHaveLength(1);
  });

  it("Diff shows the body changes against the current version", () => {
    versions = V;
    renderPanel({ skill: SKILL, tab: "versions" });
    fireEvent.click(screen.getByRole("button", { name: /Diff/ }));
    const rows = Array.from(screen.getByTestId("version-diff").querySelectorAll("[data-kind]")).map(
      (el) => `${el.getAttribute("data-kind")}:${el.textContent?.slice(1)}`,
    );
    expect(rows).toEqual(["same:# Edge cases", "add:- empty input"]);
  });

  it("Restore asks first, then reseeds the editor from the new version", () => {
    versions = V;
    const onTab = vi.fn();
    const confirm = vi.spyOn(window, "confirm");
    confirm.mockReturnValueOnce(false);
    const view = renderPanel({ skill: SKILL, tab: "versions", onTab });
    fireEvent.click(screen.getByRole("button", { name: /Restore/ }));
    expect(restoreMutate).not.toHaveBeenCalled();

    confirm.mockReturnValueOnce(true);
    restoreMutate.mockImplementation((_v, opts: { onSuccess: (s: Skill) => void }) =>
      opts.onSuccess({ ...SKILL, body: "# Edge cases", version: 3 }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Restore/ }));
    expect(restoreMutate.mock.calls[0]![0]).toEqual({ id: "s1", version: 1 });
    expect(onTab).toHaveBeenCalledWith("config");
    // The parent follows onTab; the same panel instance now shows the restored body.
    view.rerender(
      <NextIntlClientProvider locale="en" timeZone="UTC" messages={{ skills }}>
        <ToastProvider>
          <SkillPanel skill={SKILL} tab="config" onTab={onTab} onCreated={() => {}} onDeleted={() => {}} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByLabelText("Skill body (Markdown)")).toHaveValue("# Edge cases");
    confirm.mockRestore();
  });
});
