import { MAX_ACTIVE_SKILLS, combatantSnapshot, describeSetProgress, nextSkills, unlockedSkills } from "../gameplay/AdvancedBattle";
import {
  ARENAS,
  CLASS_DEFINITIONS,
  DUEL_BOSSES,
  DUEL_TIERS,
  DUNGEONS,
  ENDGAME_ACTIVITIES,
  EQUIPMENT_SKILLS,
  EQUIPMENT_SETS,
  ITEM_TEMPLATES,
  RARITY_LABELS,
  SLOT_LABELS,
  SKILLS,
} from "../catalogs/WorldCatalog";
import { CLASS_CHANGE_GOLD_COST, CLASS_CHANGE_MARK_COST, WorldGame, skillById } from "../gameplay/WorldGame";
import { createEquipmentIcon, renderCharacterDoll } from "./CharacterDoll";
import { basicTournamentUi } from "./BasicTournamentUi";
import {
  ActivityDefinition,
  ArenaDefinition,
  BattleReport,
  CombatantSnapshot,
  DungeonDefinition,
  EquipmentItem,
  EquipmentSlot,
  GameSave,
  HeroClass,
  Rarity,
  TournamentReport,
} from "../gameplay/WorldTypes";

const SAVE_KEY = "dust-and-crown-save-v2";
const MODE_KEY = "dust-and-crown-mode";
const LEADER_SNAPSHOT_KEY = "dust-and-crown-leader-snapshot-v1";
const ELITE_SNAPSHOT_KEY = "dust-and-crown-elite-snapshot-v1";
const $ = <T extends HTMLElement>(selector: string): T => document.querySelector(selector) as T;
const $$ = <T extends HTMLElement>(selector: string): T[] => Array.from(document.querySelectorAll(selector)) as T[];

const classIcons: Record<HeroClass, string> = {
  Knight: "♜", Archer: "➶", Wizard: "✦", Monk: "◉", Gunsmith: "⚙", Swordsman: "⚔",
};
const rarityClass: Record<Rarity, string> = {
  common: "common", rare: "rare", epic: "epic", legendary: "legendary", mythic: "mythic",
};

let game: WorldGame | null = null;
let selectedClass: HeroClass = "Knight";
let inventoryFilter: EquipmentSlot | "all" = "all";
let inventorySetFilter = "all";
let inventoryRarityFilter: Rarity | "all" = "all";
let inventorySort: "newest" | "oldest" = "newest";
let rivalrySort: "recent" | "wins" | "losses" = "recent";
let inventoryVisibleLimit = 60;
let equipmentPickerSlot: EquipmentSlot | null = null;
let comparisonItemId: string | null = null;
let comparisonShopIndex: number | null = null;
let dismissedTournamentReminderKey: string | null = null;
let battleTimer: number | null = null;
let currentReport: BattleReport | null = null;
let currentTournament: TournamentReport | null = null;
let tournamentBattleIndex = 0;
let battleTurnIndex = 0;
let battleHealth = { hero: 0, enemy: 0 };
let battleReturnScrollY = 0;
let battleReturnPage = "map";
let tutorialStepIndex = 0;
const leaderboardObservers = new Map<string, IntersectionObserver>();

type RankingSnapshot = Record<string, number>;

const tutorialSteps = [
  { title: "Карта задаёт ритм", copy: "Начните с тренировки, дуэлей и доступных данжей. На турниры нужно записываться заранее: в день события игра напомнит о старте." },
  { title: "Герой сражается сам", copy: "В автоматическом режиме герой выбирает приёмы самостоятельно. В книге навыков можно ограничить сборку четырьмя умениями или включить ручное подтверждение ходов." },
  { title: "Снаряжение определяет билд", copy: "Сравнивайте добычу, собирайте комплекты и закаляйте лучшие вещи в кузнице. Автоэкипировка работает только тогда, когда вы сами включили её." },
  { title: "Мир развивается без героя", copy: "Соперники получают уровни, меняют арены и могут погибнуть навсегда. Их результаты видны в личной истории, сотне лучших и летописи мира." },
  { title: "Путь продолжается после финальной арены", copy: "Победа на последней арене открывает Лигу короны. Чемпион квалификации входит в элитную тридцатку, а первые пять мест можно оспаривать в Охоте на легенд." },
] as const;

function renderGearActions(): void {
  if (!game) return;
  const renderInto = (container: HTMLElement) => {
    container.replaceChildren();
    const best = element("button", "button", "Надеть лучшее");
    const set = element("button", "button", "Собрать лучший комплект");
    const auto = element("label", "auto-equip-toggle");
    const checkbox = element("input") as HTMLInputElement;
    checkbox.type = "checkbox";
    checkbox.checked = game!.save.hero.autoEquipBest;
    auto.append(checkbox, document.createTextNode(" Автоматически надевать лучшее"));
    best.addEventListener("click", () => {
      const equipped = game!.equipBest(); persist(); renderAll();
      toast(equipped.length ? "Выбрано лучшее доступное снаряжение." : "Подходящего снаряжения пока нет.");
    });
    set.addEventListener("click", () => {
      const equipped = game!.equipBest("set"); persist(); renderAll();
      toast(equipped.length ? "Собран наиболее полный доступный комплект." : "Частей комплектов пока нет.");
    });
    checkbox.addEventListener("change", () => {
      game!.setAutoEquipBest(checkbox.checked); persist(); renderAll();
      toast(checkbox.checked ? "Автоэкипировка включена." : "Автоэкипировка выключена.");
    });
    container.append(best, set, auto);
  };
  renderInto($("#hero-gear-actions"));
  renderInto($("#inventory-gear-actions"));
}

function loadGame(): WorldGame | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw) as GameSave;
    if (save.version !== 2 || !save.hero) return null;
    return WorldGame.restore(save);
  } catch {
    return null;
  }
}

function persist(): void {
  if (!game) return;
  localStorage.setItem(SAVE_KEY, JSON.stringify(game.save));
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

type EquipmentVisual = Pick<EquipmentItem, "name" | "templateId" | "rarity" | "setId" | "allowedClasses">;

function equipmentArtwork(slot: EquipmentSlot, classId: HeroClass, className = "equipment-art", item?: EquipmentVisual): HTMLSpanElement {
  return createEquipmentIcon(slot, classId, className, item ? {
    name: item.name,
    templateId: item.templateId,
    rarity: item.rarity,
    rarityColor: rarityColors[item.rarity],
    setId: item.setId,
    visualClassId: classForTemplate(item.allowedClasses),
  } : undefined);
}

function classForTemplate(classes: HeroClass[] | "all"): HeroClass {
  if (!game || classes === "all" || classes.includes(game.save.hero.classId)) return game?.save.hero.classId ?? "Knight";
  return classes[0] ?? "Knight";
}

function toast(message: string, kind: "ok" | "error" = "ok"): void {
  const node = element("div", `toast ${kind}`, message);
  $("#toast-region").append(node);
  window.setTimeout(() => node.remove(), 3200);
}

function loadRankingSnapshot(key: string): RankingSnapshot {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "{}") as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] =>
      typeof entry[1] === "number" && Number.isFinite(entry[1]) && entry[1] > 0));
  } catch {
    return {};
  }
}

function saveRankingSnapshot(key: string, entries: Array<{ id: string }>): void {
  const snapshot = Object.fromEntries(entries.map((entry, index) => [entry.id, index + 1]));
  localStorage.setItem(key, JSON.stringify(snapshot));
}

function markRankMovement(row: HTMLTableRowElement, nameCell: HTMLTableCellElement, previousRank: number | undefined, currentRank: number, hasSnapshot: boolean): void {
  if (!hasSnapshot) return;
  if (previousRank === undefined) {
    row.classList.add("rank-newcomer");
    const marker = element("span", "rank-change newcomer", "новый");
    marker.title = "Новый участник рейтинга с прошлого посещения";
    nameCell.append(marker);
    return;
  }
  const places = previousRank - currentRank;
  if (places === 0) return;
  const movedUp = places > 0;
  row.classList.add(movedUp ? "rank-moved-up" : "rank-moved-down");
  row.style.setProperty("--rank-offset", `${Math.max(-72, Math.min(72, places * 11))}px`);
  const marker = element("span", `rank-change ${movedUp ? "up" : "down"}`, `${movedUp ? "↑" : "↓"}${Math.abs(places)}`);
  marker.title = `${movedUp ? "Поднялся" : "Опустился"} на ${Math.abs(places)} мест с прошлого посещения`;
  nameCell.append(marker);
}

