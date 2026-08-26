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
import {
  FACTIONS,
  FACTION_REPUTATION_TIERS,
  FIGHTER_SCARS,
  FIGHTER_TRAITS,
  RELIC_PATHS,
  RELIC_TIER_THRESHOLDS,
  factionReputationTier,
  TOURNAMENT_RULES,
} from "../catalogs/WorldExpansionCatalog";
import { ERA_LAWS, LEGACY_BOONS, legacyTitleForCycle } from "../catalogs/NewGamePlusCatalog";
import { countermeasureDefinition, memoryStageDefinition, type EnemyMemoryCombatRead } from "../gameplay/EnemyMemory";
import { CLASS_CHANGE_GOLD_COST, CLASS_CHANGE_MARK_COST, WorldGame, skillById } from "../gameplay/WorldGame";
import { createEquipmentIcon, renderCharacterDoll } from "./CharacterDoll";
import { basicTournamentUi } from "./BasicTournamentUi";
import { gameAudio } from "./GameAudio";
import { initializeGlossary, markTerm } from "./Glossary";
import { queueWorldEffect } from "./WorldEffects";
import { appendEraVeteranBadge, loadRankingSnapshot, markRankMovement, observeLeaderboardRows, saveRankingSnapshot } from "./LeaderboardView";
import { createElement as element, query as $, queryAll as $$ } from "./UiDom";
import {
  ActivityDefinition,
  ArenaDefinition,
  BattleReport,
  CombatantSnapshot,
  DungeonDefinition,
  EquipmentItem,
  EquipmentSlot,
  EnemyStyleMemory,
  ExpeditionStepReport,
  FighterFeatureChange,
  GameSave,
  HeroClass,
  HeroBehaviorPattern,
  EraLawId,
  LegacyBoonId,
  Rarity,
  TournamentReport,
  Stats,
  TacticalStyle,
  ContextualTutorialId,
  WorldFeatureId,
} from "../gameplay/WorldTypes";

const SAVE_KEY = "dust-and-crown-save-v2";
const MODE_KEY = "dust-and-crown-mode";
const LEADER_SNAPSHOT_KEY = "dust-and-crown-leader-snapshot-v1";
const ELITE_SNAPSHOT_KEY = "dust-and-crown-elite-snapshot-v1";
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
const openRivalryMemories = new Set<string>();
let inventoryVisibleLimit = 60;
let equipmentPickerSlot: EquipmentSlot | null = null;
let comparisonItemId: string | null = null;
let comparisonShopIndex: number | null = null;
let dismissedTournamentReminderKey: string | null = null;
let lootReminderTimer: number | null = null;
let lootReminderQueue: Array<{ itemId: string; equippedItemId: string | null }> = [];
let lootReminderIndex = 0;
let battleTimer: number | null = null;
let currentReport: BattleReport | null = null;
let currentTournament: TournamentReport | null = null;
let tournamentBattleIndex = 0;
let battleTurnIndex = 0;
let battleHealth = { hero: 0, enemy: 0 };
let battleReturnScrollY = 0;
let battleReturnPage = "map";
let battleEquipmentBefore: Partial<Record<EquipmentSlot, string>> | null = null;
let battleInventoryBefore: Set<string> | null = null;
let pendingExpeditionResult: ExpeditionStepReport | null = null;
let pendingExpeditionLoot: { items: EquipmentItem[]; equipmentBefore: Partial<Record<EquipmentSlot, string>> | null } | null = null;
let expeditionRewardFollowup: { items: EquipmentItem[]; equipmentBefore: Partial<Record<EquipmentSlot, string>> | null } | null = null;
let tutorialStepIndex = 0;
let tutorialTarget: HTMLElement | null = null;
let tutorialPositionFrame: number | null = null;
let tutorialReturnPage = "map";
let tutorialReturnScrollY = 0;
let activeTutorialId: ContextualTutorialId | "base" = "base";
let activeTutorialSteps: TutorialStep[] = [];
let contextualTutorialTimer: number | null = null;
const contextualTutorialQueue: ContextualTutorialId[] = [];
let newChronicleStep = 0;
let selectedLegacyId: LegacyBoonId | null = null;
let selectedHeirloomItemId: string | null = null;
let selectedWorldLawIds: EraLawId[] = [];
let newChronicleClass: HeroClass = "Knight";
let newChronicleConfirmed = false;
let newChronicleName = "";
let newChronicleReturnFocus: HTMLElement | null = null;
const activeToasts = new Map<string, { node: HTMLElement; count: number; timer: number }>();

type TutorialStep = {
  page: string;
  target: string;
  title: string;
  copy: string;
  action: string;
  feature?: WorldFeatureId;
};

const baseTutorialSteps: TutorialStep[] = [
  { page: "map", target: ".game-header .hero-summary", title: "Это ваш герой", copy: "Кампания хранится в браузере и продолжается день за днём. В шапке всегда видны имя, класс и краткий итог карьеры.", action: "Начните с имени героя: рядом находятся все главные ресурсы кампании." },
  { page: "map", target: ".game-header .resources", title: "Следите за ресурсами", copy: "Уровень открывает активности, монеты нужны для лавки и смены класса, а редкие печати — для постоянной закалки хорошего снаряжения.", action: "Проверяйте место в рейтинге и день мира перед записью на события." },
  { page: "map", target: ".main-nav", title: "Разделы всегда под рукой", copy: "Закреплённая навигация ведёт к герою, инвентарю, кузнице, навыкам, коллекциям, лавке и рейтингам. Более сложные системы появятся здесь только после нужных этапов карьеры.", action: "Нажимайте вкладки в этой строке; кнопка «Как играть» запустит этот маршрут снова." },
  { page: "map", target: ".map-shortcuts", title: "Быстрый переход по карте", copy: "Карта длинная, поэтому этот ряд сразу переносит к тренировкам, дуэлям, боссам, турнирам, данжам и эндгейму.", action: "Нажмите нужную карточку перехода — страница сама прокрутится к активности." },
  { page: "map", target: "#daily-actions-section", title: "Тренировка двигает день", copy: "Тренировка безопасно даёт опыт, но её потолок зависит от уже открытых арен. Каждый подход продвигает календарь и весь живой мир.", action: "Нажмите «Тренироваться», когда хотите развиться без риска и приблизить события." },
  { page: "map", target: "#duels-section", title: "Дуэли строят отдельную карьеру", copy: "Здесь герой встречает обычных бойцов мира подходящей силы. Дуэльные победы не поднимают мировой рейтинг, но открывают новые ступени.", action: "Выберите доступную ступень и нажмите «Начать дуэль»." },
  { page: "map", target: "#bosses-section", title: "Особые противники", copy: "Боссы — одноразовые испытания с условиями доступа и уникальной наградой под класс героя. Побеждённый босс больше не возвращается.", action: "Изучите условия на карточке; вступайте в бой, когда все требования отмечены." },
  { page: "map", target: "#tournaments-section", title: "На турнир записываются заранее", copy: "Турнир состоит минимум из восьми участников и проходит в назначенный день. Более престижные события реже, опаснее и щедрее.", action: "Нажмите «Записаться», а в день турнира запустите сетку из появившегося напоминания." },
  { page: "map", target: "#dungeons-section", title: "Данж — это экспедиция", copy: "Поход состоит из нескольких этапов. Безопасный путь бережёт здоровье, рискованный повышает шанс добычи, а отдых лечит ценой продвижения к финалу.", action: "Откройте данж, начните поход и выбирайте маршрут на доске экспедиции после каждого этапа." },
  { page: "hero", target: ".hero-visual-layout", title: "Герой показывает всю экипировку", copy: "На этом экране видны внешний вид, итоговые характеристики, история боёв, соперники и некролог. Любой слот снаряжения можно открыть напрямую.", action: "Нажмите на надетый предмет, чтобы выбрать замену, сравнить её или снять вещь." },
  { page: "arsenal", target: ".inventory-panel", title: "Инвентарь — центр сборки", copy: "Фильтруйте добычу по слоту, комплекту, редкости и новизне. Сравнение показывает точную прибавку или потерю каждой характеристики.", action: "Используйте «Сравнить» перед экипировкой; массовая продажа не трогает надетые вещи и регалии." },
  { page: "forge", target: ".forge-summary", title: "Закаляйте только важные вещи", copy: "Печати добываются редко, а каждый следующий уровень закалки дороже. Надетое снаряжение всегда вынесено вверх списка.", action: "Выберите предмет и нажмите улучшение, если готовы потратить указанное число печатей." },
  { page: "skills", target: "#skill-tactics", title: "Сборка ограничена четырьмя навыками", copy: "Автоматический режим подбирает сильные доступные приёмы. Для билдостроения отключите автоподбор и соберите набор вручную; здесь же включается ручной бой.", action: "Добавляйте и убирайте навыки карточками ниже, затем выберите автоматический бой или подтверждение ходов." },
  { page: "contracts", target: "#reputation-guide", title: "Репутация улучшает будущие контракты", copy: "Каждая фракция отдельно запоминает вашу помощь. Новые статусы повышают награды монетами и опытом в следующих поручениях именно этой фракции.", action: "Подход «честь» быстрее поднимает репутацию, а «выгода» приносит больше денег сразу.", feature: "contracts" },
  { page: "collections", target: "#collection-overview", title: "Коллекция помнит каждую находку", copy: "Однажды найденный предмет остаётся в каталоге даже после продажи. Здесь видны недостающие части комплектов и их бонусы.", action: "Найдите желаемый комплект и ориентируйтесь на его подсказку при выборе активностей." },
  { page: "shop", target: ".shopkeeper", title: "Лавка обновляется по календарю", copy: "Ассортимент подстраивается под класс и уровень героя. Цена зависит от силы и редкости, а сравнение работает до покупки.", action: "Сначала нажмите «Сравнить», затем покупайте только полезное для текущей сборки." },
  { page: "leaders", target: ".leader-summary", title: "Мировой рейтинг дают турниры", copy: "Сотня лучших учитывает турнирные результаты. Дуэли и данжи вынесены в отдельную статистику, а место меняется только после реальных выступлений.", action: "Откройте таблицу после нескольких дней, чтобы увидеть анимированное изменение позиций." },
  { page: "elite", target: "#page-elite .leader-summary", title: "Элита — поздняя игра", copy: "Чемпион последней арены может пройти Лигу короны и войти в элитную тридцатку. Первые пять — легенды; до лидера нужно последовательно победить стоящих выше.", action: "Вернитесь к эндгейму на карте после чемпионства и запишитесь в Лигу короны." },
  { page: "chronicle", target: ".chronicle-layout", title: "Мир живёт без героя", copy: "Соперники тренируются, меняют арены, находят вещи и могут погибнуть навсегда. Летопись объясняет, что происходило, пока вы занимались своей карьерой.", action: "Обучение закончено. Нажмите «Начать игру», чтобы вернуться туда, откуда вы его открыли." },
];

const contextualTutorialSteps: Record<ContextualTutorialId, TutorialStep[]> = {
  contracts: [
    { page: "contracts", target: '.main-nav button[data-page="contracts"]', title: "Открыта доска контрактов", copy: "После первого чемпионства фракции начали доверять герою поручения. Контракт не заменяет активность: он задаёт дополнительную цель тренировкам, дуэлям, турнирам или данжам.", action: "Откройте новую вкладку «Контракты». Одновременно можно принять только одно поручение." },
    { page: "contracts", target: "#reputation-guide", title: "Репутация меняет будущие награды", copy: "У каждой фракции своя шкала доверия. Повышение статуса усиливает монеты и опыт только в новых контрактах этой фракции.", action: "Изучите пороги статусов, затем выберите фракцию, чьи награды полезнее вашему пути." },
    { page: "contracts", target: "#contract-grid", title: "Честь или выгода", copy: "Оба подхода выполняют одну задачу, но распределяют награду по-разному: честь быстрее растит репутацию, выгода увеличивает немедленную выплату.", action: "Наведите на вариант подхода, прочитайте точные изменения и примите подходящий контракт." },
  ],
  "equipment-legacy": [
    { page: "forge", target: "#relic-workshop", title: "Открыто наследие снаряжения", copy: "Победы на второй половине арен пробуждают историю легендарных и мифических вещей. Надетые предметы получают известность и открывают ступени наследия.", action: "В кузнице следите за известностью ценных вещей и выбирайте постоянный путь только для снаряжения, которым действительно пользуетесь." },
    { page: "forge", target: ".forge-grid", title: "Реликтовая пыль требует выбора", copy: "Ненужную ценную вещь можно разобрать в редкий ресурс. Выбранный путь реликвии постоянен, поэтому сравнивайте его с текущей сборкой.", action: "Сначала накопите известность предмета, затем изучите подсказки путей и подтвердите один из них." },
  ],
  adaptation: [
    { page: "hero", target: "#hero-rivalries", title: "Соперник начал адаптацию", copy: "Знакомые противники запоминают ваш класс, тактику и часто используемые навыки. Повторение одного стиля постепенно усиливает их контрмеры.", action: "Раскройте досье соперника: там видны изученные привычки, сходство текущей сборки и подготовленные ответы." },
    { page: "skills", target: "#skill-tactics", title: "Меняйте рисунок боя", copy: "Память врага не исчезает полностью, но смена навыков или тактического профиля снижает точность старых контрмер и даёт эффект неожиданности. Смена класса меняет стиль ещё сильнее.", action: "Соберите альтернативный набор из четырёх приёмов и чередуйте тактики перед повторными встречами." },
  ],
};

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
      const equipped = game!.equipBest(); persist(); refreshEquipmentViews(true);
      toast(equipped.length ? "Выбрано лучшее доступное снаряжение." : "Подходящего снаряжения пока нет.");
    });
    set.addEventListener("click", () => {
      const equipped = game!.equipBest("set"); persist(); refreshEquipmentViews(true);
      toast(equipped.length ? "Собран наиболее полный доступный комплект." : "Частей комплектов пока нет.");
    });
    checkbox.addEventListener("change", () => {
      game!.setAutoEquipBest(checkbox.checked); persist(); refreshEquipmentViews(true);
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
    if ((save.version !== 2 && save.version !== 3) || !save.hero) return null;
    return WorldGame.restore(save);
  } catch {
    return null;
  }
}

function contextualTutorialCanOpen(): boolean {
  if (!game || !$("#tutorial-layer").hidden) return false;
  return ["#battle-overlay", "#dungeon-layer", "#equipment-picker", "#equipment-comparison", "#new-chronicle-layer"]
    .every((selector) => $(selector).hidden);
}

function queueContextualTutorial(id: ContextualTutorialId): void {
  if (!game || game.hasSeenTutorial(id) || contextualTutorialQueue.includes(id)) return;
  contextualTutorialQueue.push(id);
  scheduleContextualTutorials();
}

function scheduleContextualTutorials(): void {
  if (contextualTutorialTimer !== null || contextualTutorialQueue.length === 0) return;
  contextualTutorialTimer = window.setTimeout(() => {
    contextualTutorialTimer = null;
    if (!contextualTutorialCanOpen()) {
      scheduleContextualTutorials();
      return;
    }
    const tutorialId = contextualTutorialQueue.shift();
    if (tutorialId) openTutorial(false, tutorialId);
  }, 3200);
}

function queueUnseenContextualTutorials(): void {
  if (!game) return;
  (["contracts", "equipment-legacy"] as const).forEach((id) => {
    if (game!.isFeatureUnlocked(id)) queueContextualTutorial(id);
  });
  const adaptationStarted = Object.values(game.save.hero.rivalries)
    .some((record) => record.memoryStage && record.memoryStage !== "unknown");
  if (adaptationStarted) queueContextualTutorial("adaptation");
}

