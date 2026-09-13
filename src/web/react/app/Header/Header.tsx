import { useLayoutEffect, useRef } from "react";
import { CLASS_DEFINITIONS } from "../../../../catalogs/WorldCatalog";
import {
  WORLD_PAGE_IDS,
  WORLD_PAGE_NAV_GROUP,
  isWorldPageAvailable,
  type WorldPageId,
} from "../routing/WorldPageCatalog";
import { useAppSelector, useGame } from "../state/GameContext";
import { classIcons } from "../../shared/utils/gameLabels";
import { SaveActions } from "../../features/settings/SaveActions";

const groups = [
  { label: "Карта", page: "map", icon: "✦" },
  { label: "Снаряжение", page: "arsenal", icon: "◈" },
  { label: "Герой", page: "hero", icon: "♟" },
  { label: "Лавка", page: "shop", icon: "¤" },
  { label: "Рейтинги", page: "leaders", icon: "♜" },
  { label: "Мир", page: "chronicle", icon: "◎" },
  { label: "Настройки", page: "settings", icon: "⚙" },
] as const satisfies ReadonlyArray<{
  label: string;
  page: WorldPageId;
  icon: string;
}>;
const labels: Record<WorldPageId, string> = {
  map: "Карта окрестностей",
  hero: "Облик и класс",
  career: "Карьера",
  "class-change": "Смена класса",
  arsenal: "Инвентарь",
  forge: "Кузница",
  legacy: "Наследие",
  skills: "Навыки",
  contracts: "Контракты",
  collections: "Коллекции",
  shop: "Лавка Ионы",
  leaders: "Сотня лучших",
  elite: "Элита",
  chronicle: "Обзор мира",
  fighters: "Бойцы и школы",
  relics: "Реликвии",
  history: "Архив эпох",
  settings: "Настройки",
};
const pageDescriptions: Partial<Record<WorldPageId, string>> = {
  career: "Соперники, достижения и последствия",
  "class-change": "Новая специализация без потери прогресса",
  chronicle: "Сезон и контроль фракций",
  fighters: "Соперники, наставники и школы",
  relics: "Мировые реликвии и ветераны эпох",
  contracts: "Поручения и репутация фракций",
  history: "Итоги завершённых эпох",
};

function itemCount(count: number): string {
  const hundred = count % 100;
  const ten = count % 10;
  const noun =
    hundred >= 11 && hundred <= 14
      ? "предметов"
      : ten === 1
        ? "предмет"
        : ten >= 2 && ten <= 4
          ? "предмета"
          : "предметов";
  return `${count} ${noun}`;
}