function observeLeaderboardRows(body: HTMLTableSectionElement): void {
  leaderboardObservers.get(body.id)?.disconnect();
  const rows = Array.from(body.querySelectorAll("tr"));
  rows.forEach((row) => row.classList.add("leader-row-awaiting"));
  if (!("IntersectionObserver" in window)) {
    rows.forEach((row) => row.classList.add("leader-row-visible"));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("leader-row-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.08, rootMargin: "0px 0px -4% 0px" });
  rows.forEach((row) => observer.observe(row));
  leaderboardObservers.set(body.id, observer);
}

function replayAnimation(node: HTMLElement, className: string): void {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

function setAnimatedText(selector: string, text: string): void {
  const node = $(selector);
  if (node.textContent === text) return;
  node.textContent = text;
  replayAnimation(node, "value-updated");
}

function renderTutorial(animate = true): void {
  const step = tutorialSteps[tutorialStepIndex];
  $("#tutorial-title").textContent = step.title;
  $("#tutorial-copy").textContent = step.copy;
  $("#tutorial-progress").textContent = `${tutorialStepIndex + 1} / ${tutorialSteps.length}`;
  $("#tutorial-illustration").textContent = String(tutorialStepIndex + 1).padStart(2, "0");
  const back = $("#tutorial-back") as HTMLButtonElement;
  const next = $("#tutorial-next") as HTMLButtonElement;
  back.hidden = tutorialStepIndex === 0;
  next.textContent = tutorialStepIndex === tutorialSteps.length - 1 ? "Начать игру" : "Далее";
  if (animate) {
    replayAnimation($(".tutorial-dialog"), "step-changing");
  }
}

function openTutorial(firstVisit = false): void {
  if (!game) return;
  tutorialStepIndex = 0;
  $("#tutorial-layer").hidden = false;
  renderTutorial();
  if (firstVisit && !game.save.tutorialCompleted) {
    game.save.tutorialCompleted = true;
    persist();
  }
}

function finishTutorial(): void {
  if (!game) return;
  game.save.tutorialCompleted = true;
  persist();
  $("#tutorial-layer").hidden = true;
}

function equippedItems(): EquipmentItem[] {
  if (!game) return [];
  const ids = new Set(Object.values(game.save.hero.equipped));
  return game.save.hero.inventory.filter((item) => ids.has(item.id));
}

function renderCreation(): void {
  const choices = $("#class-choice");
  choices.replaceChildren();
  (Object.values(CLASS_DEFINITIONS)).forEach((definition) => {
    const button = element("button", `class-option${definition.id === selectedClass ? " selected" : ""}`);
    button.type = "button";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", String(definition.id === selectedClass));
    button.style.setProperty("--class-accent", definition.accent);
    const icon = element("span", "class-icon", classIcons[definition.id]);
    const copy = element("span", "class-copy");
    copy.append(element("strong", "", definition.name), element("small", "", definition.epithet), element("p", "", definition.description));
    const stats = element("span", "class-stats", `HP ${definition.startingStats.health} · ATK ${definition.startingStats.attack} · DEF ${definition.startingStats.defense}`);
    button.append(icon, copy, stats);
    button.addEventListener("click", () => { selectedClass = definition.id; renderCreation(); });
    choices.append(button);
  });
}

function createHero(): void {
  const name = ($("#hero-name-input") as HTMLInputElement).value.trim();
  if (name.length < 2) {
    $("#creation-message").textContent = "Имя должно состоять минимум из двух символов.";
    return;
  }
  game = WorldGame.create(name, selectedClass);
  localStorage.removeItem(LEADER_SNAPSHOT_KEY);
  localStorage.removeItem(ELITE_SNAPSHOT_KEY);
  game.save.hero.appearance = {
    hairStyle: Number(($("#hero-hair") as HTMLSelectElement).value) as 0 | 1 | 2,
    faceStyle: 0,
  };
  persist();
  $("#creation-screen").classList.add("hidden");
  renderAll();
  openTutorial(true);
  toast(`${name}: путь начался.`);
}

function showPage(page: string, scrollToTop = true): void {
  $$(".main-nav button").forEach((button) => button.classList.toggle("active", button.dataset.page === page));
  $$(".page").forEach((section) => section.classList.toggle("active", section.id === `page-${page}`));
  if (page === "leaders") renderLeaders(true);
  if (page === "elite") renderEliteLeaders(true);
  if (scrollToTop) window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderHeader(): void {
  if (!game) return;
  const hero = game.save.hero;
  $("#header-portrait").textContent = classIcons[hero.classId];
  $("#header-portrait").style.setProperty("--portrait-accent", CLASS_DEFINITIONS[hero.classId].accent);
  $("#header-hero-name").textContent = hero.name;
  const championships = hero.arenaWins.reduce((total, wins) => total + wins, 0);
  $("#header-hero-meta").textContent = `${CLASS_DEFINITIONS[hero.classId].name} · ${championships} побед в турнирах · победы в дуэлях ${hero.duelWins} · поражения ${hero.duelLosses}`;
  setAnimatedText("#header-level", String(hero.level));
  setAnimatedText("#header-gold", `${hero.gold} ¤`);
  setAnimatedText("#header-marks", String(hero.temperingMarks));
  const eliteRank = game.heroEliteRank();
  setAnimatedText("#header-rank", eliteRank ? `Элита #${eliteRank}` : `#${game.heroRank() ?? "—"}`);
  setAnimatedText("#header-day", String(game.save.worldDay));
  setAnimatedText("#inventory-count", String(hero.inventory.length));
  setAnimatedText("#collection-count", `${game.save.discoveredItems.length}/${ITEM_TEMPLATES.length}`);
}

function statRow(label: string, value: string | number): HTMLElement {
  const row = element("div", "stat-row");
  row.append(element("span", "", label), element("strong", "", String(value)));
  return row;
}

function renderHeroCard(): void {
  if (!game) return;
  const hero = game.save.hero;
  const stats = combatantSnapshot(hero);
  const card = $("#hero-card");
  card.replaceChildren();
  const top = element("div", "hero-card-top");
  const portrait = element("div", "large-portrait", classIcons[hero.classId]);
  portrait.style.setProperty("--portrait-accent", CLASS_DEFINITIONS[hero.classId].accent);
  const title = element("div");
  title.append(element("small", "", `УРОВЕНЬ ${hero.level}`), element("h2", "", hero.name), element("p", "", CLASS_DEFINITIONS[hero.classId].name));
  top.append(portrait, title);
  const exp = element("div", "experience-line");
  const meter = element("i"); meter.style.width = `${Math.min(100, hero.experience / hero.experienceToNextLevel * 100)}%`; exp.append(meter);
  const statsGrid = element("div", "compact-stats");
  statsGrid.append(
    statRow("Здоровье", stats.maxHealth),
    statRow("Атака", stats.attack),
    statRow("Защита", stats.defense),
    statRow("Скорость", stats.speed),
    statRow("Победы в дуэлях", hero.duelWins),
    statRow("Поражения в дуэлях", hero.duelLosses),
  );
  card.append(top, exp, element("small", "exp-label", `${hero.experience} / ${hero.experienceToNextLevel} опыта`), statsGrid, element("p", "passive", CLASS_DEFINITIONS[hero.classId].passive));
}

const rarityColors: Record<Rarity, string> = {
  common: "#898478", rare: "#477ca8", epic: "#76519d", legendary: "#c58b2d", mythic: "#a13c43",
};

function renderHeroVisual(): void {
  if (!game) return;
  const hero = game.save.hero;
  const items = equippedItems();
  const doll = $("#paper-doll");
  $("#visual-class-name").textContent = `${CLASS_DEFINITIONS[hero.classId].name.toUpperCase()} · УРОВЕНЬ ${hero.level}`;
  $("#visual-hero-name").textContent = hero.name;
  const slotItems = new Map(items.map((item) => [item.slot, item]));
  renderCharacterDoll(doll, hero.classId, Object.fromEntries(items.map((item) => [item.slot, {
    name: item.name,
    rarityColor: rarityColors[item.rarity],
    templateId: item.templateId,
    rarity: item.rarity,
    setId: item.setId,
    visualClassId: classForTemplate(item.allowedClasses),
  }])), hero.appearance);
  const designs = $("#worn-designs"); designs.replaceChildren(element("h2", "", "Надетые предметы"));
  (["head", "chest", "hands", "feet", "weapon", "offhand"] as EquipmentSlot[]).forEach((slot) => {
    const item = slotItems.get(slot);
    const row = element("article", `worn-item selectable ${item?.rarity ?? "empty"}`);
    row.tabIndex = 0;
    row.setAttribute("role", "button");
    row.setAttribute("aria-label", `Выбрать предмет для слота «${SLOT_LABELS[slot]}»`);
    row.title = `Открыть выбор: ${SLOT_LABELS[slot]}`;
    row.addEventListener("click", () => openEquipmentPicker(slot));
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openEquipmentPicker(slot); }
    });
    const swatch = item ? equipmentArtwork(slot, hero.classId, "gear-swatch equipment-art", item) : element("span", "gear-swatch", "—");
    if (item) swatch.style.setProperty("--rarity-color", rarityColors[item.rarity]);
    const copy = element("div");
    copy.append(element("small", "", SLOT_LABELS[slot]), element("strong", "", item?.name ?? "Ничего не надето"), element("p", "", item ? `${RARITY_LABELS[item.rarity]} · ${itemStatsText(item)}${item.setId ? ` · комплект ${EQUIPMENT_SETS.find((set) => set.id === item.setId)?.name ?? item.setId}` : ""}` : "Слот не даёт характеристик."));
    row.append(swatch, copy);
    if (item) {
      const remove = element("button", "small-button unequip-inline", "Снять");
      remove.addEventListener("click", (event) => { event.stopPropagation(); game!.unequip(slot); persist(); renderAll(); toast(`${item.name} снят.`); });
      row.append(remove);
    }
    designs.append(row);
  });
  const snapshot = combatantSnapshot(hero);
  const stats = $("#visual-stats"); stats.replaceChildren(element("p", "eyebrow", "ОБРАЗ В БОЮ"), element("h2", "", CLASS_DEFINITIONS[hero.classId].epithet));
  stats.append(statRow("Сила вещей", snapshot.equipmentScore), statRow("Крит. шанс", `${snapshot.crit}%`), statRow("Скорость", snapshot.speed));
  stats.append(element("p", "passive", CLASS_DEFINITIONS[hero.classId].passive));
  const editor = element("div", "appearance-editor");
  const appearanceTitle = element("strong", "", "Внешность");
  const hair = document.createElement("select");
  [["0", "Короткая"], ["1", "Зачёс назад"], ["2", "Длинная"]].forEach(([value, label]) => hair.append(new Option(label, value, false, Number(value) === hero.appearance.hairStyle)));
  hair.addEventListener("change", () => { hero.appearance.hairStyle = Number(hair.value) as 0 | 1 | 2; persist(); renderHeroVisual(); });
  editor.append(appearanceTitle, hair); stats.append(editor);
  renderClassChangePanel();
  renderHeroHistory();
}

function renderClassChangePanel(): void {
  if (!game) return;
  const panel = $("#class-change-panel");
  const hero = game.save.hero;
  const availability = game.classChangeAvailability();
  panel.replaceChildren();
  const copy = element("div");
  copy.append(
    element("p", "eyebrow", "ПОЗДНЯЯ СПЕЦИАЛИЗАЦИЯ"),
    element("h2", "", "Смена класса"),
    element("p", "", "Уровень, рейтинг, история и инвентарь сохраняются. Несовместимые предметы снимаются, а навыки нового класса подбираются заново."),
    element("small", "", availability.reason),
  );
  const controls = element("div", "class-change-controls");
  const select = document.createElement("select");
  Object.values(CLASS_DEFINITIONS).filter((definition) => definition.id !== hero.classId).forEach((definition) => {
    select.append(new Option(`${definition.name} — ${definition.epithet}`, definition.id));
  });
  const button = element("button", "button primary", "Сменить класс");
  button.disabled = !availability.unlocked;
  button.addEventListener("click", () => {
    const nextClass = select.value as HeroClass;
    const nextName = CLASS_DEFINITIONS[nextClass].name;
    if (!window.confirm(`Сменить класс на «${nextName}» за ${CLASS_CHANGE_GOLD_COST.toLocaleString("ru-RU")} ¤ и ${CLASS_CHANGE_MARK_COST} печатей?`)) return;
    try {
      game!.changeHeroClass(nextClass); persist(); renderAll();
      toast(`Новый класс: ${nextName}. Подходящее снаряжение надето автоматически.`);
    } catch (error) { toast((error as Error).message, "error"); }
  });
  controls.append(select, button, element("small", "", `Смен класса: ${hero.classChanges}`));
  panel.append(copy, controls);
}

function renderHeroHistory(): void {
  if (!game) return;
  const hero = game.save.hero;
  const records = Object.values(hero.rivalries).sort((a, b) => {
    if (rivalrySort === "wins") return b.wins - a.wins || b.lastMetDay - a.lastMetDay;
    if (rivalrySort === "losses") return b.losses - a.losses || b.lastMetDay - a.lastMetDay;
    return b.lastMetDay - a.lastMetDay || (b.wins + b.losses) - (a.wins + a.losses);
  });
  const topHundred = new Map(game.leaderboard().map((entry, index) => [entry.id, { entry, rank: index + 1 }]));
  const elite = new Map(game.eliteLeaderboard().map((entry, index) => [entry.id, { entry, rank: index + 1 }]));
  const livingWorldFighters = new Map(game.save.enemies.map((enemy) => [enemy.id, enemy]));
  const career = $("#hero-career-stats");
  career.replaceChildren(element("p", "eyebrow", "КАРЬЕРА"), element("h2", "", "Статистика героя"));
  const careerResults = element("div", "career-results");
  const careerHeader = element("div", "career-results-head");
  careerHeader.append(
    element("span", "", "Активность"),
    element("span", "", "Победы"),
    element("span", "", "Проигрыши"),
  );
  careerResults.append(careerHeader);
  [
    ["Все бои", hero.wins, hero.losses],
    ["Турниры", hero.tournamentMatchWins, hero.tournamentMatchLosses],
    ["Дуэли", hero.duelWins, hero.duelLosses],
    ["Данжи", hero.dungeonWins, hero.dungeonLosses],
  ].forEach(([label, wins, losses]) => {
    const row = element("div", "career-results-row");
    row.append(
      element("span", "", String(label)),
      element("strong", "", String(wins)),
      element("strong", "", String(losses)),
    );
    careerResults.append(row);
  });
  const lethalWins = element("div", "career-lethal-wins");
  lethalWins.append(element("span", "", "Смертельные победы"), element("strong", "", String(hero.kills)));
  career.append(careerResults, lethalWins);

  const rivalries = $("#hero-rivalries");
  rivalries.replaceChildren(element("p", "eyebrow", "ЛИЧНЫЕ ВСТРЕЧИ"), element("h2", "", "Соперники"));
  const rivalryToolbar = element("label", "rivalry-toolbar");
  const rivalrySortSelect = document.createElement("select");
  [
    ["recent", "Сначала новые"],
    ["wins", "Больше побед"],
    ["losses", "Больше проигрышей"],
  ].forEach(([value, label]) => rivalrySortSelect.append(new Option(label, value, false, value === rivalrySort)));
  rivalrySortSelect.addEventListener("change", () => {
    rivalrySort = rivalrySortSelect.value as typeof rivalrySort;
    renderHeroHistory();
  });
  rivalryToolbar.append(element("span", "", "Сортировка"), rivalrySortSelect);
  rivalries.append(rivalryToolbar);
  const rivalryHeader = element("div", "rivalry-list-head");
  rivalryHeader.append(
    element("span", "", "Соперник"),
    element("span", "", "Победы"),
    element("span", "", "Проигрыши"),
  );
  const rivalryList = element("div", "history-list rivalry-history-list");
  records.forEach((record) => {
    const row = element("article");
    const copy = element("div");
    const ranked = topHundred.get(record.enemyId);
    const eliteFighter = elite.get(record.enemyId);
    const worldFighter = livingWorldFighters.get(record.enemyId);
    const worldStatus = eliteFighter
      ? `Элита №${eliteFighter.rank} · ${game!.legendTitle(eliteFighter.rank) ?? "участник Лиги короны"} · рейтинг ${eliteFighter.entry.rating}`
      : ranked
      ? `№${ranked.rank} в мире · рейтинг ${ranked.entry.rating} · ${ARENAS[ranked.entry.arenaIndex]?.name ?? "арена не указана"}`
      : worldFighter?.alive
        ? `Вне первой сотни · рейтинг ${worldFighter.rating} · ${ARENAS[worldFighter.arenaIndex]?.name ?? "арена не указана"}`
        : worldFighter
          ? "Погиб · исключён из мирового рейтинга"
          : record.enemyId.startsWith("boss-")
            ? "Особый противник · не участвует в мировом рейтинге"
            : record.enemyId.startsWith("dungeon-")
              ? "Страж данжа · не участвует в мировом рейтинге"
              : "Боец мира · текущая позиция в рейтинге недоступна";
    copy.append(
      element("strong", "", record.name),
      element("small", "", `${CLASS_DEFINITIONS[record.classId].name} · последняя встреча: день ${record.lastMetDay}`),
      element("span", `rivalry-world-rank${eliteFighter ? " elite" : ranked ? " ranked" : ""}`, worldStatus),
    );
    const wins = element("b", "rivalry-score", String(record.wins));
    wins.setAttribute("aria-label", `Победы: ${record.wins}`);
    const losses = element("b", "rivalry-score", String(record.losses));
    losses.setAttribute("aria-label", `Проигрыши: ${record.losses}`);
    row.append(copy, wins, losses);
    rivalryList.append(row);
  });
  if (records.length === 0) rivalryList.append(element("p", "empty-copy", "Здесь появятся бойцы, с которыми герой уже встречался."));
  if (records.length > 0) rivalries.append(rivalryHeader);
  rivalries.append(rivalryList);

  const necrology = $("#hero-necrology");
  necrology.replaceChildren(element("p", "eyebrow", "НЕКРОЛОГ"), element("h2", "", "Погибшие противники"));
  const dead = records.filter((record) => record.killed);
  const deadList = element("div", "history-list necrology-list");
  dead.forEach((record) => deadList.append(element("article", "", `${record.name} · побеждён в день ${record.lastMetDay}`)));
  if (dead.length === 0) deadList.append(element("p", "empty-copy", "Герой пока не завершил ни одной чужой истории навсегда."));
  necrology.append(deadList);
}

function activityCard(activity: ArenaDefinition | DungeonDefinition): HTMLElement {
  if (!game) return element("article");
  const availability = game.availability(activity);
  const card = element("article", `activity-card ${activity.kind}${availability.unlocked ? "" : " locked"}`);
  card.style.setProperty("--activity-accent", activity.accent);
  const index = activity.kind === "arena" ? ARENAS.findIndex((item) => item.id === activity.id) + 1 : DUNGEONS.findIndex((item) => item.id === activity.id) + 1;
  const head = element("div", "activity-head");
  head.append(element("span", "activity-number", String(index).padStart(2, "0")), element("small", "", activity.place));
  card.append(head, element("h3", "", activity.name), element("p", "", activity.description));
  const levels = element("div", "activity-levels", activity.kind === "arena"
    ? `Сетка: ${activity.participants} · каждые ${activity.tournamentInterval} дн. · приз ${activity.rewardGold} ¤`
    : `Уровни врагов: ${activity.enemyLevel[0]}–${activity.enemyLevel[1]}`);
  const state = element("div", "activity-state", availability.reason);
  const registeredDay = activity.kind === "arena" ? game.registeredTournamentDay(activity.id) : undefined;
  const tournamentToday = activity.kind === "arena" && registeredDay === game.save.worldDay;
  const buttonLabel = !availability.unlocked ? "Закрыто"
    : activity.kind === "dungeon" ? "Начать вылазку"
      : tournamentToday ? "Начать турнир"
        : registeredDay ? `Записан на день ${registeredDay}`
          : `Записаться на день ${game.nextTournamentDay(activity.id)}`;
  const button = element("button", "button activity-button", buttonLabel);
  button.disabled = !availability.unlocked;
  if (activity.kind === "arena" && registeredDay && !tournamentToday) button.disabled = true;
  button.addEventListener("click", () => {
    if (activity.kind === "dungeon") startActivity(activity.id);
    else if (tournamentToday) startTournament(activity.id);
    else registerForTournament(activity.id);
  });
  card.append(levels, state, button);
  return card;
}

function registerForTournament(arenaId: string): void {
  if (!game) return;
  try {
    const day = game.registerTournament(arenaId); persist(); renderAll();
    toast(`Место зарезервировано. Турнир начнётся в день ${day}.`);
  } catch (error) { toast((error as Error).message, "error"); }
}

function tournamentsScheduledToday(): ArenaDefinition[] {
  if (!game) return [];
  return ARENAS.filter((arena) => game!.registeredTournamentDay(arena.id) === game!.save.worldDay);
}

function tournamentReminderKey(arenas: ArenaDefinition[]): string {
  return `${game?.save.worldDay ?? 0}:${arenas.map((arena) => arena.id).sort().join(",")}`;
}

function renderTournamentReminder(): void {
  const reminder = $("#tournament-reminder");
  if (!game) { reminder.hidden = true; return; }
  const arenas = tournamentsScheduledToday();
  const key = tournamentReminderKey(arenas);
  if (arenas.length === 0 || dismissedTournamentReminderKey === key) { reminder.hidden = true; return; }

  $("#tournament-reminder-title").textContent = arenas.length === 1 ? `Сегодня: ${arenas[0].name}` : `Сегодня турниров: ${arenas.length}`;
  const list = $("#tournament-reminder-list");
  list.replaceChildren(...arenas.map((arena) => {
    const row = element("article", "tournament-reminder-item");
    const copy = element("div");
    copy.append(
      element("strong", "", arena.name),
      element("small", "", `${arena.participants} участников · награда ${arena.rewardGold} ¤ · ${arena.place}`),
    );
    const start = element("button", "button primary", "Начать турнир");
    start.type = "button";
    start.addEventListener("click", () => startTournament(arena.id));
    row.append(copy, start);
    return row;
  }));
  reminder.hidden = false;
}

function renderMap(): void {
  if (!game) return;
  renderHeroCard();
  const trainingCap = game.trainingLevelCap();
  const trainingCopy = $("#daily-actions-section article p");
  const trainingButton = $("#training-btn") as HTMLButtonElement;
  const trainingBlocked = game.save.hero.level >= trainingCap;
  trainingCopy.textContent = trainingBlocked
    ? `Предел тренировок для текущей арены достигнут: ${trainingCap} уровень. Продвиньтесь в следующую турнирную лигу.`
    : `Безопасный опыт до ${trainingCap} уровня. Дальше потребуется продвижение на арене.`;
  trainingButton.disabled = trainingBlocked;
  trainingButton.textContent = trainingBlocked ? "Достигнут предел" : "Тренироваться";
  const arenaRoute = $("#arena-route"); arenaRoute.replaceChildren(...ARENAS.map(activityCard));
  const dungeonRoute = $("#dungeon-route"); dungeonRoute.replaceChildren(...DUNGEONS.map(activityCard));
  const tournamentsToday = ARENAS.filter((arena) => game!.registeredTournamentDay(arena.id) === game!.save.worldDay).length;
  const openTournaments = ARENAS.filter((arena) => game!.availability(arena).unlocked).length;
  const openDungeons = DUNGEONS.filter((dungeon) => game!.availability(dungeon).unlocked).length;
  const openDuels = DUEL_TIERS.filter((duel) => game!.availability(duel).unlocked).length;
  const openBosses = DUEL_BOSSES.filter((boss) => !game!.save.defeatedBosses.includes(boss.id) && game!.availability(boss).unlocked).length;
  $("#quick-duel-status").textContent = `${openDuels} доступно`;
  $("#quick-boss-status").textContent = openBosses > 0 ? `${openBosses} готовы к бою` : "Нет доступных";
  $("#quick-tournament-status").textContent = tournamentsToday > 0 ? `${tournamentsToday} сегодня` : `${openTournaments} открыто`;
  $("#quick-dungeon-status").textContent = `${openDungeons} доступно`;
  const crownAvailable = game.crownLeagueAvailability().unlocked;
  const huntAvailable = game.legendHuntAvailability().unlocked;
  $("#quick-endgame-status").textContent = huntAvailable ? "Легенда найдена" : crownAvailable ? game.crownLeagueTier().name : "Закрыто";
  renderDuels();
  renderEndgame();
  const hero = game.save.hero;
  const next = nextSkills(hero.classId, hero.level)[0];
  const currentArena = ARENAS[hero.highestArena];
  const goal = $("#next-goal"); goal.replaceChildren();
  goal.append(element("p", "eyebrow", "БЛИЖАЙШИЕ ЦЕЛИ"), element("h2", "", currentArena.name));
  goal.append(statRow("Победы", `${hero.arenaWins[hero.highestArena]}/${currentArena.winsToAdvance}`));
  if (next) {
    const skill = element("div", "next-skill");
    skill.append(element("small", "", `НАВЫК НА ${next.unlockLevel} УРОВНЕ`), element("strong", "", next.name), element("p", "", next.description));
    goal.append(skill);
  }
  const events = game.save.events.slice(0, 3);
  const feed = element("div", "mini-events");
  feed.append(element("h3", "", "Сейчас в мире"));
  events.forEach((event) => feed.append(element("p", "", `День ${event.day}. ${event.message}`)));
  goal.append(feed);
}

function renderDuels(): void {
  if (!game) return;
  $("#duel-summary").textContent = `Победы ${game.save.hero.duelWins} · поражения ${game.save.hero.duelLosses}. Мировой рейтинг от этих боёв не меняется.`;
  const route = $("#duel-route"); route.replaceChildren();
  DUEL_TIERS.forEach((duel, index) => {
    const availability = game!.availability(duel);
    const card = element("article", `activity-card duel${availability.unlocked ? "" : " locked"}`);
    card.style.setProperty("--activity-accent", duel.accent);
    card.append(element("div", "activity-head", `СТУПЕНЬ ${String(index + 1).padStart(2, "0")}`), element("h3", "", duel.name), element("p", "", duel.description), element("div", "activity-state", availability.reason));
    const button = element("button", "button activity-button", availability.unlocked ? "Начать дуэль" : "Закрыто"); button.disabled = !availability.unlocked;
    button.addEventListener("click", () => startDuel(duel.id)); card.append(button); route.append(card);
  });
  const bosses = $("#boss-route"); bosses.replaceChildren();
  DUEL_BOSSES.forEach((boss) => {
    const defeated = game!.save.defeatedBosses.includes(boss.id);
    const availability = game!.availability(boss);
    const card = element("article", `activity-card boss${availability.unlocked ? "" : " locked"}${defeated ? " defeated" : ""}`);
    card.style.setProperty("--activity-accent", boss.accent);
    card.append(element("div", "activity-head", defeated ? "ПОБЕЖДЁН" : "УНИКАЛЬНАЯ ПОБЕДА"), element("h3", "", boss.name), element("p", "", boss.description), element("div", "activity-levels", `Уровень ${boss.level} · уникальная добыча`), element("div", "activity-state", availability.reason));
    const button = element("button", "button activity-button", defeated ? "История завершена" : availability.unlocked ? "Вызвать на бой" : "Закрыто"); button.disabled = !availability.unlocked;
    button.addEventListener("click", () => startBossFight(boss.id)); card.append(button); bosses.append(card);
  });
}

function itemStatsText(item: EquipmentItem): string {
  const labels: Record<string, string> = { health: "HP", attack: "ATK", defense: "DEF", speed: "SPD", crit: "CRIT" };
  return Object.entries(item.stats).map(([key, value]) => `+${value} ${labels[key]}`).join(" · ");
}

const comparisonStats = ["health", "attack", "defense", "speed", "crit"] as const;
type ComparisonStat = typeof comparisonStats[number];
const comparisonStatLabels: Record<ComparisonStat, string> = {
  health: "HP", attack: "ATK", defense: "DEF", speed: "SPD", crit: "CRIT",
};

function effectiveItemStats(item?: EquipmentItem): Record<ComparisonStat, number> {
  const stats: Record<ComparisonStat, number> = { health: 0, attack: 0, defense: 0, speed: 0, crit: 0 };
  if (!item) return stats;
  comparisonStats.forEach((key) => { stats[key] = item.stats[key] ?? 0; });
  if (item.affix) stats[item.affix.stat] += item.affix.value;
  return stats;
}

function equippedItemInSlot(slot: EquipmentSlot): EquipmentItem | undefined {
  if (!game) return undefined;
  const itemId = game.save.hero.equipped[slot];
  return game.save.hero.inventory.find((item) => item.id === itemId);
}

function canHeroEquip(item: EquipmentItem): boolean {
  if (!game) return false;
  return item.allowedClasses === "all" || item.allowedClasses.includes(game.save.hero.classId);
}

function closeEquipmentPicker(): void {
  equipmentPickerSlot = null;
  $("#equipment-picker").hidden = true;
  if ($("#equipment-comparison").hidden) document.body.classList.remove("equipment-dialog-open");
}

function closeEquipmentComparison(): void {
  comparisonItemId = null;
  comparisonShopIndex = null;
  $("#equipment-comparison").hidden = true;
  if ($("#equipment-picker").hidden) document.body.classList.remove("equipment-dialog-open");
}

function equipFromDialog(item: EquipmentItem): void {
  if (!game) return;
  try {
    game.equip(item.id);
    persist();
    closeEquipmentComparison();
    closeEquipmentPicker();
    renderAll();
    toast(`${item.name} экипирован.`);
  } catch (error) {
    toast((error as Error).message, "error");
  }
}

function comparisonItemContent(container: HTMLElement, item: EquipmentItem | undefined, heading: string): void {
  container.replaceChildren(element("p", "eyebrow", heading));
  container.style.removeProperty("--rarity-color");
  container.classList.remove("has-item");
  if (!item) {
    container.append(element("h3", "", "Слот пуст"), element("p", "comparison-empty", "На персонаже пока нет предмета этого типа."));
    return;
  }
  container.classList.add("has-item");
  container.style.setProperty("--rarity-color", rarityColors[item.rarity]);
  const artwork = equipmentArtwork(item.slot, classForTemplate(item.allowedClasses), "comparison-art equipment-art", item);
  artwork.style.setProperty("--rarity-color", rarityColors[item.rarity]);
  const copy = element("div", "comparison-item-copy");
  copy.append(
    element("small", "", `${SLOT_LABELS[item.slot]} · ${RARITY_LABELS[item.rarity]}`),
    element("h3", "", item.name),
    element("p", "item-stats", itemStatsText(item)),
  );
  if (item.affix) copy.append(element("p", "item-affix", `${item.affix.name}: +${item.affix.value} ${comparisonStatLabels[item.affix.stat]}`));
  if (item.grantedSkillId) copy.append(element("p", "item-skill", `Навык: ${skillById(item.grantedSkillId)?.name ?? item.grantedSkillId}`));
  container.append(artwork, copy);
}

function renderEquipmentComparison(): void {
  if (!game || !comparisonItemId) return;
  const shopOffer = comparisonShopIndex === null ? undefined : game.save.shopOffers[comparisonShopIndex];
  const candidate = shopOffer?.item ?? game.save.hero.inventory.find((item) => item.id === comparisonItemId);
  if (!candidate) { closeEquipmentComparison(); return; }
  const equipped = equippedItemInSlot(candidate.slot);
  comparisonItemContent($("#comparison-equipped"), equipped, "СЕЙЧАС НАДЕТО");
  comparisonItemContent($("#comparison-candidate"), candidate, "ВЫБРАННЫЙ ПРЕДМЕТ");

  const currentStats = effectiveItemStats(equipped);
  const candidateStats = effectiveItemStats(candidate);
  const list = $("#comparison-stat-list");
  list.replaceChildren(...comparisonStats.map((key) => {
    const difference = candidateStats[key] - currentStats[key];
    const row = element("div", `comparison-stat ${difference > 0 ? "positive" : difference < 0 ? "negative" : "neutral"}`);
    row.append(element("span", "", comparisonStatLabels[key]), element("strong", "", difference > 0 ? `+${difference}` : String(difference)));
    return row;
  }));

  const equip = $("#comparison-equip") as HTMLButtonElement;
  const alreadyEquipped = equipped?.id === candidate.id;
  if (shopOffer) {
    equip.disabled = shopOffer.sold || game.save.hero.gold < candidate.price;
    equip.textContent = shopOffer.sold ? "Продано" : `Купить · ${candidate.price} ¤`;
    equip.onclick = () => {
      try {
        const bought = game!.buy(comparisonShopIndex!);
        persist(); closeEquipmentComparison(); renderAll(); toast(`${bought.name} добавлен в инвентарь.`);
      } catch (error) { toast((error as Error).message, "error"); }
    };
  } else {
    equip.disabled = alreadyEquipped || !canHeroEquip(candidate);
    equip.textContent = alreadyEquipped ? "Уже надето" : canHeroEquip(candidate) ? "Надеть выбранное" : "Не подходит классу";
    equip.onclick = () => equipFromDialog(candidate);
  }
  $("#comparison-back").textContent = $("#equipment-picker").hidden ? "Закрыть" : "Вернуться к выбору";
}

function openEquipmentComparison(itemId: string, shopIndex: number | null = null): void {
  comparisonItemId = itemId;
  comparisonShopIndex = shopIndex;
  renderEquipmentComparison();
  const layer = $("#equipment-comparison");
  layer.hidden = false;
  document.body.classList.add("equipment-dialog-open");
  window.setTimeout(() => ($("#close-equipment-comparison") as HTMLButtonElement).focus(), 0);
}

function pickerItemCard(item: EquipmentItem, equippedId?: string): HTMLElement {
  if (!game) return element("article");
  const card = element("article", `picker-item ${rarityClass[item.rarity]}`);
  const artwork = equipmentArtwork(item.slot, classForTemplate(item.allowedClasses), "picker-art equipment-art", item);
  artwork.style.setProperty("--rarity-color", rarityColors[item.rarity]);
  const copy = element("div", "picker-item-copy");
  copy.append(element("small", "", `${RARITY_LABELS[item.rarity]} · ${item.level} ур.`), element("strong", "", item.name), element("p", "", itemStatsText(item)));
  const controls = element("div", "picker-item-controls");
  const compare = element("button", "small-button muted", "Сравнить");
  compare.type = "button";
  compare.addEventListener("click", () => openEquipmentComparison(item.id));
  const equip = element("button", "small-button", equippedId === item.id ? "Надето" : "Надеть");
  equip.type = "button";
  equip.disabled = equippedId === item.id || !canHeroEquip(item);
  equip.addEventListener("click", () => equipFromDialog(item));
  controls.append(compare, equip);
  card.append(artwork, copy, controls);
  return card;
}

function renderEquipmentPicker(): void {
  if (!game || !equipmentPickerSlot) return;
  const slot = equipmentPickerSlot;
  const equipped = equippedItemInSlot(slot);
  $("#equipment-picker-title").textContent = `Выберите: ${SLOT_LABELS[slot].toLowerCase()}`;
  $("#equipment-picker-copy").textContent = "Показаны вещи подходящего типа, которые уже находятся в вашем инвентаре.";

  const current = $("#equipment-picker-current");
  current.replaceChildren(element("p", "eyebrow", "СЕЙЧАС НАДЕТО"));
  if (equipped) {
    const line = element("div", "picker-current-line");
    const copy = element("div");
    copy.append(element("strong", "", equipped.name), element("small", "", `${RARITY_LABELS[equipped.rarity]} · ${itemStatsText(equipped)}`));
    const remove = element("button", "small-button muted", "Снять");
    remove.type = "button";
    remove.addEventListener("click", () => {
      game!.unequip(slot); persist(); renderAll(); renderEquipmentPicker(); toast(`${equipped.name} снят.`);
    });
    line.append(copy, remove); current.append(line);
  } else {
    current.append(element("p", "empty-copy", "Слот пока пуст."));
  }

  const candidates = game.save.hero.inventory
    .filter((item) => item.slot === slot && canHeroEquip(item))
    .sort((a, b) => Number(b.id === equipped?.id) - Number(a.id === equipped?.id) || b.level - a.level);
  const grid = $("#equipment-picker-grid");
  grid.replaceChildren(...candidates.map((item) => pickerItemCard(item, equipped?.id)));
  if (candidates.length === 0) grid.append(element("p", "empty-copy", "В инвентаре пока нет подходящих предметов для этого слота."));
}

function openEquipmentPicker(slot: EquipmentSlot): void {
  equipmentPickerSlot = slot;
  comparisonItemId = null;
  comparisonShopIndex = null;
  $("#equipment-comparison").hidden = true;
  renderEquipmentPicker();
  const layer = $("#equipment-picker");
  layer.hidden = false;
  document.body.classList.add("equipment-dialog-open");
  window.setTimeout(() => ($("#close-equipment-picker") as HTMLButtonElement).focus(), 0);
}

function createItemCard(item: EquipmentItem, mode: "inventory" | "shop", shopIndex = -1, sold = false): HTMLElement {
  if (!game) return element("article");
  const card = element("article", `item-card ${rarityClass[item.rarity]}${sold ? " sold" : ""}`);
  const head = element("div", "item-head");
  head.append(element("span", "item-slot", SLOT_LABELS[item.slot]), element("span", "rarity-label", RARITY_LABELS[item.rarity]));
  const artwork = equipmentArtwork(item.slot, classForTemplate(item.allowedClasses), "equipment-art", item);
  artwork.style.setProperty("--rarity-color", rarityColors[item.rarity]);
  card.append(head, artwork, element("h3", "", item.name), element("small", "", `Предмет ${item.level} уровня${item.enhancement ? ` · закалка +${item.enhancement}` : ""}`), element("p", "item-stats", itemStatsText(item)));
  if (item.affix) card.append(element("p", "item-affix", `${item.affix.name}: +${item.affix.value} · ${item.affix.description}`));
  if (item.grantedSkillId) card.append(element("p", "item-skill", `Навык: ${skillById(item.grantedSkillId)?.name ?? item.grantedSkillId}`));
  const controls = element("div", "item-controls");
  if (mode === "inventory") {
    const equipped = game.save.hero.equipped[item.slot] === item.id;
    const compare = element("button", "small-button muted", "Сравнить");
    compare.type = "button";
    compare.disabled = equipped;
    compare.addEventListener("click", () => openEquipmentComparison(item.id));
    const equip = element("button", "small-button", equipped ? "Снять" : "Надеть");
    equip.addEventListener("click", () => {
      try {
        if (equipped) game!.unequip(item.slot);
        else game!.equip(item.id);
        persist(); renderAll(); toast(equipped ? `${item.name} снят.` : `${item.name} экипирован.`);
      } catch (error) { toast((error as Error).message, "error"); }
    });
    const sellable = game!.canSell(item.id);
    const sell = element("button", "small-button muted sell-button", sellable ? `Продать · ${Math.round(item.price * 0.45)} ¤` : "Регалия короны");
    sell.disabled = equipped || !sellable;
    if (!sellable) sell.title = "Этот уникальный комплект принадлежит первой легенде и не продаётся.";
    sell.addEventListener("click", () => {
      const scrollTop = window.scrollY;
      const inventoryGrid = $("#inventory-grid");
      const previousHeight = inventoryGrid.offsetHeight;
      sell.blur();
      try {
        const value = game!.sell(item.id);
        persist();
        inventoryGrid.style.minHeight = `${previousHeight}px`;
        renderHeader();
        renderArsenal();
        window.scrollTo(0, scrollTop);
        window.requestAnimationFrame(() => {
          inventoryGrid.style.minHeight = "";
          window.scrollTo(0, scrollTop);
        });
        toast(`Получено ${value} монет.`);
      } catch (error) { toast((error as Error).message, "error"); }
    });
    controls.append(compare, equip, sell);
  } else {
    const compare = element("button", "small-button muted", "Сравнить");
    compare.type = "button";
    compare.disabled = sold;
    compare.addEventListener("click", () => openEquipmentComparison(item.id, shopIndex));
    const buy = element("button", "button", sold ? "Продано" : `Купить · ${item.price} ¤`); buy.disabled = sold || game.save.hero.gold < item.price;
    buy.addEventListener("click", () => { try { const bought = game!.buy(shopIndex); persist(); renderAll(); toast(`${bought.name} добавлен в инвентарь.`); } catch (error) { toast((error as Error).message, "error"); } });
    controls.append(compare, buy);
  }
  card.append(controls);
  return card;
}

function renderArsenal(): void {
  if (!game) return;
  const slots: EquipmentSlot[] = ["weapon", "offhand", "head", "chest", "hands", "feet"];
  const grid = $("#equipment-grid"); grid.replaceChildren();
  slots.forEach((slot) => {
    const itemId = game!.save.hero.equipped[slot];
    const item = game!.save.hero.inventory.find((candidate) => candidate.id === itemId);
    const cell = element("article", `equipment-slot${item ? ` ${item.rarity}` : " empty"}`);
    cell.tabIndex = 0;
    cell.setAttribute("role", "button");
    cell.setAttribute("aria-label", `Выбрать предмет для слота «${SLOT_LABELS[slot]}»`);
    cell.addEventListener("click", () => openEquipmentPicker(slot));
    cell.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openEquipmentPicker(slot); }
    });
    if (item) {
      const artwork = equipmentArtwork(slot, game!.save.hero.classId, "equipment-art", item);
      artwork.style.setProperty("--rarity-color", rarityColors[item.rarity]);
      cell.append(artwork);
    }
    cell.append(element("small", "", SLOT_LABELS[slot]), element("strong", "", item?.name ?? "Пусто"));
    if (item) cell.append(element("span", "", itemStatsText(item)));
    grid.append(cell);
  });
  const setBox = $("#set-bonuses"); setBox.replaceChildren();
  const setProgress = describeSetProgress(equippedItems());
  setBox.append(element("h3", "", "Активные комплекты"));
  if (setProgress.length === 0) setBox.append(element("p", "empty-copy", "Соберите две части одного комплекта, чтобы получить первый бонус."));
  setProgress.forEach((set) => setBox.append(element("p", "set-progress", `${set.name}: ${set.count} ч. ${set.active.join(" · ")}`)));

  const filters = $("#inventory-filters"); filters.replaceChildren();
  (["all", ...slots] as Array<EquipmentSlot | "all">).forEach((slot) => {
    const button = element("button", inventoryFilter === slot ? "active" : "", slot === "all" ? "Все" : SLOT_LABELS[slot]);
    button.addEventListener("click", () => { inventoryFilter = slot; inventoryVisibleLimit = 60; renderArsenal(); }); filters.append(button);
  });
  const setFilter = $("#inventory-set-filter") as HTMLSelectElement;
  if (setFilter.options.length === 0) {
    setFilter.append(new Option("Все комплекты", "all"), new Option("Без комплекта", "none"));
    EQUIPMENT_SETS.forEach((set) => setFilter.append(new Option(set.name, set.id)));
  }
  setFilter.value = inventorySetFilter;
  const rarityFilter = $("#inventory-rarity-filter") as HTMLSelectElement;
  if (rarityFilter.options.length === 0) {
    rarityFilter.append(new Option("Все редкости", "all"));
    Object.entries(RARITY_LABELS).forEach(([rarity, label]) => rarityFilter.append(new Option(label, rarity)));
  }
  rarityFilter.value = inventoryRarityFilter;
  const sortFilter = $("#inventory-sort") as HTMLSelectElement;
  sortFilter.value = inventorySort;
  const inventory = $("#inventory-grid");
  const inventoryOrder = new Map(game.save.hero.inventory.map((item, index) => [item.id, index]));
  const items = game.save.hero.inventory.filter((item) =>
    (inventoryFilter === "all" || item.slot === inventoryFilter)
    && (inventorySetFilter === "all" || (inventorySetFilter === "none" ? !item.setId : item.setId === inventorySetFilter))
    && (inventoryRarityFilter === "all" || item.rarity === inventoryRarityFilter))
    .sort((first, second) => {
      const difference = (inventoryOrder.get(first.id) ?? 0) - (inventoryOrder.get(second.id) ?? 0);
      return inventorySort === "newest" ? -difference : difference;
    });
  const visibleItems = items.slice(0, inventoryVisibleLimit);
  inventory.replaceChildren(...visibleItems.map((item) => createItemCard(item, "inventory")));
  if (items.length === 0) inventory.append(element("p", "empty-copy", "По выбранным фильтрам предметов нет."));
  $("#inventory-result-count").textContent = `Показано ${visibleItems.length} из ${items.length}`;
  const equippedIds = new Set(Object.values(game.save.hero.equipped));
  const bulkSell = $("#inventory-sell-unequipped") as HTMLButtonElement;
  const sellableUnequipped = game.save.hero.inventory.filter((item) => !equippedIds.has(item.id) && game!.canSell(item.id)).length;
  bulkSell.disabled = sellableUnequipped === 0;
  bulkSell.textContent = sellableUnequipped > 0 ? `Продать ненадетое · ${sellableUnequipped}` : "Нет ненадетых вещей";
  const more = $("#inventory-more") as HTMLButtonElement;
  more.hidden = visibleItems.length >= items.length;
  const snapshot = combatantSnapshot(game.save.hero);
  const stats = $("#hero-stats"); stats.replaceChildren(element("h2", "", "Итоговые характеристики"));
  stats.append(statRow("Здоровье", snapshot.maxHealth), statRow("Атака", snapshot.attack), statRow("Защита", snapshot.defense), statRow("Скорость", snapshot.speed), statRow("Крит. шанс", `${snapshot.crit}%`), statRow("Сила вещей", snapshot.equipmentScore));
  stats.append(element("p", "stats-hint", "Характеристики уже включают уровень, экипировку, свойства редкости и активные бонусы комплектов."));
}

