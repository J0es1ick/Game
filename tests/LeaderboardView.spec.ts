import { appendEraVeteranBadge, eraVeteranBadgeCopy } from "../src/web/LeaderboardView";

describe("leaderboard era veteran badge", () => {
  it("describes a carried fighter with the source era number", () => {
    expect(eraVeteranBadgeCopy(3)).toEqual({
      text: "эп. 3",
      label: "Ветеран, перенесённый из эпохи 3",
    });
    expect(eraVeteranBadgeCopy(undefined)).toBeUndefined();
    expect(eraVeteranBadgeCopy(0)).toBeUndefined();
    expect(eraVeteranBadgeCopy(1.5)).toBeUndefined();
  });

  it("adds matching visible, title and accessible labels", () => {
    const attributes = new Map<string, string>();
    const badge = {
      className: "",
      textContent: "",
      title: "",
      setAttribute: (name: string, value: string) => attributes.set(name, value),
    } as unknown as HTMLSpanElement;
    const appended: HTMLSpanElement[] = [];
    const nameCell = {
      ownerDocument: { createElement: () => badge },
      append: (node: HTMLSpanElement) => appended.push(node),
    } as unknown as HTMLTableCellElement;

    expect(appendEraVeteranBadge(nameCell, 7)).toBe(badge);
    expect(appended).toEqual([badge]);
    expect(badge.className).toBe("era-veteran-badge");
    expect(badge.textContent).toBe("эп. 7");
    expect(badge.title).toBe("Ветеран, перенесённый из эпохи 7");
    expect(attributes.get("aria-label")).toBe("Ветеран, перенесённый из эпохи 7");
  });
});
