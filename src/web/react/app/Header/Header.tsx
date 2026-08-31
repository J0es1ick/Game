import { useLayoutEffect, useRef, useState } from "react";
import { CLASS_DEFINITIONS } from "../../../../catalogs/WorldCatalog";
import { SaveTransferController } from "../state/SaveTransferController";
import { gameAudio } from "../audio/GameAudio";
import {
  WORLD_PAGE_IDS,
  WORLD_PAGE_NAV_GROUP,
  isWorldPageAvailable,
  type WorldPageId,
} from "../routing/WorldPageCatalog";
import { useAppSelector, useGame, useGameStore } from "../state/GameContext";
import { classIcons } from "../../shared/utils/gameLabels";

export function SoundButton() {
  const [muted, setMuted] = useState(gameAudio.isMuted);
  const label = muted ? "Включить звуки" : "Отключить звуки";
  return (
    <button
      className={`plain-button sound-toggle${muted ? " muted" : ""}`}
      type="button"
      aria-pressed={muted}
      aria-label={label}
      title={label}
      onClick={() => setMuted(gameAudio.toggle())}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 10h4l5-4v12l-5-4H4z" />
        {muted ? (
          <path d="M5 4l14 16" />
        ) : (
          <g>
            <path d="M16 9c1.5 1.7 1.5 4.3 0 6" />
            <path d="M19 6c3 3.3 3 8.7 0 12" />
          </g>
        )}
      </svg>
    </button>
  );
}

export function SaveActions({ recovery = false }: { recovery?: boolean }) {
  const store = useGameStore();
  const input = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const transfer = new SaveTransferController(store.repository, store.storage);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const reportError = (error: unknown, title: string) => {
    if (!mounted.current) return;
    setErrorMessage(error instanceof Error ? error.message : String(error));
    store.fail(error, title);
  };
  const exportFile = () => {
    setErrorMessage(null);
    try {
      const hero = store.game?.save.hero;
      const download = transfer.export(
        hero?.name ?? "hero",
        store.game?.save.worldDay ?? 1,
        store.game?.save,
      );
      const url = URL.createObjectURL(
        new Blob([download.content], {
          type: "application/json;charset=utf-8",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = download.fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      reportError(error, "Файл не скачан");
    }
  };
  const importFile = async (file: File) => {
    if (
      !window.confirm(
        "Заменить текущую летопись файлом? Последняя исправная копия останется в резерве.",
      )
    )
      return;
    setBusy(true);
    setErrorMessage(null);
    try {
      if (!(await store.importSave(file))) return;
      store.notify({
        eyebrow: "СОХРАНЕНИЕ",
        title: "Летопись загружена",
        description: "Можно продолжить игру.",
        tone: "positive",
      });
    } catch (error) {
      reportError(error, "Файл не загружен");
    } finally {
      if (mounted.current) setBusy(false);
    }
  };
  const restore = () => {
    if (
      !window.confirm(
        "Вернуть предыдущее исправное состояние? Текущее состояние останется резервной копией.",
      )
    )
      return;
    setErrorMessage(null);
    try {
      store.restoreBackup();
    } catch (error) {
      reportError(error, "Копия не восстановлена");
    }
  };
  return (
    <div className={recovery ? "save-recovery-actions" : "header-save-popover"}>
      <strong>Сохранение героя</strong>
      <p>
        Прогресс хранится в этом браузере. Скачайте файл, чтобы перенести его на
        другое устройство.
      </p>
      {errorMessage && <p role="alert">{errorMessage}</p>}
      {store.game && (
        <button className="plain-button" onClick={exportFile}>
          Скачать сохранение
        </button>
      )}
      <button
        className="plain-button"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? "Проверяем файл…" : "Загрузить из файла"}
      </button>
      <button
        className="plain-button"
        disabled={!store.hasBackup() || busy}
        onClick={restore}
      >
        Вернуть предыдущую копию
      </button>
      <button
        className="plain-button danger"
        onClick={() => {
          if (
            window.confirm(
              "Удалить текущую летопись и создать нового героя? Это действие нельзя отменить.",
            )
          )
            store.reset();
        }}
      >
        Начать новую игру
      </button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) void importFile(file);
        }}
      />
    </div>
  );
}

const groups = [
  { label: "Карта", page: "map", icon: "✦" },
  { label: "Герой", page: "hero", icon: "♟" },
  { label: "Снаряжение", page: "arsenal", icon: "◈" },
  { label: "Лавка", page: "shop", icon: "¤" },
  { label: "Рейтинги", page: "leaders", icon: "♜" },
  { label: "Мир", page: "chronicle", icon: "◎" },
] as const satisfies ReadonlyArray<{
  label: string;
  page: WorldPageId;
  icon: string;
}>;
const labels: Record<WorldPageId, string> = {
  map: "Карта окрестностей",
  hero: "Снаряжение и облик",
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
          <SoundButton />
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
            <SaveActions />
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
          hidden={group === "shop" || group === "map"}
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