function renderSkills(): void {
  if (!game) return;
  const hero = game.save.hero;
  const activeItems = equippedItems();
  const availableSkills = unlockedSkills(hero.classId, hero.level, activeItems);
  const available = new Set(availableSkills.map((skill) => skill.id));
  const selected = new Set(hero.selectedSkillIds.filter((id) => available.has(id)));
  const kindNames = { attack: "Атака", heal: "Лечение", buff: "Усиление", control: "Контроль" } as const;
  const recommended = [...availableSkills].sort((a, b) => b.priority - a.priority).slice(0, MAX_ACTIVE_SKILLS);
  const currentBuild = hero.autoSelectSkills ? recommended : availableSkills.filter((skill) => selected.has(skill.id));

  const tactics = $("#skill-tactics"); tactics.replaceChildren();
  const copy = element("div", "skill-tactics-copy");
  copy.append(
    element("p", "eyebrow", "АКТИВНАЯ СБОРКА"),
    element("h2", "", hero.autoSelectSkills ? "Лучшие навыки выбираются автоматически" : `${currentBuild.length} из ${MAX_ACTIVE_SKILLS} навыков выбрано`),
    element("p", "", currentBuild.length > 0 ? currentBuild.map((skill) => skill.name).join(" · ") : "Выберите хотя бы один доступный приём ниже."),
  );
  const controls = element("div", "skill-tactics-controls");
  const autoBuild = element("label", "tactic-toggle");
  const autoBuildInput = element("input") as HTMLInputElement;
  autoBuildInput.type = "checkbox"; autoBuildInput.checked = hero.autoSelectSkills;
  autoBuild.append(autoBuildInput, document.createTextNode(" Автоматически выбирать лучшие навыки"));
  autoBuildInput.addEventListener("change", () => { game!.setAutoSelectSkills(autoBuildInput.checked); persist(); renderSkills(); });
  const modeLabel = element("span", "tactic-label", "Ведение боя");
  const modeButtons = element("div", "tactic-mode-buttons");
  (["auto", "manual"] as const).forEach((mode) => {
    const button = element("button", hero.combatMode === mode ? "active" : "", mode === "auto" ? "Автоматически" : "Подтверждать ходы");
    button.type = "button";
    button.addEventListener("click", () => { game!.setCombatMode(mode); persist(); renderSkills(); });
    modeButtons.append(button);
  });
  controls.append(autoBuild, modeLabel, modeButtons);
  tactics.append(copy, controls);

  const toggleSkill = (skillId: string) => {
    const next = new Set(hero.selectedSkillIds.filter((id) => available.has(id)));
    if (next.has(skillId)) next.delete(skillId);
    else if (next.size < MAX_ACTIVE_SKILLS) next.add(skillId);
    else { toast(`Можно выбрать не больше ${MAX_ACTIVE_SKILLS} навыков.`, "error"); return; }
    game!.setAutoSelectSkills(false);
    game!.setSelectedSkills([...next]);
    persist(); renderSkills();
  };
  const skillCard = (skill: typeof SKILLS[number], status: string, unlocked: boolean, source?: string) => {
    const active = selected.has(skill.id) && !hero.autoSelectSkills;
    const node = element("article", `skill-node ${skill.kind}${unlocked ? " unlocked" : " locked"}${active ? " selected" : ""}${skill.equipmentOnly ? " gear-skill" : ""}`);
    node.append(
      element("span", "skill-level", status),
      element("h3", "", skill.name),
      element("p", "", source ? `${skill.description} ${source}` : skill.description),
      element("div", "skill-meta", `${kindNames[skill.kind]} · перезарядка ${skill.cooldown} х.`),
    );
    if (unlocked) {
      const button = element("button", `skill-select${active ? " active" : ""}`, hero.autoSelectSkills ? "Добавить в ручную сборку" : active ? "Убрать из сборки" : "Добавить в сборку");
      button.type = "button";
      button.addEventListener("click", () => toggleSkill(skill.id));
      node.append(button);
    }
    return node;
  };

  const relevant = SKILLS
    .filter((skill) => !skill.equipmentOnly && (skill.classes === "all" || skill.classes.includes(hero.classId)))
    .sort((a, b) => a.unlockLevel - b.unlockLevel);
  const road = $("#skill-road"); road.replaceChildren(...relevant.map((skill) => {
    const unlocked = available.has(skill.id);
    return skillCard(skill, unlocked ? `УР. ${skill.unlockLevel} · ОТКРЫТО` : `ОТКРОЕТСЯ НА УР. ${skill.unlockLevel}`, unlocked);
  }));

  const book = $("#equipment-skill-book");
  const ownedBySkill = new Map<string, EquipmentItem[]>();
  hero.inventory.filter((item) => item.grantedSkillId).forEach((item) => {
    const items = ownedBySkill.get(item.grantedSkillId!) ?? []; items.push(item); ownedBySkill.set(item.grantedSkillId!, items);
  });
  const equipmentSkills = EQUIPMENT_SKILLS.filter((skill) => skill.classes === "all" || skill.classes.includes(hero.classId));
  book.replaceChildren(...equipmentSkills.map((skill) => {
    const activeSource = activeItems.find((item) => item.grantedSkillId === skill.id);
    const owned = ownedBySkill.get(skill.id) ?? [];
    const status = activeSource ? "АКТИВЕН ОТ ЭКИПИРОВКИ" : owned.length ? "ЕСТЬ В ИНВЕНТАРЕ" : "ЕЩЁ НЕ НАЙДЕН";
    const source = activeSource ? `Источник: ${activeSource.name}.` : owned.length ? `Найден на: ${owned[0].name}. Наденьте предмет, чтобы активировать приём.` : "Ищите на легендарных и мифических предметах.";
    return skillCard(skill, status, Boolean(activeSource), source);
  }));
}

