import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { AgentSkillLink, Skill } from "@devdigest/shared";
import agents from "../../../../../../../../messages/en/agents.json";
import skillsMessages from "../../../../../../../../messages/en/skills.json";

const mutate = vi.fn();
let links: AgentSkillLink[] = [];
const skill = (id: string, name: string, extra: Partial<Skill> = {}): Skill => ({
  id,
  name,
  description: "",
  type: "rubric",
  source: "manual",
  body: "b",
  enabled: true,
  version: 1,
  ...extra,
});
const SKILLS = [skill("s1", "pr-quality-rubric"), skill("s2", "edge-cases", { type: "security" }), skill("s3", "flaky-tests", { enabled: false })];

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: SKILLS, isLoading: false, isError: false }),
  useAgentSkillLinks: () => ({ data: links, isLoading: false, isError: false }),
  useSetAgentSkills: () => ({ mutate }),
}));

import { SkillsTab } from "./SkillsTab";

afterEach(cleanup);
beforeEach(() => {
  mutate.mockReset();
  links = [
    { agent_id: "a", skill_id: "s2", order: 0, enabled: true },
    { agent_id: "a", skill_id: "s1", order: 1, enabled: false },
  ];
});

const renderTab = () =>
  render(
    <NextIntlClientProvider locale="en" messages={{ agents, skills: skillsMessages }}>
      <SkillsTab agentId="a" />
    </NextIntlClientProvider>,
  );
const rowNames = () => screen.getAllByTestId("agent-skill-row").map((r) => within(r).getByText(/-/).textContent);

describe("Agent editor — Skills tab", () => {
  it("lists linked skills in order, then unlinked ones, with the enabled count", () => {
    renderTab();
    expect(rowNames()).toEqual(["edge-cases", "pr-quality-rubric", "flaky-tests"]);
    expect(screen.getByText("1 of 3 enabled")).toBeInTheDocument();
    expect(screen.getByText("off globally")).toBeInTheDocument();
  });

  it("checking a skill saves the whole ordered set, keeping positions", () => {
    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: "pr-quality-rubric" }));
    expect(mutate).toHaveBeenCalledWith([
      { skill_id: "s2", enabled: true },
      { skill_id: "s1", enabled: true },
      { skill_id: "s3", enabled: false },
    ]);
  });

  it("Alt+ArrowDown on the handle moves a skill later in the prompt", () => {
    renderTab();
    fireEvent.keyDown(screen.getByRole("button", { name: "Drag to reorder edge-cases" }), {
      key: "ArrowDown",
      altKey: true,
    });
    expect(mutate).toHaveBeenCalledWith([
      { skill_id: "s1", enabled: false },
      { skill_id: "s2", enabled: true },
      { skill_id: "s3", enabled: false },
    ]);
  });

  it("filtering hides rows and disables reordering", () => {
    renderTab();
    fireEvent.change(screen.getByLabelText("Filter skills…"), { target: { value: "flaky" } });
    expect(rowNames()).toEqual(["flaky-tests"]);
    expect(screen.getByRole("button", { name: "Drag to reorder flaky-tests" })).toBeDisabled();
  });
});
