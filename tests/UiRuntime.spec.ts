import { pageFromHash, pageHash } from "../src/web/UiRuntime";

describe("static application routes", () => {
  const pages = ["map", "inventory", "elite"] as const;

  test("creates and parses GitHub Pages-safe hash routes", () => {
    expect(pageHash("inventory")).toBe("#/inventory");
    expect(pageFromHash("#/elite", pages, "map")).toBe("elite");
    expect(pageFromHash("#/inventory?view=all", pages, "map")).toBe(
      "inventory",
    );
  });

  test("handles absent, unknown and malformed routes", () => {
    expect(pageFromHash("", pages, "map")).toBe("map");
    expect(pageFromHash("#/unknown", pages, "map")).toBe("map");
    expect(pageFromHash("#/%E0%A4%A", pages, "map")).toBe("map");
    expect(pageHash("Архив эпох")).toBe(
      "#/" + encodeURIComponent("Архив эпох"),
    );
  });
});