function renderEndgame(): void {
  if (!game) return;
  const route = $("#endgame-route");
  route.replaceChildren(...ENDGAME_ACTIVITIES.map((activity) => {
    const availability = game!.availability(activity);
    const card = element("article", `activity-card endgame${availability.unlocked ? "" : " locked"}`);
    card.style.setProperty("--activity-accent", activity.accent);
    const label = activity.id === "crown-league" ? game!.crownLeagueTier().name.toUpperCase() : "ПОСЛЕДОВАТЕЛЬНЫЙ ВЫЗОВ";
    const reward = activity.id === "crown-league"
      ? `${game!.heroEliteRank() ? `место #${game!.heroEliteRank()} · ` : "квалификация · "}${game!.save.hero.crownLeagueWins} побед в лиге`
      : `${game!.save.hero.legendHuntWins} побед в охоте · ${game!.save.hero.legendDefenses} защит титула`;
    card.append(
      element("div", "activity-head", label),
      element("h3", "", activity.name),
      element("p", "", activity.description),
      element("div", "activity-levels", reward),
      element("div", "activity-state", availability.reason),
    );
    const button = element("button", "button activity-button", availability.unlocked
      ? activity.id === "crown-league" ? `Начать турнир на ${30} бойцов` : "Бросить следующий вызов"
      : "Закрыто");
    button.disabled = !availability.unlocked;
    button.addEventListener("click", () => startEndgame(activity.id));
    card.append(button);
    return card;
  }));

  const pending = game.pendingLegendChallenge();
  if (pending) {
    const card = element("article", "activity-card endgame elite-defense");
    card.style.setProperty("--activity-accent", "#9c5044");
    card.append(
      element("div", "activity-head", "ВЫЗОВ ВАШЕМУ ТИТУЛУ"),
      element("h3", "", pending.name),
      element("p", "", `Боец элиты пытается занять ваше место. При поражении вы поменяетесь позициями.`),
      element("div", "activity-levels", `${CLASS_DEFINITIONS[pending.classId].name} · уровень ${pending.level}`),
    );
    const defend = element("button", "button activity-button", "Защитить титул");
    defend.addEventListener("click", startLegendDefense); card.append(defend); route.append(card);
  }

  const board = $("#elite-board");
  const elite = game.eliteLeaderboard();
  const header = element("header");
  const heading = element("div");
  heading.append(element("p", "eyebrow", "ЗАКРЫТАЯ ЛИГА"), element("h3", "", "Тридцать бойцов элиты"));
  header.append(heading, element("p", "", "Первые пять носят титулы легенд. Места меняются в Лиге короны и последовательных личных вызовах."));
  const wrap = element("div", "leader-table-wrap");
  const table = element("table", "leader-table");
  const thead = element("thead"); const headRow = element("tr");
  ["Место", "Титул", "Боец", "Класс", "Ур.", "Очки элиты", "Короны"].forEach((label) => headRow.append(element("th", "", label)));
  thead.append(headRow);
  const tbody = element("tbody");
  elite.forEach((entry, index) => {
    const rank = index + 1;
    const row = element("tr", `${entry.isHero ? "is-hero " : ""}${rank <= 5 ? "legend" : ""}`.trim());
    row.append(
      element("td", "elite-rank", `#${rank}`),
      element("td", rank <= 5 ? "elite-title" : "", game!.legendTitle(rank) ?? "Элита"),
      element("td", "", entry.name),
      element("td", "", CLASS_DEFINITIONS[entry.classId].name),
      element("td", "", String(entry.level)),
      element("td", "", String(entry.rating)),
      element("td", "", String(game!.save.eliteCrownWins[entry.id] ?? (entry.isHero ? game!.save.hero.crownLeagueWins : 0))),
    );
    tbody.append(row);
  });
  table.append(thead, tbody); wrap.append(table); board.replaceChildren(header, wrap);
}