function persist(options: { deferFeatureUnlocks?: boolean } = {}): void {
  if (!game) return;
  const featureUnlocks = options.deferFeatureUnlocks ? [] : game.consumeFeatureUnlocks();
  localStorage.setItem(SAVE_KEY, JSON.stringify(game.save));
  featureUnlocks.forEach((unlock) => {
    queueWorldEffect({
      eyebrow: `НОВАЯ ВОЗМОЖНОСТЬ · ДЕНЬ ${unlock.day}`,
      title: unlock.title,
      description: unlock.description,
      symbol: unlock.id === "contracts" ? "§" : "✦",
      tone: "legendary",
      sound: "reputation",
      duration: 3000,
    });
    queueContextualTutorial(unlock.tutorialId);
  });
  const defense = game.consumeAutomaticLegendDefense();
  if (defense) {
    queueWorldEffect({
      eyebrow: "АВТОМАТИЧЕСКАЯ ЗАЩИТА ТИТУЛА",
      title: defense.heroWon ? "Место легенды сохранено" : "Место легенды потеряно",
      description: defense.heroWon
        ? `${defense.enemyBefore.name} не смог отобрать вашу позицию.`
        : `${defense.enemyBefore.name} победил и занял вашу прежнюю позицию в элите.`,
      symbol: defense.heroWon ? "♛" : "↓",
      tone: defense.heroWon ? "positive" : "negative",
      sound: "reputation",
      duration: 2600,
    });
  }
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
  const key = `${kind}:${message}`;
  const current = activeToasts.get(key);
  if (current) {
    window.clearTimeout(current.timer);
    current.count += 1;
    current.node.textContent = current.count > 1 ? `${message} · ×${current.count}` : message;
    current.timer = window.setTimeout(() => {
      current.node.remove();
      activeToasts.delete(key);
    }, 3200);
    return;
  }
  const node = element("div", `toast ${kind}`, message);
  const region = $("#toast-region");
  while (region.childElementCount >= 4) {
    const oldest = region.firstElementChild as HTMLElement | null;
    if (!oldest) break;
    const oldestEntry = [...activeToasts.entries()].find(([, value]) => value.node === oldest);
    if (oldestEntry) {
      window.clearTimeout(oldestEntry[1].timer);
      activeToasts.delete(oldestEntry[0]);
    }
    oldest.remove();
  }
  region.append(node);
  const record = { node, count: 1, timer: 0 };
  record.timer = window.setTimeout(() => {
    node.remove();
    activeToasts.delete(key);
  }, 3200);
  activeToasts.set(key, record);
}

function updateSoundControls(): void {
  ["#sound-toggle", "#basic-sound-toggle"].forEach((selector) => {
    const button = document.querySelector<HTMLButtonElement>(selector);
    if (!button) return;
    button.setAttribute("aria-pressed", String(gameAudio.isMuted));
    button.setAttribute("aria-label", gameAudio.isMuted ? "Включить звуки" : "Отключить звуки");
    button.title = gameAudio.isMuted ? "Включить звуки" : "Отключить звуки";
  });
}

function initializeStickyOffsets(): void {
  const header = document.querySelector<HTMLElement>(".game-header");
  if (!header) return;
  const sync = () => document.documentElement.style.setProperty("--game-header-height", `${Math.ceil(header.getBoundingClientRect().height)}px`);
  sync();
  if ("ResizeObserver" in window) new ResizeObserver(sync).observe(header);
}

function toggleSound(): void {
  const muted = gameAudio.toggle();
  updateSoundControls();
  toast(muted ? "Звуки отключены." : "Звуки включены.");
}

function featureStatsText(stats: Partial<Stats>): string {
  const labels: Record<keyof Stats, string> = { health: "HP", attack: "ATK", defense: "DEF", speed: "SPD", crit: "CRIT" };
  return Object.entries(stats)
    .filter(([, value]) => Number(value) !== 0)
    .map(([stat, value]) => `${Number(value) > 0 ? "+" : ""}${value} ${labels[stat as keyof Stats]}`)
    .join(" · ");
}

const tacticalStyleLabels: Record<TacticalStyle, string> = {
  balanced: "Ровный бой",
  aggressive: "Давление",
  defensive: "Выжидание",
  control: "Срыв темпа",
};

const behaviorPatternLabels: Record<HeroBehaviorPattern, string> = {
  pressure: "Ранний натиск",
  healing: "Восстановление",
  control: "Контроль",
  burst: "Критические выпады",
  finisher: "Добивание",
};

function strongestMemoryEntries<T extends string>(knowledge: Partial<Record<T, number>>, limit = 2): Array<[T, number]> {
  return Object.entries(knowledge)
    .map(([key, value]) => [key as T, Number(value)] as [T, number])
    .filter(([, value]) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function renderRivalryMemory(enemyId: string, memory: EnemyStyleMemory, preview?: EnemyMemoryCombatRead): HTMLElement {
  const familiarity = Math.max(0, Math.min(100, Math.round(memory.familiarity)));
  const similarity = Math.max(0, Math.min(100, Math.round((preview?.similarity ?? memory.currentSimilarity) * 100)));
  const counterStrength = Math.max(0, Math.min(100, Math.round((preview?.strength ?? 0) * 100)));
  const stage = memoryStageDefinition(memory.stage);
  const details = document.createElement("details");
  details.className = "rivalry-memory";
  details.dataset.enemyId = enemyId;
  details.open = openRivalryMemories.has(enemyId);
  details.addEventListener("toggle", () => {
    if (details.open) openRivalryMemories.add(enemyId);
    else openRivalryMemories.delete(enemyId);
  });

  const summary = document.createElement("summary");
  summary.setAttribute("aria-label", `Память соперника: ${stage.name}. Нажмите, чтобы открыть досье.`);
  const mark = element("span", "rivalry-memory-mark", "◉");
  mark.setAttribute("aria-hidden", "true");
  const heading = element("span", "rivalry-memory-heading");
  heading.append(
    element("b", "", stage.name),
    element("small", "", familiarity > 0 ? `Изученность ${familiarity}% · сходство текущего стиля ${similarity}%` : "Наблюдений пока нет"),
  );
  summary.append(mark, heading);
  details.append(summary);

  const body = element("div", "rivalry-memory-body");
  const progressWrap = element("div", "rivalry-memory-progress");
  const progressLabel = markTerm(element("span", "", "Изученность вашего стиля"), "styleFamiliarity");
  const progressValue = document.createElement("output");
  progressValue.textContent = `${familiarity}%`;
  const progress = document.createElement("progress");
  progress.max = 100;
  progress.value = familiarity;
  progress.setAttribute("aria-label", `Изученность стиля: ${familiarity} процентов`);
  progressWrap.append(progressLabel, progressValue, progress);
  body.append(progressWrap, element("p", "rivalry-memory-note", stage.description));

  if (familiarity > 0) {
    const styleRead = similarity < 35
      ? `Вы заметно изменили манеру боя: подготовленные контрмеры сейчас работают лишь на ${counterStrength}%.`
      : similarity < 70
        ? `Соперник узнаёт только часть текущего построения. Сила его контрмер: ${counterStrength}%.`
        : `Текущий стиль хорошо знаком сопернику. Сила его подготовленных ответов: ${counterStrength}%.`;
    const note = element("p", `rivalry-memory-note${similarity < 35 ? " disrupted" : ""}`, styleRead);
    if (similarity < 35) markTerm(note, "surprise");
    body.append(note);
  }

  const signals = element("section", "rivalry-memory-section");
  signals.append(element("strong", "", "Что соперник запомнил"));
  const tags = element("div", "rivalry-memory-tags");
  strongestMemoryEntries(memory.classKnowledge, 1).forEach(([classId, score]) => {
    tags.append(element("span", "rivalry-memory-tag", `Класс: ${CLASS_DEFINITIONS[classId].name} · ${Math.round(score)}%`));
  });
  strongestMemoryEntries(memory.tacticalKnowledge, 1).forEach(([style, score]) => {
    tags.append(element("span", "rivalry-memory-tag", `Тактика: ${tacticalStyleLabels[style]} · ${Math.round(score)}%`));
  });
  strongestMemoryEntries(memory.skillKnowledge, 2).forEach(([skillId, score]) => {
    tags.append(element("span", "rivalry-memory-tag", `Приём: ${skillById(skillId)?.name ?? skillId} · ${Math.round(score)}%`));
  });
  strongestMemoryEntries(memory.behaviorKnowledge, 2).forEach(([pattern, score]) => {
    tags.append(element("span", "rivalry-memory-tag", `${behaviorPatternLabels[pattern]} · ${Math.round(score)}%`));
  });
  if (!tags.childElementCount) tags.append(element("span", "rivalry-memory-empty", "Устойчивые привычки ещё не выявлены."));
  signals.append(tags);
  body.append(signals);

  const counters = element("section", "rivalry-memory-section");
  counters.append(markTerm(element("strong", "", "Подготовленные контрмеры"), "countermeasure"));
  const counterList = element("div", "rivalry-memory-counters");
  memory.countermeasureIds.forEach((id) => {
    const definition = countermeasureDefinition(id);
    if (!definition) return;
    const counter = element("div", "rivalry-memory-counter");
    counter.append(
      element("b", "", definition.name),
      element("span", "", `${definition.description} ${definition.effect}`),
    );
    counterList.append(counter);
  });
  if (!counterList.childElementCount) counterList.append(element("span", "rivalry-memory-empty", "Контрмеры появятся, если продолжать сражаться одинаково."));
  counters.append(counterList);
  body.append(counters);
  details.append(body);
  return details;
}

function displayItemName(item: EquipmentItem): string { return item.relicName ?? item.name; }

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

function tutorialStepsFor(id: ContextualTutorialId | "base"): TutorialStep[] {
  if (id !== "base") return contextualTutorialSteps[id];
  return baseTutorialSteps.filter((step) => !step.feature || game?.isFeatureUnlocked(step.feature));
}

function scheduleTutorialPosition(): void {
  if (tutorialPositionFrame !== null) window.cancelAnimationFrame(tutorialPositionFrame);
  tutorialPositionFrame = window.requestAnimationFrame(() => {
    tutorialPositionFrame = null;
    positionTutorial();
  });
}

function renderTutorial(animate = true): void {
  const step = activeTutorialSteps[tutorialStepIndex];
  if (!step) return;
  $("#tutorial-title").textContent = step.title;
  $("#tutorial-copy").textContent = step.copy;
  $("#tutorial-action-copy").textContent = step.action;
  $("#tutorial-progress").textContent = `${tutorialStepIndex + 1} / ${activeTutorialSteps.length}`;
  const back = $("#tutorial-back") as HTMLButtonElement;
  const next = $("#tutorial-next") as HTMLButtonElement;
  back.hidden = tutorialStepIndex === 0;
  next.textContent = tutorialStepIndex === activeTutorialSteps.length - 1
    ? (activeTutorialId === "base" ? "Начать игру" : "Понятно")
    : "Далее";
  showPage(step.page, false, false, false);
  window.requestAnimationFrame(() => {
    tutorialTarget = document.querySelector<HTMLElement>(step.target);
    if (!tutorialTarget) tutorialTarget = $(".game-header");
    const targetIsFixed = tutorialTarget.closest(".game-header, .main-nav");
    if (!targetIsFixed) tutorialTarget.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
    scheduleTutorialPosition();
  });
  if (animate) {
    replayAnimation($(".tutorial-dialog"), "step-changing");
  }
}

function positionTutorial(): void {
  if ($("#tutorial-layer").hidden || !tutorialTarget) return;
  const rect = tutorialTarget.getBoundingClientRect();
  const padding = 8;
  const spotlight = $("#tutorial-spotlight");
  const left = Math.max(6, rect.left - padding);
  const top = Math.max(6, rect.top - padding);
  const right = Math.min(window.innerWidth - 6, rect.right + padding);
  const bottom = Math.min(window.innerHeight - 6, rect.bottom + padding);
  spotlight.style.left = `${left}px`;
  spotlight.style.top = `${top}px`;
  spotlight.style.width = `${Math.max(24, right - left)}px`;
  spotlight.style.height = `${Math.max(24, bottom - top)}px`;

}

function openTutorial(firstVisit = false, tutorialId: ContextualTutorialId | "base" = "base"): void {
  if (!game) return;
  if (tutorialId !== "base" && game.hasSeenTutorial(tutorialId)) return;
  tutorialReturnPage = document.querySelector<HTMLElement>(".page.active")?.id.replace("page-", "") ?? "map";
  tutorialReturnScrollY = window.scrollY;
  activeTutorialId = tutorialId;
  activeTutorialSteps = tutorialStepsFor(tutorialId);
  if (!activeTutorialSteps.length) return;
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
  if (activeTutorialId === "base") game.save.tutorialCompleted = true;
  else game.markTutorialSeen(activeTutorialId);
  persist();
  $("#tutorial-layer").hidden = true;
  if (tutorialPositionFrame !== null) window.cancelAnimationFrame(tutorialPositionFrame);
  tutorialPositionFrame = null;
  tutorialTarget = null;
  activeTutorialSteps = [];
  showPage(tutorialReturnPage, false, false, false);
  window.requestAnimationFrame(() => window.scrollTo({ top: tutorialReturnScrollY, behavior: "auto" }));
  scheduleContextualTutorials();
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
  queueWorldEffect({ eyebrow: "НОВАЯ ЛЕТОПИСЬ", title: name, description: `${CLASS_DEFINITIONS[selectedClass].name} выходит на первую арену.`, symbol: classIcons[selectedClass], tone: "legendary", sound: "reputation", duration: 2600 });
}

function showPage(page: string, scrollToTop = true, refresh = true, scrollNavigation = true): void {
  $$(".main-nav button").forEach((button) => {
    const active = button.dataset.page === page;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  $$(".page").forEach((section) => section.classList.toggle("active", section.id === `page-${page}`));
  if (game && refresh) {
    switch (page) {
      case "map": renderMap(); break;
      case "hero": renderHeroVisual(); renderGearActions(); break;
      case "arsenal": renderGearActions(); renderArsenal(); break;
      case "forge": renderForge(); break;
      case "skills": renderSkills(); break;
      case "contracts": renderContracts(); break;
      case "collections": renderCollections(); break;
      case "shop": renderShop(); break;
      case "leaders": renderLeaders(true); break;
      case "elite": renderEliteLeaders(true); break;
      case "chronicle": renderChronicle(); break;
    }
  }
  const activeNavigationItem = document.querySelector<HTMLButtonElement>(`.main-nav button[data-page="${page}"]`);
  if (scrollNavigation) activeNavigationItem?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  if (scrollToTop) window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderFeatureNavigation(): void {
  if (!game) return;
  const contracts = document.querySelector<HTMLButtonElement>('.main-nav button[data-page="contracts"]');
  if (contracts) {
    const unlocked = game.isFeatureUnlocked("contracts");
    contracts.hidden = !unlocked;
    contracts.setAttribute("aria-hidden", String(!unlocked));
  }
}

function renderHeader(): void {
  if (!game) return;
  renderFeatureNavigation();
  const hero = game.save.hero;
  $("#header-portrait").textContent = classIcons[hero.classId];
  $("#header-portrait").style.setProperty("--portrait-accent", CLASS_DEFINITIONS[hero.classId].accent);
  $("#header-hero-name").textContent = hero.name;
  const championships = hero.arenaWins.reduce((total, wins) => total + wins, 0);
  const lawNames = game.save.legacy.activeLawIds.map((id) => ERA_LAWS.find((law) => law.id === id)?.name).filter((name): name is string => Boolean(name));
  const lawCount = lawNames.length ? ` · ${lawNames.length} ${lawNames.length === 1 ? "закон" : "закона"}` : "";
  const heroMeta = $("#header-hero-meta");
  heroMeta.textContent = `Эпоха ${game.save.legacy.cycle}${lawCount} · ${game.save.legacy.seals} печ. летописи · ${CLASS_DEFINITIONS[hero.classId].name} · турниры ${championships} · дуэли ${hero.duelWins}/${hero.duelLosses}`;
  heroMeta.title = lawNames.length ? `Законы эпохи: ${lawNames.join(", ")}` : "В этой эпохе нет дополнительных законов.";
  setAnimatedText("#header-level", String(hero.level));
  setAnimatedText("#header-gold", `${hero.gold} ¤`);
  setAnimatedText("#header-marks", String(hero.temperingMarks));
  const eliteRank = game.heroEliteRank();
  setAnimatedText("#header-rank", eliteRank ? `Элита #${eliteRank}` : `#${game.heroRank() ?? "—"}`);
  setAnimatedText("#header-day", String(game.save.worldDay));
  setAnimatedText("#inventory-count", String(hero.inventory.length));
  setAnimatedText("#collection-count", `${game.save.discoveredItems.length}/${ITEM_TEMPLATES.length}`);
  setAnimatedText("#contract-count", game.isFeatureUnlocked("contracts")
    ? (game.save.activeContract ? `${game.save.activeContract.progress}/${game.save.activeContract.target}` : String(game.save.contractOffers.length))
    : "0");
}

function statRow(label: string, value: string | number): HTMLElement {
  const row = element("div", "stat-row");
  const labelNode = element("span", "", label);
  const terms: Record<string, "health" | "attack" | "defense" | "speed" | "crit"> = {
    "Здоровье": "health", "Атака": "attack", "Защита": "defense", "Скорость": "speed", "Крит. шанс": "crit",
  };
  if (terms[label]) markTerm(labelNode, terms[label]);
  row.append(labelNode, element("strong", "", String(value)));
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

function renderHeroVisual(animateHistory = true): void {
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
    copy.append(element("small", "", SLOT_LABELS[slot]), element("strong", "", item ? displayItemName(item) : "Ничего не надето"), element("p", "", item ? `${RARITY_LABELS[item.rarity]} · ${itemStatsText(item)}${item.setId ? ` · комплект ${EQUIPMENT_SETS.find((set) => set.id === item.setId)?.name ?? item.setId}` : ""}` : "Слот не даёт характеристик."));
    row.append(swatch, copy);
    if (item) {
      const remove = element("button", "small-button unequip-inline", "Снять");
      remove.addEventListener("click", (event) => { event.stopPropagation(); game!.unequip(slot); persist(); refreshEquipmentViews(true); toast(`${item.name} снят.`); });
      row.append(remove);
    }
    designs.append(row);
  });
  const snapshot = combatantSnapshot(hero);
  const stats = $("#visual-stats"); stats.replaceChildren(element("p", "eyebrow", "ОБРАЗ В БОЮ"), element("h2", "", CLASS_DEFINITIONS[hero.classId].epithet));
  stats.append(statRow("Сила вещей", snapshot.equipmentScore), statRow("Крит. шанс", `${snapshot.crit}%`), statRow("Скорость", snapshot.speed));
  stats.append(element("p", "passive", CLASS_DEFINITIONS[hero.classId].passive));
  const features = element("div", "fighter-feature-list");
  features.append(element("strong", "", "Черты и последствия"));
  game.fighterFeatures(hero).forEach((feature) => {
    const row = element("div");
    row.append(element("small", "", feature.kind), element("b", "", feature.name), element("span", "", feature.description));
    const stats = featureStatsText(feature.stats);
    if (stats) row.append(element("em", "feature-stat-line", stats));
    features.append(row);
  });
  hero.injuries.forEach((injury) => {
    const row = element("div", "injury");
    row.append(element("small", "", `ТРАВМА · ${injury.remainingDays} ДН.`), element("b", "", injury.name), element("span", "", injury.description), element("em", "feature-stat-line", featureStatsText(injury.stats)));
    features.append(row);
  });
  stats.append(features);
  const editor = element("div", "appearance-editor");
  const appearanceTitle = element("strong", "", "Внешность");
  const hair = document.createElement("select");
  [["0", "Короткая"], ["1", "Зачёс назад"], ["2", "Длинная"]].forEach(([value, label]) => hair.append(new Option(label, value, false, Number(value) === hero.appearance.hairStyle)));
  hair.addEventListener("change", () => { hero.appearance.hairStyle = Number(hair.value) as 0 | 1 | 2; persist(); renderHeroVisual(false); });
  editor.append(appearanceTitle, hair); stats.append(editor);
  renderClassChangePanel();
  renderHeroHistory(animateHistory);
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
      queueWorldEffect({ eyebrow: "НОВАЯ СПЕЦИАЛИЗАЦИЯ", title: nextName, description: "Класс изменён. Навыки и подходящее снаряжение собраны заново.", symbol: "✦", tone: "legendary", sound: "reputation" });
    } catch (error) { toast((error as Error).message, "error"); }
  });
  controls.append(select, button, element("small", "", `Смен класса: ${hero.classChanges}`));
  panel.append(copy, controls);
}

function renderHeroHistory(animateItems = true): void {
  if (!game) return;
  const hero = game.save.hero;
  const allRecords = Object.values(hero.rivalries);
  const livingWorldFighters = new Map(game.save.enemies.map((enemy) => [enemy.id, enemy]));
  const records = allRecords.filter((record) => livingWorldFighters.has(record.enemyId)).sort((a, b) => {
    if (rivalrySort === "wins") return b.wins - a.wins || b.lastMetDay - a.lastMetDay;
    if (rivalrySort === "losses") return b.losses - a.losses || b.lastMetDay - a.lastMetDay;
    return b.lastMetDay - a.lastMetDay || (b.wins + b.losses) - (a.wins + a.losses);
  });
  const topHundred = new Map(game.leaderboard().map((entry, index) => [entry.id, { entry, rank: index + 1 }]));
  const elite = new Map(game.eliteLeaderboard().map((entry, index) => [entry.id, { entry, rank: index + 1 }]));
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
    renderHeroHistory(false);
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
    if (!animateItems) row.classList.add("no-entry-motion");
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
          : "Участник турниров · текущая позиция в рейтинге недоступна";
    copy.append(
      element("strong", "", record.name),
      element("small", "", `${CLASS_DEFINITIONS[record.classId].name} · последняя встреча: день ${record.lastMetDay}`),
      element("span", `rivalry-world-rank${eliteFighter ? " elite" : ranked ? " ranked" : ""}`, worldStatus),
    );
    if (worldFighter) {
      const features = game!.fighterFeatures(worldFighter).slice(0, 2).map((feature) => feature.name).join(" · ");
      if (features) copy.append(element("span", "rivalry-traits", `Характер: ${features}`));
      copy.append(renderRivalryMemory(record.enemyId, worldFighter.heroMemory, game!.enemyMemoryPreview(record.enemyId)));
    }
    const wins = element("b", "rivalry-score", String(record.wins));
    wins.setAttribute("aria-label", `Победы: ${record.wins}`);
    const losses = element("b", "rivalry-score", String(record.losses));
    losses.setAttribute("aria-label", `Проигрыши: ${record.losses}`);
    row.append(copy, wins, losses);
    rivalryList.append(row);
  });
  if (records.length === 0) rivalryList.append(element("p", "empty-copy", "Здесь появятся участники турниров, с которыми герой уже встречался на арене или в дуэли."));
  if (records.length > 0) rivalries.append(rivalryHeader);
  rivalries.append(rivalryList);

  const necrology = $("#hero-necrology");
  necrology.replaceChildren(element("p", "eyebrow", "НЕКРОЛОГ"), element("h2", "", "Погибшие противники"));
  const dead = allRecords.filter((record) => record.killed);
  const deadList = element("div", "history-list necrology-list");
  dead.forEach((record) => {
    const row = element("article", animateItems ? "" : "no-entry-motion", `${record.name} · побеждён в день ${record.lastMetDay}`);
    deadList.append(row);
  });
  if (dead.length === 0) deadList.append(element("p", "empty-copy", "Герой пока не завершил ни одной чужой истории навсегда."));
  necrology.append(deadList);
}