export function Header() {
  const { game, navigate, openDialog, store } = useGame();
  const page = useAppSelector((state) => state.page);
  const header = useRef<HTMLElement>(null),
    nav = useRef<HTMLElement>(null);
  const hero = game.save.hero;
  const eliteRank = game.heroEliteRank();
  const group = WORLD_PAGE_NAV_GROUP[page];
  const primaryStatus: Record<(typeof groups)[number]["page"], string> = {
    map: "5 направлений",
    hero: `ур. ${hero.level}`,
    arsenal: itemCount(hero.inventory.length),
    shop: `${hero.gold.toLocaleString("ru-RU")} ¤`,
    leaders: eliteRank ? `элита #${eliteRank}` : `место #${game.heroRank()}`,
    chronicle: `день ${game.save.worldDay}`,
    settings: "тема и управление",
  };
  useLayoutEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const headerRect = header.current?.getBoundingClientRect();
      const navRect = nav.current?.getBoundingClientRect();
      const root = document.documentElement;
      root.style.setProperty(
        "--game-header-height",
        `${headerRect?.height ?? 0}px`,
      );
      root.style.setProperty("--main-nav-height", `${navRect?.height ?? 0}px`);
      root.style.setProperty(
        "--announcement-top",
        `${Math.max(0, headerRect?.bottom ?? 0, navRect?.bottom ?? 0) + 12}px`,
      );
    };
    const scheduleMeasure = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleMeasure);
    if (header.current) observer?.observe(header.current);
    if (nav.current) observer?.observe(nav.current);
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("scroll", scheduleMeasure, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("scroll", scheduleMeasure);
    };
  }, []);
  return (
    <>
      <header className="game-header" ref={header}>
        <div className="header-brand">
          <a
            className="wordmark"
            href="#/map"
            onClick={(event) => {
              event.preventDefault();
              navigate("map");
            }}
          >
            <span>Пыль</span>
            <i>&amp;</i>
            <span>Корона</span>
          </a>
          <small>{labels[page]}</small>
        </div>
        <div className="hero-summary">
          <div
            className="portrait"
            style={{ background: CLASS_DEFINITIONS[hero.classId].accent }}
          >
            {classIcons[hero.classId]}
          </div>
          <div>
            <strong>{hero.name}</strong>
            <small>
              {CLASS_DEFINITIONS[hero.classId].name} · побед в турнирах{" "}
              {hero.arenaWins.reduce((total, wins) => total + wins, 0)} · побед
              в дуэлях {hero.duelWins ?? 0}
            </small>
          </div>
        </div>
        <dl className="resources">
          <div>
            <dt data-term="level" tabIndex={0}>
              Уровень
            </dt>
            <dd>{hero.level}</dd>
          </div>
          <div>
            <dt data-term="gold" tabIndex={0}>
              Монеты
            </dt>
            <dd>{hero.gold.toLocaleString("ru-RU")} ¤</dd>
          </div>
          <div>
            <dt data-term="marks" tabIndex={0}>
              Печати
            </dt>
            <dd>{hero.temperingMarks ?? 0}</dd>
          </div>
          <div>
            <dt data-term="rank" tabIndex={0}>
              Место
            </dt>
            <dd>{eliteRank ? `Элита #${eliteRank}` : `#${game.heroRank()}`}</dd>
          </div>
          <div>
            <dt data-term="day" tabIndex={0}>
              День мира
            </dt>
            <dd>{game.save.worldDay}</dd>
          </div>
        </dl>
        <div className="header-actions">
          <button
            className="plain-button"
            onClick={() => openDialog({ kind: "tutorial", id: "base" })}
          >
            Как играть
          </button>
          <button className="plain-button" onClick={store.exitMode}>
            Сменить режим
          </button>
          <details className="header-save-menu">
            <summary className="plain-button">Сохранение</summary>
            <div className="header-save-popover">
              <SaveActions />
            </div>
          </details>
        </div>
      </header>
      <nav className="main-nav" ref={nav} aria-label="Разделы игры">
        <div className="nav-primary">
          {groups.map((entry) => (
            <button
              key={entry.page}
              className={
                WORLD_PAGE_NAV_GROUP[entry.page] === group ? "active" : ""
              }
              aria-current={
                WORLD_PAGE_NAV_GROUP[entry.page] === group ? "page" : undefined
              }
              aria-label={entry.label}
              onClick={() => navigate(entry.page)}
            >
              <span className="nav-icon" aria-hidden="true">
                {entry.icon}
              </span>
              <span className="nav-copy">
                <b>{entry.label}</b>
                <small aria-hidden="true">{primaryStatus[entry.page]}</small>
              </span>
            </button>
          ))}
        </div>
        <div
          className="nav-secondary"
          data-group={group}
          hidden={group === "shop" || group === "map" || group === "settings"}
        >
          {WORLD_PAGE_IDS.filter(
            (id) =>
              id !== "shop" &&
              id !== "class-change" &&
              WORLD_PAGE_NAV_GROUP[id] === group &&
              isWorldPageAvailable(id, (feature) =>
                game.isFeatureUnlocked(feature),
              ),
          ).map((id) => (
            <button
              key={id}
              data-page={id}
              className={page === id ? "active" : ""}
              aria-current={page === id ? "page" : undefined}
              title={pageDescriptions[id]}
              onClick={() => navigate(id)}
            >
              {labels[id]}
              {id === "arsenal" && <span>{hero.inventory.length}</span>}
              {id === "elite" && <span>30</span>}
              {id === "collections" && (
                <span>{game.save.discoveredItems.length}</span>
              )}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
