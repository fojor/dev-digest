import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { SkillImportPreview } from "@devdigest/shared";
import skills from "../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const PREVIEW: SkillImportPreview = {
  name: "api-contract",
  description: "Flag breaking changes to public routes.",
  type: "custom",
  body: "# Rules\n- check signatures",
  source_file: "api-contract/SKILL.md",
  ignored_files: [
    { path: "api-contract/scripts/install.sh", executable: true },
    { path: "api-contract/references/rest.md", executable: false },
  ],
  warnings: ["1 executable file(s) in the archive were ignored and never run."],
};
const previewMutate = vi.fn((_input: unknown, opts: { onSuccess: (p: SkillImportPreview) => void }) =>
  opts.onSuccess(PREVIEW),
);
const createMutate = vi.fn((_input: unknown, opts: { onSuccess: (s: { id: string; name: string }) => void }) =>
  opts.onSuccess({ id: "new-id", name: "api-contract" }),
);

vi.mock("@/lib/hooks/skills", () => ({
  useImportPreview: () => ({ mutate: previewMutate, isPending: false }),
  useCreateSkill: () => ({ mutate: createMutate, isPending: false }),
}));

import { ImportSkillDrawer } from "./ImportSkillDrawer";

afterEach(cleanup);

describe("ImportSkillDrawer", () => {
  it("previews the upload, lists ignored files, and saves only on confirm as imported", async () => {
    const onSaved = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ skills }}>
        <ToastProvider>
          <ImportSkillDrawer onClose={() => {}} onSaved={onSaved} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("You are adding someone else's instructions")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save skill/ })).toBeDisabled();

    const file = new File(["zip-bytes"], "api-contract.zip", { type: "application/zip" });
    fireEvent.change(screen.getByLabelText("Skill file"), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByDisplayValue("api-contract")).toBeInTheDocument());
    expect(previewMutate.mock.calls[0]![0]).toEqual({
      filename: "api-contract.zip",
      content_base64: btoa("zip-bytes"),
    });
    expect(screen.getByText("api-contract/scripts/install.sh")).toBeInTheDocument();
    expect(screen.getByText("executable — not run")).toBeInTheDocument();
    expect(createMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Save skill/ }));
    expect(createMutate.mock.calls[0]![0]).toEqual({
      name: "api-contract",
      description: "Flag breaking changes to public routes.",
      type: "custom",
      body: "# Rules\n- check signatures",
      source: "imported",
      source_file: "api-contract/SKILL.md",
    });
    expect(onSaved).toHaveBeenCalledWith("new-id");
  });
});