function activityCard(activity: ArenaDefinition | DungeonDefinition, animateItems = true): HTMLElement {
  if (!game) return element("article");
  const availability = game.availability(activity);
  const card = element("article", `activity-card ${activity.kind}${availability.unlocked ? "" : " locked"}`);
  if (!animateItems) card.classList.add("no-entry-motion");
  card.style.setProperty("--activity-accent", activity.accent);
  const index = activity.kind === "arena" ? ARENAS.findIndex((item) => item.id === activity.id) + 1 : DUNGEONS.findIndex((item) => item.id === activity.id) + 1;
  const head = element("div", "activity-head");
  head.append(element("span", "activity-number", String(index).padStart(2, "0")), element("small", "", activity.place));
  card.append(head, element("h3", "", activity.name), element("p", "", activity.description));
  const levels = element("div", "activity-levels", activity.kind === "arena"
    ? `Сетка: ${activity.participants} · каждые ${activity.tournamentInterval} дн. · приз ${activity.rewardGold} ¤`
    : `Уровни врагов: ${activity.enemyLevel[0]}–${activity.enemyLevel[1]}`);
  if (activity.kind === "arena") {
    const rules = element("div", "activity-rules", game.tournamentRules(activity.id, game.registeredTournamentDay(activity.id) ?? game.nextTournamentDay(activity.id)).map((rule) => rule.name).join(" · "));
    rules.title = game.tournamentRules(activity.id, game.registeredTournamentDay(activity.id) ?? game.nextTournamentDay(activity.id)).map((rule) => `${rule.name}: ${rule.description}`).join("\n");
    card.append(rules);
  }
  const state = element("div", "activity-state", availability.reason);
  const registeredDay = activity.kind === "arena" ? game.registeredTournamentDay(activity.id) : undefined;
  const tournamentToday = activity.kind === "arena" && registeredDay === game.save.worldDay;
  const activeDungeon = activity.kind === "dungeon" && game.save.activeExpedition?.dungeonId === activity.id;
  const anotherDungeonActive = activity.kind === "dungeon" && Boolean(game.save.activeExpedition) && !activeDungeon;
  const buttonLabel = activeDungeon ? "Продолжить поход"
    : anotherDungeonActive ? "Сначала завершите текущий поход"
      : !availability.unlocked ? "Закрыто"
    : activity.kind === "dungeon" ? "Начать вылазку"
      : tournamentToday ? "Начать турнир"
        : registeredDay ? `Записан на день ${registeredDay}`
          : `Записаться на день ${game.nextTournamentDay(activity.id)}`;
  const button = element("button", "button activity-button", buttonLabel);
  button.disabled = (!availability.unlocked && !activeDungeon) || anotherDungeonActive;
  if (activity.kind === "arena" && registeredDay && !tournamentToday) button.disabled = true;
  button.addEventListener("click", () => {
    if (activeDungeon) openDungeonWindow();
    else if (activity.kind === "dungeon") startActivity(activity.id);
    else if (tournamentToday) startTournament(activity.id);
    else registerForTournament(activity.id);
  });
  card.append(levels, state, button);
  return card;
}

function registerForTournament(arenaId: string): void {
  if (!game) return;
  try {
    const day = game.registerTournament(arenaId); persist(); refreshMapViews(false);
    toast(`Место зарезервировано. Турнир начнётся в день ${day}.`);
    queueWorldEffect({ eyebrow: "КАЛЕНДАРЬ ТУРНИРОВ", title: `Запись на день ${day}`, description: "Место в сетке закреплено за героем. В день события появится напоминание.", symbol: "◇", sound: "choice" });
  } catch (error) { toast((error as Error).message, "error"); }
}

function registerForCrownLeague(): void {
  if (!game) return;
  try {
    const day = game.registerCrownLeague();
    persist();
    refreshMapViews(false);
    toast(`Место в Лиге короны зарезервировано на день ${day}.`);
    queueWorldEffect({ eyebrow: "ЭЛИТНЫЙ ОТБОР", title: `Лига короны · день ${day}`, description: "Победа в редком турнире откроет дорогу в элитную тридцатку.", symbol: "♛", tone: "legendary", sound: "reputation" });
  } catch (error) { toast((error as Error).message, "error"); }
}

interface ScheduledTournament {
  id: string;
  name: string;
  participants: number;
  rewardGold: number;
  place: string;
  crownLeague: boolean;
}

function tournamentsScheduledToday(): ScheduledTournament[] {
  if (!game) return [];
  const scheduled: ScheduledTournament[] = ARENAS
    .filter((arena) => game!.registeredTournamentDay(arena.id) === game!.save.worldDay)
    .map((arena) => ({ ...arena, crownLeague: false }));
  if (game.registeredCrownLeagueDay() === game.save.worldDay) {
    const crown = ENDGAME_ACTIVITIES.find((activity) => activity.id === "crown-league")!;
    scheduled.push({
      id: crown.id,
      name: crown.name,
      participants: 30,
      rewardGold: crown.rewardGold,
      place: crown.place,
      crownLeague: true,
    });
  }
  return scheduled;
}

function tournamentReminderKey(arenas: ScheduledTournament[]): string {
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
    start.addEventListener("click", () => arena.crownLeague ? startEndgame("crown-league") : startTournament(arena.id));
    row.append(copy, start);
    return row;
  }));
  reminder.hidden = false;
}

