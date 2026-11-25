import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import skills from "../../../../../messages/en/skills.json";
import shell from "../../../../../messages/en/shell.json";
import { ToastProvider } from "@/lib/toast";
import type * as SkillPanelModule from "../SkillPanel";

const replace = vi.fn();
const deleteMutate = vi.fn();
let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
  usePathname: () => "/skills",
}));
// The page chrome is not under test.
vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
// The side panel has its own tests; stub it to a marker.
vi.mock("../SkillPanel", async (importOriginal) => ({
  ...(await importOriginal<typeof SkillPanelModule>()),
  SkillPanel: ({ skill }: { skill?: Skill }) => <div data-testid="panel">{skill?.name ?? "new"}</div>,
}));

const mk = (id: string, name: string): Skill => ({
  id,
  name,
  description: "",
  type: "rubric",
  source: "manual",
  body: "x",
  enabled: true,
  version: 1,
});
const SKILLS = [mk("a", "alpha"), mk("b", "beta")];

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false, refetch: vi.fn() }),
  useSkillStatsSummary: () => ({ data: [] }),
  useUpdateSkill: () => ({ mutate: vi.fn() }),
  useDeleteSkill: () => ({ mutate: deleteMutate, isPending: false, variables: undefined }),
}));

import { SkillsView } from "./SkillsView";

afterEach(cleanup);
beforeEach(() => {
  replace.mockReset();
  deleteMutate.mockReset();
  search = "";
  vi.restoreAllMocks();
});

const renderView = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ skills, shell }}>
      <ToastProvider>
        <SkillsView />
      </ToastProvider>
    </NextIntlClientProvider>,
  );

const trashOf = (i: number) => screen.getAllByRole("button", { name: "Delete skill" })[i]!;

describe("SkillsView — card delete", () => {
  it("cancelling the confirm deletes nothing", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderView();
    fireEvent.click(trashOf(0));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('"alpha"'));
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("deleting the selected skill closes the panel", () => {
    search = "skill=a";
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteMutate.mockImplementation((_id: string, opts: { onSuccess: () => void }) => opts.onSuccess());
    renderView();
    expect(screen.getByTestId("panel")).toHaveTextContent("alpha");
    fireEvent.click(trashOf(0));
    expect(deleteMutate).toHaveBeenCalledWith("a", expect.anything());
    expect(replace).toHaveBeenCalledWith("/skills");
  });

  it("deleting another skill keeps the selection and does not select the card", () => {
    search = "skill=a";
    vi.spyOn(window, "confirm").mockReturnValue(true);
    deleteMutate.mockImplementation((_id: string, opts: { onSuccess: () => void }) => opts.onSuccess());
    renderView();
    fireEvent.click(trashOf(1));
    expect(deleteMutate).toHaveBeenCalledWith("b", expect.anything());
    expect(replace).not.toHaveBeenCalled();
  });
});