function renderCollections(): void {
  if (!game) return;
  const found = new Set(game.save.discoveredItems);
  const overview = $("#collection-overview"); overview.replaceChildren();
  const percent = Math.round(found.size / ITEM_TEMPLATES.length * 100);
  overview.append(element("strong", "", `${found.size} / ${ITEM_TEMPLATES.length}`), element("div", "collection-meter"), element("p", "", `${percent}% каталога найдено. Проданные предметы остаются в летописи.`));
  const meter = overview.querySelector(".collection-meter")!; const fill = element("i"); fill.style.width = `${percent}%`; meter.append(fill);

  const list = $("#sets-list"); list.replaceChildren();
  EQUIPMENT_SETS.forEach((set) => {
    const relevant = set.classes === "all" || set.classes.includes(game!.save.hero.classId);
    const card = element("article", `set-card${relevant ? " recommended" : ""}`);
    const discovered = set.pieces.filter((id) => found.has(id)).length;
    const head = element("header");
    const title = element("div"); title.append(element("small", "", relevant ? "ПОДХОДИТ ВАШЕМУ КЛАССУ" : "ДРУГОЙ КЛАСС"), element("h2", "", set.name), element("p", "", set.description));
    head.append(title, element("strong", "set-count", `${discovered}/${set.pieces.length}`));
    const purpose = element("p", "set-purpose", set.purpose);
    const pieces = element("div", "collection-pieces");
    set.pieces.forEach((id) => {
      const template = ITEM_TEMPLATES.find((item) => item.id === id)!;
      const piece = element("div", found.has(id) ? "found" : "missing");
      const marker = found.has(id)
        ? equipmentArtwork(template.slot, classForTemplate(template.allowedClasses), "collection-art equipment-art", {
          name: template.name, templateId: template.id, rarity: "common", setId: template.setId, allowedClasses: template.allowedClasses,
        })
        : element("span", "collection-missing", "?");
      piece.append(marker, element("div", "", ""));
      const copy = piece.lastElementChild!; copy.append(element("strong", "", found.has(id) ? template.name : "Не найдено"), element("small", "", SLOT_LABELS[template.slot])); pieces.append(piece);
    });
    const bonuses = element("ol", "set-bonus-list");
    set.bonuses.forEach((bonus) => { const row = element("li", discovered >= bonus.pieces ? "active" : ""); row.append(element("b", "", `${bonus.pieces} ч.`), document.createTextNode(bonus.description)); bonuses.append(row); });
    card.append(head, purpose, pieces, bonuses); list.append(card);
  });
}