function renderMap(animateItems = true): void {
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
  const arenaRoute = $("#arena-route"); arenaRoute.replaceChildren(...ARENAS.map((arena) => activityCard(arena, animateItems)));
  const dungeonRoute = $("#dungeon-route"); dungeonRoute.replaceChildren(...DUNGEONS.map((dungeon) => activityCard(dungeon, animateItems)));
  renderExpedition();
  const tournamentsToday = tournamentsScheduledToday().length;
  const openTournaments = ARENAS.filter((arena) => game!.availability(arena).unlocked).length;
  const openDungeons = DUNGEONS.filter((dungeon) => game!.availability(dungeon).unlocked).length;
  const openDuels = DUEL_TIERS.filter((duel) => game!.availability(duel).unlocked).length;
  const openBosses = DUEL_BOSSES.filter((boss) => !game!.save.defeatedBosses.includes(boss.id) && game!.availability(boss).unlocked).length;
  $("#quick-duel-status").textContent = `${openDuels} доступно`;
  $("#quick-boss-status").textContent = openBosses > 0 ? `${openBosses} готовы к бою` : "Нет доступных";
  $("#quick-tournament-status").textContent = tournamentsToday > 0 ? `${tournamentsToday} сегодня` : `${openTournaments} открыто`;
  $("#quick-dungeon-status").textContent = `${openDungeons} доступно`;
  const crownAvailable = game.crownLeagueAvailability().unlocked;
  const crownRegistrationDay = game.registeredCrownLeagueDay();
  const huntAvailable = game.legendHuntAvailability().unlocked;
  const newEraAvailable = game.newGamePlusStatus().unlocked;
  $("#quick-endgame-status").textContent = newEraAvailable
    ? `Эпоха ${game.save.legacy.cycle + 1} готова`
    : huntAvailable
    ? "Легенда найдена"
    : crownAvailable
      ? game.crownLeagueTier().name
      : crownRegistrationDay ? `Лига: день ${crownRegistrationDay}` : "Закрыто";
  renderDuels(animateItems);
  renderEndgame(animateItems);
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

function renderExpedition(): void {
  if (!game) return;
  const board = $("#expedition-board");
  const expedition = game.save.activeExpedition;
  if (!expedition) { board.hidden = true; board.replaceChildren(); return; }
  const dungeon = DUNGEONS.find((candidate) => candidate.id === expedition.dungeonId)!;
  board.hidden = false;
  const heading = element("header", "expedition-heading");
  const copy = element("div");
  copy.append(element("p", "eyebrow", "ПОХОД ПРОДОЛЖАЕТСЯ"), element("h3", "", dungeon.name), element("p", "", `Этап ${expedition.stage + 1} из ${expedition.maxStages}. Решение влияет на риск и объём добычи.`));
  const condition = element("div", "expedition-condition");
  condition.append(statRow("Силы", `${expedition.health}%`), statRow("Монеты", expedition.accumulatedGold), statRow("Опыт", expedition.accumulatedExperience), statRow("Трофеи", expedition.loot.length));
  heading.append(copy, condition);
  const choices = element("div", "expedition-choices");
  game.expeditionChoices().forEach((choice) => {
    const card = element("article", `expedition-choice ${choice.id}`);
    card.append(element("small", "", `РИСК: ${choice.danger.toUpperCase()}`), element("h4", "", choice.name), element("p", "", choice.description), element("span", "", `Награда: ${choice.reward}`));
    const button = element("button", "button", "Выбрать путь");
    button.addEventListener("click", () => advanceExpedition(choice.id));
    card.append(button); choices.append(card);
  });
  const retreat = element("button", "plain-button expedition-retreat", "Отступить и сохранить часть найденного");
  retreat.addEventListener("click", retreatExpedition);
  const path = element("p", "expedition-path", expedition.path.length ? `Пройденный путь: ${expedition.path.map((id) => id === "risk" ? "риск" : id === "rest" ? "лагерь" : "проход").join(" → ")}` : "Поход только начался.");
  board.replaceChildren(heading, choices, path, retreat);
}

function openDungeonWindow(): void {
  if (!game?.save.activeExpedition) return;
  const dungeon = DUNGEONS.find((candidate) => candidate.id === game!.save.activeExpedition?.dungeonId);
  $("#dungeon-window-kicker").textContent = "ЭКСПЕДИЦИЯ ПРОДОЛЖАЕТСЯ";
  $("#dungeon-window-title").textContent = dungeon?.name ?? "Путь в глубину";
  $("#dungeon-reward-view").hidden = true;
  $("#dungeon-expedition-view").hidden = false;
  renderExpedition();
  $("#dungeon-layer").hidden = false;
}

function closeDungeonWindow(): void {
  if (!$("#dungeon-reward-view").hidden) {
    closeExpeditionRewards();
    return;
  }
  $("#dungeon-layer").hidden = true;
}

function renderDuels(animateItems = true): void {
  if (!game) return;
  $("#duel-summary").textContent = `Победы ${game.save.hero.duelWins} · поражения ${game.save.hero.duelLosses}. Мировой рейтинг от этих боёв не меняется.`;
  const route = $("#duel-route"); route.replaceChildren();
  DUEL_TIERS.forEach((duel, index) => {
    const availability = game!.availability(duel);
    const card = element("article", `activity-card duel${availability.unlocked ? "" : " locked"}`);
    if (!animateItems) card.classList.add("no-entry-motion");
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
    if (!animateItems) card.classList.add("no-entry-motion");
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

function statComparisonRow(stat: ComparisonStat, current: number, candidate: number, className: string): HTMLElement {
  const difference = candidate - current;
  const state = difference > 0 ? "positive" : difference < 0 ? "negative" : "neutral";
  const row = element("div", `${className} ${state}`);
  const values = element("span", "stat-comparison-values");
  values.append(element("i", "", String(current)), element("b", "", "→"), element("i", "", String(candidate)));
  row.append(
    element("span", "stat-comparison-label", comparisonStatLabels[stat]),
    values,
    element("strong", "stat-comparison-delta", difference > 0 ? `+${difference}` : String(difference)),
  );
  return row;
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
    refreshEquipmentViews(true);
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
  list.replaceChildren(...comparisonStats.map((key) => statComparisonRow(key, currentStats[key], candidateStats[key], "comparison-stat")));

  const equip = $("#comparison-equip") as HTMLButtonElement;
  const alreadyEquipped = game.save.hero.equipped[candidate.slot] === candidate.id;
  if (shopOffer) {
    equip.disabled = shopOffer.sold || game.save.hero.gold < candidate.price;
    equip.textContent = shopOffer.sold ? "Продано" : `Купить · ${candidate.price} ¤`;
    equip.onclick = () => {
      try {
        const bought = game!.buy(comparisonShopIndex!);
        persist(); closeEquipmentComparison(); renderShop(); renderCollections(); refreshEquipmentViews(true); toast(`${bought.name} добавлен в инвентарь.`);
        queueWorldEffect({ eyebrow: "НОВАЯ ПОКУПКА", title: bought.name, description: `${RARITY_LABELS[bought.rarity]} снаряжение добавлено в инвентарь.`, symbol: "◆", tone: rarityAtLeastUi(bought.rarity, "legendary") ? "legendary" : "positive", sound: "loot" });
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

function concealLootReminder(): void {
  if (lootReminderTimer !== null) window.clearTimeout(lootReminderTimer);
  lootReminderTimer = null;
  const reminder = $("#loot-reminder");
  reminder.hidden = true;
  reminder.classList.remove("is-visible");
}

function hideLootReminder(): void {
  concealLootReminder();
  lootReminderQueue = [];
  lootReminderIndex = 0;
}

function lootReminderItemContent(container: HTMLElement, item: EquipmentItem | undefined, heading: string): void {
  container.replaceChildren(element("small", "", heading));
  container.style.removeProperty("--rarity-color");
  if (!item) {
    container.append(element("strong", "", "Слот пуст"), element("p", "", "Предмет этого типа не надет."));
    return;
  }
  container.style.setProperty("--rarity-color", rarityColors[item.rarity]);
  container.append(
    element("strong", "", item.name),
    element("p", "", `${RARITY_LABELS[item.rarity]} · ${item.level} ур.`),
    element("p", "loot-reminder-stats", itemStatsText(item)),
  );
}

function renderLootReminder(): void {
  if (!game) return;
  concealLootReminder();
  const queued = lootReminderQueue[lootReminderIndex];
  if (!queued) {
    hideLootReminder();
    return;
  }
  const item = game.save.hero.inventory.find((candidate) => candidate.id === queued.itemId);
  if (!item) {
    advanceLootReminder();
    return;
  }
  const equippedItemId = queued.equippedItemId;
  const equipped = equippedItemId ? game.save.hero.inventory.find((candidate) => candidate.id === equippedItemId) : undefined;
  lootReminderItemContent($("#loot-reminder-equipped"), equipped, "НАДЕТО");
  lootReminderItemContent($("#loot-reminder-candidate"), item, "ДОБЫЧА");
  $("#loot-reminder-title").textContent = item.name;
  $("#loot-reminder-progress").textContent = lootReminderQueue.length > 1
    ? `ПОЛУЧЕНА ДОБЫЧА · ${lootReminderIndex + 1} ИЗ ${lootReminderQueue.length}`
    : "ПОЛУЧЕНА ДОБЫЧА";

  const currentStats = effectiveItemStats(equipped);
  const candidateStats = effectiveItemStats(item);
  $("#loot-reminder-difference").replaceChildren(
    ...comparisonStats.map((stat) => statComparisonRow(stat, currentStats[stat], candidateStats[stat], "loot-reminder-stat")),
  );

  const equip = $("#loot-reminder-equip") as HTMLButtonElement;
  const alreadyEquipped = game.save.hero.equipped[item.slot] === item.id;
  equip.disabled = alreadyEquipped || !canHeroEquip(item);
  equip.textContent = alreadyEquipped ? "Уже надето автоматически" : canHeroEquip(item) ? "Надеть" : "Не подходит классу";
  equip.onclick = () => {
    try {
      game!.equip(item.id); persist(); refreshEquipmentViews(true); advanceLootReminder(); toast(`${item.name} экипирован.`);
    } catch (error) { toast((error as Error).message, "error"); }
  };

  const reminder = $("#loot-reminder");
  reminder.hidden = false;
  void reminder.offsetWidth;
  reminder.classList.add("is-visible");
  lootReminderTimer = window.setTimeout(advanceLootReminder, 5_000);
}

function advanceLootReminder(): void {
  concealLootReminder();
  lootReminderIndex += 1;
  if (lootReminderIndex >= lootReminderQueue.length) {
    hideLootReminder();
    return;
  }
  window.setTimeout(renderLootReminder, 40);
}

function showLootReminders(items: EquipmentItem[], equipmentBefore: Partial<Record<EquipmentSlot, string>> | null): void {
  hideLootReminder();
  if (items.length === 0) return;
  lootReminderQueue = items.map((item) => ({ itemId: item.id, equippedItemId: equipmentBefore?.[item.slot] ?? null }));
  lootReminderIndex = 0;
  renderLootReminder();
}

function itemCountLabel(count: number): string {
  const tail = count % 100;
  const last = count % 10;
  if (tail >= 11 && tail <= 19) return `${count} предметов`;
  if (last === 1) return `${count} предмет`;
  if (last >= 2 && last <= 4) return `${count} предмета`;
  return `${count} предметов`;
}

function expeditionRewardItem(item: EquipmentItem): HTMLElement {
  const card = element("article", "expedition-reward-item");
  card.style.setProperty("--rarity-color", rarityColors[item.rarity]);
  const art = equipmentArtwork(item.slot, classForTemplate(item.allowedClasses), "equipment-art", item);
  const copy = element("div");
  copy.append(
    element("small", "", `${RARITY_LABELS[item.rarity]} · ${SLOT_LABELS[item.slot]}`),
    element("strong", "", displayItemName(item)),
  );
  card.append(art, copy);
  return card;
}

function openExpeditionRewards(
  result: ExpeditionStepReport,
  items: EquipmentItem[],
  equipmentBefore: Partial<Record<EquipmentSlot, string>> | null,
): void {
  hideLootReminder();
  const rewards = result.rewards;
  const dungeon = DUNGEONS.find((candidate) => candidate.id === result.expedition?.dungeonId);
  expeditionRewardFollowup = { items, equipmentBefore };
  $("#dungeon-window-kicker").textContent = result.completed ? "ЭКСПЕДИЦИЯ ЗАВЕРШЕНА" : "ВОЗВРАЩЕНИЕ ИЗ ПОХОДА";
  $("#dungeon-window-title").textContent = result.completed
    ? `Исследован данж «${dungeon?.name ?? "Неизвестный путь"}»`
    : "Часть добычи удалось спасти";
  $("#expedition-reward-copy").textContent = result.message;
  const progress = result.expedition ? `${result.expedition.stage} / ${result.expedition.maxStages}` : "—";
  $("#expedition-reward-stats").replaceChildren(
    rewardStat("Пройдено этапов", progress),
    rewardStat("Получено опыта", `+${rewards?.experience ?? 0}`),
    rewardStat("Получено монет", `+${rewards?.gold ?? 0}`),
    rewardStat("Новых уровней", `+${rewards?.levelsGained ?? 0}`),
  );
  $("#expedition-reward-loot-count").textContent = itemCountLabel(items.length);
  const loot = $("#expedition-reward-items");
  loot.replaceChildren(...(items.length
    ? items.map(expeditionRewardItem)
    : [element("p", "expedition-reward-empty", result.completed
      ? "В этот раз снаряжение не найдено, но опыт и монеты уже начислены."
      : "При отступлении найденные предметы сохранить не удалось.")]));
  $("#dungeon-expedition-view").hidden = true;
  $("#dungeon-reward-view").hidden = false;
  $("#dungeon-layer").hidden = false;
}

function rewardStat(label: string, value: string): HTMLElement {
  const card = element("article", "expedition-reward-stat");
  card.append(element("small", "", label), element("strong", "", value));
  return card;
}

function closeExpeditionRewards(): void {
  $("#dungeon-layer").hidden = true;
  $("#dungeon-reward-view").hidden = true;
  $("#dungeon-expedition-view").hidden = false;
  const followup = expeditionRewardFollowup;
  expeditionRewardFollowup = null;
  if (followup?.items.length) window.setTimeout(() => showLootReminders(followup.items, followup.equipmentBefore), 120);
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
      game!.unequip(slot); persist(); refreshEquipmentViews(true); renderEquipmentPicker(); toast(`${equipped.name} снят.`);
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
  const rarity = markTerm(element("span", "rarity-label", RARITY_LABELS[item.rarity]), "rarity");
  head.append(element("span", "item-slot", SLOT_LABELS[item.slot]), rarity);
  const artwork = equipmentArtwork(item.slot, classForTemplate(item.allowedClasses), "equipment-art", item);
  artwork.style.setProperty("--rarity-color", rarityColors[item.rarity]);
  const legacyVisible = game.isFeatureUnlocked("equipment-legacy") && rarityAtLeastUi(item.rarity, "legendary");
  const progress = element("small", "", `Предмет ${item.level} уровня${item.enhancement ? ` · закалка +${item.enhancement}` : ""}${legacyVisible ? ` · наследие ${item.relicTier ?? 0}/3` : ""}`);
  if (legacyVisible) markTerm(progress, "relic");
  else if (item.enhancement) markTerm(progress, "enhancement");
  card.append(head, artwork, element("h3", "", displayItemName(item)), progress, element("p", "item-stats", itemStatsText(item)));
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
        persist(); refreshEquipmentViews(true); toast(equipped ? `${item.name} снят.` : `${item.name} экипирован.`);
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
        renderArsenal(false);
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
    buy.addEventListener("click", () => {
      try {
        const bought = game!.buy(shopIndex);
        persist();
        renderShop();
        renderCollections();
        refreshEquipmentViews(true);
        toast(`${bought.name} добавлен в инвентарь.`);
        queueWorldEffect({ eyebrow: "НОВАЯ ПОКУПКА", title: bought.name, description: `${RARITY_LABELS[bought.rarity]} снаряжение добавлено в инвентарь.`, symbol: "◆", tone: rarityAtLeastUi(bought.rarity, "legendary") ? "legendary" : "positive", sound: "loot" });
      } catch (error) { toast((error as Error).message, "error"); }
    });
    controls.append(compare, buy);
  }
  card.append(controls);
  return card;
}

function renderArsenal(animateItems = true): void {
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
  inventory.replaceChildren(...visibleItems.map((item) => {
    const card = createItemCard(item, "inventory");
    if (!animateItems) card.classList.add("no-entry-motion");
    return card;
  }));
  if (items.length === 0) inventory.append(element("p", "empty-copy", "По выбранным фильтрам предметов нет."));
  $("#inventory-result-count").textContent = `Показано ${visibleItems.length} из ${items.length}`;
  const equippedIds = new Set(Object.values(game.save.hero.equipped));
  const bulkSell = $("#inventory-sell-unequipped") as HTMLButtonElement;
  const sellableUnequipped = game.save.hero.inventory.filter((item) => !equippedIds.has(item.id) && game!.canSell(item.id)).length;
  bulkSell.disabled = sellableUnequipped === 0;
  bulkSell.replaceChildren(
    element("span", "", sellableUnequipped > 0 ? `Продать неиспользуемое · ${sellableUnequipped}` : "Нет неиспользуемых вещей"),
    element("small", "", "Надетое и регалии останутся"),
  );
  const more = $("#inventory-more") as HTMLButtonElement;
  more.hidden = visibleItems.length >= items.length;
  const snapshot = combatantSnapshot(game.save.hero);
  const stats = $("#hero-stats"); stats.replaceChildren(element("h2", "", "Итоговые характеристики"));
  stats.append(statRow("Здоровье", snapshot.maxHealth), statRow("Атака", snapshot.attack), statRow("Защита", snapshot.defense), statRow("Скорость", snapshot.speed), statRow("Крит. шанс", `${snapshot.crit}%`), statRow("Сила вещей", snapshot.equipmentScore));
  stats.append(element("p", "stats-hint", "Характеристики уже включают уровень, экипировку, свойства редкости и активные бонусы комплектов."));
}

function renderSkills(animateItems = true): void {
  if (!game) return;
  const hero = game.save.hero;
  const activeItems = equippedItems();
  const availableSkills = unlockedSkills(hero.classId, hero.level, activeItems, hero.legacySkillId ? [hero.legacySkillId] : []);
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
  autoBuildInput.addEventListener("change", () => { game!.setAutoSelectSkills(autoBuildInput.checked); persist(); renderSkills(false); });
  const modeLabel = element("span", "tactic-label", "Ведение боя");
  const modeButtons = element("div", "tactic-mode-buttons");
  (["auto", "manual"] as const).forEach((mode) => {
    const button = element("button", hero.combatMode === mode ? "active" : "", mode === "auto" ? "Автоматически" : "Подтверждать ходы");
    button.type = "button";
    button.addEventListener("click", () => { game!.setCombatMode(mode); persist(); renderSkills(false); });
    modeButtons.append(button);
  });
  const profileLabel = element("label", "tactical-profile-picker");
  profileLabel.append(element("span", "tactic-label", "Тактический профиль"));
  const profileSelect = document.createElement("select");
  hero.tacticalProfiles.forEach((profile) => profileSelect.append(new Option(profile.name, profile.id, false, profile.id === hero.activeTacticalProfileId)));
  profileSelect.addEventListener("change", () => { game!.setTacticalProfile(profileSelect.value); persist(); renderSkills(false); });
  const activeProfile = game.activeTacticalProfile();
  const profileDescription = activeProfile.style === "aggressive" ? "Раньше использует добивающие атаки и реже лечится."
    : activeProfile.style === "defensive" ? "Сохраняет сильные навыки и раньше восстанавливается."
      : activeProfile.style === "control" ? "Сначала нарушает темп и ослабляет противника."
        : "Универсальный порядок решений без перекоса.";
  profileLabel.append(profileSelect, element("small", "", profileDescription));
  controls.append(autoBuild, modeLabel, modeButtons, profileLabel);
  tactics.append(copy, controls);

  const toggleSkill = (skillId: string) => {
    const next = new Set(hero.selectedSkillIds.filter((id) => available.has(id)));
    if (next.has(skillId)) next.delete(skillId);
    else if (next.size < MAX_ACTIVE_SKILLS) next.add(skillId);
    else { toast(`Можно выбрать не больше ${MAX_ACTIVE_SKILLS} навыков.`, "error"); return; }
    game!.setAutoSelectSkills(false);
    game!.setSelectedSkills([...next]);
    persist(); renderSkills(false);
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
    if (!animateItems) node.classList.add("no-entry-motion");
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
    const remembered = game!.save.legacy.discoveredSkillIds.includes(skill.id);
    const status = activeSource ? "АКТИВЕН ОТ ЭКИПИРОВКИ" : owned.length ? "ЕСТЬ В ИНВЕНТАРЕ" : remembered ? "ЗАПИСАН В ЛЕТОПИСИ" : "ЕЩЁ НЕ НАЙДЕН";
    const source = activeSource ? `Источник: ${activeSource.name}.` : owned.length ? `Найден на: ${owned[0].name}. Наденьте предмет, чтобы активировать приём.` : remembered ? "Приём был найден в прежней эпохе. Для применения всё равно требуется подходящий предмет." : "Ищите на легендарных и мифических предметах.";
    return skillCard(skill, status, Boolean(activeSource), source);
  }));
}

function renderNewChronicleStatus(): void {
  if (!game) return;
  const status = game.newGamePlusStatus();
  const panel = $("#new-chronicle-status");
  panel.classList.toggle("available", status.unlocked);
  const completeCount = status.requirements.filter((requirement) => requirement.met).length;
  const title = element("div");
  const chronicleTitle = element("h3", "", "Завершение летописи");
  markTerm(chronicleTitle, "newChronicle");
  title.append(
    element("p", "eyebrow", `ЭПОХА ${game.save.legacy.cycle} · ${legacyTitleForCycle(game.save.legacy.cycle + 1).toUpperCase()}`),
    chronicleTitle,
    element("p", "", status.unlocked
      ? `Мир готов отпустить героя. За переход будет получено ${status.sealsAwarded} печатей летописи.`
      : "Новая эпоха — не удаление сохранения, а продолжение истории другим героем."),
  );
  const progress = element("div", "new-chronicle-progress");
  progress.append(element("strong", "", `${completeCount} из ${status.requirements.length} условий`));
  const line = element("div", "new-chronicle-progress-line");
  line.style.setProperty("--chronicle-progress", `${completeCount / status.requirements.length * 100}%`);
  line.append(element("i"));
  const list = element("ul", "chronicle-requirements");
  status.requirements.forEach((requirement) => list.append(element("li", `chronicle-requirement ${requirement.met ? "complete" : "locked"}`, requirement.label)));
  progress.append(line, list);
  const actions = element("div", "chronicle-status-actions");
  const begin = element("button", "button primary", status.unlocked ? `Начать эпоху ${status.targetCycle}` : "Путь ещё не завершён");
  begin.type = "button";
  begin.disabled = !status.unlocked;
  begin.addEventListener("click", openNewChronicleDialog);
  actions.append(begin);
  if (game.save.legacy.archives.length > 0) {
    const archive = element("button", "plain-button", `Архив эпох · ${game.save.legacy.archives.length}`);
    archive.type = "button";
    archive.addEventListener("click", () => { showPage("chronicle"); showChronicleView("archive"); });
    actions.append(archive);
    const legacyAvailability = game.legacyChampionAvailability();
    const echo = element("button", "plain-button", legacyAvailability.unlocked ? "Вызвать героя прошлого" : "Герой прошлого закрыт");
    echo.type = "button";
    echo.disabled = !legacyAvailability.unlocked;
    echo.title = legacyAvailability.reason;
    echo.addEventListener("click", startLegacyChampion);
    actions.append(echo);
  }
  panel.replaceChildren(title, progress, actions);
}

function openNewChronicleDialog(): void {
  if (!game) return;
  const status = game.newGamePlusStatus();
  if (!status.unlocked) { toast(status.reason, "error"); return; }
  newChronicleStep = 0;
  newChronicleClass = game.save.hero.classId;
  newChronicleName = game.save.hero.name;
  selectedLegacyId = LEGACY_BOONS.find((boon) => boon.sealCost <= status.availableSeals)?.id ?? null;
  const candidates = game.heirloomCandidates(newChronicleClass);
  const equippedIds = new Set(Object.values(game.save.hero.equipped));
  selectedHeirloomItemId = candidates.find((item) => equippedIds.has(item.id))?.id ?? candidates[0]?.id ?? null;
  selectedWorldLawIds = ERA_LAWS.slice(0, status.lawLimit).map((law) => law.id);
  newChronicleConfirmed = false;
  newChronicleReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  $("#new-chronicle-layer").hidden = false;
  document.body.classList.add("new-chronicle-open");
  renderNewChronicleStep();
  window.requestAnimationFrame(() => $("#new-chronicle-title").focus());
}

function closeNewChronicleDialog(): void {
  if ($("#new-chronicle-layer").hidden) return;
  $("#new-chronicle-layer").hidden = true;
  document.body.classList.remove("new-chronicle-open");
  const returnFocus = newChronicleReturnFocus;
  newChronicleReturnFocus = null;
  window.requestAnimationFrame(() => returnFocus?.focus());
}

function newChronicleHeading(eyebrow: string, title: string, copy: string): HTMLElement {
  const heading = element("header", "new-chronicle-stage-heading");
  const name = element("div");
  const titleNode = element("h3", "", title);
  titleNode.tabIndex = -1;
  name.append(element("p", "eyebrow", eyebrow), titleNode);
  heading.append(name, element("p", "", copy));
  return heading;
}

function focusNewChronicleStep(): void {
  window.requestAnimationFrame(() => {
    $("#new-chronicle-stage h3")?.focus();
    const activeStep = document.querySelector<HTMLElement>("#new-chronicle-steps li.active");
    const strip = activeStep?.parentElement;
    if (activeStep && strip) strip.scrollTo({ left: activeStep.offsetLeft - (strip.clientWidth - activeStep.offsetWidth) / 2, behavior: "smooth" });
  });
}

function renderNewChronicleStep(): void {
  if (!game) return;
  const status = game.newGamePlusStatus();
  const stage = $("#new-chronicle-stage");
  $("#new-chronicle-progress").textContent = `Шаг ${newChronicleStep + 1} из 4`;
  $$("#new-chronicle-steps li").forEach((item, index) => {
    item.classList.toggle("active", index === newChronicleStep);
    item.classList.toggle("complete", index < newChronicleStep);
    if (index === newChronicleStep) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
  });
  const back = $<HTMLButtonElement>("#new-chronicle-back");
  const next = $<HTMLButtonElement>("#new-chronicle-next");
  const confirm = $<HTMLButtonElement>("#new-chronicle-confirm");
  back.disabled = newChronicleStep === 0;
  next.hidden = newChronicleStep === 3;
  confirm.hidden = newChronicleStep !== 3;

  if (newChronicleStep === 0) {
    stage.replaceChildren(newChronicleHeading("ПОСТОЯННЫЙ СЛЕД", "Выберите наследие", `Доступно ${status.availableSeals} печатей. Стоимость будет списана только после подтверждения перехода.`));
    const grid = element("div", "new-chronicle-choice-grid");
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", "Варианты наследия");
    LEGACY_BOONS.forEach((boon) => {
      const card = element("button", `new-chronicle-choice${selectedLegacyId === boon.id ? " selected" : ""}`);
      card.type = "button";
      card.disabled = boon.sealCost > status.availableSeals;
      card.dataset.choiceId = boon.id;
      card.setAttribute("aria-pressed", String(selectedLegacyId === boon.id));
      if (card.disabled) card.title = `Нужно печатей летописи: ${boon.sealCost}. Доступно: ${status.availableSeals}.`;
      card.style.setProperty("--choice-accent", "#715063");
      card.append(element("small", "", `${boon.sealCost} ПЕЧ.`), element("strong", "", boon.name), element("p", "", boon.description), element("b", "", boon.effect));
      card.addEventListener("click", () => {
        selectedLegacyId = boon.id;
        grid.querySelectorAll<HTMLButtonElement>(".new-chronicle-choice").forEach((choice) => {
          const selected = choice.dataset.choiceId === boon.id;
          choice.classList.toggle("selected", selected);
          choice.setAttribute("aria-pressed", String(selected));
        });
        next.disabled = false;
      });
      grid.append(card);
    });
    stage.append(grid);
    next.disabled = !selectedLegacyId;
    return;
  }

  if (newChronicleStep === 1) {
    stage.replaceChildren(newChronicleHeading("ИМЯ И РЕЛИКВИЯ", "Кто продолжит путь", "Выберите класс наследника и одну вещь прошлого. Её характеристики, уровень и закалка будут честно пересчитаны для начала игры."));
    const identity = element("div", "new-chronicle-identity");
    const nameLabel = element("label", "new-chronicle-name");
    nameLabel.append(element("span", "", "Имя нового героя"));
    const nameInput = element("input") as HTMLInputElement;
    nameInput.value = newChronicleName;
    nameInput.maxLength = 28;
    nameInput.autocomplete = "off";
    nameInput.addEventListener("input", () => { newChronicleName = nameInput.value; next.disabled = newChronicleName.trim().length < 2; });
    nameLabel.append(nameInput);
    const classGrid = element("div", "new-chronicle-class-grid");
    classGrid.setAttribute("role", "radiogroup");
    classGrid.setAttribute("aria-label", "Класс нового героя");
    (Object.values(CLASS_DEFINITIONS)).forEach((definition) => {
      const button = element("button", `new-chronicle-class${definition.id === newChronicleClass ? " selected" : ""}`, `${classIcons[definition.id]} ${definition.name}`);
      button.type = "button";
      button.setAttribute("role", "radio");
      button.setAttribute("aria-checked", String(definition.id === newChronicleClass));
      button.style.setProperty("--choice-accent", definition.accent);
      button.addEventListener("click", () => {
        newChronicleClass = definition.id;
        if (selectedHeirloomItemId && !game!.heirloomCandidates(newChronicleClass).some((item) => item.id === selectedHeirloomItemId)) selectedHeirloomItemId = null;
        renderNewChronicleStep();
        window.requestAnimationFrame(() => document.querySelector<HTMLElement>(".new-chronicle-class.selected")?.focus());
      });
      classGrid.append(button);
    });
    identity.append(nameLabel, classGrid);
    const grid = element("div", "new-chronicle-choice-grid heirloom-grid");
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", "Предмет-наследие");
    const noItem = element("button", `new-chronicle-choice${selectedHeirloomItemId === null ? " selected" : ""}`);
    noItem.type = "button";
    noItem.dataset.choiceId = "none";
    noItem.setAttribute("aria-pressed", String(selectedHeirloomItemId === null));
    noItem.append(element("small", "", "БЕЗ ПРЕДМЕТА"), element("strong", "", "Чистое начало"), element("p", "", "Начать только с обычного классового снаряжения."), element("b", "", "Никаких скрытых штрафов."));
    noItem.addEventListener("click", () => {
      selectedHeirloomItemId = null;
      grid.querySelectorAll<HTMLButtonElement>(".new-chronicle-choice").forEach((choice) => {
        const selected = choice.dataset.choiceId === "none";
        choice.classList.toggle("selected", selected);
        choice.setAttribute("aria-pressed", String(selected));
      });
    });
    grid.append(noItem);
    game.heirloomCandidates(newChronicleClass).forEach((item) => {
      const card = element("button", `new-chronicle-choice${selectedHeirloomItemId === item.id ? " selected" : ""}`);
      card.type = "button";
      card.dataset.choiceId = item.id;
      card.setAttribute("aria-pressed", String(selectedHeirloomItemId === item.id));
      card.style.setProperty("--choice-accent", rarityColors[item.rarity]);
      card.append(
        equipmentArtwork(item.slot, newChronicleClass, "new-chronicle-item-art equipment-art", item),
        element("small", "", `${SLOT_LABELS[item.slot]} · ${RARITY_LABELS[item.rarity]}`),
        element("strong", "", displayItemName(item)),
        element("p", "", "В новой эпохе станет редким предметом 1 уровня без прежней закалки."),
        element("b", "", item.grantedSkillId ? `Сохранит навык: ${skillById(item.grantedSkillId)?.name ?? item.grantedSkillId}` : "Сохранит внешний вид и историю."),
      );
      card.addEventListener("click", () => {
        selectedHeirloomItemId = item.id;
        grid.querySelectorAll<HTMLButtonElement>(".new-chronicle-choice").forEach((choice) => {
          const selected = choice.dataset.choiceId === item.id;
          choice.classList.toggle("selected", selected);
          choice.setAttribute("aria-pressed", String(selected));
        });
      });
      grid.append(card);
    });
    stage.append(identity, grid);
    next.disabled = newChronicleName.trim().length < 2;
    return;
  }

  if (newChronicleStep === 2) {
    stage.replaceChildren(newChronicleHeading("ПРАВИЛА НОВОГО МИРА", `Выберите ${status.lawLimit} ${status.lawLimit === 1 ? "закон" : "закона"}`, "Законы меняют не уровни врагов, а условия боёв, наград и жизни элиты. Их нельзя заменить внутри эпохи."));
    const grid = element("div", "new-chronicle-choice-grid");
    grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", "Законы новой эпохи");
    ERA_LAWS.forEach((law) => {
      const selected = selectedWorldLawIds.includes(law.id);
      const card = element("button", `new-chronicle-choice${selected ? " selected" : ""}`);
      card.type = "button";
      card.dataset.choiceId = law.id;
      card.setAttribute("aria-pressed", String(selected));
      card.style.setProperty("--choice-accent", law.accent);
      card.append(element("small", "", selected ? "ВЫБРАН" : "ЗАКОН ЭПОХИ"), element("strong", "", law.name), element("p", "", law.description), element("b", "", law.effect));
      card.addEventListener("click", () => {
        const isSelected = selectedWorldLawIds.includes(law.id);
        if (isSelected) selectedWorldLawIds = selectedWorldLawIds.filter((id) => id !== law.id);
        else if (status.lawLimit === 1) selectedWorldLawIds = [law.id];
        else if (selectedWorldLawIds.length < status.lawLimit) selectedWorldLawIds.push(law.id);
        else { toast(`Можно выбрать не больше ${status.lawLimit}.`, "error"); return; }
        grid.querySelectorAll<HTMLButtonElement>(".new-chronicle-choice").forEach((choice) => {
          const nowSelected = selectedWorldLawIds.includes(choice.dataset.choiceId as EraLawId);
          choice.classList.toggle("selected", nowSelected);
          choice.setAttribute("aria-pressed", String(nowSelected));
          choice.querySelector("small")!.textContent = nowSelected ? "ВЫБРАН" : "ЗАКОН ЭПОХИ";
        });
        next.disabled = selectedWorldLawIds.length !== status.lawLimit;
      });
      grid.append(card);
    });
    stage.append(grid);
    next.disabled = selectedWorldLawIds.length !== status.lawLimit;
    return;
  }

  const selectedBoon = LEGACY_BOONS.find((boon) => boon.id === selectedLegacyId);
  const selectedItem = selectedHeirloomItemId ? game.save.hero.inventory.find((item) => item.id === selectedHeirloomItemId) : undefined;
  stage.replaceChildren(newChronicleHeading("ПОСЛЕДНЯЯ ЗАПИСЬ", `Эпоха ${status.targetCycle}: ${newChronicleName.trim()}`, "Проверьте условия. После подтверждения прежний мир попадёт в архив и останется доступен для просмотра."));
  const summary = element("div", "new-chronicle-summary");
  const kept = element("article");
  kept.append(element("h4", "", "Сохранится"));
  const keptList = element("ul");
  ["Коллекция найденных предметов", "Архив героев и павших бойцов", "Внешность и настройки боя", `Наследие: ${selectedBoon?.name ?? "—"}`, `Предмет: ${selectedItem ? displayItemName(selectedItem) : "без предмета"}`, `Законы: ${selectedWorldLawIds.map((id) => ERA_LAWS.find((law) => law.id === id)?.name).join(", ")}`].forEach((line) => keptList.append(element("li", "", line)));
  kept.append(keptList);
  const reset = element("article");
  reset.append(element("h4", "", "Начнётся заново"));
  const resetList = element("ul");
  ["Уровень, опыт и мировой рейтинг", "Золото, печати закалки и обычный инвентарь", "Арены, данжи, боссы и контракты", "Население мира, элита и соперничества"].forEach((line) => resetList.append(element("li", "", line)));
  reset.append(resetList);
  summary.append(kept, reset);
  const acknowledgement = element("label", "new-chronicle-confirmation");
  const checkbox = element("input") as HTMLInputElement;
  checkbox.type = "checkbox";
  checkbox.checked = newChronicleConfirmed;
  checkbox.addEventListener("change", () => { newChronicleConfirmed = checkbox.checked; confirm.disabled = !newChronicleConfirmed; });
  acknowledgement.append(checkbox, document.createTextNode("Я понимаю, что текущая эпоха будет завершена и продолжится новым миром."));
  stage.append(summary, acknowledgement);
  confirm.textContent = `Начать эпоху ${status.targetCycle}`;
  confirm.disabled = !newChronicleConfirmed;
}

function moveNewChronicleStep(direction: -1 | 1): void {
  if (direction > 0) {
    if (newChronicleStep === 0 && !selectedLegacyId) return;
    if (newChronicleStep === 1 && newChronicleName.trim().length < 2) return;
    if (newChronicleStep === 2 && game && selectedWorldLawIds.length !== game.newGamePlusStatus().lawLimit) return;
  }
  if (newChronicleStep === 3 && direction < 0) newChronicleConfirmed = false;
  newChronicleStep = Math.max(0, Math.min(3, newChronicleStep + direction));
  renderNewChronicleStep();
  replayAnimation($("#new-chronicle-stage"), "is-changing");
  focusNewChronicleStep();
}

function confirmNewChronicle(): void {
  if (!game || !selectedLegacyId || !newChronicleConfirmed) return;
  try {
    game = game.beginNewChronicle({
      name: newChronicleName,
      classId: newChronicleClass,
      boonId: selectedLegacyId,
      lawIds: selectedWorldLawIds,
      heirloomItemId: selectedHeirloomItemId ?? undefined,
    });
    localStorage.removeItem(LEADER_SNAPSHOT_KEY);
    localStorage.removeItem(ELITE_SNAPSHOT_KEY);
    persist();
    closeNewChronicleDialog();
    renderAll();
    showPage("map", true, false);
    queueWorldEffect({
      eyebrow: "НОВАЯ ЛЕТОПИСЬ",
      title: `Началась эпоха ${game.save.legacy.cycle}`,
      description: `${game.save.hero.name} принимает мир с новыми законами и памятью прежнего героя.`,
      symbol: "Ⅱ", tone: "legendary", sound: "reputation", duration: 3600,
    });
    toast("Новая эпоха началась. Прошлый мир сохранён в архиве.");
  } catch (error) { toast((error as Error).message, "error"); }
}

function showChronicleView(view: "current" | "archive"): void {
  const current = view === "current";
  $("#current-chronicle-view").hidden = !current;
  $("#epoch-history-view").hidden = current;
  const currentTab = $<HTMLButtonElement>("#chronicle-current-tab");
  const archiveTab = $<HTMLButtonElement>("#chronicle-archive-tab");
  currentTab.classList.toggle("active", current);
  archiveTab.classList.toggle("active", !current);
  currentTab.setAttribute("aria-selected", String(current));
  archiveTab.setAttribute("aria-selected", String(!current));
  currentTab.tabIndex = current ? 0 : -1;
  archiveTab.tabIndex = current ? -1 : 0;
  if (!current) renderEpochHistory();
}

function renderEpochHistory(): void {
  if (!game) return;
  const archives = game.legacyArchives();
  $("#epoch-count").textContent = String(archives.length);
  const summary = $("#epoch-history-summary");
  summary.replaceChildren(
    statRow("Текущая эпоха", game.save.legacy.cycle),
    statRow("Завершено эпох", archives.length),
    statRow("Печатей летописи", game.save.legacy.seals),
    statRow("Всего заработано", game.save.legacy.totalSealsEarned),
  );
  const list = $("#epoch-history-list");
  list.replaceChildren(...archives.slice().reverse().map((archive) => {
    const card = element("article", "epoch-card paper-panel");
    const head = element("header", "epoch-hero-summary");
    const copy = element("div");
    copy.append(element("p", "eyebrow", `ЭПОХА ${archive.cycle} · ${archive.worldDay} ДНЕЙ`), element("h3", "", archive.name), element("p", "", `${CLASS_DEFINITIONS[archive.classId].name} · ${archive.title}`));
    head.append(copy, element("strong", "", `Ур. ${archive.level}`));
    const stats = element("div", "epoch-stat-grid");
    [["Рейтинг", archive.rating], ["Турниры", archive.tournamentWins], ["Победы", archive.wins], ["Поражения", archive.losses], ["Убийства", archive.kills], ["Короны", archive.crownLeagueWins], ["Защиты", archive.legendDefenses], ["Элита", archive.eliteRank ? `#${archive.eliteRank}` : "—"]].forEach(([label, value]) => stats.append(statRow(String(label), value)));
    const details = element("details", "epoch-details");
    const detailsTitle = element("summary", "", "Соперники, павшие и снаряжение");
    const rivals = element("div", "epoch-rival-list");
    archive.notableFighters.forEach((fighter) => rivals.append(element("p", "", `${fighter.name} · ${CLASS_DEFINITIONS[fighter.classId].name} · ${fighter.wins} побед · ${fighter.losses} поражений`)));
    if (!archive.notableFighters.length) rivals.append(element("p", "empty-copy", "Главные соперники в этой эпохе не записаны."));
    const gear = element("p", "epoch-gear", `Финальное снаряжение: ${archive.equipment.map(displayItemName).join(", ") || "без предметов"}.`);
    const legacy = element("p", "epoch-legacy", `Наследие эпохи: ${LEGACY_BOONS.find((boon) => boon.id === archive.boonId)?.name ?? "первый путь"}. Законы: ${(archive.lawIds ?? []).map((id) => ERA_LAWS.find((law) => law.id === id)?.name).filter(Boolean).join(", ") || "без законов"}.${archive.inheritedItemName ? ` Переданный предмет: ${archive.inheritedItemName}.` : ""}`);
    const fallen = element("p", "epoch-fallen", archive.fallenNames.length ? `Погибли навсегда: ${archive.fallenNames.join(", ")}.` : "Список павших пуст.");
    details.append(detailsTitle, rivals, legacy, gear, fallen);
    card.append(head, stats, details);
    return card;
  }));
  if (!archives.length) list.append(element("p", "empty-copy", "Первая эпоха ещё продолжается. Здесь появится её итог после начала новой летописи."));
}

function startLegacyChampion(): void {
  if (!game) return;
  captureBattleEquipment();
  try {
    currentTournament = null;
    currentReport = game.fightLegacyChampion();
    persist();
    openBattleReport(currentReport);
  } catch (error) { battleEquipmentBefore = null; toast((error as Error).message, "error"); }
}

function renderEndgame(animateItems = true): void {
  if (!game) return;
  const route = $("#endgame-route");
  route.replaceChildren(...ENDGAME_ACTIVITIES.map((activity) => {
    const availability = game!.availability(activity);
    const crownLeague = activity.id === "crown-league";
    const registeredDay = crownLeague ? game!.registeredCrownLeagueDay() : undefined;
    const registration = crownLeague ? game!.crownLeagueRegistrationAvailability() : undefined;
    const canAct = availability.unlocked || Boolean(registration?.unlocked);
    const card = element("article", `activity-card endgame${canAct || registeredDay ? "" : " locked"}${registeredDay ? " registered" : ""}`);
    if (!animateItems) card.classList.add("no-entry-motion");
    card.style.setProperty("--activity-accent", activity.accent);
    const label = crownLeague ? game!.crownLeagueTier().name.toUpperCase() : "ПОСЛЕДОВАТЕЛЬНЫЙ ВЫЗОВ";
    const reward = crownLeague
      ? `${game!.heroEliteRank() ? `место #${game!.heroEliteRank()} · ` : "квалификация · "}${game!.save.hero.crownLeagueWins} побед в лиге`
      : `${game!.save.hero.legendHuntWins} побед в охоте · ${game!.save.hero.legendDefenses} защит титула`;
    card.append(
      element("div", "activity-head", label),
      element("h3", "", activity.name),
      element("p", "", activity.description),
      element("div", "activity-levels", reward),
      element("div", "activity-state", availability.reason),
    );
    if (crownLeague) {
      const ruleDay = registeredDay ?? game!.nextCrownLeagueDay();
      card.append(element("div", "activity-rules", game!.tournamentRules("crown-league", ruleDay).map((rule) => rule.name).join(" · ")));
    }
    if (!crownLeague && game!.heroEliteRank() && game!.heroEliteRank()! <= 5) {
      const automatic = element("label", "tactic-toggle elite-auto-defense");
      const input = element("input") as HTMLInputElement;
      input.type = "checkbox";
      input.checked = game!.save.hero.autoResolveLegendChallenges;
      input.addEventListener("change", () => {
        game!.setAutoResolveLegendChallenges(input.checked);
        persist();
        renderEndgame(false);
        toast(input.checked ? "Автоматическая защита титула включена." : "Защита титула снова требует личного решения.");
      });
      automatic.append(input, document.createTextNode(" Автоматически рассчитывать защиту титула"));
      card.append(automatic, element("small", "auto-defense-note", "Если начать другое занятие в день вызова, бой пройдёт в фоне до смены дня."));
    }
    const buttonLabel = crownLeague
      ? availability.unlocked
        ? `Начать турнир на ${30} бойцов`
        : registeredDay && registeredDay > game!.save.worldDay
          ? `Записан на день ${registeredDay}`
          : registration?.unlocked
            ? `Записаться на день ${game!.nextCrownLeagueDay()}`
            : "Закрыто"
      : availability.unlocked ? "Бросить следующий вызов" : "Закрыто";
    const button = element("button", "button activity-button", buttonLabel);
    button.disabled = crownLeague
      ? !availability.unlocked && !registration?.unlocked
      : !availability.unlocked;
    button.addEventListener("click", () => {
      if (crownLeague && !availability.unlocked) registerForCrownLeague();
      else startEndgame(activity.id);
    });
    card.append(button);
    return card;
  }));

  const pending = game.pendingLegendChallenge();
  if (pending) {
    const card = element("article", "activity-card endgame elite-defense");
    if (!animateItems) card.classList.add("no-entry-motion");
    card.style.setProperty("--activity-accent", "#9c5044");
    card.append(
      element("div", "activity-head", "ВЫЗОВ ВАШЕМУ ТИТУЛУ"),
      element("h3", "", pending.name),
      element("p", "", `Боец элиты пытается занять ваше место. При поражении вы поменяетесь позициями.`),
      element("div", "activity-levels", `${CLASS_DEFINITIONS[pending.classId].name} · уровень ${pending.level}`),
      element("div", "activity-state", game.save.hero.autoResolveLegendChallenges
        ? "Можно выбрать другое занятие: защита будет рассчитана автоматически до смены дня."
        : "Смена дня заблокирована, пока вы не защитите титул или не включите авторасчёт."),
    );
    const defend = element("button", "button activity-button", "Защитить титул");
    defend.addEventListener("click", startLegendDefense); card.append(defend); route.append(card);
  }

  renderNewChronicleStatus();

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
    const nameCell = element("td", "leader-name-cell", entry.name);
    appendEraVeteranBadge(nameCell, entry.carriedFromCycle);
    row.append(
      element("td", "elite-rank", `#${rank}`),
      element("td", rank <= 5 ? "elite-title" : "", game!.legendTitle(rank) ?? "Элита"),
      nameCell,
      element("td", "", CLASS_DEFINITIONS[entry.classId].name),
      element("td", "", String(entry.level)),
      element("td", "", String(entry.rating)),
      element("td", "", String(game!.save.eliteCrownWins[entry.id] ?? (entry.isHero ? game!.save.hero.crownLeagueWins : 0))),
    );
    tbody.append(row);
  });
  table.append(thead, tbody); wrap.append(table); board.replaceChildren(header, wrap);
}

function renderContracts(): void {
  if (!game) return;
  const activePanel = $("#active-contract");
  const active = game.save.activeContract;
  if (active) {
    const faction = FACTIONS.find((candidate) => candidate.id === active.factionId)!;
    const copy = element("div");
    copy.append(element("p", "eyebrow", "ДЕЙСТВУЮЩИЙ КОНТРАКТ"), element("h2", "", active.title), element("p", "", active.description));
    const progress = element("div", "contract-progress");
    const meter = element("i"); meter.style.width = `${active.progress / active.target * 100}%`; progress.append(meter);
    copy.append(progress, element("strong", "", `${active.progress} / ${active.target} · ${faction.name} · до дня ${active.expiresDay}`));
    const abandon = element("button", "plain-button", "Отказаться от контракта");
    abandon.addEventListener("click", () => { if (!window.confirm("Отказ снизит репутацию фракции. Продолжить?")) return; game!.abandonContract(); persist(); renderContracts(); renderHeader(); });
    activePanel.replaceChildren(copy, abandon);
  } else {
    activePanel.replaceChildren(element("div", "", ""));
    activePanel.firstElementChild!.append(element("p", "eyebrow", "СВОБОДНЫЙ КОНТРАКТНЫЙ СЛОТ"), element("h2", "", "Выберите поручение"), element("p", "", "Задача будет выполняться вместе с привычными активностями — отдельный режим запускать не потребуется."));
  }

  const guide = $("#reputation-guide");
  const guideCopy = element("div", "reputation-guide-copy");
  guideCopy.append(
    element("p", "eyebrow", "ЗАЧЕМ НУЖНА РЕПУТАЦИЯ"),
    element("h2", "", "Доверие улучшает новые поручения"),
    element("p", "", "У каждой фракции свой счёт доверия. Чем выше статус, тем больше монет и опыта она закладывает в новые контракты. Уже выданные поручения не пересчитываются; отказ от принятого контракта отнимает 2 репутации."),
  );
  const tiers = element("div", "reputation-tier-list");
  FACTION_REPUTATION_TIERS.forEach((tier) => {
    const item = element("article", tier.threshold === 0 ? "base" : "");
    item.append(
      element("small", "", tier.threshold === 0 ? "С НАЧАЛА" : `ОТ ${tier.threshold} РЕПУТАЦИИ`),
      element("strong", "", tier.name),
      element("span", "", tier.contractRewardBonus > 0 ? `+${Math.round(tier.contractRewardBonus * 100)}% к монетам и опыту` : "Базовые награды"),
    );
    tiers.append(item);
  });
  guide.replaceChildren(guideCopy, tiers);

  const factions = $("#faction-grid");
  factions.replaceChildren(...FACTIONS.map((faction) => {
    const reputation = game!.save.hero.factionReputation[faction.id] ?? 0;
    const tier = factionReputationTier(reputation);
    const nextTier = FACTION_REPUTATION_TIERS.find((candidate) => candidate.threshold > reputation);
    const card = element("article", "faction-card paper-panel"); card.style.setProperty("--faction-accent", faction.accent);
    card.append(
      element("p", "eyebrow", tier.name.toUpperCase()),
      element("h3", "", faction.name),
      element("blockquote", "", `«${faction.motto}»`),
      element("p", "", faction.description),
      statRow("Репутация", nextTier ? `${reputation} / ${nextTier.threshold}` : reputation),
      element("p", "faction-contract-benefit", tier.contractRewardBonus > 0
        ? `Новые контракты: +${Math.round(tier.contractRewardBonus * 100)}% к монетам и опыту.`
        : `Следующий статус откроет +${Math.round((nextTier?.contractRewardBonus ?? 0) * 100)}% к наградам новых контрактов.`),
    );
    return card;
  }));

  const grid = $("#contract-grid");
  grid.replaceChildren(...game.save.contractOffers.map((offer) => {
    const faction = FACTIONS.find((candidate) => candidate.id === offer.factionId)!;
    const card = element("article", "contract-card paper-panel"); card.style.setProperty("--faction-accent", faction.accent);
    card.append(element("small", "", `${faction.name.toUpperCase()} · ДО ДНЯ ${offer.expiresDay}`), element("h3", "", offer.title), element("p", "", offer.description));
    const rewards = element("div", "contract-rewards", `Награда: ${offer.rewardGold} ¤ · ${offer.rewardExperience} опыта · ${offer.rewardReputation} репутации`);
    const actions = element("div", "contract-actions");
    const approaches = [
      {
        id: "honor" as const,
        label: "Принять ради чести",
        eyebrow: "ЧЕСТЬ ФРАКЦИИ",
        title: "Репутация прежде монет",
        description: "Награда монетами остаётся обычной, зато репутация фракции увеличивается на 50%.",
        reward: `${offer.rewardGold} ¤ · ${offer.rewardExperience} опыта · ${Math.round(offer.rewardReputation * 1.5)} репутации`,
      },
      {
        id: "profit" as const,
        label: "Принять ради выгоды",
        eyebrow: "ЛИЧНАЯ ВЫГОДА",
        title: "Монеты прежде признания",
        description: "Награда монетами увеличивается на 35%, а репутация фракции остаётся обычной.",
        reward: `${Math.round(offer.rewardGold * 1.35)} ¤ · ${offer.rewardExperience} опыта · ${offer.rewardReputation} репутации`,
      },
    ];
    approaches.forEach((approach) => {
      const option = element("div", `contract-approach-option ${approach.id}`);
      const tooltipId = `contract-${offer.id}-${approach.id}`;
      const button = element("button", "button", approach.label);
      button.disabled = Boolean(active);
      button.setAttribute("aria-describedby", tooltipId);
      button.addEventListener("click", () => acceptContract(offer.id, approach.id));
      const tooltip = element("aside", "contract-approach-tooltip");
      tooltip.id = tooltipId;
      tooltip.setAttribute("role", "tooltip");
      tooltip.append(
        element("small", "", approach.eyebrow),
        element("strong", "", approach.title),
        element("p", "", approach.description),
        element("b", "", approach.reward),
      );
      option.append(button, tooltip);
      actions.append(option);
    });
    card.append(rewards, actions); return card;
  }));
}

function acceptContract(id: string, approach: "honor" | "profit"): void {
  if (!game) return;
  try {
    const contract = game.acceptContract(id, approach); persist(); renderContracts(); renderHeader(); toast(`Принят контракт «${contract.title}».`);
    queueWorldEffect({ eyebrow: approach === "honor" ? "КЛЯТВА ЧЕСТИ" : "УСЛОВИЯ СДЕЛКИ", title: contract.title, description: approach === "honor" ? "Репутация фракции важнее быстрой прибыли." : "Награда монетами важнее признания фракции.", symbol: "§", tone: "neutral", sound: "reputation" });
  }
  catch (error) { toast((error as Error).message, "error"); }
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

function renderForge(animateItems = true, preserveOrder = false): void {
  if (!game) return;
  const hero = game.save.hero;
  const legacyUnlocked = game.isFeatureUnlocked("equipment-legacy");
  $("#forge-marks").textContent = `${hero.temperingMarks} ${hero.temperingMarks === 1 ? "печать" : hero.temperingMarks >= 2 && hero.temperingMarks <= 4 ? "печати" : "печатей"}`;
  $("#relic-workshop").hidden = !legacyUnlocked;
  if (legacyUnlocked) renderRelicWorkshop();
  const grid = $("#forge-grid");
  const equippedIds = new Set(Object.values(hero.equipped));
  const displayedOrder = new Map(
    Array.from(grid.querySelectorAll<HTMLElement>("[data-item-id]"))
      .map((card, index) => [card.dataset.itemId!, index]),
  );
  const order = [...hero.inventory].sort((a, b) => {
    if (preserveOrder) {
      const aOrder = displayedOrder.get(a.id);
      const bOrder = displayedOrder.get(b.id);
      if (aOrder !== undefined || bOrder !== undefined) {
        if (aOrder === undefined) return 1;
        if (bOrder === undefined) return -1;
        return aOrder - bOrder;
      }
    }
    return Number(equippedIds.has(b.id)) - Number(equippedIds.has(a.id))
      || (b.enhancement ?? 0) - (a.enhancement ?? 0)
      || b.level - a.level;
  });
  grid.replaceChildren(...order.map((item) => {
    const card = element("article", `forge-card paper-panel ${rarityClass[item.rarity]}`);
    card.dataset.itemId = item.id;
    if (!animateItems) card.classList.add("no-entry-motion");
    card.style.setProperty("--rarity-color", rarityColors[item.rarity]);
    const art = equipmentArtwork(item.slot, classForTemplate(item.allowedClasses), "forge-art equipment-art", item);
    art.style.setProperty("--rarity-color", rarityColors[item.rarity]);
    const copy = element("div", "forge-card-copy");
    const enhancement = item.enhancement ?? 0;
    copy.append(element("small", "", `${equippedIds.has(item.id) ? "НАДЕТО · " : ""}${SLOT_LABELS[item.slot]} · ${RARITY_LABELS[item.rarity]}`), element("h3", "", item.relicName ?? item.name), element("p", "", `${item.level} ур. · закалка +${enhancement}/5${legacyUnlocked && rarityAtLeastUi(item.rarity, "legendary") ? ` · наследие ${item.relicTier ?? 0}/3 (${item.relicRenown ?? 0})` : ""}`), element("p", "item-stats", itemStatsText(item)));
    if (equippedIds.has(item.id)) card.classList.add("equipped");
    const button = element("button", "button", enhancement >= 5 ? "Максимальная закалка" : `Улучшить · ${game!.upgradeCost(item.id)} печ.`);
    button.type = "button";
    button.disabled = enhancement >= 5 || hero.temperingMarks < game!.upgradeCost(item.id);
    button.addEventListener("click", () => {
      try {
        game!.upgradeItem(item.id); persist(); refreshEquipmentViews(true); toast(`${item.name} усилен.`);
        queueWorldEffect({ eyebrow: "КУЗНИЦА", title: `${item.name} · закалка +${enhancement + 1}`, description: "Характеристики предмета повышены навсегда.", symbol: "⚒", tone: "positive", sound: "forge" });
      }
      catch (error) { toast((error as Error).message, "error"); }
    });
    const actions = element("div", "forge-card-actions");
    actions.append(button);
    if (legacyUnlocked && !equippedIds.has(item.id) && game!.canSell(item.id)) {
      const salvage = element("button", "plain-button", "Разобрать в пыль");
      salvage.addEventListener("click", () => {
        if (!window.confirm(`Разобрать «${item.name}» без возможности восстановления?`)) return;
        try { const dust = game!.salvageItem(item.id); persist(); renderForge(false); renderHeader(); toast(`Получено реликтовой пыли: ${dust}.`); }
        catch (error) { toast((error as Error).message, "error"); }
      });
      actions.append(salvage);
    }
    card.append(art, copy, actions);
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
    appendEraVeteranBadge(nameCell, entry.carriedFromCycle);
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

function rarityAtLeastUi(rarity: Rarity, minimum: Rarity): boolean {
  const order: Rarity[] = ["common", "rare", "epic", "legendary", "mythic"];
  return order.indexOf(rarity) >= order.indexOf(minimum);
}

function renderRelicWorkshop(): void {
  if (!game) return;
  const panel = $("#relic-workshop");
  const hero = game.save.hero;
  const relics = hero.inventory.filter((item) => rarityAtLeastUi(item.rarity, "legendary"));
  const ready = relics.filter((item) => (item.relicTier ?? 0) >= 1 && !item.relicPath);
  const head = element("div", "relic-workshop-head");
  head.append(element("p", "eyebrow", "НАСЛЕДИЕ СНАРЯЖЕНИЯ"), element("h2", "", "Предметы помнят победы"), element("p", "", "Надетые легендарные и мифические вещи получают известность в боях. На первой ступени можно выбрать постоянный путь развития."));
  const resource = statRow("Реликтовая пыль", hero.relicDust);
  markTerm(resource.querySelector<HTMLElement>("span")!, "relicDust");
  const list = element("div", "relic-ready-list");
  ready.forEach((item) => {
    const row = element("article");
    const copy = element("div"); copy.append(element("strong", "", item.relicName ?? item.name), element("small", "", `Наследие ${item.relicTier}/3 · известность ${item.relicRenown ?? 0} · следующий порог ${RELIC_TIER_THRESHOLDS[Math.min(3, (item.relicTier ?? 0) + 1)]}`));
    const actions = element("div");
    RELIC_PATHS.forEach((path) => {
      const option = element("div", "relic-path-option");
      const tooltipId = `relic-path-${item.id}-${path.id}`;
      const button = element("button", "plain-button", path.name);
      button.setAttribute("aria-describedby", tooltipId);
      button.disabled = hero.relicDust < 8;
      button.addEventListener("click", () => { try {
        game!.awakenRelic(item.id, path.id); persist(); renderForge(false); toast(`${item.name} обрёл собственный путь.`);
        queueWorldEffect({ eyebrow: "ПРОБУЖДЕНИЕ РЕЛИКВИИ", title: path.name, description: path.description, stats: featureStatsText(path.stats).split(" · ").filter(Boolean), symbol: "✦", tone: "legendary", sound: "loot", duration: 2800 });
      } catch (error) { toast((error as Error).message, "error"); } });
      const tooltip = element("aside", "relic-path-tooltip");
      tooltip.id = tooltipId;
      tooltip.setAttribute("role", "tooltip");
      tooltip.append(
        element("small", "", "ПОСТОЯННЫЙ ВЫБОР"),
        element("strong", "", path.name),
        element("p", "", path.description),
        element("b", "feature-stats", featureStatsText(path.stats)),
      );
      option.append(button, tooltip);
      actions.append(option);
    });
    row.append(copy, actions); list.append(row);
  });
  if (ready.length === 0) list.append(element("p", "empty-copy", relics.length ? "Продолжайте побеждать с легендарными предметами: путь откроется на первой ступени наследия." : "Легендарных предметов пока нет."));
  panel.replaceChildren(head, resource, list);
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
    appendEraVeteranBadge(nameCell, entry.carriedFromCycle);
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
  renderEpochHistory();
}

function refreshEquipmentViews(preserveForgeOrder = false): void {
  if (!game) return;
  renderHeader();
  renderHeroVisual(false);
  renderGearActions();
  renderArsenal(false);
  renderForge(false, preserveForgeOrder);
  renderSkills(false);
}

function refreshMapViews(animateItems = false): void {
  if (!game) return;
  renderHeader();
  renderMap(animateItems);
  renderTournamentReminder();
}

function renderAll(): void {
  if (!game) return;
  renderHeader(); renderMap(); renderHeroVisual(); renderGearActions(); renderArsenal(); renderForge(); renderSkills(); renderContracts(); renderCollections(); renderShop(); renderLeaders(); renderEliteLeaders(); renderChronicle(); renderTournamentReminder();
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

function captureBattleEquipment(): void {
  hideLootReminder();
  battleEquipmentBefore = game ? { ...game.save.hero.equipped } : null;
  battleInventoryBefore = game ? new Set(game.save.hero.inventory.map((item) => item.id)) : null;
}

function startActivity(activityId: string): void {
  if (!game) return;
  try {
    game.startExpedition(activityId);
    persist(); renderMap(false); openDungeonWindow();
    toast("Поход начат. Выберите первый маршрут.");
    queueWorldEffect({ eyebrow: "ЭКСПЕДИЦИЯ", title: "Отряд покинул лагерь", description: "Выбирайте путь после каждого этапа: риск меняет опасность и возможную добычу.", symbol: "↟", sound: "choice" });
  } catch (error) {
    toast((error as Error).message, "error");
  }
}

function advanceExpedition(choiceId: "safe" | "risk" | "rest"): void {
  if (!game) return;
  captureBattleEquipment();
  let result: ExpeditionStepReport;
  try { result = game.advanceExpedition(choiceId); persist(); }
  catch (error) { battleEquipmentBefore = null; battleInventoryBefore = null; toast((error as Error).message, "error"); return; }
  pendingExpeditionResult = result.completed || result.retreated ? result : null;
  currentTournament = null;
  if (result.battle) {
    currentReport = result.battle;
    openBattleReport(result.battle);
    return;
  }
  const before = battleInventoryBefore;
  const acquired = before ? game.save.hero.inventory.filter((item) => !before.has(item.id)) : [];
  const equipmentBefore = battleEquipmentBefore;
  battleEquipmentBefore = null; battleInventoryBefore = null;
  refreshMapViews(false);
  if (pendingExpeditionResult) {
    openExpeditionRewards(pendingExpeditionResult, acquired, equipmentBefore);
    pendingExpeditionResult = null;
  } else {
    showLootReminders(acquired, equipmentBefore);
  }
  toast(result.message);
}

function retreatExpedition(): void {
  if (!game || !window.confirm("Завершить поход сейчас? Герой сохранит 55% награды и половину найденных предметов.")) return;
  captureBattleEquipment();
  try {
    const before = battleInventoryBefore;
    const result = game.retreatExpedition();
    persist(); refreshMapViews(false);
    const acquired = before ? game.save.hero.inventory.filter((item) => !before.has(item.id)) : [];
    const equipmentBefore = battleEquipmentBefore;
    battleEquipmentBefore = null; battleInventoryBefore = null;
    openExpeditionRewards(result, acquired, equipmentBefore);
    toast(result.message);
  } catch (error) { battleEquipmentBefore = null; battleInventoryBefore = null; toast((error as Error).message, "error"); }
}

function trainHero(): void {
  if (!game) return;
  try {
    const result = game.train();
    persist();
    refreshMapViews(false);
    queueWorldEffect({
      eyebrow: "ТРЕНИРОВОЧНЫЙ ДЕНЬ", title: result.title,
      description: `Получено ${result.experience} опыта${result.levelsGained ? ` и ${result.levelsGained} ур.` : ""}.`,
      symbol: "⚔", tone: "positive", sound: "training", duration: 1700,
      aggregation: {
        key: "training", count: 1, totals: { experience: result.experience, levels: result.levelsGained },
        format: (count, totals) => ({
          eyebrow: "СЕРИЯ ТРЕНИРОВОК",
          title: `${count} тренировочных дней завершено`,
          description: `Всего получено ${totals.experience ?? 0} опыта${totals.levels ? ` и ${totals.levels} ур.` : ""}.`,
        }),
      },
    });
  } catch (error) { toast((error as Error).message, "error"); }
}

function startEndgame(activityId: "crown-league" | "legend-hunt"): void {
  if (!game) return;
  captureBattleEquipment();
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
  } catch (error) { battleEquipmentBefore = null; toast((error as Error).message, "error"); return; }
  if (currentTournament) renderTournamentBracket();
  if (!currentReport) { battleEquipmentBefore = null; toast("В турнирной сетке не найден бой героя.", "error"); return; }
  openBattleReport(currentReport);
}

function startLegendDefense(): void {
  if (!game) return;
  captureBattleEquipment();
  try { currentTournament = null; currentReport = game.defendLegendTitle(); persist(); }
  catch (error) { battleEquipmentBefore = null; toast((error as Error).message, "error"); return; }
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
  captureBattleEquipment();
  let result;
  try { result = game.duel(tierId); persist(); renderAll(); }
  catch (error) { battleEquipmentBefore = null; toast((error as Error).message, "error"); return; }
  if (!result.battle) { battleEquipmentBefore = null; return; }
  currentTournament = null; currentReport = result.battle; openBattleReport(result.battle);
}

function startBossFight(bossId: string): void {
  if (!game) return;
  captureBattleEquipment();
  let result;
  try { result = game.fightBoss(bossId); persist(); renderAll(); }
  catch (error) { battleEquipmentBefore = null; toast((error as Error).message, "error"); return; }
  if (!result.battle) { battleEquipmentBefore = null; return; }
  currentTournament = null; currentReport = result.battle; openBattleReport(result.battle);
}

function startTournament(arenaId: string): void {
  if (!game) return;
  captureBattleEquipment();
  try {
    currentTournament = game.playTournament(arenaId);
    // The tournament is calculated synchronously, but its unlocks should only
    // be announced after the player has actually watched the final result.
    persist({ deferFeatureUnlocks: true });
  }
  catch (error) { battleEquipmentBefore = null; toast((error as Error).message, "error"); return; }
  renderTournamentReminder();
  tournamentBattleIndex = 0;
  renderTournamentBracket();
  currentReport = currentTournament.heroBattles[0] ?? null;
  if (!currentReport) { battleEquipmentBefore = null; toast("Герой не попал в турнирную сетку.", "error"); return; }
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
  hideLootReminder();
  if ($("#battle-overlay").hidden) {
    battleReturnScrollY = window.scrollY;
    battleReturnPage = document.querySelector<HTMLElement>(".page.active")?.id.replace("page-", "") ?? "map";
  }
  currentReport = report;
  battleTurnIndex = 0;
  battleHealth = { hero: currentReport.heroBefore.maxHealth, enemy: currentReport.enemyBefore.maxHealth };
  $("#battle-place").textContent = currentReport.activity.place.toUpperCase();
  $("#battle-name").textContent = currentReport.activity.name;
  const rulesPanel = $("#battle-rules");
  const activeRules = TOURNAMENT_RULES.filter((rule) => currentReport?.ruleIds?.includes(rule.id));
  rulesPanel.hidden = activeRules.length === 0;
  rulesPanel.replaceChildren(...activeRules.map((rule) => {
    const chip = element("span"); chip.append(element("b", "", rule.name), document.createTextNode(rule.description)); return chip;
  }));
  $("#battle-turn").textContent = "ХОД 0"; $("#battle-action").textContent = "Бойцы выходят на площадку"; $("#battle-detail").textContent = "";
  $("#battle-log").replaceChildren(); $("#battle-result").hidden = true;
  $("#skip-battle").hidden = false;
  $("#close-battle").textContent = "Вернуться на карту";
  if (!currentTournament) $("#tournament-panel").hidden = true;
  setCombatant($("#battle-hero"), currentReport.heroBefore, battleHealth.hero);
  setCombatant($("#battle-enemy"), currentReport.enemyBefore, battleHealth.enemy);
  renderBattleSkills(currentReport);
  $("#battle-overlay").hidden = false;
  document.body.classList.add("battle-open");
  gameAudio.battleStart(currentReport.activity.kind === "boss" || currentReport.activity.kind === "dungeon");
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
  const actorClass = turn.actorId === "hero" ? currentReport.heroBefore.classId : currentReport.enemyBefore.classId;
  gameAudio.battleTurn(turn, actorClass);
  const log = element("p", turn.critical ? "critical" : "", `${turn.turn}. ${turn.actorName} — ${turn.action}: ${turn.damage} урона${turn.healing ? `, +${turn.healing} HP` : ""}.`);
  $("#battle-log").prepend(log);
  scheduleBattleTurn();
}

function battleFeatureChangeCard(change: FighterFeatureChange): HTMLElement {
  const adverse = change.kind === "Травма" || change.kind === "Адаптация";
  const card = element("article", `battle-feature-change${adverse ? " negative" : ""}${change.kind === "Адаптация" ? " adaptation" : ""}`);
  const kind = element("small", "", `${change.fighterName} · ${change.kind}`);
  if (change.kind === "Адаптация") markTerm(kind, "enemyMemory");
  card.append(
    kind,
    element("strong", "", change.name),
    element("p", "", change.description),
  );
  const stats = element("div", "battle-feature-stats");
  Object.entries(change.stats).filter(([, value]) => Number(value) !== 0).forEach(([stat, value]) => {
    const amount = Number(value);
    const chip = element("span", amount > 0 ? "positive" : "negative", `${amount > 0 ? "+" : ""}${amount} ${comparisonStatLabels[stat as ComparisonStat]}`);
    stats.append(chip);
  });
  if (stats.childElementCount) card.append(stats);
  return card;
}

function finishBattlePlayback(): void {
  if (!currentReport) return;
  if (battleTimer !== null) window.clearTimeout(battleTimer); battleTimer = null;
  $("#manual-battle-step").hidden = true;
  $("#skip-battle").hidden = true;
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
  gameAudio.battleResult(currentReport.heroWon);
  queueWorldEffect({
    eyebrow: currentReport.activity.name,
    title,
    description: currentReport.heroWon ? `${currentReport.enemyBefore.name} побеждён.` : `${currentReport.enemyBefore.name} оказался сильнее.`,
    symbol: currentReport.heroWon ? "♛" : "×",
    tone: currentReport.heroWon ? "positive" : "negative",
    duration: 1800,
  });
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
  const featureChanges = game?.consumeFeatureChanges() ?? [];
  if (featureChanges.length) {
    const featurePanel = element("section", "battle-feature-changes");
    const adaptations = featureChanges.filter((change) => change.kind === "Адаптация");
    if (adaptations.length && game && !game.hasSeenTutorial("adaptation")) {
      queueContextualTutorial("adaptation");
    }
    const featureTitle = adaptations.length === featureChanges.length
      ? (adaptations.length === 1 ? "Соперник запомнил ваш стиль" : "Соперники изучили ваш стиль")
      : featureChanges.length === 1 ? "Бой оставил след" : "Бой изменил участников";
    featurePanel.append(element("h4", "", featureTitle));
    const featureList = element("div");
    featureList.append(...featureChanges.map(battleFeatureChangeCard));
    featurePanel.append(featureList);
    copy.append(featurePanel);
    featureChanges.forEach((change) => queueWorldEffect({
      eyebrow: `${change.fighterName} · ${change.kind}`,
      title: change.name,
      description: change.description,
      stats: featureStatsText(change.stats).split(" · ").filter(Boolean),
      symbol: change.kind === "Травма" ? "✕" : change.kind === "Шрам" ? "⌁" : "✦",
      tone: change.kind === "Травма" || change.kind === "Адаптация" ? "negative" : "positive",
      duration: 2500,
    }));
  }
  $("#close-battle").textContent = hasNextTournamentBattle
    ? "Следующий бой"
    : pendingExpeditionResult ? "Посмотреть итоги похода" : "Вернуться на карту";
  const inventoryBefore = battleInventoryBefore;
  const newlyAcquiredItems = !hasNextTournamentBattle && game && inventoryBefore
    ? game.save.hero.inventory.filter((item) => !inventoryBefore.has(item.id))
    : [];
  if (newlyAcquiredItems.length === 0 && !hasNextTournamentBattle && finalRewards.item) newlyAcquiredItems.push(finalRewards.item);
  renderAll();
  if (pendingExpeditionResult && !hasNextTournamentBattle) {
    pendingExpeditionLoot = { items: newlyAcquiredItems, equipmentBefore: battleEquipmentBefore };
  } else {
    showLootReminders(newlyAcquiredItems, battleEquipmentBefore);
  }
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
  const completedTournament = Boolean(currentTournament);
  const expeditionResult = pendingExpeditionResult;
  const expeditionLoot = pendingExpeditionLoot;
  pendingExpeditionResult = null;
  pendingExpeditionLoot = null;
  currentReport = null; currentTournament = null; battleEquipmentBefore = null; battleInventoryBefore = null; $("#battle-overlay").hidden = true; $("#tournament-panel").hidden = true; document.body.classList.remove("battle-open");
  if (completedTournament) persist();
  showPage(battleReturnPage, false, false);
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: battleReturnScrollY, behavior: "auto" });
    if (expeditionResult) openExpeditionRewards(expeditionResult, expeditionLoot?.items ?? expeditionResult.rewards?.items ?? [], expeditionLoot?.equipmentBefore ?? null);
  });
}

function setWorldInterface(visible: boolean): void {
  $(".game-header").hidden = !visible;
  $(".main-nav").hidden = !visible;
  $(".game-shell").hidden = !visible;
  $("#basic-shell").hidden = visible;
  if (!visible) {
    $("#tournament-reminder").hidden = true;
    $("#dungeon-layer").hidden = true;
  }
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
  queueUnseenContextualTutorials();
  if (!game.save.tutorialCompleted) openTutorial(true);
}

function bootstrap(): void {
  initializeGlossary();
  initializeStickyOffsets();
  updateSoundControls();
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
$("#sound-toggle").addEventListener("click", toggleSound);
$("#basic-sound-toggle").addEventListener("click", toggleSound);
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
  if (!window.confirm(`Продать все неиспользуемые предметы (${count})? Регалии короны и надетые вещи останутся у героя.`)) return;
  const scrollTop = window.scrollY;
  const result = game.sellUnequipped();
  persist(); renderHeader(); renderArsenal(false); window.scrollTo(0, scrollTop);
  toast(`Продано предметов: ${result.count}. Получено ${result.value} монет.`);
});
$("#open-tutorial-btn").addEventListener("click", () => openTutorial(false));
$("#tutorial-skip").addEventListener("click", finishTutorial);
$("#tutorial-back").addEventListener("click", () => {
  tutorialStepIndex = Math.max(0, tutorialStepIndex - 1);
  renderTutorial();
});
$("#tutorial-next").addEventListener("click", () => {
  if (tutorialStepIndex >= activeTutorialSteps.length - 1) { finishTutorial(); return; }
  tutorialStepIndex += 1;
  renderTutorial();
});
$("#close-dungeon-window").addEventListener("click", closeDungeonWindow);
$("#continue-expedition-rewards").addEventListener("click", closeExpeditionRewards);
$("#dungeon-layer").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeDungeonWindow(); });
$("#dismiss-tournament-reminder").addEventListener("click", () => {
  dismissedTournamentReminderKey = tournamentReminderKey(tournamentsScheduledToday());
  $("#tournament-reminder").hidden = true;
});
$("#dismiss-loot-reminder").addEventListener("click", advanceLootReminder);
$("#open-tournament-calendar").addEventListener("click", () => {
  const scheduled = tournamentsScheduledToday();
  dismissedTournamentReminderKey = tournamentReminderKey(scheduled);
  $("#tournament-reminder").hidden = true;
  showPage("map");
  const target = scheduled.some((event) => event.crownLeague) ? "#endgame-section" : "#tournaments-section";
  window.setTimeout(() => $(target).scrollIntoView({ behavior: "smooth", block: "start" }), 0);
});
$("#close-equipment-picker").addEventListener("click", closeEquipmentPicker);
$("#close-equipment-comparison").addEventListener("click", closeEquipmentComparison);
$("#comparison-back").addEventListener("click", closeEquipmentComparison);
$("#close-new-chronicle").addEventListener("click", closeNewChronicleDialog);
$("#new-chronicle-back").addEventListener("click", () => moveNewChronicleStep(-1));
$("#new-chronicle-next").addEventListener("click", () => moveNewChronicleStep(1));
$("#new-chronicle-confirm").addEventListener("click", confirmNewChronicle);
$("#new-chronicle-layer").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeNewChronicleDialog(); });
$("#new-chronicle-layer").addEventListener("keydown", (event) => {
  if ((event as KeyboardEvent).key !== "Tab") return;
  const layer = $("#new-chronicle-layer");
  const focusable = Array.from(layer.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])"))
    .filter((node) => !node.hidden && node.offsetParent !== null);
  if (!focusable.length) { event.preventDefault(); return; }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const keyboardEvent = event as KeyboardEvent;
  if (!focusable.includes(document.activeElement as HTMLElement)) { event.preventDefault(); (keyboardEvent.shiftKey ? last : first).focus(); }
  else if (keyboardEvent.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!keyboardEvent.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});
