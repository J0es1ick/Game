export function prepareChronicleList(list: HTMLElement, key: string, label: string): void {
  list.classList.add("chronicle-scroll-list");
  list.dataset.chronicleList = key;
  list.dataset.focusKey = `chronicle:${key}`;
  list.tabIndex = 0;
  list.setAttribute("role", "region");
  list.setAttribute("aria-label", label);
}

export function rememberChronicleScroll(root: HTMLElement): () => void {
  const positions = new Map(Array.from(root.querySelectorAll<HTMLElement>("[data-chronicle-list]"))
    .map((list) => [list.dataset.chronicleList, list.scrollTop]));
  return () => root.querySelectorAll<HTMLElement>("[data-chronicle-list]").forEach((list) => {
    list.scrollTop = positions.get(list.dataset.chronicleList) ?? 0;
  });
}
