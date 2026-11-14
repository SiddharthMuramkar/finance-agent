// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RowActions } from "./admin-controls";

// /admin's row buttons (ADR 0014): Approve posts at once; Deny and Remove access ask first, in an inline confirm modelled
// on Settings' Start over (StartOverButton) and the Topic restart confirm: focus lands on Cancel, the safe choice, and
// only the confirm's own form posts `confirm=deny`.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

const buttons = () => [...host.querySelectorAll<HTMLButtonElement>("button")];
const button = (name: string) => buttons().find((b) => b.textContent === name)!;
const dialog = () => host.querySelector<HTMLElement>('[role="alertdialog"]');
const click = (el: HTMLElement) => act(async () => el.click());

async function mount(props: Parameters<typeof RowActions>[0]) {
  await act(async () => root.render(<RowActions {...props} />));
}

beforeEach(() => {
  host = document.createElement("ul");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("a waiting person's buttons", () => {
  it("Approve is a plain form post with no confirm; Deny asks first", async () => {
    await mount({ userId: "u-noor", email: "noor@icloud.com", kind: "deny" });
    expect(buttons().map((b) => b.textContent)).toEqual(["Approve", "Deny"]);
    const approve = button("Approve").closest("form")!;
    expect(approve.getAttribute("action")).toBe("/api/admin/access");
    expect(approve.getAttribute("method")).toBe("post");
    expect(Object.fromEntries(new FormData(approve))).toEqual({ userId: "u-noor", action: "approve" });
    expect(button("Approve").className).toMatch(/^btn btn-secondary btn-sm/);
    expect(button("Deny").className).toMatch(/^btn btn-secondary btn-sm/);
    expect(button("Deny").closest("form")).toBeNull();
    expect(dialog()).toBeNull();
    expect(host.querySelector('input[name="confirm"]')).toBeNull();
  });

  it("Deny opens a confirm that names the email, lands on Cancel, and posts confirm=deny only from its danger button", async () => {
    await mount({ userId: "u-noor", email: "noor@icloud.com", kind: "deny" });
    await click(button("Deny"));
    expect(button("Deny").getAttribute("aria-expanded")).toBe("true");
    const d = dialog()!;
    expect(d.textContent).toContain("Deny noor@icloud.com?");
    expect(d.textContent).toContain("Nothing is sent to them.");
    expect(document.activeElement?.textContent).toBe("Cancel");
    const yes = button("Yes, deny");
    expect(yes.className).toMatch(/\bbtn-danger\b/);
    expect(yes.getAttribute("type")).toBe("submit");
    const form = yes.closest("form")!;
    expect(form.getAttribute("action")).toBe("/api/admin/access");
    expect(form.getAttribute("method")).toBe("post");
    expect(Object.fromEntries(new FormData(form))).toEqual({ userId: "u-noor", action: "deny", confirm: "deny" });
  });

  it("Cancel closes the confirm, posts nothing, and gives focus back to Deny", async () => {
    await mount({ userId: "u-noor", email: "noor@icloud.com", kind: "deny" });
    await click(button("Deny"));
    await click(button("Cancel"));
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(button("Deny"));
    expect(button("Deny").getAttribute("aria-expanded")).toBe("false");
  });
});

describe("a person with access", () => {
  it("has only Remove access, an outline danger button, whose confirm says they are signed out and their progress is kept", async () => {
    await mount({ userId: "u-asha", email: "asha@gmail.com", kind: "remove" });
    expect(buttons().map((b) => b.textContent)).toEqual(["Remove access"]);
    expect(button("Remove access").className).toContain("btn-danger-outline");
    await click(button("Remove access"));
    const d = dialog()!;
    expect(d.textContent).toContain("Remove access for asha@gmail.com?");
    expect(d.textContent).toContain("They are signed out at once and can't sign back in. Their progress is kept.");
    expect(Object.fromEntries(new FormData(button("Yes, remove access").closest("form")!))).toEqual({ userId: "u-asha", action: "deny", confirm: "deny" });
  });
});
