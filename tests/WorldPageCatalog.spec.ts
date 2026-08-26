import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pageFromHash, pageHash } from "../src/web/UiRuntime";
import {
  WORLD_PAGE_IDS,
  WORLD_PAGE_NAV_GROUP,
  isWorldPageAvailable,
} from "../src/web/WorldPageCatalog";

describe("world page catalog", () => {
  it("routes the legacy page through a GitHub Pages-safe hash", () => {
    expect(pageHash("legacy")).toBe("#/legacy");
    expect(pageFromHash("#/legacy", WORLD_PAGE_IDS, "map")).toBe("legacy");
  });

  it("keeps the shop top-level and legacy inside the equipment group", () => {
    expect(WORLD_PAGE_NAV_GROUP.shop).toBe("shop");
    expect(WORLD_PAGE_NAV_GROUP.legacy).toBe("equipment");
  });

  it("gates legacy behind equipment-legacy without gating the shop", () => {
    const locked = (feature: "contracts" | "equipment-legacy") => feature === "contracts";
    const unlocked = () => true;

    expect(isWorldPageAvailable("legacy", locked)).toBe(false);
    expect(isWorldPageAvailable("legacy", unlocked)).toBe(true);
    expect(isWorldPageAvailable("shop", locked)).toBe(true);
  });
});

describe("world page markup", () => {
  const html = readFileSync(resolve(process.cwd(), "src/web/index.html"), "utf8");
  const primaryNavigation = html.match(/<div class="nav-primary"[\s\S]*?<\/div>/)?.[0] ?? "";
  const secondaryNavigation = html.match(/<div class="nav-secondary"[\s\S]*?<\/div>/)?.[0] ?? "";
  const forgePage = html.match(/<section class="page" id="page-forge"[\s\S]*?<\/section>/)?.[0] ?? "";
  const legacyPage = html.match(/<section class="page" id="page-legacy"[\s\S]*?<section class="page" id="page-skills"/)?.[0] ?? "";

  it("renders shop only in primary navigation and legacy in equipment navigation", () => {
    expect(primaryNavigation).toContain('data-nav-default="shop"');
    expect(secondaryNavigation).not.toContain('data-page="shop"');
    expect(secondaryNavigation).toContain('data-page="legacy" data-nav-group="equipment"');
  });

  it("keeps forge focused and gives legacy both workshops", () => {
    expect(forgePage).toContain('id="forge-grid"');
    expect(forgePage).not.toContain("loot-target-workshop");
    expect(forgePage).not.toContain("relic-workshop");
    expect(legacyPage).toContain('id="loot-target-workshop"');
    expect(legacyPage).toContain('id="relic-workshop"');
  });
});