function renderShop(): void {
  if (!game) return;
  $("#shop-description").textContent = `Ассортимент обновлён на ${game.save.shopDay}-й день. Следующая смена не позднее ${game.save.shopDay + 2}-го дня.`;
  $("#shop-grid").replaceChildren(...game.save.shopOffers.map((offer, index) => createItemCard(offer.item, "shop", index, offer.sold)));
}

function renderForge(): void {
  if (!game) return;
  const hero = game.save.hero;
  $("#forge-marks").textContent = `${hero.temperingMarks} ${hero.temperingMarks === 1 ? "печать" : hero.temperingMarks >= 2 && hero.temperingMarks <= 4 ? "печати" : "печатей"}`;
  const grid = $("#forge-grid");
  const equippedIds = new Set(Object.values(hero.equipped));
  const order = [...hero.inventory].sort((a, b) =>
    Number(equippedIds.has(b.id)) - Number(equippedIds.has(a.id))
    || (b.enhancement ?? 0) - (a.enhancement ?? 0)
    || b.level - a.level);
  grid.replaceChildren(...order.map((item) => {
    const card = element("article", `forge-card paper-panel ${rarityClass[item.rarity]}`);
    card.style.setProperty("--rarity-color", rarityColors[item.rarity]);
    const art = equipmentArtwork(item.slot, classForTemplate(item.allowedClasses), "forge-art equipment-art", item);
    art.style.setProperty("--rarity-color", rarityColors[item.rarity]);
    const copy = element("div", "forge-card-copy");
    const enhancement = item.enhancement ?? 0;
    copy.append(element("small", "", `${equippedIds.has(item.id) ? "НАДЕТО · " : ""}${SLOT_LABELS[item.slot]} · ${RARITY_LABELS[item.rarity]}`), element("h3", "", item.name), element("p", "", `${item.level} ур. · закалка +${enhancement}/5`), element("p", "item-stats", itemStatsText(item)));
    if (equippedIds.has(item.id)) card.classList.add("equipped");
    const button = element("button", "button", enhancement >= 5 ? "Максимальная закалка" : `Улучшить · ${game!.upgradeCost(item.id)} печ.`);
    button.type = "button";
    button.disabled = enhancement >= 5 || hero.temperingMarks < game!.upgradeCost(item.id);
    button.addEventListener("click", () => {
      try { game!.upgradeItem(item.id); persist(); renderAll(); toast(`${item.name} усилен.`); }
      catch (error) { toast((error as Error).message, "error"); }
    });
    card.append(art, copy, button);
    return card;
  }));
  if (order.length === 0) grid.append(element("p", "empty-copy", "В инвентаре нет предметов для закалки."));
}

function renderLeaders(trackMovement = false): void {
  if (!game) return;
  const leaders = game.leaderboard();
  const previousRanks = trackMovement ? loadRankingSnapshot(LEADER_SNAPSHOT_KEY) : {};
  const hasSnapshot = Object.keys(previousRanks).length > 0;
  const heroRank = game.heroRank();
  const eliteRank = game.heroEliteRank();
  const alive = game.save.enemies.filter((enemy) => enemy.alive).length;
  const dead = game.save.enemies.length - alive;
  const rankSummary = eliteRank ? element("div", "stat-row elite-rank-link") : statRow("Ваше место", `#${heroRank ?? "—"}`);
  if (eliteRank) {
    const link = element("button", "plain-button", `Открыть элиту · #${eliteRank}`);
    link.type = "button";
    link.addEventListener("click", () => showPage("elite"));
    rankSummary.append(element("span", "", "Вы находитесь в другом рейтинге"), link);
  }
  const summary = $("#leader-summary"); summary.replaceChildren(rankSummary, statRow("Живых бойцов", alive), statRow("Погибло навсегда", dead), statRow("Активных арен", ARENAS.length));
  const body = $<HTMLTableSectionElement>("#leader-table"); body.replaceChildren();
  leaders.forEach((entry, index) => {
    const row = element("tr", entry.isHero ? "is-hero" : "");
    if (trackMovement) row.classList.add("leader-row-awaiting");
    const rankCell = element("td", "", String(index + 1));
    const nameCell = element("td", "leader-name-cell", entry.name);
    markRankMovement(row, nameCell, previousRanks[entry.id], index + 1, hasSnapshot);
    row.append(rankCell, nameCell);
    [CLASS_DEFINITIONS[entry.classId].name, ARENAS[entry.arenaIndex]?.name ?? "—", String(entry.level), String(entry.tournamentWins), String(entry.wins), String(entry.losses), String(entry.kills), String(entry.rating)].forEach((value) => row.append(element("td", "", value)));
    body.append(row);
  });
  if (trackMovement) {
    saveRankingSnapshot(LEADER_SNAPSHOT_KEY, leaders);
    window.requestAnimationFrame(() => observeLeaderboardRows(body));
  }
}

