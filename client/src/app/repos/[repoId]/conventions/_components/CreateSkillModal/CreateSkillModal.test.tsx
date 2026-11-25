import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate, ConventionList, Skill } from "@devdigest/shared";
import conventions from "../../../../../../../messages/en/conventions.json";
import { ToastProvider } from "@/lib/toast";
import { ApiError } from "@/lib/api";

let listData: ConventionList;
let skillsData: Skill[];
const createMutate = vi.fn();
const updateMutate = vi.fn();

vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({ refetch: async () => ({ data: listData }) }),
}));
vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ refetch: async () => ({ data: skillsData }) }),
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
  useUpdateSkill: () => ({ mutate: updateMutate, isPending: false }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

const cand = (id: string, o: Partial<ConventionCandidate> = {}): ConventionCandidate => ({
  id,
  rule: `Rule ${id}`,
  original_rule: `Rule ${id}`,
  category: "api layer",
  evidence_path: `src/${id}.ts`,
  evidence_snippet: "x",
  evidence_start_line: 1,
  evidence_end_line: 1,
  confidence: 0.5,
  status: "accepted",
  ...o,
});
const skill = (o: Partial<Skill> = {}): Skill => ({
  id: "s1",
  name: "repo-conventions",
  description: "old",
  type: "convention",
  source: "extracted",
  body: "old body",
  enabled: true,
  version: 3,
  updated_at: "2026-11-20T00:00:00Z",
  ...o,
});

const onClose = vi.fn();
afterEach(cleanup);
beforeEach(() => {
  listData = { scan: null, scanning: false, candidates: [cand("a"), cand("b"), cand("c", { status: "pending" })] };
  skillsData = [];
  createMutate.mockReset();
  updateMutate.mockReset();
  onClose.mockReset();
});

const renderModal = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ conventions }}>
      <ToastProvider>
        <CreateSkillModal repoId="r1" repoName="o/r" onClose={onClose} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
const dialog = () => screen.findByRole("dialog");
const field = (label: string) => within(screen.getByTestId(`field-${label}`)).getByRole(label === "body" ? "textbox" : "textbox");

