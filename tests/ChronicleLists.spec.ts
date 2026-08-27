import { prepareChronicleList, rememberChronicleScroll } from "../src/web/ChronicleLists";

function list(key = "relics", scrollTop = 0): HTMLElement {
  return {
    dataset: { chronicleList: key }, scrollTop,
    classList: { add: jest.fn() }, setAttribute: jest.fn(),
  } as unknown as HTMLElement;
}

describe("Chronicle lists", () => {
  test("scroll regions are named, keyboard reachable and retain stable focus keys", () => {
    const target = list();
    prepareChronicleList(target, "mentors", "Все наставники: 25");
    expect(target.tabIndex).toBe(0);
    expect(target.dataset.focusKey).toBe("chronicle:mentors");
    expect(target.dataset.chronicleList).toBe("mentors");
    expect(target.classList.add).toHaveBeenCalledWith("chronicle-scroll-list");
    expect(target.setAttribute).toHaveBeenCalledWith("role", "region");
    expect(target.setAttribute).toHaveBeenCalledWith("aria-label", "Все наставники: 25");
  });

  test("rerender keeps every independently scrolled list at its previous position", () => {
    let children = [list("relics", 900), list("mentors", 340), list("veterans", 1300)];
    const root = { querySelectorAll: () => children } as unknown as HTMLElement;
    const restore = rememberChronicleScroll(root);
    children = [list("veterans"), list("mentors"), list("relics"), list("dynasties")];
    restore();
    expect(children.map((child) => child.scrollTop)).toEqual([1300, 340, 900, 0]);
  });
});