function renderEliteLeaders(trackMovement = false): void {
  if (!game) return;
  const elite = game.eliteLeaderboard();
  const previousRanks = trackMovement ? loadRankingSnapshot(ELITE_SNAPSHOT_KEY) : {};
  const hasSnapshot = Object.keys(previousRanks).length > 0;
  const heroRank = game.heroEliteRank();
  const leader = elite[0];
  $("#elite-leader-summary").replaceChildren(
    statRow("Ваше место", heroRank ? `#${heroRank}` : "Не в элите"),
    statRow("Участников", elite.length),
    statRow("Легенд", Math.min(5, elite.length)),
    statRow("Первая корона", leader?.name ?? "—"),
  );
  const body = $<HTMLTableSectionElement>("#elite-leader-table"); body.replaceChildren();
  elite.forEach((entry, index) => {
    const rank = index + 1;
    const row = element("tr", `${entry.isHero ? "is-hero " : ""}${rank <= 5 ? "legend" : ""}`.trim());
    if (trackMovement) row.classList.add("leader-row-awaiting");
    const rankCell = element("td", "", `#${rank}`);
    const titleCell = element("td", rank <= 5 ? "elite-title" : "", game!.legendTitle(rank) ?? "Элита");
    const nameCell = element("td", "leader-name-cell", entry.name);
    markRankMovement(row, nameCell, previousRanks[entry.id], rank, hasSnapshot);
    row.append(rankCell, titleCell, nameCell);
    [
      CLASS_DEFINITIONS[entry.classId].name,
      String(entry.level),
      String(entry.rating),
      String(game!.save.eliteCrownWins[entry.id] ?? (entry.isHero ? game!.save.hero.crownLeagueWins : 0)),
      String(entry.wins),
      String(entry.losses),
      String(entry.kills),
    ].forEach((value) => row.append(element("td", "", value)));
    body.append(row);
  });
  if (trackMovement) {
    saveRankingSnapshot(ELITE_SNAPSHOT_KEY, elite);
    window.requestAnimationFrame(() => observeLeaderboardRows(body));
  }
}

function renderChronicle(): void {
  if (!game) return;
  const list = $("#event-list"); list.replaceChildren();
  game.save.events.forEach((event) => {
    const row = element("article", `world-event ${event.type}`);
    row.append(element("span", "event-day", `ДЕНЬ ${event.day}`), element("p", "", event.message)); list.append(row);
  });
  if (game.save.events.length === 0) list.append(element("p", "empty-copy", "Мир ещё не успел оставить событий в летописи."));
}

function renderAll(): void {
  if (!game) return;
  renderHeader(); renderMap(); renderHeroVisual(); renderGearActions(); renderArsenal(); renderForge(); renderSkills(); renderCollections(); renderShop(); renderLeaders(); renderEliteLeaders(); renderChronicle(); renderTournamentReminder();
}

function setCombatant(container: HTMLElement, fighter: CombatantSnapshot, health: number): void {
  container.querySelector("h3")!.textContent = fighter.name;
  container.querySelector("p")!.textContent = fighter.originalLevel
    ? `${CLASS_DEFINITIONS[fighter.classId].name} · уровень ${fighter.level} (снижен с ${fighter.originalLevel})`
    : `${CLASS_DEFINITIONS[fighter.classId].name} · уровень ${fighter.level}`;
  container.querySelector("strong")!.textContent = `${Math.max(0, health)} / ${fighter.maxHealth} HP`;
  const fill = container.querySelector(".battle-health i") as HTMLElement;
  fill.style.width = `${Math.max(0, health / fighter.maxHealth * 100)}%`;
}

function renderBattleSkills(report: BattleReport): void {
  const panel = $("#battle-skills");
  (["hero", "enemy"] as const).forEach((side) => {
    const fighter = side === "hero" ? report.heroBefore : report.enemyBefore;
    const list = panel.querySelector<HTMLElement>(`[data-fighter="${side}"] > div`)!;
    const interactive = side === "hero" && game?.save.hero.combatMode === "manual";
    const makeChip = (label: string, id: string, className: string): HTMLElement => {
      const chip = interactive ? element("button", className, label) : element("span", className, label);
      if (chip instanceof HTMLButtonElement) {
        chip.type = "button";
        chip.addEventListener("click", () => { if (chip.classList.contains("awaiting-input")) confirmManualBattleTurn(); });
      }
      chip.dataset.skillId = id;
      return chip;
    };
    const regular = makeChip("Обычная атака", "basic", "battle-skill ready basic");
    const skills = fighter.skills.map((id) => {
      const skill = skillById(id);
      const chip = makeChip(skill?.name ?? id, id, `battle-skill ready ${skill?.kind ?? "attack"}`);
      if (skill) chip.title = `${skill.description} Перезарядка: ${skill.cooldown} х.`;
      return chip;
    });
    list.replaceChildren(regular, ...skills);
  });
}

function markUsedBattleSkill(actorId: string, skillId?: string): void {
  $$(".battle-skill").forEach((chip) => chip.classList.remove("used"));
  const side = actorId === "hero" ? "hero" : "enemy";
  const id = skillId ?? "basic";
  const chip = $<HTMLElement>(`#battle-skills [data-fighter="${side}"] [data-skill-id="${id}"]`);
  chip?.classList.add("used");
}

function startActivity(activityId: string): void {
  if (!game) return;
  try {
    currentTournament = null;
    currentReport = game.play(activityId);
    persist();
  } catch (error) {
    toast((error as Error).message, "error"); return;
  }
  openBattleReport(currentReport);
}

function trainHero(): void {
  if (!game) return;
  try {
    const result = game.train(); persist(); renderAll();
    toast(`${result.title}: +${result.experience} опыта${result.levelsGained ? `, +${result.levelsGained} ур.` : ""}.`);
  } catch (error) { toast((error as Error).message, "error"); }
}

function startEndgame(activityId: "crown-league" | "legend-hunt"): void {
  if (!game) return;
  try {
    if (activityId === "crown-league") {
      currentTournament = game.playCrownLeague();
      tournamentBattleIndex = 0;
      currentReport = currentTournament.heroBattles[0] ?? null;
    } else {
      currentTournament = null;
      currentReport = game.huntLegend();
    }
    persist();
  } catch (error) { toast((error as Error).message, "error"); return; }
  if (currentTournament) renderTournamentBracket();
  if (!currentReport) { toast("В турнирной сетке не найден бой героя.", "error"); return; }
  openBattleReport(currentReport);
}

function startLegendDefense(): void {
  if (!game) return;
  try { currentTournament = null; currentReport = game.defendLegendTitle(); persist(); }
  catch (error) { toast((error as Error).message, "error"); return; }
  openBattleReport(currentReport);
}

function confirmManualBattleTurn(): void {
  if (!currentReport || game?.save.hero.combatMode !== "manual") return;
  const next = currentReport.turns[battleTurnIndex];
  if (!next || next.actorId !== "hero") return;
  playBattleTurn();
}

function startDuel(tierId?: string): void {
  if (!game) return;
  let result;
  try { result = game.duel(tierId); persist(); renderAll(); }
  catch (error) { toast((error as Error).message, "error"); return; }
  if (!result.battle) return;
  currentTournament = null; currentReport = result.battle; openBattleReport(result.battle);
}

function startBossFight(bossId: string): void {
  if (!game) return;
  let result;
  try { result = game.fightBoss(bossId); persist(); renderAll(); }
  catch (error) { toast((error as Error).message, "error"); return; }
  if (!result.battle) return;
  currentTournament = null; currentReport = result.battle; openBattleReport(result.battle);
}

function startTournament(arenaId: string): void {
  if (!game) return;
  try { currentTournament = game.playTournament(arenaId); persist(); }
  catch (error) { toast((error as Error).message, "error"); return; }
  renderTournamentReminder();
  tournamentBattleIndex = 0;
  renderTournamentBracket();
  currentReport = currentTournament.heroBattles[0] ?? null;
  if (!currentReport) { toast("Герой не попал в турнирную сетку.", "error"); return; }
  openBattleReport(currentReport);
}

function renderTournamentBracket(): void {
  const panel = $("#tournament-panel");
  if (!currentTournament) { panel.hidden = true; return; }
  panel.hidden = false;
  $("#tournament-round-label").textContent = `${currentTournament.participantCount} УЧАСТНИКОВ · ${currentTournament.matches.length} БОЁВ`;
  $("#tournament-progress").textContent = `БОЙ ГЕРОЯ ${Math.min(tournamentBattleIndex + 1, currentTournament.heroBattles.length)} / ${currentTournament.heroBattles.length}`;
  const strip = $("#bracket-strip"); strip.replaceChildren();
  currentTournament.matches.forEach((match) => {
    const cell = element("article", match.heroInvolved ? "hero-match" : "");
    cell.append(element("small", "", `РАУНД ${match.round} · БОЙ ${match.match}`), element("span", "", `${match.firstName} × ${match.secondName}`), element("strong", "", `→ ${match.winnerName}`));
    strip.append(cell);
  });
}

function openBattleReport(report: BattleReport): void {
  if ($("#battle-overlay").hidden) {
    battleReturnScrollY = window.scrollY;
    battleReturnPage = document.querySelector<HTMLElement>(".page.active")?.id.replace("page-", "") ?? "map";
  }
  currentReport = report;
  battleTurnIndex = 0;
  battleHealth = { hero: currentReport.heroBefore.maxHealth, enemy: currentReport.enemyBefore.maxHealth };
  $("#battle-place").textContent = currentReport.activity.place.toUpperCase();
  $("#battle-name").textContent = currentReport.activity.name;
  $("#battle-turn").textContent = "ХОД 0"; $("#battle-action").textContent = "Бойцы выходят на площадку"; $("#battle-detail").textContent = "";
  $("#battle-log").replaceChildren(); $("#battle-result").hidden = true;
  $("#battle-quick-equip").hidden = true;
  $("#close-battle").textContent = "Вернуться на карту";
  if (!currentTournament) $("#tournament-panel").hidden = true;
  setCombatant($("#battle-hero"), currentReport.heroBefore, battleHealth.hero);
  setCombatant($("#battle-enemy"), currentReport.enemyBefore, battleHealth.enemy);
  renderBattleSkills(currentReport);
  $("#battle-overlay").hidden = false;
  document.body.classList.add("battle-open");
  scheduleBattleTurn();
}

function scheduleBattleTurn(): void {
  if (!currentReport || battleTurnIndex >= currentReport.turns.length) { finishBattlePlayback(); return; }
  const next = currentReport.turns[battleTurnIndex];
  const manual = game?.save.hero.combatMode === "manual" && next.actorId === "hero";
  const manualButton = $("#manual-battle-step") as HTMLButtonElement;
  $$("#battle-skills .battle-skill").forEach((chip) => chip.classList.remove("awaiting-input"));
  if (manual) {
    const skillId = next.skillId ?? "basic";
    const chip = $<HTMLElement>(`#battle-skills [data-fighter="hero"] [data-skill-id="${skillId}"]`);
    chip?.classList.add("awaiting-input");
    manualButton.hidden = false;
    manualButton.textContent = `Применить: ${next.action}`;
    $("#battle-action").textContent = "Ваш ход — подтвердите выбранный приём";
    return;
  }
  manualButton.hidden = true;
  const delay = Number(($("#battle-speed") as HTMLSelectElement).value);
  battleTimer = window.setTimeout(playBattleTurn, delay);
}

function playBattleTurn(): void {
  if (!currentReport) return;
  $("#manual-battle-step").hidden = true;
  $$("#battle-skills .battle-skill").forEach((chip) => chip.classList.remove("awaiting-input"));
  const turn = currentReport.turns[battleTurnIndex++];
  if (!turn) { finishBattlePlayback(); return; }
  if (turn.actorId === "hero") { battleHealth.hero = turn.actorHealth; battleHealth.enemy = turn.targetHealth; }
  else { battleHealth.enemy = turn.actorHealth; battleHealth.hero = turn.targetHealth; }
  setCombatant($("#battle-hero"), currentReport.heroBefore, battleHealth.hero);
  setCombatant($("#battle-enemy"), currentReport.enemyBefore, battleHealth.enemy);
  $("#battle-turn").textContent = `ХОД ${turn.turn}`;
  $("#battle-action").textContent = `${turn.actorName}: ${turn.action}`;
  $("#battle-detail").textContent = `${turn.damage ? `${turn.damage} урона` : "без урона"}${turn.healing ? ` · +${turn.healing} HP` : ""}${turn.critical ? " · критический удар" : ""}. ${turn.detail}`;
  replayAnimation($(".battle-action"), "turn-updated");
  markUsedBattleSkill(turn.actorId, turn.skillId);
  const actor = turn.actorId === "hero" ? $("#battle-hero") : $("#battle-enemy");
  const target = turn.targetId === "hero" ? $("#battle-hero") : $("#battle-enemy");
  actor.classList.remove("acting"); target.classList.remove("hit"); void actor.offsetWidth; actor.classList.add("acting"); if (turn.damage > 0) target.classList.add("hit");
  const log = element("p", turn.critical ? "critical" : "", `${turn.turn}. ${turn.actorName} — ${turn.action}: ${turn.damage} урона${turn.healing ? `, +${turn.healing} HP` : ""}.`);
  $("#battle-log").prepend(log);
  scheduleBattleTurn();
}