describe("CreateSkillModal — SCR-03", () => {
  it("refused while scanning: no dialog, a toast, closes (AC-04b)", async () => {
    listData = { ...listData, scanning: true };
    renderModal();
    expect(await screen.findByText("A scan is in progress — try again when it ends.")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onClose).toHaveBeenCalled();
  });

  it("default-create: pre-filled draft, trust warning, enabled off; saves an extracted convention skill (AC-15, AC-18, AC-23)", async () => {
    createMutate.mockImplementation((_i: unknown, o: { onSuccess: () => void }) => o.onSuccess());
    renderModal();
    const d = await dialog();
    expect(d).toHaveTextContent("Merged from 2 accepted conventions in o/r. Everything below is editable before you save.");
    expect(d).toHaveTextContent("These rules come from repository content and will become instructions for reviewer agents");
    expect(d).toHaveTextContent("skip or ignore a class of problems");
    expect(d).toHaveTextContent("Off by default — review the merged body before it reaches an agent's prompt.");
    expect(d).toHaveTextContent("Saved as v1 · added to Skills Lab");
    expect(field("name")).toHaveValue("repo-conventions");
    expect(field("description")).toHaveValue("2 house conventions extracted from o/r");
    expect((field("body") as HTMLTextAreaElement).value).toMatch(/^# repo-conventions\n/);
    expect(within(d).getByRole("switch")).toHaveAttribute("aria-checked", "false");

    fireEvent.click(within(d).getByRole("button", { name: /Create skill/ }));
    await waitFor(() => expect(createMutate).toHaveBeenCalled());
    expect(createMutate.mock.calls[0]![0]).toMatchObject({
      name: "repo-conventions",
      description: "2 house conventions extracted from o/r",
      type: "convention",
      source: "extracted",
      enabled: false,
      evidence_files: ["src/a.ts", "src/b.ts"],
    });
    expect(await screen.findByText("Saved — find it in Skills Lab")).toBeInTheDocument();
    expect(onClose).toHaveBeenCalled();
  });

  it("default-update: warns, starts from the existing enabled state, updates as a new version (AC-19, AC-23)", async () => {
    skillsData = [skill({ name: "Repo-Conventions " })];
    renderModal();
    const d = await dialog();
    expect(d).toHaveTextContent("Updates existing Repo-Conventions to v4 — v3 stays in its history.");
    expect(d).toHaveTextContent("These rules come from repository content");
    expect(within(d).getByRole("switch")).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(d).getByRole("switch"));
    fireEvent.click(within(d).getByRole("button", { name: /Update skill/ }));
    await waitFor(() => expect(updateMutate).toHaveBeenCalled());
    expect(updateMutate.mock.calls[0]![0]).toMatchObject({
      id: "s1",
      patch: { name: "repo-conventions", enabled: false, evidence_files: ["src/a.ts", "src/b.ts"] },
    });
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("renaming switches between update and create", async () => {
    skillsData = [skill({ name: "team-rules", enabled: true })];
    renderModal();
    const d = await dialog();
    expect(within(d).getByRole("button", { name: /Create skill/ })).toBeInTheDocument();
    fireEvent.change(field("name"), { target: { value: "team-rules" } });
    expect(within(d).getByRole("button", { name: /Update skill/ })).toBeInTheDocument();
    expect(within(d).getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it.each([
    ["name", "", "Name is required."],
    ["name", "Repo Conventions", "Use a slug — lowercase letters, digits and dashes."],
    ["name", "a".repeat(101), "Name must be at most 100 characters."],
    ["description", "", "Description is required."],
    ["description", "d".repeat(1001), "Description must be at most 1000 characters."],
    ["body", "", "Body is required."],
  ])("validation: %s=%j blocks the save (AC-17)", async (f, value, message) => {
    renderModal();
    const d = await dialog();
    fireEvent.change(field(f), { target: { value } });
    fireEvent.click(within(d).getByRole("button", { name: /(Create|Update) skill/ }));
    expect(await within(d).findByText(message)).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
    expect(field("description")).toBeInTheDocument();
  });

  it("a manual or imported skill with the name blocks the save (AC-20)", async () => {
    skillsData = [skill({ source: "manual" })];
    renderModal();
    const d = await dialog();
    fireEvent.click(within(d).getByRole("button", { name: /Create skill/ }));
    expect(
      await within(d).findByText("A skill named repo-conventions already exists — choose another name."),
    ).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
    expect(updateMutate).not.toHaveBeenCalled();
  });

  it("refetches before saving and refuses while a scan started meanwhile", async () => {
    renderModal();
    const d = await dialog();
    listData = { ...listData, scanning: true };
    fireEvent.click(within(d).getByRole("button", { name: /Create skill/ }));
    expect(await screen.findByText("A scan is in progress — try again when it ends.")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();
  });

  it("save error shows a banner and keeps the input", async () => {
    createMutate.mockImplementation((_i: unknown, o: { onError: (e: unknown) => void }) =>
      o.onError(new ApiError("Request validation failed", 422, "validation_error")),
    );
    renderModal();
    const d = await dialog();
    fireEvent.change(field("description"), { target: { value: "my text" } });
    fireEvent.click(within(d).getByRole("button", { name: /Create skill/ }));
    expect(await within(d).findByRole("alert")).toHaveTextContent("Could not save the skill");
    expect(field("description")).toHaveValue("my text");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cancel closes without writing (AC-21)", async () => {
    renderModal();
    const d = await dialog();
    fireEvent.click(within(d).getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(createMutate).not.toHaveBeenCalled();
    expect(updateMutate).not.toHaveBeenCalled();
  });
});
