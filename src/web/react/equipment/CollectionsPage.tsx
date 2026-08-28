import { useState } from "react";
import {
  EQUIPMENT_SETS,
  ITEM_TEMPLATES,
  SLOT_LABELS,
} from "../../../catalogs/WorldCatalog";
import { PageHeading } from "../components/common";
import { useGame } from "../state/GameContext";
import { EquipmentArt } from "./Artwork";
import { itemTemplates, pageSlice } from "./model";
import { Pagination } from "./shared";

export function CollectionsPage() {
  const { game } = useGame();
  const [page, setPage] = useState(0);
  const [classOnly, setClassOnly] = useState(false);
  const [search, setSearch] = useState("");
  const found = new Set(game.save.discoveredItems);
  const hero = game.save.hero;
  const percent = Math.round((found.size / ITEM_TEMPLATES.length) * 100);
  const sets = EQUIPMENT_SETS.filter(
    (set) =>
      (!classOnly ||
        set.classes === "all" ||
        set.classes.includes(hero.classId)) &&
      (!search.trim() ||
        set.name
          .toLocaleLowerCase("ru")
          .includes(search.trim().toLocaleLowerCase("ru"))),
  );
  const shown = pageSlice(sets, page, 8);
  return (
    <section className="page active" id="page-collections">
      <PageHeading
        eyebrow="ПОСТОЯННАЯ ИСТОРИЯ НАХОДОК"
        title="Коллекции и комплекты"
      >
        <p>
          Находка остаётся отмеченной навсегда, даже если предмет продан.
          Комплекты объясняют, что собирать и под какой стиль игры.
        </p>
      </PageHeading>
      <div className="collection-overview" id="collection-overview">
        <strong>
          {found.size} / {ITEM_TEMPLATES.length}
        </strong>
        <div className="collection-meter">
          <i style={{ width: `${percent}%` }} />
        </div>
        <p>
          {percent}% каталога найдено. Проданные предметы остаются в летописи.
        </p>
      </div>
      <div className="collection-filters filter-row">
        <label>
          Найти комплект{" "}
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="auto-equip-toggle">
          <input
            type="checkbox"
            checked={classOnly}
            onChange={(event) => {
              setClassOnly(event.target.checked);
              setPage(0);
            }}
          />{" "}
          Только для моего класса
        </label>
      </div>
      <Pagination {...shown} onChange={setPage} />
      <div className="sets-list" id="sets-list">
        {shown.items.map((set) => {
          const relevant =
            set.classes === "all" || set.classes.includes(hero.classId);
          const discovered = set.pieces.filter((id) => found.has(id)).length;
          return (
            <article
              key={set.id}
              className={`set-card${relevant ? " recommended" : ""}`}
            >
              <header>
                <div>
                  <small>
                    {relevant ? "ПОДХОДИТ ВАШЕМУ КЛАССУ" : "ДРУГОЙ КЛАСС"}
                  </small>
                  <h2>{set.name}</h2>
                  <p>{set.description}</p>
                </div>
                <strong className="set-count">
                  {discovered}/{set.pieces.length}
                </strong>
              </header>
              <p className="set-purpose">{set.purpose}</p>
              <div className="collection-pieces">
                {set.pieces.map((id) => {
                  const template = itemTemplates.get(id);
                  if (!template) return null;
                  return (
                    <div
                      key={id}
                      className={found.has(id) ? "found" : "missing"}
                    >
                      {found.has(id) ? (
                        <EquipmentArt
                          slot={template.slot}
                          classId={hero.classId}
                          className="collection-art equipment-art"
                          item={{
                            ...template,
                            templateId: template.id,
                            rarity: "common",
                          }}
                        />
                      ) : (
                        <span className="collection-missing">?</span>
                      )}
                      <div>
                        <strong>
                          {found.has(id) ? template.name : "Не найдено"}
                        </strong>
                        <small>{SLOT_LABELS[template.slot]}</small>
                      </div>
                    </div>
                  );
                })}
              </div>
              <ol className="set-bonus-list">
                {set.bonuses.map((bonus) => (
                  <li
                    key={bonus.pieces}
                    className={discovered >= bonus.pieces ? "active" : ""}
                  >
                    <b>{bonus.pieces} ч.</b>
                    {bonus.description}
                  </li>
                ))}
              </ol>
            </article>
          );
        })}
        {!sets.length && (
          <p className="empty-copy">
            Комплекты по выбранным условиям не найдены.
          </p>
        )}
      </div>
      <Pagination {...shown} onChange={setPage} />
    </section>
  );
}
