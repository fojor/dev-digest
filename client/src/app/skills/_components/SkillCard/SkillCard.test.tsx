import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill } from "@devdigest/shared";
import skills from "../../../../../messages/en/skills.json";
import { SkillCard } from "./SkillCard";

afterEach(cleanup);

const SKILL: Skill = {
  id: "s1",
  name: "api-contract-guard",
  description: "Flag breaking route changes.",
  type: "convention",
  source: "imported",
  body: "x",
  enabled: true,
  version: 1,
};

const renderCard = (props: Partial<React.ComponentProps<typeof SkillCard>> = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ skills }}>
      <SkillCard skill={SKILL} onClick={() => {}} onToggle={() => {}} {...props} />
    </NextIntlClientProvider>,
  );

describe("SkillCard", () => {
  it("shows the source and the batch stats row", () => {
    renderCard({ stats: { skill_id: "s1", used_by: 3, pull_rate: 0.8, accept_rate: 0.25 } });
    expect(screen.getByText("Imported")).toBeInTheDocument();
    expect(screen.getByText("3 agents · 80% pull · 25% accept")).toBeInTheDocument();
  });

  it("renders unknown rates and missing stats as dashes", () => {
    renderCard({ stats: { skill_id: "s1", used_by: 1, pull_rate: null, accept_rate: null } });
    expect(screen.getByText("1 agent · — pull · — accept")).toBeInTheDocument();
    cleanup();
    renderCard({ skill: { ...SKILL, source: "manual" } });
    expect(screen.getByText("Manual")).toBeInTheDocument();
    expect(screen.getByText("— agents · — pull · — accept")).toBeInTheDocument();
  });

  it("has no delete control without onDelete", () => {
    renderCard();
    expect(screen.queryByRole("button", { name: "Delete skill" })).not.toBeInTheDocument();
  });

  it("the trash icon reports delete without selecting the card", () => {
    const onClick = vi.fn();
    const onDelete = vi.fn();
    renderCard({ onClick, onDelete });
    const trash = screen.getByRole("button", { name: "Delete skill" });
    fireEvent.click(trash);
    fireEvent.keyDown(trash, { key: "Enter" });
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("disables the trash icon while deleting", () => {
    renderCard({ onDelete: () => {}, deleting: true });
    expect(screen.getByRole("button", { name: "Delete skill" })).toBeDisabled();
  });
});