$("#chronicle-current-tab").addEventListener("click", () => showChronicleView("current"));
$("#chronicle-archive-tab").addEventListener("click", () => showChronicleView("archive"));
$(".chronicle-tabs").addEventListener("keydown", (event) => {
  const keyboardEvent = event as KeyboardEvent;
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(keyboardEvent.key)) return;
  keyboardEvent.preventDefault();
  const openArchive = keyboardEvent.key === "ArrowRight" || keyboardEvent.key === "End";
  showChronicleView(openArchive ? "archive" : "current");
  $<HTMLButtonElement>(openArchive ? "#chronicle-archive-tab" : "#chronicle-current-tab").focus();
});
$("#equipment-picker").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeEquipmentPicker(); });
$("#equipment-comparison").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeEquipmentComparison(); });
window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!$("#tutorial-layer").hidden) finishTutorial();
  else if (!$("#new-chronicle-layer").hidden) closeNewChronicleDialog();
  else if (!$("#dungeon-layer").hidden) closeDungeonWindow();
  else if (!$("#equipment-comparison").hidden) closeEquipmentComparison();
  else if (!$("#equipment-picker").hidden) closeEquipmentPicker();
});
window.addEventListener("resize", scheduleTutorialPosition);
window.addEventListener("scroll", scheduleTutorialPosition, { passive: true });
$("#skip-battle").addEventListener("click", skipBattle);
$("#manual-battle-step").addEventListener("click", confirmManualBattleTurn);
$("#close-battle").addEventListener("click", closeBattle);
window.addEventListener("beforeunload", () => persist());

bootstrap();