function finishBattlePlayback(): void {
  if (!currentReport) return;
  if (battleTimer !== null) window.clearTimeout(battleTimer); battleTimer = null;
  $("#manual-battle-step").hidden = true;
  const finalHeroHealth = currentReport.heroWon ? Math.max(1, battleHealth.hero) : 0;
  const finalEnemyHealth = currentReport.heroWon ? 0 : Math.max(1, battleHealth.enemy);
  setCombatant($("#battle-hero"), currentReport.heroBefore, finalHeroHealth);
  setCombatant($("#battle-enemy"), currentReport.enemyBefore, finalEnemyHealth);
  const result = $("#battle-result"); result.hidden = false;
  const copy = result.querySelector("div")!; copy.replaceChildren();
  const hasNextTournamentBattle = Boolean(currentTournament && tournamentBattleIndex < currentTournament.heroBattles.length - 1);
  const finalTournamentBattle = Boolean(currentTournament && !hasNextTournamentBattle);
  const finalRewards = finalTournamentBattle ? currentTournament!.rewards : currentReport.rewards;
  const title = finalTournamentBattle
    ? (currentTournament!.heroWon ? "Вы — чемпион турнира" : `Турнир завершён · место ${currentTournament!.heroPlacement}`)
    : currentReport.heroWon ? "Победа" : "Поражение";
  copy.append(element("h3", "", title));
  const lines = hasNextTournamentBattle
    ? ["Раунд пройден. Следующий соперник уже определён турнирной сеткой."]
    : [`Опыт: +${finalRewards.experience}`, `Монеты: +${finalRewards.gold}`];
  if (finalRewards.item) lines.push(`Добыча: ${finalRewards.item.name}`);
  if (finalRewards.temperingMarks) lines.push(`Печати закалки: +${finalRewards.temperingMarks}`);
  if (currentReport.enemyDied) lines.push("Противник погиб и удалён из живого мира.");
  if (finalRewards.levelsGained) lines.push(`Получено уровней: ${finalRewards.levelsGained}`);
  if (finalRewards.unlockedSkills.length) lines.push(`Открыты навыки: ${finalRewards.unlockedSkills.map((skill) => skill.name).join(", ")}`);
  if (finalTournamentBattle) lines.push(`Чемпион: ${currentTournament!.championName}`);
  copy.append(element("p", "", lines.join(" · ")));
  $("#close-battle").textContent = hasNextTournamentBattle ? "Следующий бой" : "Вернуться на карту";
  const quickEquip = $("#battle-quick-equip") as HTMLButtonElement;
  const rewardItem = !hasNextTournamentBattle ? finalRewards.item : undefined;
  quickEquip.hidden = !rewardItem;
  quickEquip.onclick = null;
  if (rewardItem && game) {
    const equipped = game.save.hero.equipped[rewardItem.slot] === rewardItem.id;
    quickEquip.disabled = equipped;
    quickEquip.textContent = equipped ? "Уже надето автоматически" : "Надеть добычу";
    quickEquip.onclick = () => {
      try {
        game!.equip(rewardItem.id); persist(); renderAll();
        quickEquip.disabled = true; quickEquip.textContent = "Надето";
        toast(`${rewardItem.name} экипирован.`);
      } catch (error) { toast((error as Error).message, "error"); }
    };
  }
  renderAll();
}

function skipBattle(): void {
  if (!currentReport) return;
  battleTurnIndex = currentReport.turns.length;
  finishBattlePlayback();
}

function closeBattle(): void {
  if (battleTimer !== null) window.clearTimeout(battleTimer);
  battleTimer = null;
  if (currentTournament && tournamentBattleIndex < currentTournament.heroBattles.length - 1) {
    tournamentBattleIndex += 1;
    renderTournamentBracket();
    openBattleReport(currentTournament.heroBattles[tournamentBattleIndex]);
    return;
  }
  currentReport = null; currentTournament = null; $("#battle-overlay").hidden = true; $("#tournament-panel").hidden = true; document.body.classList.remove("battle-open");
  renderAll(); showPage(battleReturnPage, false);
  window.requestAnimationFrame(() => window.scrollTo({ top: battleReturnScrollY, behavior: "auto" }));
}

function setWorldInterface(visible: boolean): void {
  $(".game-header").hidden = !visible;
  $(".main-nav").hidden = !visible;
  $(".game-shell").hidden = !visible;
  $("#basic-shell").hidden = visible;
  if (!visible) $("#tournament-reminder").hidden = true;
}

function switchMode(): void {
  basicTournamentUi.stop();
  localStorage.removeItem(MODE_KEY);
  location.reload();
}

function activateBasicMode(): void {
  localStorage.setItem(MODE_KEY, "basic");
  $("#mode-screen").classList.add("hidden");
  $("#creation-screen").classList.add("hidden");
  setWorldInterface(false);
  basicTournamentUi.initialize();
}

function activateWorldMode(): void {
  localStorage.setItem(MODE_KEY, "world");
  $("#mode-screen").classList.add("hidden");
  setWorldInterface(true);
  bootstrapWorld();
}

function newGame(): void {
  if (!window.confirm("Удалить героя, предметы и историю мира? Это действие нельзя отменить.")) return;
  localStorage.removeItem(SAVE_KEY);
  localStorage.removeItem(LEADER_SNAPSHOT_KEY);
  localStorage.removeItem(ELITE_SNAPSHOT_KEY);
  game = null; location.reload();
}

function bootstrapWorld(): void {
  renderCreation();
  game = loadGame();
  if (!game) {
    $("#creation-screen").classList.remove("hidden");
    return;
  }
  $("#creation-screen").classList.add("hidden");
  const cycles = game.simulateElapsed();
  if (cycles > 0) {
    const notice = $("#world-notice"); notice.hidden = false;
    notice.textContent = `Мир продолжал жить без вас: прошло ${cycles} дн. фоновых турниров, дуэлей и вылазок.`;
  }
  persist(); renderAll();
  if (!game.save.tutorialCompleted) openTutorial(true);
}

function bootstrap(): void {
  renderCreation();
  const mode = localStorage.getItem(MODE_KEY);
  if (mode === "basic") { activateBasicMode(); return; }
  if (mode === "world") { activateWorldMode(); return; }
  $("#mode-screen").classList.remove("hidden");
  $("#creation-screen").classList.add("hidden");
  $("#basic-shell").hidden = true;
  $(".game-header").hidden = true;
  $(".main-nav").hidden = true;
  $(".game-shell").hidden = true;
}

$("#create-hero-btn").addEventListener("click", createHero);
$("#hero-name-input").addEventListener("keydown", (event) => { if ((event as KeyboardEvent).key === "Enter") createHero(); });
$$(".main-nav button").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.page!)));
$$<HTMLElement>("[data-page-link]").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); showPage(link.dataset.pageLink!); }));
$$<HTMLButtonElement>("[data-scroll-target]").forEach((button) => button.addEventListener("click", () => {
  document.getElementById(button.dataset.scrollTarget!)?.scrollIntoView({ behavior: "smooth", block: "start" });
}));
$("#new-game-btn").addEventListener("click", newGame);
$("#switch-mode-btn").addEventListener("click", switchMode);
$("#basic-switch-mode").addEventListener("click", switchMode);
$("#basic-mode-btn").addEventListener("click", activateBasicMode);
$("#world-mode-btn").addEventListener("click", activateWorldMode);
$("#basic-create").addEventListener("click", basicTournamentUi.createTournament);
$("#basic-add-random").addEventListener("click", basicTournamentUi.addRandomPlayers);
$("#basic-add-manual").addEventListener("click", basicTournamentUi.addManualPlayer);
$("#basic-reset").addEventListener("click", basicTournamentUi.resetTournament);
$("#basic-clear-log").addEventListener("click", basicTournamentUi.clearLog);
$("#basic-step").addEventListener("click", basicTournamentUi.step);
$("#basic-auto").addEventListener("click", basicTournamentUi.toggleAuto);
$("#training-btn").addEventListener("click", trainHero);
$("#inventory-set-filter").addEventListener("change", (event) => { inventorySetFilter = (event.target as HTMLSelectElement).value; inventoryVisibleLimit = 60; renderArsenal(); });
$("#inventory-rarity-filter").addEventListener("change", (event) => { inventoryRarityFilter = (event.target as HTMLSelectElement).value as Rarity | "all"; inventoryVisibleLimit = 60; renderArsenal(); });
$("#inventory-sort").addEventListener("change", (event) => { inventorySort = (event.target as HTMLSelectElement).value as "newest" | "oldest"; inventoryVisibleLimit = 60; renderArsenal(); });
$("#inventory-more").addEventListener("click", () => { inventoryVisibleLimit += 60; renderArsenal(); });
$("#inventory-sell-unequipped").addEventListener("click", () => {
  if (!game) return;
  const equippedIds = new Set(Object.values(game.save.hero.equipped));
  const count = game.save.hero.inventory.filter((item) => !equippedIds.has(item.id) && game!.canSell(item.id)).length;
  if (count === 0) return;
  if (!window.confirm(`Продать все ненадетые предметы (${count})? Регалии короны и надетые вещи останутся у героя.`)) return;
  const scrollTop = window.scrollY;
  const result = game.sellUnequipped();
  persist(); renderHeader(); renderArsenal(); window.scrollTo(0, scrollTop);
  toast(`Продано предметов: ${result.count}. Получено ${result.value} монет.`);
});
$("#open-tutorial-btn").addEventListener("click", () => openTutorial(false));
$("#tutorial-skip").addEventListener("click", finishTutorial);
$("#tutorial-back").addEventListener("click", () => {
  tutorialStepIndex = Math.max(0, tutorialStepIndex - 1);
  renderTutorial();
});
$("#tutorial-next").addEventListener("click", () => {
  if (tutorialStepIndex >= tutorialSteps.length - 1) { finishTutorial(); return; }
  tutorialStepIndex += 1;
  renderTutorial();
});
$("#dismiss-tournament-reminder").addEventListener("click", () => {
  dismissedTournamentReminderKey = tournamentReminderKey(tournamentsScheduledToday());
  $("#tournament-reminder").hidden = true;
});
$("#open-tournament-calendar").addEventListener("click", () => {
  dismissedTournamentReminderKey = tournamentReminderKey(tournamentsScheduledToday());
  $("#tournament-reminder").hidden = true;
  showPage("map");
  window.setTimeout(() => $("#tournaments-section").scrollIntoView({ behavior: "smooth", block: "start" }), 0);
});
$("#close-equipment-picker").addEventListener("click", closeEquipmentPicker);
$("#close-equipment-comparison").addEventListener("click", closeEquipmentComparison);
$("#comparison-back").addEventListener("click", closeEquipmentComparison);
$("#equipment-picker").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeEquipmentPicker(); });
$("#equipment-comparison").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeEquipmentComparison(); });
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!$("#equipment-comparison").hidden) closeEquipmentComparison();
  else if (!$("#equipment-picker").hidden) closeEquipmentPicker();
});
$("#skip-battle").addEventListener("click", skipBattle);
$("#manual-battle-step").addEventListener("click", confirmManualBattleTurn);
$("#close-battle").addEventListener("click", closeBattle);
window.addEventListener("beforeunload", persist);

bootstrap();
