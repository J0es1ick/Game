import type { SeasonNotice } from "./SeasonNotices";
import { createElement as element, query } from "./UiDom";
import type { ModalController } from "./UiRuntime";

export function openSeasonChanges(notice: SeasonNotice, modal: ModalController): void {
  const layer = query("#season-changes-layer");
  query("#season-changes-kicker").textContent = `${notice.kind === "world" ? `ЭПОХА ${notice.cycle} · МИРОВОЙ СЕЗОН` : "ЛИГА КОРОНЫ"} ${notice.number} · ДНИ ${notice.startsDay}–${notice.endsDay}`;
  query("#season-changes-title").textContent = notice.title;
  query("#season-changes-description").textContent = notice.description;
  query("#season-changes-previous").textContent = `Сравнение с условиями: ${notice.previousTitle}`;
  query("#season-changes-note").textContent = notice.note;
  const body = query("#season-changes-rows");
  body.replaceChildren(...notice.changes.map((change) => {
    const row = element("tr", change.before !== change.after ? "is-changed" : "");
    const label = element("th");
    label.scope = "row";
    label.append(element("strong", "", change.label));
    if (change.description) label.append(element("p", "", change.description));
    row.append(label, element("td", "", change.before), element("td", "", change.after));
    return row;
  }));
  const close = () => modal.close(layer);
  query("#close-season-changes").onclick = close;
  query("#confirm-season-changes").onclick = close;
  modal.open(layer, { initialFocus: "#confirm-season-changes", dismissOnBackdrop: true, onRequestClose: close });
}
