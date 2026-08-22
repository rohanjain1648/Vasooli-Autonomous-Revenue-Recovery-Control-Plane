import { describe, it, expect } from "vitest";
import { loadPlaybookCatalog } from "./playbooks.js";

describe("loadPlaybookCatalog", () => {
  it("loads every yaml playbook from the repo-root playbooks directory", () => {
    const catalog = loadPlaybookCatalog();
    expect(catalog.playbooks.length).toBeGreaterThanOrEqual(5);
  });

  it("flattens arms with globally-unique ids", () => {
    const catalog = loadPlaybookCatalog();
    const ids = catalog.arms.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives control arms zero cost regardless of playbook cost", () => {
    const catalog = loadPlaybookCatalog();
    const controlArms = catalog.arms.filter((a) => a.name === "control");
    expect(controlArms.length).toBeGreaterThan(0);
    for (const arm of controlArms) expect(arm.costPaise).toBe(0n);
  });

  it("covers all four leakage categories", () => {
    const catalog = loadPlaybookCatalog();
    for (const category of [
      "payment_failure",
      "checkout_abandonment",
      "subscription_failure",
      "b2b_receivable",
    ]) {
      expect(catalog.armsByCategory.get(category as never)?.length).toBeGreaterThan(0);
    }
  });
});
