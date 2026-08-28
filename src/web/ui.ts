import { worldEliteSeasonStandings } from "../gameplay/WorldSeason";
import { prepareChronicleList, rememberChronicleScroll } from "./ChronicleLists";
import { compareEquipment } from "../gameplay/EquipmentComparison";
import { selectActiveSkills } from "../gameplay/SkillLoadout";
import {
  BattleSession,
  MAX_ACTIVE_SKILLS,
  combatantSnapshot,
  describeSetProgress,
  nextSkills,
  unlockedSkills,
  type BattleAction,
  type BattleActionOption,
  type BattleFighterState,
} from "../gameplay/AdvancedBattle";
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
import { buildLegacySalvageEntries, sortLegacyPathCandidates } from "../gameplay/EquipmentLegacy";
import { createEquipmentIcon, renderCharacterDoll } from "./CharacterDoll";
import { basicTournamentUi } from "./BasicTournamentUi";
import { gameAudio } from "./GameAudio";
import { initializeGlossary, markTerm } from "./Glossary";
import { queueWorldEffect } from "./WorldEffects";
import { currentWorldSeasonNotice, SeasonNoticeTracker } from "./SeasonNotices";
import { openSeasonChanges } from "./SeasonChangesDialog";
import { appendEraVeteranBadge, loadRankingSnapshot, markRankMovement, observeLeaderboardRows, saveRankingSnapshot } from "./LeaderboardView";
import { createElement as element, query as $, queryAll as $$ } from "./UiDom";
import { DirtyPageRegistry, ModalController, PausableTimeout, pageFromHash, pageHash } from "./UiRuntime";
import { WorldSaveRepository } from "../gameplay/WorldSaveStorage";
import {
  createCrownSeasonOverview,
  createEraChallengePanel,
  createExpeditionConditionView,
  createExpeditionRouteView,
  narrativeEffectLines,
} from "./CampaignViewBuilders";
import { baseTutorialSteps, contextualTutorialSteps, type TutorialStep } from "./TutorialCatalog";
import { SaveTransferController } from "./SaveTransferController";
import { PendingBattleUiController, pendingBattleReport } from "./PendingBattleUi";
import {
  WORLD_PAGE_IDS,
  WORLD_PAGE_NAV_GROUP,
  isWorldPageAvailable,
  type WorldPageId,
} from "./WorldPageCatalog";
import { buildRivalScoutingReport, rivalryStatus } from "../gameplay/RivalrySystem";
import { FACTION_PERKS, factionModifier, unlockedFactionPerks } from "../gameplay/FactionSystem";
import { crownSeasonRemainingDays } from "../gameplay/CrownSeason";
import { reforgeCost } from "../gameplay/LootProgression";
import type { DungeonRouteNode } from "../gameplay/DungeonRoute";
import {
  ActivityDefinition,
  ArenaDefinition,
  BattleReport,
  BattleTurn,
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
  PendingBattle,
  PendingBattleFinalization,
} from "../gameplay/WorldTypes";

const SAVE_KEY = "dust-and-crown-save-v2";
const MODE_KEY = "dust-and-crown-mode";
const LEADER_SNAPSHOT_KEY = "dust-and-crown-leader-snapshot-v1";
const ELITE_SNAPSHOT_KEY = "dust-and-crown-elite-snapshot-v1";
const PAGE_IDS = WORLD_PAGE_IDS;
type PageId = WorldPageId;
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
const selectedLegacySalvageIds = new Set<string>();
let inventoryVisibleLimit = 60;
let equipmentPickerSlot: EquipmentSlot | null = null;
let comparisonItemId: string | null = null;
let comparisonShopIndex: number | null = null;
let dismissedTournamentReminderKey: string | null = null;
let lootReminderQueue: Array<{ itemId: string; equippedItemId: string | null }> = [];
let lootReminderIndex = 0;
let deferredBattleLoot: { items: EquipmentItem[]; equipmentBefore: Partial<Record<EquipmentSlot, string>> | null } | null = null;
let battleTimer: number | null = null;
let currentReport: BattleReport | null = null;
let manualBattleSession: BattleSession | null = null;
let pendingBattleUi: PendingBattleUiController | null = null;
let pendingTournamentContinuation = false;
let pendingBattleCompletedForPersist = false;
let selectedManualActionId = "basic";
let currentTournament: TournamentReport | null = null;
let tournamentBattleIndex = 0;
let battleTurnIndex = 0;
let battleHealth = { hero: 0, enemy: 0 };
let battleReturnScrollY = 0;
let battleReturnPage = "map";
let battleEquipmentBefore: Partial<Record<EquipmentSlot, string>> | null = null;
let battleInventoryBefore: Set<string> | null = null;
let pendingExpeditionResult: ExpeditionStepReport | null = null;
let resumeExpeditionAfterBattle = false;
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
const modalController = new ModalController(document);
const lootReminderTimeout = new PausableTimeout();
const saveRepository = new WorldSaveRepository(localStorage, SAVE_KEY);
const saveTransferController = new SaveTransferController(saveRepository, localStorage);
const seasonNoticeTracker = new SeasonNoticeTracker();
let saveLoadError: string | null = null;
let saveRecoveredFromBackup = false;

const pageRegistry = new DirtyPageRegistry<PageId>({
  map: (animate) => renderMap(animate),
  hero: (animate) => { renderHeroVisual(animate); renderGearActions(); },
  arsenal: (animate) => { renderGearActions(); renderArsenal(animate); },
  forge: (animate) => renderForge(animate),
  legacy: () => renderLegacy(),
  skills: (animate) => renderSkills(animate),
  contracts: () => renderContracts(),
  collections: () => renderCollections(),
  shop: () => renderShop(),
  leaders: (animate) => renderLeaders(animate),
  elite: (animate) => renderEliteLeaders(animate),
  chronicle: () => renderChronicle(),
});

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
    best.dataset.focusKey = `${container.id}:best`;
    set.dataset.focusKey = `${container.id}:set`;
    checkbox.dataset.focusKey = `${container.id}:auto`;
    auto.append(checkbox, document.createTextNode(" Автоматически надевать лучшее"));
    best.addEventListener("click", () => {
      game!.equipBest(); persist(); refreshEquipmentViews(true);
    });
    set.addEventListener("click", () => {
      game!.equipBest("set"); persist(); refreshEquipmentViews(true);
    });
    checkbox.addEventListener("change", () => {
      game!.setAutoEquipBest(checkbox.checked); persist(); refreshEquipmentViews(true);
    });
    container.append(best, set, auto);
  };
  renderInto($("#hero-gear-actions"));
  renderInto($("#inventory-gear-actions"));
}

function loadGame(): WorldGame | null {
  saveLoadError = null;
  saveRecoveredFromBackup = false;
  const loaded = saveRepository.load();
  if (!loaded) {
    const hasUnreadableData = [saveRepository.primaryKey, saveRepository.temporaryKey, saveRepository.backupKey]
      .some((key) => localStorage.getItem(key) !== null);
    if (hasUnreadableData) saveLoadError = "Ни основное сохранение, ни временная или резервная копия не прошли проверку целостности.";
    return null;
  }
  saveRecoveredFromBackup = loaded.source !== "primary";
  return WorldGame.restore(loaded.save);
}

function contextualTutorialCanOpen(): boolean {
  if (!game || !$("#tutorial-layer").hidden) return false;
  return ["#battle-overlay", "#dungeon-layer", "#equipment-picker", "#equipment-comparison", "#new-chronicle-layer", "#narrative-layer"]
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
  try {
    saveRepository.save(game.save);
  } catch (error) {
    queueWorldEffect({
      eyebrow: "ОШИБКА СОХРАНЕНИЯ",
      title: "Прогресс не записан",
      description: (error as Error).message,
      symbol: "!",
      tone: "negative",
      duration: 8000,
    });
    return;
  }
  pageRegistry.invalidateAll();
  seasonNoticeTracker.collect(game.save).forEach((notice) => queueWorldEffect({
    variant: "season",
    replaceKey: `season-${notice.kind}`,
    eyebrow: notice.kind === "world" ? `ЭПОХА ${notice.cycle} · СЕЗОН ${notice.number}` : "СМЕНА СЕЗОНА · ЭЛИТА",
    title: notice.kind === "world" ? `Новый сезон: ${notice.title}` : notice.title,
    description: notice.description,
    symbol: "◈", tone: "legendary", sound: "reputation", duration: 7000,
    action: { label: "Узнать изменения", run: () => openSeasonChanges(notice, modalController) },
  }));
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
      variant: defense.heroWon ? "victory" : "defeat",
      replaceKey: "legend-defense-result",
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

type EquipmentVisual = Pick<EquipmentItem, "name" | "templateId" | "rarity" | "setId" | "allowedClasses" | "relicTier" | "relicPath" | "appearanceVariant">;

function equipmentArtwork(slot: EquipmentSlot, classId: HeroClass, className = "equipment-art", item?: EquipmentVisual): HTMLSpanElement {
  return createEquipmentIcon(slot, classId, className, item ? {
    name: item.name,
    templateId: item.templateId,
    rarity: item.rarity,
    rarityColor: rarityColors[item.rarity],
    setId: item.setId,
    visualClassId: classForTemplate(item.allowedClasses),
    relicTier: item.relicTier,
    relicPath: item.relicPath,
    appearanceVariant: item.appearanceVariant,
  } : undefined);
}

function classForTemplate(classes: HeroClass[] | "all"): HeroClass {
  if (!game || classes === "all" || classes.includes(game.save.hero.classId)) return game?.save.hero.classId ?? "Knight";
  return classes[0] ?? "Knight";
}

function notifyError(message: string): void {
  queueWorldEffect({
    eyebrow: "ДЕЙСТВИЕ НЕ ВЫПОЛНЕНО",
    title: "Проверьте условие",
    description: message,
    symbol: "!",
    tone: "negative",
    duration: 3200,
  });
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
  const navigation = document.querySelector<HTMLElement>(".main-nav");
  const basicHeader = document.querySelector<HTMLElement>(".basic-header");
  if (!header || !navigation) return;
  let announcementTop = "";
  const syncAnnouncement = () => {
    const bottom = Math.max(0, header.getBoundingClientRect().bottom, navigation.getBoundingClientRect().bottom, basicHeader?.getBoundingClientRect().bottom ?? 0);
    const next = `${Math.ceil(bottom) + 12}px`;
    if (announcementTop === next) return;
    announcementTop = next;
    document.documentElement.style.setProperty("--announcement-top", next);
  };
  const sync = () => {
    document.documentElement.style.setProperty("--game-header-height", `${Math.ceil(header.getBoundingClientRect().height)}px`);
    document.documentElement.style.setProperty("--main-nav-height", `${Math.ceil(navigation.getBoundingClientRect().height)}px`);
    syncAnnouncement();
  };
  let scrollFrame = 0;
  window.addEventListener("scroll", () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => { scrollFrame = 0; syncAnnouncement(); });
  }, { passive: true });
  sync();
  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(sync);
    observer.observe(header);
    observer.observe(navigation);
    if (basicHeader) observer.observe(basicHeader);
  }
  window.addEventListener("resize", sync);
}

function toggleSound(): void {
  gameAudio.toggle();
  updateSoundControls();
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
  if (preview) {
    const scouting = buildRivalScoutingReport(memory, preview);
    const advice = element("section", "rivalry-scouting-advice");
    advice.append(
      element("strong", "", "Совет перед следующей встречей"),
      element("p", "", scouting.recommendation),
    );
    body.append(advice);
  }
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

function preserveUiFocus(render: () => void): void {
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const id = active?.id;
  const key = active?.dataset.focusKey;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  render();
  const replacement = id
    ? document.getElementById(id)
    : key
      ? document.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(key)}"]`)
      : null;
  if (replacement && replacement !== active) replacement.focus({ preventScroll: true });
  window.scrollTo({ left: scrollX, top: scrollY, behavior: "auto" });
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
  showPage(step.page, false, true, false, false);
  window.requestAnimationFrame(() => {
    tutorialTarget = document.querySelector<HTMLElement>(step.target);
    const targetIsVisible = tutorialTarget && !tutorialTarget.hidden
      && tutorialTarget.getAttribute("aria-hidden") !== "true"
      && getComputedStyle(tutorialTarget).display !== "none"
      && tutorialTarget.getBoundingClientRect().width > 0;
    if (!targetIsVisible) {
      tutorialTarget = step.target.includes(".resources")
        ? document.querySelector<HTMLElement>(".hero-summary")
        : document.querySelector<HTMLElement>(`.main-nav button[data-page="${step.page}"]`) ?? $(".game-header");
    }
    const positionedTarget = tutorialTarget ?? $(".game-header");
    tutorialTarget = positionedTarget;
    if (positionedTarget.closest(".main-nav")) {
      positionedTarget.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    } else if (!positionedTarget.closest(".game-header")) {
      positionedTarget.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
    }
    window.requestAnimationFrame(scheduleTutorialPosition);
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
  showPage(tutorialReturnPage, false, true, false, false);
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
  pendingBattleUi = new PendingBattleUiController(game);
  localStorage.removeItem(LEADER_SNAPSHOT_KEY);
  localStorage.removeItem(ELITE_SNAPSHOT_KEY);
  game.save.hero.appearance = {
    hairStyle: Number(($("#hero-hair") as HTMLSelectElement).value) as 0 | 1 | 2,
    faceStyle: 0,
  };
  persist();
  modalController.close($("#creation-screen"), false);
  renderAll();
  openTutorial(true);
  queueWorldEffect({ eyebrow: "НОВАЯ ЛЕТОПИСЬ", title: name, description: `${CLASS_DEFINITIONS[selectedClass].name} выходит на первую арену.`, symbol: classIcons[selectedClass], tone: "legendary", sound: "reputation", duration: 2600 });
}

function currentPage(): PageId {
  const page = document.querySelector<HTMLElement>(".page.active")?.id.replace("page-", "") as PageId | undefined;
  return PAGE_IDS.includes(page as PageId) ? page as PageId : "map";
}

function pageIsAvailable(page: PageId): boolean {
  return Boolean(game) && isWorldPageAvailable(page, (feature) => game!.isFeatureUnlocked(feature));
}

function syncNavigation(page: PageId): void {
  const group = WORLD_PAGE_NAV_GROUP[page];
  const secondary = $("#nav-secondary");
  let hasVisibleSecondaryPage = false;
  $$<HTMLButtonElement>(".nav-primary button[data-nav-group]").forEach((button) => {
    const active = button.dataset.navGroup === group;
    button.classList.toggle("active", active);
    if (button.dataset.navDefault === "shop") {
      button.removeAttribute("aria-expanded");
      button.setAttribute("aria-controls", "page-shop");
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    } else {
      button.removeAttribute("aria-current");
      button.setAttribute("aria-expanded", String(active));
      button.setAttribute("aria-controls", "nav-secondary");
    }
  });
  $$<HTMLButtonElement>(".nav-secondary button[data-page]").forEach((button) => {
    const buttonPage = button.dataset.page as PageId;
    const active = buttonPage === page;
    const visible = button.dataset.navGroup === group && pageIsAvailable(buttonPage);
    if (visible) hasVisibleSecondaryPage = true;
    button.hidden = !visible;
    button.setAttribute("aria-hidden", String(!visible));
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  secondary.hidden = !hasVisibleSecondaryPage;
  secondary.dataset.group = group;
}

function renderActivePage(animate = false, force = false): void {
  if (!game) return;
  const page = currentPage();
  pageRegistry.render(page, { animate, force });
}

function showPage(page: string, scrollToTop = true, refresh = true, scrollNavigation = true, updateRoute = true): void {
  const requested = PAGE_IDS.includes(page as PageId) ? page as PageId : "map";
  const targetPage = pageIsAvailable(requested) ? requested : "map";
  syncNavigation(targetPage);
  $$(".page").forEach((section) => section.classList.toggle("active", section.id === `page-${targetPage}`));
  if (game && refresh) pageRegistry.render(targetPage, { animate: true });
  const activeNavigationItem = document.querySelector<HTMLButtonElement>(
    `.main-nav button[data-page="${targetPage}"], .main-nav button[data-nav-default="${targetPage}"]`,
  );
  if (scrollNavigation) activeNavigationItem?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  if (scrollToTop) window.scrollTo({ top: 0, behavior: "smooth" });
  if (updateRoute && location.hash !== pageHash(targetPage)) history.pushState(null, "", pageHash(targetPage));
}

function renderFeatureNavigation(): void {
  if (!game) return;
  syncNavigation(currentPage());
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
  const restoreBackup = $("#restore-backup-btn") as HTMLButtonElement;
  restoreBackup.disabled = !saveTransferController.canRestoreBackup();
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
    relicTier: item.relicTier,
    relicPath: item.relicPath,
    appearanceVariant: item.appearanceVariant,
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
      remove.addEventListener("click", (event) => { event.stopPropagation(); game!.unequip(slot); persist(); refreshEquipmentViews(true); });
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
      game!.changeHeroClass(nextClass); persist();
      renderHeader();
      preserveUiFocus(() => renderActivePage(false));
      queueWorldEffect({ eyebrow: "НОВАЯ СПЕЦИАЛИЗАЦИЯ", title: nextName, description: "Класс изменён. Навыки и подходящее снаряжение собраны заново.", symbol: "✦", tone: "legendary", sound: "reputation" });
    } catch (error) { notifyError((error as Error).message); }
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
    const rivalry = rivalryStatus(record);
    const worldStatus = eliteFighter
      ? `Элита №${eliteFighter.rank} · ${game!.legendTitle(eliteFighter.rank) ?? "участник Лиги короны"} · рейтинг ${eliteFighter.entry.rating}`
      : ranked
      ? `№${ranked.rank} в мире · рейтинг ${ranked.entry.rating} · ${ARENAS[ranked.entry.arenaIndex]?.name ?? "арена не указана"}`
      : worldFighter?.alive
        ? `Вне первой сотни · рейтинг ${worldFighter.rating} · ${ARENAS[worldFighter.arenaIndex]?.name ?? "арена не указана"}`
        : worldFighter?.retiredDay
          ? `Завершил карьеру в день ${worldFighter.retiredDay} · теперь наставник`
        : worldFighter
          ? "Погиб · исключён из мирового рейтинга"
          : "Участник турниров · текущая позиция в рейтинге недоступна";
    copy.append(
      element("strong", "", record.name),
      element("small", "", `${CLASS_DEFINITIONS[record.classId].name} · последняя встреча: день ${record.lastMetDay}`),
      element("span", `rivalry-disposition ${rivalry.id}`, `${rivalry.name} · ${rivalry.description}`),
      element("span", `rivalry-world-rank${eliteFighter ? " elite" : ranked ? " ranked" : ""}`, worldStatus),
    );
    if (worldFighter) {
      const features = game!.fighterFeatures(worldFighter).slice(0, 2).map((feature) => feature.name).join(" · ");
      if (features) copy.append(element("span", "rivalry-traits", `Характер: ${features}`));
      const faction = FACTIONS.find((candidate) => candidate.id === worldFighter.factionId);
      const goal = game!.npcGoal(worldFighter.goal);
      copy.append(element("span", "rivalry-world-intent", `${faction?.name ?? "Независимый боец"} · ${goal.name}`));
      if (worldFighter.lastActivity) copy.append(element("span", "rivalry-last-activity", worldFighter.lastActivity.description));
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
    const controller = game.factionController(activity.id);
    const control = element("div", "activity-controller");
    control.style.setProperty("--faction-accent", controller.accent);
    control.append(element("small", "", "АРЕНОЙ УПРАВЛЯЕТ"), element("strong", "", controller.name), element("span", "", controller.effect));
    card.append(control);
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
    queueWorldEffect({ eyebrow: "КАЛЕНДАРЬ ТУРНИРОВ", title: `Запись на день ${day}`, description: "Место в сетке закреплено за героем. В день события появится напоминание.", symbol: "◇", sound: "choice" });
  } catch (error) { notifyError((error as Error).message); }
}

function registerForCrownLeague(): void {
  if (!game) return;
  try {
    const day = game.registerCrownLeague();
    persist();
    refreshMapViews(false);
    queueWorldEffect({ eyebrow: "ЭЛИТНЫЙ ОТБОР", title: `Лига короны · день ${day}`, description: "Победа в редком турнире откроет дорогу в элитную тридцатку.", symbol: "♛", tone: "legendary", sound: "reputation" });
  } catch (error) { notifyError((error as Error).message); }
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
  if (lootReminderQueue[lootReminderIndex] || !$("#loot-reminder").hidden || !$("#narrative-layer").hidden) {
    reminder.hidden = true;
    return;
  }
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
  const condition = createExpeditionConditionView(expedition);
  heading.append(copy, condition);
  const route = game.expeditionRoute();
  const routeMap = route ? renderExpeditionRoute(route.nodes) : element("div", "expedition-choices");
  const shrineChoices = game.expeditionShrineChoices();
  const merchantOptions = game.expeditionMerchantOptions();
  const choices = shrineChoices.length || merchantOptions.length ? element("div", "expedition-route-shell") : routeMap;
  if (shrineChoices.length) {
    const shrine = element("section", "expedition-shrine-choice");
    shrine.append(
      element("p", "eyebrow", "КЛЯТВА У СВЯТИЛИЩА"),
      element("h4", "", "Сила всегда требует цены"),
      element("p", "", "Решение действует до конца текущего похода и не может быть отменено."),
    );
    const shrineGrid = element("div");
    shrineChoices.forEach((choice) => {
      const button = element("button", "expedition-shrine-option");
      button.type = "button";
      button.append(
        element("strong", "", choice.name),
        element("p", "", choice.description),
        element("span", "positive", choice.benefit),
        element("span", "negative", `Цена: ${choice.cost}`),
      );
      button.addEventListener("click", () => resolveExpeditionShrine(choice.id));
      shrineGrid.append(button);
    });
    shrine.append(shrineGrid);
    choices.append(shrine, routeMap);
  }
  if (merchantOptions.length) {
    const merchant = element("section", "expedition-merchant-choice");
    merchant.append(
      element("p", "eyebrow", "ТОРГОВЕЦ ПОД ЗЕМЛЁЙ"),
      element("h4", "", "Распорядитесь найденными монетами"),
      element("p", "", `В кошеле похода ${expedition.accumulatedGold} ¤. Потраченные здесь монеты не попадут в итоговую награду.`),
    );
    const merchantGrid = element("div");
    merchantOptions.forEach((option) => {
      const affordable = expedition.accumulatedGold >= option.price;
      const button = element("button", `expedition-merchant-option${affordable ? "" : " unavailable"}`);
      button.type = "button";
      button.disabled = !affordable;
      button.append(
        element("strong", "", option.name),
        element("p", "", option.description),
        element("span", option.price ? "negative" : "positive", option.price ? `${option.price} найденных монет` : "Бесплатно"),
      );
      button.addEventListener("click", () => resolveExpeditionMerchant(option.id));
      merchantGrid.append(button);
    });
    merchant.append(merchantGrid);
    choices.append(merchant, routeMap);
  }
  if (!route) game.expeditionChoices().forEach((choice) => {
      const card = element("article", `expedition-choice ${choice.id}`);
      card.append(element("small", "", `РИСК: ${choice.danger.toUpperCase()}`), element("h4", "", choice.name), element("p", "", choice.description), element("span", "", `Награда: ${choice.reward}`));
      const button = element("button", "button", "Выбрать путь");
      button.addEventListener("click", () => advanceExpedition(choice.id));
      card.append(button); choices.append(card);
    });
  const retreat = element("button", "plain-button expedition-retreat", "Отступить и сохранить часть найденного");
  retreat.addEventListener("click", retreatExpedition);
  const visitedTitles = route
    ? (expedition.visitedNodeIds ?? []).map((id) => route.nodes.find((node) => node.id === id)?.title).filter((title): title is string => Boolean(title))
    : expedition.path.map((id) => id === "risk" ? "риск" : id === "rest" ? "лагерь" : "проход");
  const path = element("p", "expedition-path", visitedTitles.length ? `Пройденный путь: ${visitedTitles.join(" → ")}` : "Поход только начался.");
  board.replaceChildren(heading, choices, path, retreat);
}

function renderExpeditionRoute(nodes: DungeonRouteNode[]): HTMLElement {
  const expedition = game!.save.activeExpedition!;
  const route = game!.expeditionRoute();
  return createExpeditionRouteView({
    nodes,
    expedition,
    reachableIds: new Set(game!.reachableExpeditionNodes().map((node) => node.id)),
    onAdvance: advanceExpeditionNode,
    route,
    discovery: game!.dungeonDiscovery(expedition.dungeonId),
  });
}

function openDungeonWindow(): void {
  if (!game?.save.activeExpedition) return;
  const dungeon = DUNGEONS.find((candidate) => candidate.id === game!.save.activeExpedition?.dungeonId);
  $("#dungeon-window-kicker").textContent = "ЭКСПЕДИЦИЯ ПРОДОЛЖАЕТСЯ";
  $("#dungeon-window-title").textContent = dungeon?.name ?? "Путь в глубину";
  $("#dungeon-reward-view").hidden = true;
  $("#dungeon-expedition-view").hidden = false;
  $("#close-dungeon-window").hidden = true;
  renderExpedition();
  modalController.open($("#dungeon-layer"), {
    initialFocus: ".expedition-route-node.reachable button, .expedition-shrine-option, .expedition-choice button, .expedition-retreat",
    dismissOnBackdrop: false,
    dismissOnEscape: false,
  });
}

function closeDungeonWindow(): void {
  if (!$("#dungeon-reward-view").hidden) {
    closeExpeditionRewards();
    return;
  }
  if (game?.save.activeExpedition) {
    notifyError("Сначала завершите поход или отступите, чтобы вернуться к карте.");
    return;
  }
  modalController.close($("#dungeon-layer"));
  resumeDeferredUi();
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

function statComparisonRow(stat: ComparisonStat, current: number, candidate: number, className: string): HTMLElement {
  const difference = candidate - current;
  const state = difference > 0 ? "positive" : difference < 0 ? "negative" : "neutral";
  const row = element("div", `${className} ${state}`);
  const values = element("span", "stat-comparison-values");

  row.title = stat === "crit" ? "Итоговый шанс ограничен 60%. Крит сверх предела не увеличивает эту характеристику."
    : stat === "speed" ? "Скорость повышает частоту действий. При высокой скорости прибавка темпа постепенно уменьшается."
      : "Итоговая характеристика героя с учётом всех надетых предметов и активных комплектов.";
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
  modalController.close($("#equipment-picker"));
  if ($("#equipment-comparison").hidden) document.body.classList.remove("equipment-dialog-open");
  resumeDeferredUi();
}

function closeEquipmentComparison(): void {
  comparisonItemId = null;
  comparisonShopIndex = null;
  modalController.close($("#equipment-comparison"));
  if ($("#equipment-picker").hidden) document.body.classList.remove("equipment-dialog-open");
  resumeDeferredUi();
}

function equipFromDialog(item: EquipmentItem): void {
  if (!game) return;
  try {
    game.equip(item.id);
    persist();
    closeEquipmentComparison();
    closeEquipmentPicker();
    refreshEquipmentViews(true);
  } catch (error) {
    notifyError((error as Error).message);
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

  const { current: currentStats, candidate: candidateStats } = compareEquipment(game.save.hero, candidate, equipped);
  const list = $("#comparison-stat-list");
  $("#equipment-comparison .comparison-note").textContent = "Показаны итоговые характеристики героя после замены: учтены комплекты, свойства наследия и предел критического шанса 60%. Условия конкретной арены могут изменить их в бою.";
  list.replaceChildren(...comparisonStats.map((key) => statComparisonRow(key, currentStats[key], candidateStats[key], "comparison-stat")));

  const equip = $("#comparison-equip") as HTMLButtonElement;
  const alreadyEquipped = game.save.hero.equipped[candidate.slot] === candidate.id;
  if (shopOffer) {
    equip.disabled = shopOffer.sold || game.save.hero.gold < candidate.price;
    equip.textContent = shopOffer.sold ? "Продано" : `Купить · ${candidate.price} ¤`;
    equip.onclick = () => {
      try {
        const bought = game!.buy(comparisonShopIndex!);
        persist(); closeEquipmentComparison(); refreshEquipmentViews(true);
        queueWorldEffect({ eyebrow: "НОВАЯ ПОКУПКА", title: bought.name, description: `${RARITY_LABELS[bought.rarity]} снаряжение добавлено в инвентарь.`, symbol: "◆", tone: rarityAtLeastUi(bought.rarity, "legendary") ? "legendary" : "positive", sound: "loot" });
      } catch (error) { notifyError((error as Error).message); }
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
  modalController.open(layer, {
    initialFocus: "#close-equipment-comparison",
    dismissOnBackdrop: true,
    onRequestClose: closeEquipmentComparison,
  });
  document.body.classList.add("equipment-dialog-open");
}

function concealLootReminder(): void {
  lootReminderTimeout.cancel();
  const reminder = $("#loot-reminder");
  reminder.hidden = true;
  reminder.classList.remove("is-visible");
}

function hideLootReminder(): void {
  concealLootReminder();
  document.body.classList.remove("loot-notification-open");
  lootReminderQueue = [];
  lootReminderIndex = 0;
  window.setTimeout(renderTournamentReminder, 60);
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
  if (document.body.classList.contains("ui-modal-open")) return;
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

  const { current: currentStats, candidate: candidateStats } = compareEquipment(game.save.hero, item, equipped);
  $("#loot-reminder-difference").replaceChildren(
    ...comparisonStats.map((stat) => statComparisonRow(stat, currentStats[stat], candidateStats[stat], "loot-reminder-stat")),
  );

  const equip = $("#loot-reminder-equip") as HTMLButtonElement;
  const alreadyEquipped = game.save.hero.equipped[item.slot] === item.id;
  equip.disabled = alreadyEquipped || !canHeroEquip(item);
  equip.textContent = alreadyEquipped ? "Уже надето автоматически" : canHeroEquip(item) ? "Надеть" : "Не подходит классу";
  equip.onclick = () => {
    try {
      game!.equip(item.id); persist(); refreshEquipmentViews(true); advanceLootReminder();
    } catch (error) { notifyError((error as Error).message); }
  };

  const reminder = $("#loot-reminder");
  $("#tournament-reminder").hidden = true;
  reminder.hidden = false;
  document.body.classList.add("loot-notification-open");
  void reminder.offsetWidth;
  reminder.classList.add("is-visible");
  reminder.classList.remove("timer-paused");
  lootReminderTimeout.start(advanceLootReminder, 5_000);
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
  if (items.length === 0) return;
  const additions = items
    .filter((item) => !lootReminderQueue.some((queued) => queued.itemId === item.id))
    .map((item) => ({ itemId: item.id, equippedItemId: equipmentBefore?.[item.slot] ?? null }));
  if (additions.length === 0) return;
  const wasEmpty = lootReminderQueue.length === 0 || lootReminderIndex >= lootReminderQueue.length;
  lootReminderQueue.push(...additions);
  if (wasEmpty) {
    lootReminderIndex = 0;
    resumeDeferredUi();
  } else {
    $("#loot-reminder-progress").textContent = `ПОЛУЧЕНА ДОБЫЧА · ${lootReminderIndex + 1} ИЗ ${lootReminderQueue.length}`;
  }
}

function resumeLootReminder(): void {
  if (document.body.classList.contains("ui-modal-open") || !lootReminderQueue[lootReminderIndex]) return;
  renderLootReminder();
}

function setLootReminderPaused(paused: boolean): void {
  const reminder = $("#loot-reminder");
  if (reminder.hidden) return;
  reminder.classList.toggle("timer-paused", paused);
  if (paused) lootReminderTimeout.pause();
  else lootReminderTimeout.resume();
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
  $("#close-dungeon-window").hidden = true;
  modalController.open($("#dungeon-layer"), {
    initialFocus: "#continue-expedition-rewards",
    dismissOnBackdrop: false,
    dismissOnEscape: false,
  });
}

function rewardStat(label: string, value: string): HTMLElement {
  const card = element("article", "expedition-reward-stat");
  card.append(element("small", "", label), element("strong", "", value));
  return card;
}

function closeExpeditionRewards(): void {
  modalController.close($("#dungeon-layer"));
  $("#dungeon-reward-view").hidden = true;
  $("#dungeon-expedition-view").hidden = false;
  const followup = expeditionRewardFollowup;
  expeditionRewardFollowup = null;
  if (followup?.items.length) window.setTimeout(() => showLootReminders(followup.items, followup.equipmentBefore), 120);
  else resumeDeferredUi();
}

function presentPendingNarrativeEvent(): boolean {
  if (!game || !$("#narrative-layer").hidden || !$("#tutorial-layer").hidden || document.body.classList.contains("ui-modal-open")) return false;
  const story = game.pendingNarrativeEvent();
  if (!story) return false;
  concealLootReminder();
  $("#tournament-reminder").hidden = true;
  $("#narrative-title").textContent = story.title;
  $("#narrative-copy").textContent = story.description;
  const choices = $("#narrative-choices");
  choices.replaceChildren(...story.choices.map((choice, index) => {
    const card = element("button", "narrative-choice");
    card.type = "button";
    card.style.setProperty("--choice-index", String(index));
    const lines = narrativeEffectLines(choice.effect);
    const unaffordable = (choice.effect.gold ?? 0) < 0 && game!.save.hero.gold + (choice.effect.gold ?? 0) < 0;
    card.disabled = unaffordable;
    card.append(
      element("small", "", `РЕШЕНИЕ ${String(index + 1).padStart(2, "0")}`),
      element("strong", "", choice.label),
      element("p", "", choice.description),
      element("span", "narrative-consequence", unaffordable ? "Недостаточно монет" : lines.join(" · ")),
    );
    card.addEventListener("click", () => {
      try {
        const resolved = game!.resolveNarrativeChoice(choice.id);
        persist();
        modalController.close($("#narrative-layer"));
        refreshCurrentWorldView();
        queueWorldEffect({
          eyebrow: "РЕШЕНИЕ ПРИНЯТО",
          title: resolved.choice.label,
          description: narrativeEffectLines(resolved.choice.effect).join(" · "),
          symbol: "◆",
          tone: "neutral",
          sound: "choice",
          duration: 2800,
        });
        window.setTimeout(resumeDeferredUi, 80);
      } catch (error) { notifyError((error as Error).message); }
    });
    return card;
  }));
  modalController.open($("#narrative-layer"), {
    initialFocus: ".narrative-choice:not(:disabled)",
    dismissOnBackdrop: false,
    dismissOnEscape: false,
    restoreFocus: true,
  });
  return true;
}

function resumeDeferredUi(): void {
  if (document.body.classList.contains("ui-modal-open") || !$("#tutorial-layer").hidden) return;
  if (presentPendingNarrativeEvent()) return;
  resumeLootReminder();
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
      game!.unequip(slot); persist(); refreshEquipmentViews(true); renderEquipmentPicker();
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
  if (!$("#equipment-comparison").hidden) modalController.close($("#equipment-comparison"), false);
  renderEquipmentPicker();
  const layer = $("#equipment-picker");
  modalController.open(layer, {
    initialFocus: "#close-equipment-picker",
    dismissOnBackdrop: true,
    onRequestClose: closeEquipmentPicker,
  });
  document.body.classList.add("equipment-dialog-open");
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
  if (item.worldRelicId) card.append(element("p", "world-relic-mark", "Мировая реликвия · история сохраняется при смене владельца"));
  if (item.affix) card.append(element("p", "item-affix", `${item.affix.name}: +${item.affix.value} · ${item.affix.description}`));
  if (item.grantedSkillId) card.append(element("p", "item-skill", `Навык: ${skillById(item.grantedSkillId)?.name ?? item.grantedSkillId}`));
  const controls = element("div", "item-controls");
  if (mode === "inventory") {
    const equipped = game.save.hero.equipped[item.slot] === item.id;
    const compare = element("button", "small-button muted", "Сравнить");
    compare.type = "button";
    compare.dataset.focusKey = `inventory:${item.id}:compare`;
    compare.disabled = equipped;
    compare.addEventListener("click", () => openEquipmentComparison(item.id));
    const equip = element("button", "small-button", equipped ? "Снять" : "Надеть");
    equip.dataset.focusKey = `inventory:${item.id}:equip`;
    equip.addEventListener("click", () => {
      try {
        if (equipped) game!.unequip(item.slot);
        else game!.equip(item.id);
        persist(); refreshEquipmentViews(true);
      } catch (error) { notifyError((error as Error).message); }
    });
    const sellable = game!.canSell(item.id);
    const sell = element("button", "small-button muted sell-button", sellable ? `Продать · ${Math.round(item.price * 0.45)} ¤` : "Регалия короны");
    sell.dataset.focusKey = `inventory:${item.id}:sell`;
    sell.disabled = equipped || !sellable;
    if (!sellable) sell.title = "Этот уникальный комплект принадлежит первой легенде и не продаётся.";
    sell.addEventListener("click", () => {
      const scrollTop = window.scrollY;
      const inventoryGrid = $("#inventory-grid");
      const previousHeight = inventoryGrid.offsetHeight;
      sell.blur();
      try {
        game!.sell(item.id);
        persist();
        inventoryGrid.style.minHeight = `${previousHeight}px`;
        renderHeader();
        pageRegistry.render("arsenal", { force: true, animate: false });
        window.scrollTo(0, scrollTop);
        window.requestAnimationFrame(() => {
          inventoryGrid.style.minHeight = "";
          window.scrollTo(0, scrollTop);
        });
      } catch (error) { notifyError((error as Error).message); }
    });
    controls.append(compare, equip, sell);
  } else {
    const compare = element("button", "small-button muted", "Сравнить");
    compare.type = "button";
    compare.dataset.focusKey = `shop:${shopIndex}:compare`;
    compare.disabled = sold;
    compare.addEventListener("click", () => openEquipmentComparison(item.id, shopIndex));
    const buy = element("button", "button", sold ? "Продано" : `Купить · ${item.price} ¤`); buy.disabled = sold || game.save.hero.gold < item.price;
    buy.dataset.focusKey = `shop:${shopIndex}:buy`;
    buy.addEventListener("click", () => {
      try {
        const bought = game!.buy(shopIndex);
        persist();
        refreshEquipmentViews(true);
        queueWorldEffect({ eyebrow: "НОВАЯ ПОКУПКА", title: bought.name, description: `${RARITY_LABELS[bought.rarity]} снаряжение добавлено в инвентарь.`, symbol: "◆", tone: rarityAtLeastUi(bought.rarity, "legendary") ? "legendary" : "positive", sound: "loot" });
      } catch (error) { notifyError((error as Error).message); }
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
    button.addEventListener("click", () => { inventoryFilter = slot; inventoryVisibleLimit = 60; pageRegistry.render("arsenal", { force: true, animate: false }); }); filters.append(button);
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
  const kindNames = { attack: "Атака", heal: "Лечение", buff: "Усиление", control: "Контроль" } as const;
  const currentBuild = selectActiveSkills(hero, availableSkills, game.activeTacticalProfile());

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
  autoBuildInput.dataset.focusKey = "skills:auto-build";
  autoBuild.append(autoBuildInput, document.createTextNode(" Автоматически выбирать лучшие навыки"));
  autoBuildInput.addEventListener("change", () => { game!.setAutoSelectSkills(autoBuildInput.checked); persist(); preserveUiFocus(() => renderSkills(false)); });
  const modeLabel = element("span", "tactic-label", "Ведение боя");
  const modeButtons = element("div", "tactic-mode-buttons");
  (["auto", "manual"] as const).forEach((mode) => {
    const button = element("button", hero.combatMode === mode ? "active" : "", mode === "auto" ? "Автоматически" : "Подтверждать ходы");
    button.type = "button";
    button.dataset.focusKey = `skills:mode:${mode}`;
    button.addEventListener("click", () => { game!.setCombatMode(mode); persist(); preserveUiFocus(() => renderSkills(false)); });
    modeButtons.append(button);
  });
  const profileLabel = element("label", "tactical-profile-picker");
  profileLabel.append(element("span", "tactic-label", "Тактический профиль"));
  const profileSelect = document.createElement("select");
  profileSelect.dataset.focusKey = "skills:profile";
  hero.tacticalProfiles.forEach((profile) => profileSelect.append(new Option(profile.name, profile.id, false, profile.id === hero.activeTacticalProfileId)));
  profileSelect.addEventListener("change", () => { game!.setTacticalProfile(profileSelect.value); persist(); preserveUiFocus(() => renderSkills(false)); });
  const activeProfile = game.activeTacticalProfile();
  const profileDescription = activeProfile.style === "aggressive" ? "Раньше использует добивающие атаки и реже лечится."
    : activeProfile.style === "defensive" ? "Сохраняет сильные навыки и раньше восстанавливается."
      : activeProfile.style === "control" ? "Сначала нарушает темп и ослабляет противника."
        : "Универсальный порядок решений без перекоса.";
  profileLabel.append(profileSelect, element("small", "", profileDescription));
  controls.append(autoBuild, modeLabel, modeButtons, profileLabel);
  tactics.append(copy, controls);

  const toggleSkill = (skillId: string) => {
    const next = new Set(currentBuild.map((skill) => skill.id));
    if (next.has(skillId)) next.delete(skillId);
    else if (next.size < MAX_ACTIVE_SKILLS) next.add(skillId);
    else { notifyError(`Можно выбрать не больше ${MAX_ACTIVE_SKILLS} навыков.`); return; }
    game!.setAutoSelectSkills(false);
    game!.setSelectedSkills([...next]);
    persist(); preserveUiFocus(() => renderSkills(false));
  };
  const skillCard = (skill: typeof SKILLS[number], status: string, unlocked: boolean, source?: string) => {
    const active = currentBuild.some((entry) => entry.id === skill.id);
    const node = element("article", `skill-node ${skill.kind}${unlocked ? " unlocked" : " locked"}${active ? " selected" : ""}${skill.equipmentOnly ? " gear-skill" : ""}`);
    node.append(
      element("span", "skill-level", status),
      element("h3", "", skill.name),
      element("p", "", source ? `${skill.description} ${source}` : skill.description),
      element("div", "skill-meta", `${kindNames[skill.kind]} · перезарядка ${skill.cooldown} х.`),
    );
    if (unlocked) {
      const button = element("button", `skill-select${active ? " active" : ""}`, active ? "Убрать из сборки" : "Добавить в сборку");
      button.type = "button";
      button.dataset.focusKey = `skills:skill:${skill.id}`;
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
  const eraChallenge = renderEraChallengePanel();
  if (eraChallenge) progress.append(eraChallenge);
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

function renderEraChallengePanel(): HTMLElement | null {
  if (!game) return null;
  const challenge = game.currentEraChallenge();
  if (!challenge) return null;
  const panel = createEraChallengePanel(challenge, game.eraObjectiveProgress());
  const goal = game.epochFinalGoalProgress();
  if (goal) {
    const final = element("section", "epoch-final-goal");
    final.append(element("p", "eyebrow", "ОБЯЗАТЕЛЬНАЯ ЦЕЛЬ ЭПОХИ"), element("h3", "", goal.name), element("p", "", goal.description));
    goal.requirements.forEach((requirement) => final.append(element("p", requirement.met ? "goal-complete" : "", `${requirement.met ? "✓" : "—"} ${requirement.label}`)));
    final.append(element("strong", "", goal.completed ? "Финальная цель выполнена" : "Выполните цель, чтобы завершить эпоху."));
    panel.append(final);
  }
  return panel;
}

function openNewChronicleDialog(): void {
  if (!game) return;
  const status = game.newGamePlusStatus();
  if (!status.unlocked) { notifyError(status.reason); return; }
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
  document.body.classList.add("new-chronicle-open");
  renderNewChronicleStep();
  modalController.open($("#new-chronicle-layer"), {
    initialFocus: "#new-chronicle-title",
    dismissOnBackdrop: true,
    onRequestClose: closeNewChronicleDialog,
  });
}

function closeNewChronicleDialog(): void {
  if ($("#new-chronicle-layer").hidden) return;
  modalController.close($("#new-chronicle-layer"));
  document.body.classList.remove("new-chronicle-open");
  newChronicleReturnFocus = null;
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
        else { notifyError(`Можно выбрать не больше ${status.lawLimit}.`); return; }
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
    pendingBattleUi = new PendingBattleUiController(game);
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
  } catch (error) { notifyError((error as Error).message); }
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
    if (archive.worldRole) {
      const roles = { legend: "Легенда новой эпохи", boss: "Противник новой эпохи", mentor: "Основатель школы", "faction-founder": "Основатель фракционной школы" };
      copy.append(element("p", "epoch-world-role", `${roles[archive.worldRole]}${archive.schoolName ? ` · ${archive.schoolName}` : ""}`));
    }
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
    if (game.save.hero.combatMode === "manual") {
      const pending = game.beginLegacyChampion();
      persist({ deferFeatureUnlocks: true });
      openPendingBattle(pending);
      return;
    }
    currentTournament = null;
    currentReport = game.fightLegacyChampion();
    persist();
    openBattleReport(currentReport);
  } catch (error) { battleEquipmentBefore = null; notifyError((error as Error).message); }
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
  route.prepend(renderCrownSeasonOverview());

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
    if (!entry.isHero) {
      const fighter = game!.save.enemies.find((enemy) => enemy.id === entry.id);
      const faction = FACTIONS.find((candidate) => candidate.id === fighter?.factionId);
      if (fighter && faction) {
        const badge = element("span", "fighter-world-badge", faction.name);
        badge.style.setProperty("--faction-accent", faction.accent);
        badge.title = `${game!.npcGoal(fighter.goal).name}. ${fighter.lastActivity?.description ?? game!.npcGoal(fighter.goal).description}`;
        nameCell.append(badge);
      }
    }
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

function renderCrownSeasonOverview(): HTMLElement {
  const season = game!.currentCrownSeason();
  const standings = game!.crownSeasonStandings();
  const heroIndex = standings.findIndex((entry) => entry.fighterId === game!.save.hero.id);
  const heroStanding = heroIndex >= 0 ? standings[heroIndex] : undefined;
  return createCrownSeasonOverview({
    season,
    remainingDays: crownSeasonRemainingDays(season, game!.save.worldDay),
    heroPoints: heroStanding?.points ?? 0,
    heroRank: heroIndex >= 0 ? heroIndex + 1 : undefined,
    heroDefenses: heroStanding?.defenses ?? 0,
  });
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

  const controlBoard = $("#world-control-board");
  const controlHead = element("header", "world-control-head");
  controlHead.append(
    element("div", "", ""),
    element("p", "world-control-copy", "Победы бойцов усиливают их фракцию. Экономика обновляется раз в 7 дней, а в сезон войны фракций — раз в 4. Влияние на арены пересчитывается по завершённым турнирным окнам; между редкими турнирами оно сохраняется. Новый хозяин меняет награды арены, а сильнейшая организация получает право снабжать лавку."),
  );
  controlHead.firstElementChild!.append(element("p", "eyebrow", "БОРЬБА ЗА ГОРОД"), element("h2", "", "Кто управляет аренами"));
  const controlGrid = element("div", "world-control-grid");
  ARENAS.forEach((arena) => {
    const controller = game!.factionController(arena.id);
    const influence = game!.save.factionControl?.arenaInfluence[arena.id] ?? {};
    const total = Math.max(1, Object.values(influence).reduce((sum, value) => sum + value, 0));
    const card = element("article", "world-control-card");
    card.style.setProperty("--faction-accent", controller.accent);
    card.append(element("small", "", arena.name.toUpperCase()), element("strong", "", controller.name), element("p", "", controller.effect));
    const bars = element("div", "faction-influence-bars");
    FACTIONS.forEach((faction) => {
      const value = influence[faction.id] ?? 0;
      const row = element("div", "faction-influence-row");
      row.style.setProperty("--influence-color", faction.accent);
      const meter = element("i");
      meter.style.width = `${Math.max(3, value / total * 100)}%`;
      row.append(element("span", "", faction.name), element("div", "", ""), element("b", "", String(value)));
      row.children[1].append(meter);
      bars.append(row);
    });
    card.append(bars);
    controlGrid.append(card);
  });
  controlBoard.replaceChildren(controlHead, controlGrid);

  const factions = $("#faction-grid");
  factions.replaceChildren(...FACTIONS.map((faction) => {
    const reputation = game!.save.hero.factionReputation[faction.id] ?? 0;
    const tier = factionReputationTier(reputation);
    const nextTier = FACTION_REPUTATION_TIERS.find((candidate) => candidate.threshold > reputation);
    const activePerks = new Set(unlockedFactionPerks(faction.id, reputation).map((perk) => perk.name));
    const factionPerks = FACTION_PERKS.filter((perk) => perk.factionId === faction.id);
    const card = element("article", "faction-card paper-panel"); card.style.setProperty("--faction-accent", faction.accent);
    const controlledArenas = ARENAS.filter((arena) => game!.save.factionControl?.arenaControllers[arena.id] === faction.id);
    const controlsShop = game!.save.factionControl?.shopControllerId === faction.id;
    card.append(
      element("p", "eyebrow", tier.name.toUpperCase()),
      element("h3", "", faction.name),
      element("blockquote", "", `«${faction.motto}»`),
      element("p", "", faction.description),
      element("p", "faction-control-summary", `${controlledArenas.length ? `Под контролем: ${controlledArenas.map((arena) => arena.name).join(", ")}.` : "Сейчас не контролирует арен."}${controlsShop ? " Управляет поставками лавки." : ""}`),
      statRow("Репутация", nextTier ? `${reputation} / ${nextTier.threshold}` : reputation),
      element("p", "faction-contract-benefit", tier.contractRewardBonus > 0
        ? `Новые контракты: +${Math.round(tier.contractRewardBonus * 100)}% к монетам и опыту.`
        : `Следующий статус откроет +${Math.round((nextTier?.contractRewardBonus ?? 0) * 100)}% к наградам новых контрактов.`),
    );
    const perkList = element("div", "faction-perk-list");
    perkList.append(element("strong", "", "Постоянные привилегии"));
    factionPerks.forEach((perk) => {
      const unlocked = activePerks.has(perk.name);
      const perkRow = element("div", `faction-perk ${unlocked ? "unlocked" : "locked"}`);
      perkRow.append(
        element("small", "", unlocked ? "ДЕЙСТВУЕТ" : `ОТ ${perk.threshold} РЕПУТАЦИИ`),
        element("b", "", perk.name),
        element("span", "", perk.description),
      );
      perkList.append(perkRow);
    });
    card.append(perkList);
    const campaign = game!.factionCampaigns().find((entry) => entry.factionId === faction.id);
    if (campaign) {
      const chain = element("section", "faction-campaign");
      chain.append(element("h4", "", campaign.current?.title ?? "Цепочка фракции завершена"));
      if (campaign.current) {
        const stage = campaign.current;
        chain.append(element("p", "", stage.description), element("p", "", `Прогресс: ${campaign.progress} / ${stage.required} · репутация от ${stage.reputation}`), element("p", "", `Награда: ${stage.reward.gold} монет · ${stage.reward.seals} печатей · ${stage.reward.slots.length} предмета фракционного комплекта${stage.reward.mentorAccess ? " · доступ к наставнику" : ""}`));
        const claim = element("button", "plain-button", campaign.claimable ? "Получить награду этапа" : campaign.unlocked ? "Выполните задание этапа" : "Недостаточно репутации");
        claim.disabled = !campaign.claimable;
        claim.addEventListener("click", () => {
          try {
            const before = { ...game!.save.hero.equipped };
            const result = game!.claimFactionCampaign(faction.id);
            persist();
            refreshCurrentWorldView();
            showLootReminders(result.items, before);
          } catch (error) { notifyError((error as Error).message); }
        });
        chain.append(claim);
      }
      const mentor = game!.factionMentors().find((entry) => entry.factionId === faction.id);
      if (mentor) {
        chain.append(element("strong", "", mentor.name), element("p", "", mentor.description));
        const train = element("button", "plain-button", "Заниматься с наставником · +20% опыта");
        train.addEventListener("click", () => {
          try {
            const result = game!.trainWithFactionMentor(faction.id);
            persist();
            refreshCurrentWorldView();
            queueWorldEffect({ eyebrow: "НАСТАВНИК", title: result.title, description: `Получено ${result.experience} опыта.`, symbol: "⚔", tone: "positive", sound: "training", duration: 2000 });
          } catch (error) { notifyError((error as Error).message); }
        });
        chain.append(train);
      }
      card.append(chain);
    }
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
    const contract = game.acceptContract(id, approach); persist(); renderContracts(); renderHeader();
    queueWorldEffect({ eyebrow: approach === "honor" ? "КЛЯТВА ЧЕСТИ" : "УСЛОВИЯ СДЕЛКИ", title: contract.title, description: approach === "honor" ? "Репутация фракции важнее быстрой прибыли." : "Награда монетами важнее признания фракции.", symbol: "§", tone: "neutral", sound: "reputation" });
  }
  catch (error) { notifyError((error as Error).message); }
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
  const controller = game.shopController();
  $("#shop-description").textContent = `Ассортимент обновлён на ${game.save.shopDay}-й день. Следующая смена не позднее ${game.save.shopDay + 2}-го дня.`;
  const panel = $("#shop-controller");
  panel.style.setProperty("--faction-accent", controller.accent);
  panel.replaceChildren(
    element("div", "", ""),
    element("p", "", controller.effect),
    element("strong", "shop-price-index", `Индекс цен: ${Math.round(controller.priceModifier * 100)}%`),
  );
  panel.firstElementChild!.append(element("p", "eyebrow", "ПОСТАВЩИК ТЕКУЩЕГО ЦИКЛА"), element("h2", "", controller.name));
  $("#shop-grid").replaceChildren(...game.save.shopOffers.map((offer, index) => createItemCard(offer.item, "shop", index, offer.sold)));
}

function renderForge(animateItems = true, preserveOrder = false): void {
  if (!game) return;
  const hero = game.save.hero;
  $("#forge-marks").textContent = `${hero.temperingMarks} ${hero.temperingMarks === 1 ? "печать" : hero.temperingMarks >= 2 && hero.temperingMarks <= 4 ? "печати" : "печатей"}`;
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
    copy.append(element("small", "", `${equippedIds.has(item.id) ? "НАДЕТО · " : ""}${SLOT_LABELS[item.slot]} · ${RARITY_LABELS[item.rarity]}`), element("h3", "", item.relicName ?? item.name), element("p", "", `${item.level} ур. · закалка +${enhancement}/5`), element("p", "item-stats", itemStatsText(item)));
    if (equippedIds.has(item.id)) card.classList.add("equipped");
    const button = element("button", "button", enhancement >= 5 ? "Максимальная закалка" : `Улучшить · ${game!.upgradeCost(item.id)} печ.`);
    button.type = "button";
    button.dataset.focusKey = `forge:${item.id}:upgrade`;
    button.disabled = enhancement >= 5 || hero.temperingMarks < game!.upgradeCost(item.id);
    button.addEventListener("click", () => {
      try {
        game!.upgradeItem(item.id); persist(); refreshEquipmentViews(true);
        queueWorldEffect({ eyebrow: "КУЗНИЦА", title: `${item.name} · закалка +${enhancement + 1}`, description: "Характеристики предмета повышены навсегда.", symbol: "⚒", tone: "positive", sound: "forge" });
      }
      catch (error) { notifyError((error as Error).message); }
    });
    const actions = element("div", "forge-card-actions");
    actions.append(button);
    card.append(art, copy, actions, renderReforgeControl(item));
    return card;
  }));
  if (order.length === 0) grid.append(element("p", "empty-copy", "В инвентаре нет предметов для закалки."));
}

function renderLegacy(): void {
  if (!game || !game.isFeatureUnlocked("equipment-legacy")) return;
  renderLootTargetWorkshop();
  renderRelicWorkshop();
}

function renderLootTargetWorkshop(): void {
  if (!game) return;
  const panel = $("#loot-target-workshop");
  const hero = game.save.hero;
  const target = game.save.lootTarget;
  const misses = game.save.lootPity?.misses ?? 0;
  const chance = Math.min(95, 18 + misses * 9);
  const guaranteedIn = Math.max(1, 7 - misses);
  const best = game.bestEquipmentEvaluation();

  const copy = element("div", "loot-target-copy");
  const targetTitle = element("h2", "", "Назначьте желанную добычу");
  targetTitle.id = "loot-target-title";
  copy.append(
    element("p", "eyebrow", "ЦЕЛЕВАЯ ОХОТА"),
    targetTitle,
    element("p", "", "Выбор не запрещает другую добычу. Каждая неудача повышает шанс выбранного слота или комплекта, а седьмая попытка гарантирует совпадение."),
  );

  const controls = element("form", "loot-target-controls") as HTMLFormElement;
  const slotLabel = element("label");
  slotLabel.append(document.createTextNode("Слот"));
  const slotSelect = element("select") as HTMLSelectElement;
  slotSelect.dataset.focusKey = "legacy:loot-target:slot";
  slotSelect.append(new Option("Любой слот", ""));
  (["weapon", "offhand", "head", "chest", "hands", "feet"] as EquipmentSlot[]).forEach((slot) => {
    slotSelect.append(new Option(SLOT_LABELS[slot], slot, false, target?.slot === slot));
  });
  slotLabel.append(slotSelect);

  const setLabel = element("label");
  setLabel.append(document.createTextNode("Комплект"));
  const setSelect = element("select") as HTMLSelectElement;
  setSelect.dataset.focusKey = "legacy:loot-target:set";
  setSelect.append(new Option("Любой комплект", ""));
  EQUIPMENT_SETS
    .filter((set) => set.classes === "all" || set.classes.includes(hero.classId))
    .forEach((set) => setSelect.append(new Option(set.name, set.id, false, target?.setId === set.id)));
  setLabel.append(setSelect);

  const actions = element("div", "loot-target-actions");
  const save = element("button", "button primary", target ? "Изменить цель" : "Начать охоту");
  save.type = "submit";
  save.dataset.focusKey = "legacy:loot-target:save";
  const clear = element("button", "plain-button", "Сбросить цель");
  clear.type = "button";
  clear.dataset.focusKey = "legacy:loot-target:clear";
  clear.disabled = !target;
  clear.addEventListener("click", () => {
    game!.setLootTarget(undefined);
    persist();
    preserveUiFocus(() => pageRegistry.render("legacy", { force: true, animate: false }));
  });
  actions.append(save, clear);
  controls.append(slotLabel, setLabel, actions);
  const syncTargetAction = () => {
    save.disabled = !slotSelect.value && !setSelect.value;
  };
  slotSelect.addEventListener("change", syncTargetAction);
  setSelect.addEventListener("change", syncTargetAction);
  syncTargetAction();
  controls.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const nextTarget = {
        slot: (slotSelect.value || undefined) as EquipmentSlot | undefined,
        setId: setSelect.value || undefined,
      };
      game!.setLootTarget(nextTarget);
      persist();
      preserveUiFocus(() => pageRegistry.render("legacy", { force: true, animate: false }));
    } catch (error) { notifyError((error as Error).message); }
  });

  const status = element("aside", "loot-target-status");
  const targetSet = EQUIPMENT_SETS.find((set) => set.id === target?.setId);
  const targetDescription = target
    ? [target.slot ? SLOT_LABELS[target.slot] : "любой слот", targetSet?.name].filter(Boolean).join(" · ")
    : "Цель не выбрана";
  status.append(
    statRow("Текущая цель", targetDescription),
    statRow("Базовый шанс", target ? `${chance}%` : "—"),
    statRow("Гарантия", target ? `через ${guaranteedIn} находок` : "—"),
    statRow("Лучшая сборка", `${best.completeSlots}/6 слотов · сила ${Math.round(best.score)}`),
  );
  if (best.activeSetBonuses.length) status.append(element("p", "loot-target-best-set", best.activeSetBonuses.join(" · ")));
  panel.replaceChildren(copy, controls, status);
}

function renderReforgeControl(item: EquipmentItem): HTMLElement {
  const details = element("details", "reforge-control");
  const summary = element("summary", "", "Перековать одно свойство");
  const body = element("div", "reforge-control-body");
  const sourceLabel = element("label");
  sourceLabel.append(document.createTextNode("Что заменить"));
  const source = element("select") as HTMLSelectElement;
  const availableSources = comparisonStats.filter((stat) => item.stats[stat] !== undefined);
  availableSources.forEach((stat) => source.append(new Option(`${comparisonStatLabels[stat]} +${item.stats[stat]}`, stat)));
  sourceLabel.append(source);

  const targetLabel = element("label");
  targetLabel.append(document.createTextNode("Во что перековать"));
  const target = element("select") as HTMLSelectElement;
  targetLabel.append(target);

  const price = element("p", "reforge-price");
  const submit = element("button", "plain-button", "Перековать");
  submit.type = "button";
  submit.dataset.focusKey = `forge:${item.id}:reforge`;

  const refreshTargetOptions = () => {
    const sourceStat = source.value as ComparisonStat;
    const previousTarget = target.value;
    const options = comparisonStats.filter((stat) => stat === sourceStat || item.stats[stat] === undefined);
    const selectedTarget = options.includes(previousTarget as ComparisonStat) ? previousTarget : sourceStat;
    target.replaceChildren(...options.map((stat) => new Option(
      stat === sourceStat ? `${comparisonStatLabels[stat]} — перебросить значение` : comparisonStatLabels[stat],
      stat,
      false,
      stat === selectedTarget,
    )));
  };
  const refreshCost = () => {
    const attempts = game!.save.reforgeAttempts[item.id] ?? 0;
    const base = reforgeCost(item, attempts);
    const discount = Math.min(.75, factionModifier(game!.save.hero.factionReputation, "forgeDiscount"));
    const gold = Math.max(0, Math.round(base.gold * (1 - discount)));
    price.textContent = `${gold} ¤ · ${base.temperingMarks} печ. · попытка ${attempts + 1}`;
    submit.disabled = game!.save.hero.gold < gold || game!.save.hero.temperingMarks < base.temperingMarks;
  };
  source.addEventListener("change", refreshTargetOptions);
  refreshTargetOptions();
  refreshCost();
  submit.addEventListener("click", () => {
    try {
      const result = game!.reforgeItem(item.id, {
        sourceStat: source.value as ComparisonStat,
        targetStat: target.value as ComparisonStat,
      });
      persist();
      renderHeader();
      pageRegistry.invalidate("hero", "arsenal", "collections", "shop");
      preserveUiFocus(() => renderForge(false, true));
      const direction = result.powerDelta >= 0 ? `+${result.powerDelta}` : String(result.powerDelta);
      queueWorldEffect({
        eyebrow: "ПЕРЕКОВКА",
        title: item.name,
        description: `${comparisonStatLabels[result.sourceStat as ComparisonStat]} ${result.previousValue} → ${comparisonStatLabels[result.targetStat as ComparisonStat]} ${result.nextValue}.`,
        stats: [`Сила предмета ${direction}`],
        symbol: "⚒",
        tone: result.powerDelta >= 0 ? "positive" : "neutral",
        sound: "forge",
      });
    } catch (error) { notifyError((error as Error).message); }
  });
  body.append(sourceLabel, targetLabel, price, submit);
  details.append(summary, body);
  return details;
}

function renderLeaders(trackMovement = false): void {
  if (!game) return;
  const leaders = game.leaderboard();
  const previousRanks = trackMovement ? loadRankingSnapshot(LEADER_SNAPSHOT_KEY) : {};
  const hasSnapshot = Object.keys(previousRanks).length > 0;
  const heroRank = game.heroRank();
  const eliteRank = game.heroEliteRank();
  const alive = game.save.enemies.filter((enemy) => enemy.alive).length;
  const dead = game.save.enemies.filter((enemy) => !enemy.alive && !enemy.retiredDay).length;
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
    if (!entry.isHero) {
      const fighter = game!.save.enemies.find((enemy) => enemy.id === entry.id);
      const faction = FACTIONS.find((candidate) => candidate.id === fighter?.factionId);
      if (fighter && faction) {
        const badge = element("span", "fighter-world-badge", faction.name);
        badge.style.setProperty("--faction-accent", faction.accent);
        badge.title = `${game!.npcGoal(fighter.goal).name}. ${fighter.lastActivity?.description ?? game!.npcGoal(fighter.goal).description}`;
        nameCell.append(badge);
      }
    }
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
  const equippedIds = new Set(Object.values(hero.equipped));
  const relics = hero.inventory.filter((item) => rarityAtLeastUi(item.rarity, "legendary"));
  const ready = sortLegacyPathCandidates(
    relics.filter((item) => (item.relicTier ?? 0) >= 1 && !item.relicPath),
    equippedIds,
  );
  const head = element("div", "relic-workshop-head");
  const title = element("h2", "", "Предметы помнят победы");
  title.id = "relic-workshop-title";
  head.append(element("p", "eyebrow", "РАЗВИТИЕ РЕЛИКВИЙ"), title, element("p", "", "Надетые легендарные и мифические вещи получают известность в боях. На первой ступени можно выбрать постоянный путь развития."));
  const resource = statRow("Реликтовая пыль", hero.relicDust);
  resource.id = "legacy-relic-dust";
  markTerm(resource.querySelector<HTMLElement>("span")!, "relicDust");
  const list = element("div", "relic-ready-list");
  ready.forEach((item) => {
    const isEquipped = equippedIds.has(item.id);
    const row = element("article", `relic-ready-card rarity-${item.rarity}${isEquipped ? " equipped" : ""}`);
    row.dataset.relicReadyItemId = item.id;
    row.style.setProperty("--rarity-accent", rarityColors[item.rarity]);
    const copy = element("div", "relic-ready-copy");
    const identity = element("div", "relic-ready-identity");
    const names = element("div");
    names.append(
      element("small", "relic-item-kicker", `${SLOT_LABELS[item.slot]} · ${RARITY_LABELS[item.rarity]} · ${item.level} ур.`),
      element("strong", "", item.relicName ?? item.name),
    );
    identity.append(equipmentArtwork(item.slot, hero.classId, "equipment-art relic-ready-art", item), names);
    if (isEquipped) identity.append(element("span", "relic-item-status equipped", "Надето"));
    copy.append(
      identity,
      element("small", "relic-progress-copy", `Наследие ${item.relicTier}/3 · известность ${item.relicRenown ?? 0} · следующий порог ${RELIC_TIER_THRESHOLDS[Math.min(3, (item.relicTier ?? 0) + 1)]}`),
    );
    const actions = element("div");
    RELIC_PATHS.forEach((path) => {
      const option = element("div", "relic-path-option");
      const tooltipId = `relic-path-${item.id}-${path.id}`;
      const button = element("button", "plain-button", path.name);
      button.dataset.focusKey = `legacy:${item.id}:${path.id}`;
      button.setAttribute("aria-describedby", tooltipId);
      button.disabled = hero.relicDust < 8;
      button.addEventListener("click", () => { try {
        game!.awakenRelic(item.id, path.id);
        persist();
        preserveUiFocus(() => pageRegistry.render("legacy", { force: true, animate: false }));
        queueWorldEffect({ eyebrow: "ПРОБУЖДЕНИЕ РЕЛИКВИИ", title: path.name, description: path.description, stats: featureStatsText(path.stats).split(" · ").filter(Boolean), symbol: "✦", tone: "legendary", sound: "loot", duration: 2800 });
      } catch (error) { notifyError((error as Error).message); } });
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

  const salvage = element("section", "relic-salvage");
  salvage.id = "legacy-salvage";
  renderLegacySalvage(salvage);
  const gifts = element("section", "relic-gift-list");
  gifts.append(element("h3", "", "Передать реликвию в мир"), element("p", "", "Ненадетую мировую реликвию можно подарить совместимому живому бойцу. Предмет покинет инвентарь, продолжит свою историю у нового владельца и может встретиться вам снова."));
  hero.inventory.filter((item) => item.worldRelicId && !equippedIds.has(item.id)).forEach((item) => {
    const recipients = game!.relicRecipients(item.id);
    if (!recipients.length) return;
    const row = element("article", "relic-gift-row");
    const select = element("select") as HTMLSelectElement;
    select.setAttribute("aria-label", `Получатель реликвии ${displayItemName(item)}`);
    recipients.forEach((fighter) => {
      const option = element("option", "", `${fighter.name} · ${CLASS_DEFINITIONS[fighter.classId].name} · ур. ${fighter.level}`) as HTMLOptionElement;
      option.value = fighter.id;
      select.append(option);
    });
    const button = element("button", "plain-button", "Передать");
    button.addEventListener("click", () => {
      const recipient = recipients.find((fighter) => fighter.id === select.value);
      if (!recipient || !window.confirm(`Передать «${displayItemName(item)}» бойцу ${recipient.name}? Предмет уйдёт из вашего инвентаря. Вернуть подарок кнопкой отмены нельзя.`)) return;
      try {
        game!.giftRelic(item.id, recipient.id);
        persist();
        refreshCurrentWorldView();
        queueWorldEffect({ eyebrow: "МИРОВАЯ РЕЛИКВИЯ", title: "Новый владелец", description: `${recipient.name} получил предмет «${displayItemName(item)}».`, symbol: "✦", tone: "legendary", duration: 3000 });
      } catch (error) { notifyError((error as Error).message); }
    });
    row.append(equipmentArtwork(item.slot, hero.classId, "equipment-art", item), element("strong", "", displayItemName(item)), select, button);
    gifts.append(row);
  });
  if (!gifts.querySelector("select")) gifts.append(element("p", "empty-copy", "Пока нет ненадетых мировых реликвий с подходящими получателями."));
  panel.replaceChildren(head, resource, list, gifts, salvage);
}

function refreshLegacyDustDisplay(): void {
  if (!game) return;
  const value = document.querySelector<HTMLElement>("#legacy-relic-dust strong");
  if (value) value.textContent = String(game.save.hero.relicDust);
  document.querySelectorAll<HTMLButtonElement>(".relic-path-option button").forEach((button) => {
    button.disabled = game!.save.hero.relicDust < 8;
  });
}

function removeSalvagedRelicCandidates(itemIds: readonly string[]): void {
  if (!game) return;
  const list = document.querySelector<HTMLElement>(".relic-ready-list");
  if (!list) return;
  const removedIds = new Set(itemIds);
  list.querySelectorAll<HTMLElement>("[data-relic-ready-item-id]").forEach((row) => {
    if (row.dataset.relicReadyItemId && removedIds.has(row.dataset.relicReadyItemId)) row.remove();
  });
  if (list.querySelector("[data-relic-ready-item-id]")) return;
  const relics = game.save.hero.inventory.filter((item) => rarityAtLeastUi(item.rarity, "legendary"));
  list.replaceChildren(element("p", "empty-copy", relics.length
    ? "Продолжайте побеждать с легендарными предметами: путь откроется на первой ступени наследия."
    : "Легендарных предметов пока нет."));
}

function renderLegacySalvage(salvage: HTMLElement): void {
  if (!game) return;
  const hero = game.save.hero;
  const equippedIds = new Set(Object.values(hero.equipped));
  const salvageEntries = buildLegacySalvageEntries(hero.inventory, equippedIds, (itemId) => game!.canSell(itemId));
  const availableEntries = salvageEntries.filter((entry) => entry.status === "available");
  const availableIds = new Set(availableEntries.map((entry) => entry.item.id));
  selectedLegacySalvageIds.forEach((itemId) => {
    if (!availableIds.has(itemId)) selectedLegacySalvageIds.delete(itemId);
  });
  const availableCount = availableEntries.length;
  const salvageHeading = element("div", "relic-salvage-heading");
  const headingCopy = element("div", "relic-salvage-heading-copy");
  headingCopy.append(
    element("div", "relic-salvage-title", "Разобрать предметы в пыль"),
    element("small", "", `Доступно для разбора: ${availableCount} из ${salvageEntries.length}`),
  );
  const bulkControls = element("div", "relic-salvage-bulk");
  const selectionSummary = element("small", "relic-salvage-selection", "Ничего не выбрано");
  const bulkButton = element("button", "button relic-salvage-bulk-button", "Разобрать выбранное");
  bulkButton.type = "button";
  bulkButton.dataset.focusKey = "legacy:salvage:selected";
  bulkControls.append(selectionSummary, bulkButton);
  salvageHeading.append(headingCopy, bulkControls);
  const salvageList = element("div", "relic-salvage-list");
  const syncSelection = () => {
    const selectedEntries = availableEntries.filter((entry) => selectedLegacySalvageIds.has(entry.item.id));
    const totalDust = selectedEntries.reduce((total, entry) => total + entry.dust, 0);
    bulkButton.disabled = selectedEntries.length === 0;
    bulkButton.textContent = selectedEntries.length > 0
      ? `Разобрать выбранное · ${selectedEntries.length}`
      : "Разобрать выбранное";
    selectionSummary.textContent = selectedEntries.length > 0
      ? `Выбрано: ${selectedEntries.length} · будет получено ${totalDust} пыли`
      : "Ничего не выбрано";
  };
  salvageEntries.forEach((entry, index) => {
    const item = entry.item;
    const isSelected = selectedLegacySalvageIds.has(item.id);
    const card = element("article", `relic-salvage-card rarity-${item.rarity} status-${entry.status}${isSelected ? " selected" : ""}`);
    card.style.setProperty("--rarity-accent", rarityColors[item.rarity]);
    const selector = element("label", "relic-salvage-selector");
    const checkbox = element("input") as HTMLInputElement;
    checkbox.type = "checkbox";
    checkbox.checked = isSelected;
    checkbox.disabled = entry.status !== "available";
    checkbox.dataset.focusKey = `legacy:salvage-select:${item.id}`;
    checkbox.setAttribute("aria-label", entry.status === "available"
      ? `Выбрать для разбора: ${displayItemName(item)}`
      : `${displayItemName(item)} нельзя выбрать для разбора`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedLegacySalvageIds.add(item.id);
      else selectedLegacySalvageIds.delete(item.id);
      card.classList.toggle("selected", checkbox.checked);
      syncSelection();
    });
    selector.append(checkbox, element("span", "", entry.status === "available" ? "Выбрать" : "Недоступно"));
    const art = equipmentArtwork(item.slot, hero.classId, "equipment-art relic-salvage-art", item);
    const copy = element("div", "relic-salvage-copy");
    copy.append(
      element("small", "relic-item-kicker", `${SLOT_LABELS[item.slot]} · ${RARITY_LABELS[item.rarity]} · ${item.level} ур.${item.enhancement ? ` · закалка +${item.enhancement}` : ""}`),
      element("strong", "", displayItemName(item)),
      element("span", "relic-salvage-stats", itemStatsText(item) || "Без базовых характеристик"),
    );
    const state = element("div", "relic-salvage-state");
    if (entry.status === "equipped") {
      state.append(
        element("span", "relic-item-status equipped", "Надето"),
        element("small", "", `После снятия: ${entry.dust} пыли`),
      );
    } else if (entry.status === "protected") {
      state.append(
        element("span", "relic-item-status protected", "Не разбирается"),
        element("small", "", "Регалия элиты защищена"),
      );
    } else {
      const salvageButton = element("button", "plain-button relic-salvage-button", `Разобрать · +${entry.dust} пыли`);
      salvageButton.type = "button";
      salvageButton.dataset.focusKey = `legacy:salvage:${item.id}`;
      salvageButton.addEventListener("click", () => {
        const description = `${SLOT_LABELS[item.slot]} · ${RARITY_LABELS[item.rarity]} · ${item.level} уровень${item.enhancement ? ` · закалка +${item.enhancement}` : ""}`;
        if (!window.confirm(`Разобрать «${displayItemName(item)}» без возможности восстановления?\n${description}\nБудет получено: ${entry.dust} пыли.`)) return;
        try {
          const dust = game!.salvageItem(item.id);
          selectedLegacySalvageIds.delete(item.id);
          persist();
          renderHeader();
          pageRegistry.invalidate("hero", "arsenal", "forge", "skills", "collections", "shop");
          refreshLegacyDustDisplay();
          removeSalvagedRelicCandidates([item.id]);
          preserveUiFocus(() => renderLegacySalvage(salvage));
          queueWorldEffect({
            eyebrow: "НАСЛЕДИЕ СНАРЯЖЕНИЯ",
            title: "Предмет разобран",
            description: `${displayItemName(item)} превращён в реликтовую пыль.`,
            stats: [`+${dust} пыли`],
            symbol: "✦",
            tone: "neutral",
            sound: "forge",
          });
        } catch (error) { notifyError((error as Error).message); }
      });
      state.append(salvageButton);
    }
    card.dataset.itemIndex = String(index);
    card.append(selector, art, copy, state);
    salvageList.append(card);
  });
  if (salvageEntries.length === 0) salvageList.append(element("p", "empty-copy", "В инвентаре пока нет предметов."));
  bulkButton.addEventListener("click", () => {
    const selectedEntries = availableEntries.filter((entry) => selectedLegacySalvageIds.has(entry.item.id));
    if (selectedEntries.length === 0) return;
    const totalDust = selectedEntries.reduce((total, entry) => total + entry.dust, 0);
    if (!window.confirm(`Разобрать выбранные предметы без возможности восстановления?\nКоличество: ${selectedEntries.length}\nБудет получено: ${totalDust} пыли.`)) return;
    const itemIds = selectedEntries.map((entry) => entry.item.id);
    try {
      const dust = game!.salvageItems(itemIds);
      itemIds.forEach((itemId) => selectedLegacySalvageIds.delete(itemId));
      persist();
      renderHeader();
      pageRegistry.invalidate("hero", "arsenal", "forge", "skills", "collections", "shop");
      refreshLegacyDustDisplay();
      removeSalvagedRelicCandidates(itemIds);
      preserveUiFocus(() => renderLegacySalvage(salvage));
      queueWorldEffect({
        eyebrow: "НАСЛЕДИЕ СНАРЯЖЕНИЯ",
        title: "Выбранные предметы разобраны",
        description: `Разобрано предметов: ${itemIds.length}.`,
        stats: [`+${dust} пыли`],
        symbol: "✦",
        tone: "neutral",
        sound: "forge",
      });
    } catch (error) { notifyError((error as Error).message); }
  });
  syncSelection();
  salvage.replaceChildren(salvageHeading, salvageList);
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
    if (!entry.isHero) {
      const fighter = game!.save.enemies.find((enemy) => enemy.id === entry.id);
      const faction = FACTIONS.find((candidate) => candidate.id === fighter?.factionId);
      if (fighter && faction) {
        const badge = element("span", "fighter-world-badge", faction.name);
        badge.style.setProperty("--faction-accent", faction.accent);
        badge.title = `${game!.npcGoal(fighter.goal).name}. ${fighter.lastActivity?.description ?? game!.npcGoal(fighter.goal).description}`;
        nameCell.append(badge);
      }
    }
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
  const livingBoard = $("#living-world-board");
  const restoreChronicleScroll = rememberChronicleScroll(livingBoard);
  const fighterNames = new Map(game.save.enemies.map((fighter) => [fighter.id, fighter.name]));
  fighterNames.set("hero", game.save.hero.name);
  const factionById = (id: string | undefined) => FACTIONS.find((candidate) => candidate.id === id);
  const season = game.currentWorldSeason();
  const seasonPanel = element("section", "living-world-section world-season paper-panel");
  const seasonHeading = element("header", "world-season-heading");
  const seasonCopy = element("div");
  seasonCopy.append(
    element("p", "eyebrow", `ЭПОХА ${game.save.legacy.cycle} · МИРОВОЙ СЕЗОН ${season.number}`),
    element("h2", "", season.rule.name),
    element("p", "", season.rule.description),
  );
  const seasonStats = element("div", "world-season-stats");
  seasonStats.append(
    statRow("Дни сезона", `${season.startsDay}–${season.endsDay}`),
    statRow("Осталось", `${season.remainingDays} дн.`),
  );
  const seasonControls = element("div", "world-season-controls");
  const seasonDetails = element("button", "plain-button", "Узнать изменения");
  seasonDetails.type = "button";
  seasonDetails.addEventListener("click", () => {
    const notice = currentWorldSeasonNotice(game!.save);
    if (notice) openSeasonChanges(notice, modalController);
  });
  seasonControls.append(seasonStats, seasonDetails);
  seasonHeading.append(seasonCopy, seasonControls);
  const championships = element("div", "world-season-championships");
  ARENAS.forEach((arena) => {
    const leader = game!.worldSeasonLeaderboard(arena.id)[0];
    const card = element("article");
    card.append(
      element("small", "", arena.name),
      element("strong", "", leader?.fighterName ?? "Сезон ещё не начат"),
      element("span", "", leader ? `${leader.points} сезонных очков` : "Первый турнир определит лидера"),
    );
    championships.append(card);
  });
  const eliteLeader = worldEliteSeasonStandings(season, game.save.enemies, game.save.hero.name)[0];
  const eliteChampionship = element("article");
  eliteChampionship.append(
    element("small", "", "Элита · чемпионат сезона"),
    element("strong", "", eliteLeader?.fighterName ?? "Лидер ещё не определён"),
    element("span", "", eliteLeader ? `${eliteLeader.points} сезонных очков` : "Результаты элитных боёв определят лидера"),
  );
  championships.append(eliteChampionship);
  const seasonHistory = element("div", "world-season-history");
  prepareChronicleList(seasonHistory, "seasons", "Все завершённые сезоны");
  const completedSeasons = game.completedWorldSeasons();
  completedSeasons.forEach((entry) => seasonHistory.append(element("p", "", `${entry.summary}${entry.eliteChampion ? ` Чемпион элиты: ${entry.eliteChampion.fighterName} · ${entry.eliteChampion.points} очков.` : ""}`)));
  if (!completedSeasons.length) seasonHistory.append(element("p", "empty-copy", "Первый сезон ещё продолжается. Его чемпионы, повышения и новые школы останутся в летописи."));
  seasonPanel.append(seasonHeading, championships, seasonHistory);

  const territories = element("section", "living-world-section world-territories paper-panel");
  territories.append(element("p", "eyebrow", "ВЛИЯНИЕ ФРАКЦИЙ"), element("h2", "", "Кто распоряжается миром"));
  const territoryList = element("div", "territory-ledger");
  const appendTerritory = (kind: string, name: string, factionId: string | undefined, note: string) => {
    const faction = factionById(factionId) ?? FACTIONS[0];
    const row = element("article");
    row.style.setProperty("--faction-accent", faction.accent);
    row.append(
      element("small", "", kind),
      element("strong", "", name),
      element("span", "", faction.name),
      element("p", "", note),
    );
    territoryList.append(row);
  };
  ARENAS.forEach((arena) => {
    const controller = game!.factionController(arena.id);
    appendTerritory("АРЕНА", arena.name, controller.id, controller.effect);
  });
  DUNGEONS.forEach((dungeon) => {
    const factionId = game!.save.factionControl?.dungeonControllers?.[dungeon.id];
    appendTerritory("ДАНЖ", dungeon.name, factionId, "Контроль влияет на награды похода и на то, чьи бойцы чаще ищут здесь добычу.");
  });
  const shop = game.shopController();
  const shopOwner = game.livingMentors().find((mentor) => mentor.id === game!.save.factionControl?.shopOwnerMentorId);
  appendTerritory("ЛАВКА", shopOwner ? `Лавка наставника ${shopOwner.name}` : "Лавка Ионы", shop.id, shop.effect);
  territories.append(territoryList);

  const activityCandidates = game.save.enemies
    .filter((enemy) => enemy.alive && enemy.lastActivity)
    .sort((first, second) => (second.lastActivity?.day ?? 0) - (first.lastActivity?.day ?? 0) || second.rating - first.rating);
  const activeFighters = activityCandidates;
  const agency = element("section", "living-world-section paper-panel");
  agency.append(element("p", "eyebrow", "САМОСТОЯТЕЛЬНЫЕ РЕШЕНИЯ"), element("h2", "", "Чем заняты бойцы"));
  const agencyList = element("div", "living-world-list");
  prepareChronicleList(agencyList, "activities", `Самостоятельные решения: ${activeFighters.length} бойцов`);
  activeFighters.forEach((fighter) => {
    const faction = factionById(fighter.factionId);
    const goal = game!.npcGoal(fighter.goal);
    const profile = game!.npcLifeProfile(fighter.id);
    const dynasty = game!.npcDynasties().find((candidate) => candidate.id === profile?.dynastyId);
    const desiredSet = EQUIPMENT_SETS.find((set) => set.id === profile?.desiredSetId);
    const revengeTarget = fighterNames.get(profile?.revengeTargetId ?? "");
    const relationships = Object.values(fighter.relationships ?? {})
      .sort((first, second) => second.intensity - first.intensity)
      .slice(0, 3)
      .map((relationship) => `${relationship.kind === "rival" ? "соперник" : relationship.kind === "ally" ? "союзник" : "наставник"}: ${fighterNames.get(relationship.fighterId) ?? relationship.fighterId}`);
    const row = element("article");
    row.style.setProperty("--faction-accent", faction?.accent ?? "#776e5f");
    const identity = element("div");
    const story = element("div", "living-world-story");
    story.append(element("span", "", fighter.lastActivity?.description ?? "Продолжает путь."));
    const detail = element("details", "living-world-detail");
    detail.append(element("summary", "", "Цель, связи и недавняя история"));
    const facts = element("div");
    facts.append(
      element("p", "", goal.description),
      ...(desiredSet ? [element("p", "", `Ищет комплект «${desiredSet.name}».`)] : []),
      ...(revengeTarget ? [element("p", "", `Готовится взять реванш у ${revengeTarget}.`)] : []),
      ...(dynasty ? [element("p", "", `Продолжает школу «${dynasty.name}», престиж ${dynasty.prestige}.`)] : []),
      ...(relationships.length ? [element("p", "", relationships.join(" · "))] : []),
      ...fighter.history.slice(-3).reverse().map((line) => element("p", "living-world-history-line", line)),
    );
    detail.append(facts);
    story.append(detail);
    row.append(identity, story);
    const mentor = game!.livingMentors().find((candidate) => candidate.id === fighter.mentorId);
    identity.append(
      element("strong", "", profile?.nickname ? `${fighter.name} · «${profile.nickname}»` : fighter.name),
      element("small", "", `${faction?.name ?? "Независимый"} · ${goal.name} · капитал ${fighter.gold ?? 0} ¤${mentor ? ` · наставник ${mentor.name}` : ""}`),
    );
    agencyList.append(row);
  });
  if (activeFighters.length === 0) agencyList.append(element("p", "empty-copy", "Первый самостоятельный день мира ещё не завершён."));
  agency.append(agencyList);

  const careers = element("section", "living-world-section world-careers paper-panel");
  careers.append(element("p", "eyebrow", "КАРЬЕРЫ И НАСЛЕДИЕ"), element("h2", "", "Школы, династии и будущие враги"));
  const careerColumns = element("div", "world-career-columns");
  const mentorColumn = element("section", "living-world-subsection");
  mentorColumn.append(element("h3", "", `Наставники · ${game.livingMentors().length}`));
  const mentorList = element("div", "living-world-list mentor-list");
  prepareChronicleList(mentorList, "mentors", `Все наставники: ${game.livingMentors().length}`);
  game.livingMentors().forEach((mentor) => {
    const row = element("article");
    const faction = factionById(mentor.factionId);
    row.style.setProperty("--faction-accent", faction?.accent ?? "#776e5f");
    row.append(element("div", "", ""), element("span", "", mentor.legacy));
    const role = mentor.role === "shop-owner" ? "владелец лавки" : mentor.role === "faction-founder" ? "основатель школы-фракции" : "наставник";
    row.firstElementChild!.append(element("strong", "", mentor.name), element("small", "", `${CLASS_DEFINITIONS[mentor.classId].name} · ${role} · учеников: ${mentor.studentIds.length}`));
    mentorList.append(row);
  });
  if (game.livingMentors().length === 0) mentorList.append(element("p", "empty-copy", "Никто из известных бойцов пока не завершил карьеру наставником."));
  mentorColumn.append(mentorList);
  const dynastyColumn = element("section", "living-world-subsection");
  dynastyColumn.append(element("h3", "", `Школы и династии · ${game.npcDynasties().length}`));
  const dynastyList = element("div", "world-dynasty-list");
  prepareChronicleList(dynastyList, "dynasties", `Все школы и династии: ${game.npcDynasties().length}`);
  game.npcDynasties().forEach((dynasty) => {
    const faction = factionById(dynasty.factionId);
    const row = element("article");
    row.style.setProperty("--faction-accent", faction?.accent ?? "#776e5f");
    row.append(
      element("strong", "", dynasty.name),
      element("span", "", `Основатель: ${dynasty.founderName}`),
      element("small", "", `${faction?.name ?? "Независимые"} · бойцов: ${dynasty.memberIds.length} · престиж ${dynasty.prestige}`),
    );
    dynastyList.append(row);
  });
  if (!game.npcDynasties().length) dynastyList.append(element("p", "empty-copy", "Первая династия появится, когда ветеран уйдёт с арены и соберёт учеников."));
  dynastyColumn.append(dynastyList);
  careerColumns.append(mentorColumn, dynastyColumn);
  careers.append(careerColumns);

  const bosses = element("section", "living-world-section future-bosses paper-panel");
  bosses.append(element("p", "eyebrow", "ИСТОРИИ, КОТОРЫЕ ЕЩЁ НЕ ЗАКОНЧЕНЫ"), element("h2", "", "Будущие боссы"));
  const bossList = element("div", "future-boss-list");
  prepareChronicleList(bossList, "bosses", "Все будущие и побеждённые боссы");
  const bossKind: Record<string, string> = {
    nemesis: "Немезида",
    "fallen-legend": "Павшая легенда",
    "relic-bearer": "Носитель реликвии",
    "dynasty-heir": "Наследник династии",
  };
  const futureBosses = game.save.npcLife?.futureBosses ?? [];
  futureBosses.slice().sort((first, second) => (first.status === "available" ? -1 : 1) - (second.status === "available" ? -1 : 1) || second.powerLevel - first.powerLevel).forEach((boss) => {
    const availability = game!.futureBossAvailability(boss.id);
    const row = element("article", boss.status);
    row.append(
      element("small", "", boss.status === "available" ? "МОЖЕТ ПОЯВИТЬСЯ" : boss.status === "defeated" ? "ИСТОРИЯ ЗАВЕРШЕНА" : `НЕ РАНЬШЕ ДНЯ ${boss.earliestAppearanceDay}`),
      element("strong", "", boss.name),
      element("span", "", `${bossKind[boss.archetype] ?? boss.archetype} · сила ${boss.powerLevel}`),
      element("p", "", boss.reason),
    );
    const action = element("button", "plain-button future-boss-action", availability.unlocked ? "Встретиться с противником" : boss.status === "defeated" ? "Побеждён" : "След ещё не проявился");
    action.disabled = !availability.unlocked;
    action.title = availability.reason;
    action.addEventListener("click", () => startWorldEncounter(() => game!.beginFutureBossFight(boss.id)));
    row.append(action);
    bossList.append(row);
  });
  if (!futureBosses.length) bossList.append(element("p", "empty-copy", "Некоторые соперники вернутся в новой роли после нескольких сезонов, громкой вражды или утраты легендарного статуса."));
  const hunter = game.factionHunter();
  if (hunter) {
    const availability = game.factionHunterAvailability();
    const faction = factionById(hunter.factionId);
    const row = element("article", "faction-hunter");
    row.style.setProperty("--faction-accent", faction?.accent ?? "#914c43");
    row.append(
      element("small", "", "ОХОТНИК ВРАЖДЕБНОЙ ФРАКЦИИ"),
      element("strong", "", hunter.name),
      element("span", "", `${faction?.name ?? "Неизвестная фракция"} · уровень ${hunter.level}`),
      element("p", "", availability.reason),
    );
    const action = element("button", "plain-button future-boss-action", "Принять бой");
    action.disabled = !availability.unlocked;
    action.addEventListener("click", () => startWorldEncounter(() => game!.beginFactionHunterFight()));
    row.append(action);
    bossList.prepend(row);
  }
  bosses.append(bossList);

  const relics = element("section", "living-world-section world-relics paper-panel");
  relics.append(element("p", "eyebrow", "ВЕЩИ С СОБСТВЕННОЙ ИСТОРИЕЙ"), element("h2", "", `Мировые реликвии · ${game.worldRelicChronicle().length}`));
  const relicList = element("div", "world-relic-list");
  prepareChronicleList(relicList, "relics", `Все мировые реликвии: ${game.worldRelicChronicle().length}`);
  game.worldRelicChronicle().forEach((record) => {
    const row = element("article", `world-relic-entry ${record.status}`);
    row.append(
      element("strong", "", record.item.relicName ?? record.item.name),
      element("small", "", record.status === "lost" ? "Утрачена и может появиться снова" : record.status === "shop" ? "Замечена в лавке Ионы" : `Владелец: ${record.currentOwnerName ?? "неизвестен"}`),
      element("p", "", record.history[record.history.length - 1] ?? "История только начинается."),
    );
    relicList.append(row);
  });
  if (game.worldRelicChronicle().length === 0) relicList.append(element("p", "empty-copy", "Реликвия рождается из легендарной вещи после великих побед её владельца."));
  relics.append(relicList);
  const veterans = element("section", "living-world-section paper-panel");
  const veteranFighters = game.save.enemies.filter((fighter) => fighter.carriedFromCycle !== undefined);
  veterans.append(element("p", "eyebrow", "ПАМЯТЬ ПРОШЛЫХ ЭПОХ"), element("h2", "", `Ветераны · ${veteranFighters.length}`));
  const veteranList = element("div", "living-world-list");
  prepareChronicleList(veteranList, "veterans", "Все ветераны прошлых эпох");
  veteranFighters.forEach((fighter) => {
    const row = element("article");
    const identity = element("div");
    const faction = factionById(fighter.factionId);
    row.style.setProperty("--faction-accent", faction?.accent ?? "#776e5f");
    identity.append(element("strong", "", fighter.name), element("small", "", `Эпоха ${fighter.carriedFromCycle} · ${CLASS_DEFINITIONS[fighter.classId].name} · уровень ${fighter.level}`));
    const status = fighter.retiredDay !== undefined ? "Завершил карьеру" : fighter.alive ? "Продолжает путь" : "Погиб";
    row.append(identity, element("span", "", `${status} · ${faction?.name ?? "Независимый"}`));
    veteranList.append(row);
  });
  if (!veteranFighters.length) veteranList.append(element("p", "empty-copy", "Бойцы прошлых эпох пока не появились в этом мире."));
  veterans.append(veteranList);
  livingBoard.replaceChildren(seasonPanel, territories, agency, careers, bosses, relics, veterans);
  restoreChronicleScroll();

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
  preserveUiFocus(() => {
    renderHeader();
    pageRegistry.invalidate("hero", "arsenal", "forge", "legacy", "skills", "collections", "shop");
    const page = currentPage();
    if (page === "forge" && preserveForgeOrder) {
      renderForge(false, true);
      return;
    }
    renderActivePage(false);
  });
}

function refreshMapViews(animateItems = false): void {
  if (!game) return;
  renderHeader();
  pageRegistry.invalidate("map", "hero", "leaders", "elite", "chronicle", "contracts");
  if (currentPage() === "map") pageRegistry.render("map", { animate: animateItems });
  renderTournamentReminder();
  window.setTimeout(resumeDeferredUi, 0);
}

function renderAll(): void {
  if (!game) return;
  renderHeader();
  pageRegistry.invalidateAll();
  const requested = pageFromHash(location.hash, PAGE_IDS, currentPage());
  showPage(requested, false, true, true, false);
  renderTournamentReminder();
  window.setTimeout(resumeDeferredUi, 0);
}

function refreshCurrentWorldView(): void {
  if (!game) return;
  renderHeader();
  pageRegistry.invalidateAll();
  preserveUiFocus(() => renderActivePage(false));
  renderTournamentReminder();
  window.setTimeout(resumeDeferredUi, 0);
}

function setCombatant(container: HTMLElement, fighter: CombatantSnapshot, health: number): void {
  container.querySelector("h3")!.textContent = fighter.name;
  container.querySelector("p")!.textContent = fighter.originalLevel
    ? `${CLASS_DEFINITIONS[fighter.classId].name} · уровень ${fighter.level} (снижен с ${fighter.originalLevel})`
    : `${CLASS_DEFINITIONS[fighter.classId].name} · уровень ${fighter.level}`;
  container.querySelector("strong")!.textContent = `${Math.max(0, health)} / ${fighter.maxHealth} HP`;
  const fill = container.querySelector(".battle-health i") as HTMLElement;
  fill.style.width = `${Math.max(0, health / fighter.maxHealth * 100)}%`;
  let resonance = container.querySelector<HTMLElement>(".battle-equipment-resonance");
  if (!resonance) {
    resonance = element("p", "battle-equipment-resonance");
    container.append(resonance);
  }
  resonance.hidden = !fighter.equipmentResonance;
  resonance.textContent = fighter.equipmentResonance ? `${fighter.equipmentResonance.setName} · резонанс ${fighter.equipmentResonance.stage}` : "";
  resonance.title = fighter.equipmentResonance?.description ?? "";
}

function updateBattleRuntime(container: HTMLElement, state?: BattleFighterState): void {
  const runtime = container.querySelector<HTMLElement>(".battle-runtime")!;
  runtime.hidden = !state;
  if (!state) return;
  const resource = runtime.querySelector<HTMLElement>("[data-battle-resource]")!;
  const statuses = runtime.querySelector<HTMLElement>("[data-battle-statuses]")!;
  resource.textContent = `${state.resource.name}: ${state.resource.current}/${state.resource.maximum}`;
  resource.title = `Классовый ресурс накапливается в бою и срабатывает при заполнении шкалы.`;
  statuses.textContent = state.statuses.length
    ? state.statuses.map((status) => `${status.name}${status.stacks > 1 ? ` ×${status.stacks}` : ""} · ${status.duration} х.`).join(" · ")
    : "Состояния: нет";
  statuses.title = state.statuses.length
    ? state.statuses.map((status) => `${status.name}: ${status.description}`).join("\n")
    : "На бойца сейчас не действуют временные состояния.";
}

function renderBattleSkills(report: BattleReport): void {
  const panel = $("#battle-skills");
  (["hero", "enemy"] as const).forEach((side) => {
    const fighter = side === "hero" ? report.heroBefore : report.enemyBefore;
    const list = panel.querySelector<HTMLElement>(`[data-fighter="${side}"] > div`)!;
    const heroTurn = side === "hero" && manualBattleSession?.currentActorId === "hero";
    const interactive = side === "hero" && Boolean(manualBattleSession);
    const available = heroTurn
      ? (hasLivePendingBattle() ? pendingBattleUi!.actions() : manualBattleSession!.availableActions())
      : [];
    const byId = new Map<string, BattleActionOption>(available.map((action) => [action.id, action]));
    const makeChip = (label: string, id: string, className: string, option?: BattleActionOption): HTMLElement => {
      const chip = interactive ? element("button", className, label) : element("span", className, label);
      if (chip instanceof HTMLButtonElement) {
        chip.type = "button";
        chip.disabled = !heroTurn || option?.available === false;
        if (option && option.cooldown > 0) chip.textContent = `${label} · ${option.cooldown} х.`;
        chip.addEventListener("click", () => confirmManualBattleTurn(id));
      }
      chip.dataset.skillId = id;
      return chip;
    };
    const regular = makeChip("Обычная атака", "basic", `battle-skill ready basic${heroTurn && selectedManualActionId === "basic" ? " awaiting-input" : ""}`, byId.get("basic"));
    const skills = fighter.skills.map((id) => {
      const skill = skillById(id);
      const option = byId.get(id);
      const chip = makeChip(skill?.name ?? id, id, `battle-skill ready ${skill?.kind ?? "attack"}${heroTurn && selectedManualActionId === id ? " awaiting-input" : ""}`, option);
      if (skill) chip.title = `${skill.description} Перезарядка: ${skill.cooldown} х.`;
      return chip;
    });
    list.replaceChildren(regular, ...skills);
  });
  if (manualBattleSession) {
    updateBattleRuntime($("#battle-hero"), manualBattleSession.fighterState("hero"));
    updateBattleRuntime($("#battle-enemy"), manualBattleSession.fighterState(report.enemyBefore.id));
  } else {
    updateBattleRuntime($("#battle-hero"));
    updateBattleRuntime($("#battle-enemy"));
  }
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
  deferredBattleLoot = null;
  battleEquipmentBefore = game ? { ...game.save.hero.equipped } : null;
  battleInventoryBefore = game ? new Set(game.save.hero.inventory.map((item) => item.id)) : null;
}

function hasLivePendingBattle(): boolean {
  return Boolean(game?.currentPendingBattle() && pendingBattleUi && manualBattleSession);
}

function pendingFighterName(id?: string): string {
  if (!id) return "—";
  if (id === "hero") return game?.save.hero.name ?? "Герой";
  const savedEnemy = game?.save.enemies.find((enemy) => enemy.id === id);
  if (savedEnemy) return savedEnemy.name;
  const current = game?.currentPendingBattle();
  return current?.enemy.id === id ? current.enemy.name : id;
}

function battleTurnDetail(turn: BattleTurn): string {
  const parts = [
    turn.damage ? `${turn.damage} урона` : "без урона",
    ...(turn.healing ? [`+${turn.healing} HP`] : []),
    ...(turn.critical ? ["критический удар"] : []),
    ...(turn.resourceChange ? [`ресурс ${turn.resourceChange > 0 ? "+" : ""}${turn.resourceChange}`] : []),
    ...(turn.resourceTriggered ? [`сработало: ${turn.resourceTriggered}`] : []),
    ...((turn.statusComboIds ?? []).length ? [`комбинация: ${turn.statusComboIds!.join(", ")}`] : []),
  ];
  if (turn.detail) parts.push(turn.detail);
  if (turn.decisionReason) parts.push(`Выбор: ${turn.decisionReason}`);
  return `${parts.join(" · ")}.`;
}

function battleTurnLogLine(turn: BattleTurn): string {
  const reason = turn.decisionReason ? ` Решение: ${turn.decisionReason}` : "";
  const resource = turn.resourceTriggered ? ` Ресурс: ${turn.resourceTriggered}.` : "";
  const combo = turn.statusComboIds?.length ? ` Комбо: ${turn.statusComboIds.join(", ")}.` : "";
  return `${turn.turn}. ${turn.actorName} — ${turn.action}: ${turn.damage} урона${turn.healing ? `, +${turn.healing} HP` : ""}.${reason}${resource}${combo}`;
}

function battleAnalyticsView(report: BattleReport): HTMLElement | null {
  const analysis = report.analysis;
  if (!analysis) return null;
  const panel = element("section", "battle-analysis");
  panel.append(
    element("div", "battle-analysis-heading", ""),
    element("p", "battle-analysis-summary", `Бой занял ${analysis.duration} х. · действий: ${analysis.actionCount}${analysis.decidingEffect ? ` · решающий фактор: ${analysis.decidingEffect}` : ""}`),
  );
  panel.firstElementChild!.append(element("small", "", "РАЗБОР БОЯ"), element("h4", "", "Почему получился такой исход"));
  const fighters = element("div", "battle-analysis-fighters");
  analysis.fighters.forEach((fighter) => {
    const mostUsed = fighter.mostUsedSkillId ? skillById(fighter.mostUsedSkillId)?.name ?? fighter.mostUsedSkillId : "обычная атака";
    const decisive = fighter.decisiveSkillId ? skillById(fighter.decisiveSkillId)?.name ?? fighter.decisiveSkillId : undefined;
    const card = element("article");
    card.append(
      element("strong", "", fighter.fighterName),
      element("span", "", `${fighter.totalDamage} урона · ${fighter.totalHealing} лечения · критов: ${fighter.criticalHits}`),
      element("p", "", `Чаще всего: ${mostUsed}${decisive ? ` · решающий приём: ${decisive}` : ""}.`),
    );
    if (fighter.statusComboIds.length || fighter.resourceTriggers.length) {
      card.append(element("small", "", [
        ...(fighter.statusComboIds.length ? [`Комбинации: ${fighter.statusComboIds.join(", ")}`] : []),
        ...(fighter.resourceTriggers.length ? [`Ресурс: ${fighter.resourceTriggers.join(", ")}`] : []),
      ].join(" · ")));
    }
    fighters.append(card);
  });
  panel.append(fighters);
  if (analysis.highlights.length) {
    const highlights = element("ul", "battle-analysis-highlights");
    analysis.highlights.forEach((highlight) => highlights.append(element("li", "", highlight)));
    panel.append(highlights);
  }
  if (analysis.adaptationReason) panel.append(element("p", "battle-analysis-adaptation", analysis.adaptationReason));
  return panel;
}

function openPendingBattle(pending: PendingBattle, resumed = false): void {
  if (!game) return;
  pendingBattleUi ??= new PendingBattleUiController(game);
  currentTournament = null;
  currentReport = pendingBattleReport(pending);
  pendingTournamentContinuation = false;
  renderTournamentBracket();
  openBattleReport(currentReport, pending);
  if (resumed) {
    queueWorldEffect({
      eyebrow: "БОЙ ПРОДОЛЖАЕТСЯ", title: "Ход сохранён",
      description: "Здоровье, ресурсы, перезарядки и состояния восстановлены без повторного расчёта.",
      symbol: "↺", tone: "positive", duration: 2200,
    });
  }
}

function startActivity(activityId: string): void {
  if (!game) return;
  try {
    game.startExpedition(activityId);
    persist(); renderMap(false); openDungeonWindow();
    queueWorldEffect({ eyebrow: "ЭКСПЕДИЦИЯ", title: "Отряд покинул лагерь", description: "Выбирайте путь после каждого этапа: риск меняет опасность и возможную добычу.", symbol: "↟", sound: "choice" });
  } catch (error) {
    notifyError((error as Error).message);
  }
}

function advanceExpedition(choiceId: "safe" | "risk" | "rest"): void {
  if (game?.save.hero.combatMode === "manual") {
    beginManualExpeditionStep(() => game!.beginExpeditionChoice(choiceId));
    return;
  }
  runExpeditionStep(() => game!.advanceExpedition(choiceId));
}

function advanceExpeditionNode(nodeId: string): void {
  if (game?.save.hero.combatMode === "manual") {
    beginManualExpeditionStep(() => game!.beginExpeditionNode(nodeId));
    return;
  }
  runExpeditionStep(() => game!.advanceExpeditionNode(nodeId));
}

function resolveExpeditionShrine(choiceId: "blood-oath" | "guardian-vow"): void {
  runExpeditionStep(() => game!.resolveExpeditionShrine(choiceId));
}

function resolveExpeditionMerchant(choiceId: "healing" | "supplies" | "leave"): void {
  runExpeditionStep(() => game!.resolveExpeditionMerchant(choiceId));
}

function beginManualExpeditionStep(action: () => PendingBattle | ExpeditionStepReport): void {
  if (!game) return;
  captureBattleEquipment();
  let started: PendingBattle | ExpeditionStepReport;
  try {
    started = action();
    persist({ deferFeatureUnlocks: true });
  } catch (error) {
    battleEquipmentBefore = null; battleInventoryBefore = null;
    notifyError((error as Error).message);
    return;
  }
  if ("version" in started) {
    resumeExpeditionAfterBattle = false;
    openPendingBattle(started);
    return;
  }
  handleExpeditionStepResult(started);
}

function handleExpeditionStepResult(result: ExpeditionStepReport): void {
  if (!game) return;
  pendingExpeditionResult = result.completed || result.retreated ? result : null;
  resumeExpeditionAfterBattle = Boolean(result.battle && !result.completed && !result.retreated);
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
    openDungeonWindow();
  }
}

function runExpeditionStep(action: () => ExpeditionStepReport): void {
  if (!game) return;
  captureBattleEquipment();
  let result: ExpeditionStepReport;
  try { result = action(); persist(); }
  catch (error) { battleEquipmentBefore = null; battleInventoryBefore = null; notifyError((error as Error).message); return; }
  handleExpeditionStepResult(result);
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
  } catch (error) { battleEquipmentBefore = null; battleInventoryBefore = null; notifyError((error as Error).message); }
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
  } catch (error) { notifyError((error as Error).message); }
}

function startEndgame(activityId: "crown-league" | "legend-hunt"): void {
  if (!game) return;
  captureBattleEquipment();
  try {
    if (activityId === "crown-league") {
      if (game.save.hero.combatMode === "manual") {
        const pending = game.beginCrownLeague();
        persist({ deferFeatureUnlocks: true });
        renderTournamentReminder();
        openPendingBattle(pending);
        return;
      }
      currentTournament = game.playCrownLeague();
      tournamentBattleIndex = 0;
      currentReport = currentTournament.heroBattles[0] ?? null;
    } else {
      if (game.save.hero.combatMode === "manual") {
        const pending = game.beginLegendHunt();
        persist({ deferFeatureUnlocks: true });
        openPendingBattle(pending);
        return;
      }
      currentTournament = null;
      currentReport = game.huntLegend();
    }
    persist();
  } catch (error) { battleEquipmentBefore = null; notifyError((error as Error).message); return; }
  if (currentTournament) renderTournamentBracket();
  if (!currentReport) { battleEquipmentBefore = null; notifyError("В турнирной сетке не найден бой героя."); return; }
  openBattleReport(currentReport);
}

function startLegendDefense(): void {
  if (!game) return;
  captureBattleEquipment();
  if (game.save.hero.combatMode === "manual") {
    try {
      const pending = game.beginLegendDefense(true);
      persist({ deferFeatureUnlocks: true });
      openPendingBattle(pending);
    } catch (error) { battleEquipmentBefore = null; notifyError((error as Error).message); }
    return;
  }
  try { currentTournament = null; currentReport = game.defendLegendTitle(); persist(); }
  catch (error) { battleEquipmentBefore = null; notifyError((error as Error).message); return; }
  openBattleReport(currentReport);
}

function confirmManualBattleTurn(actionId = selectedManualActionId): void {
  if (!currentReport || !manualBattleSession || manualBattleSession.currentActorId !== "hero") return;
  const option = (hasLivePendingBattle() ? pendingBattleUi!.actions() : manualBattleSession.availableActions())
    .find((candidate) => candidate.id === actionId);
  if (!option?.available) return;
  selectedManualActionId = actionId;
  const action: BattleAction = actionId === "basic" ? { type: "basic" } : { type: "skill", skillId: actionId };
  playManualBattleTurn(action);
}

function startDuel(tierId?: string): void {
  if (!game) return;
  captureBattleEquipment();
  if (game.save.hero.combatMode === "manual") {
    try {
      const pending = game.beginDuel(tierId);
      persist({ deferFeatureUnlocks: true });
      refreshCurrentWorldView();
      openPendingBattle(pending);
    } catch (error) { battleEquipmentBefore = null; notifyError((error as Error).message); }
    return;
  }
  let result;
  try { result = game.duel(tierId); persist(); refreshCurrentWorldView(); }
  catch (error) { battleEquipmentBefore = null; notifyError((error as Error).message); return; }
  if (!result.battle) { battleEquipmentBefore = null; return; }
  currentTournament = null; currentReport = result.battle; openBattleReport(result.battle);
}

function startWorldEncounter(begin: () => PendingBattle): void {
  if (!game) return;
  captureBattleEquipment();
  try {
    const pending = begin();
    persist({ deferFeatureUnlocks: true });
    if (game.save.hero.combatMode === "manual") {
      refreshCurrentWorldView();
      openPendingBattle(pending);
      return;
    }
    const result = game.runPendingBattleAutomatically();
    persist();
    refreshCurrentWorldView();
    if (result && "turns" in result) openBattleReport(result);
    else battleEquipmentBefore = null;
  } catch (error) {
    battleEquipmentBefore = null;
    battleInventoryBefore = null;
    notifyError((error as Error).message);
  }
}

function startBossFight(bossId: string): void {
  if (!game) return;
  captureBattleEquipment();
  if (game.save.hero.combatMode === "manual") {
    try {
      const pending = game.beginBoss(bossId);
      persist({ deferFeatureUnlocks: true });
      refreshCurrentWorldView();
      openPendingBattle(pending);
    } catch (error) { battleEquipmentBefore = null; notifyError((error as Error).message); }
    return;
  }
  let result;
  try { result = game.fightBoss(bossId); persist(); refreshCurrentWorldView(); }
  catch (error) { battleEquipmentBefore = null; notifyError((error as Error).message); return; }
  if (!result.battle) { battleEquipmentBefore = null; return; }
  currentTournament = null; currentReport = result.battle; openBattleReport(result.battle);
}

function startTournament(arenaId: string): void {
  if (!game) return;
  captureBattleEquipment();
  if (game.save.hero.combatMode === "manual") {
    try {
      const pending = game.beginTournament(arenaId);
      persist({ deferFeatureUnlocks: true });
      renderTournamentReminder();
      openPendingBattle(pending);
    } catch (error) { battleEquipmentBefore = null; notifyError((error as Error).message); }
    return;
  }
  try {
    currentTournament = game.playTournament(arenaId);
    persist({ deferFeatureUnlocks: true });
  }
  catch (error) { battleEquipmentBefore = null; notifyError((error as Error).message); return; }
  renderTournamentReminder();
  tournamentBattleIndex = 0;
  renderTournamentBracket();
  currentReport = currentTournament.heroBattles[0] ?? null;
  if (!currentReport) { battleEquipmentBefore = null; notifyError("Герой не попал в турнирную сетку."); return; }
  openBattleReport(currentReport);
}

function renderTournamentBracket(): void {
  const panel = $("#tournament-panel");
  const pending = game?.currentPendingBattle()?.tournament;
  if (!currentTournament && !pending) { panel.hidden = true; return; }
  panel.hidden = false;
  const participantCount = currentTournament?.participantCount ?? pending!.participantIds.length;
  const matches = currentTournament?.matches ?? pending!.matches.map((match) => ({
    round: match.round,
    match: match.match,
    firstName: pendingFighterName(match.firstId),
    secondName: pendingFighterName(match.secondId),
    winnerName: pendingFighterName(match.winnerId),
    heroInvolved: match.heroInvolved,
  }));
  const completedHeroBattles = currentTournament?.heroBattles.length ?? pending!.heroBattles.length;
  $("#tournament-round-label").textContent = `${participantCount} УЧАСТНИКОВ · ${matches.length} ЗАВЕРШЕНО`;
  $("#tournament-progress").textContent = currentTournament
    ? `БОЙ ГЕРОЯ ${Math.min(tournamentBattleIndex + 1, currentTournament.heroBattles.length)} / ${currentTournament.heroBattles.length}`
    : `РАУНД ${pending!.round} · БОЙ ГЕРОЯ ${completedHeroBattles + 1}`;
  const strip = $("#bracket-strip"); strip.replaceChildren();
  matches.forEach((match) => {
    const cell = element("article", match.heroInvolved ? "hero-match" : "");
    cell.append(element("small", "", `РАУНД ${match.round} · БОЙ ${match.match}`), element("span", "", `${match.firstName} × ${match.secondName}`), element("strong", "", `→ ${match.winnerName}`));
    strip.append(cell);
  });
  if (!currentTournament && pending) {
    const [firstId, secondId] = pending.pairs[pending.pairIndex] ?? ["hero", game?.currentPendingBattle()?.enemyId];
    const live = element("article", "hero-match live-match");
    live.append(
      element("small", "", `РАУНД ${pending.round} · ИДЁТ СЕЙЧАС`),
      element("span", "", `${pendingFighterName(firstId)} × ${pendingFighterName(secondId)}`),
      element("strong", "", "исход ещё не записан"),
    );
    strip.append(live);
  }
}

function openBattleReport(report: BattleReport, pending?: PendingBattle): void {
  hideLootReminder();
  if ($("#battle-overlay").hidden) {
    battleReturnScrollY = window.scrollY;
    battleReturnPage = document.querySelector<HTMLElement>(".page.active")?.id.replace("page-", "") ?? "map";
  }
  currentReport = report;
  battleTurnIndex = pending?.session.turns.length ?? 0;
  manualBattleSession = pending
    ? new BattleSession(pending.session)
    : game?.save.hero.combatMode === "manual" ? new BattleSession(currentReport.heroBefore, currentReport.enemyBefore)
    : null;
  selectedManualActionId = "basic";
  const manualHero = manualBattleSession?.fighterState("hero");
  const manualEnemy = manualBattleSession?.fighterState(currentReport.enemyBefore.id);
  battleHealth = {
    hero: manualHero?.health ?? currentReport.heroBefore.maxHealth,
    enemy: manualEnemy?.health ?? currentReport.enemyBefore.maxHealth,
  };
  $("#battle-place").textContent = currentReport.activity.place.toUpperCase();
  $("#battle-name").textContent = currentReport.activity.name;
  const rulesPanel = $("#battle-rules");
  const activeRules = TOURNAMENT_RULES.filter((rule) => currentReport?.ruleIds?.includes(rule.id));
  rulesPanel.hidden = activeRules.length === 0;
  rulesPanel.replaceChildren(...activeRules.map((rule) => {
    const chip = element("span"); chip.append(element("b", "", rule.name), document.createTextNode(rule.description)); return chip;
  }));
  const previousTurns = pending?.session.turns ?? [];
  const lastTurn = previousTurns[previousTurns.length - 1];
  $("#battle-turn").textContent = lastTurn ? `ХОД ${lastTurn.turn}` : "ХОД 0";
  $("#battle-action").textContent = lastTurn ? `${lastTurn.actorName}: ${lastTurn.action}` : "Бойцы выходят на площадку";
  $("#battle-detail").textContent = lastTurn ? battleTurnDetail(lastTurn) : "";
  $("#battle-log").replaceChildren(...previousTurns.slice().reverse().map((turn) => element(
    "p", turn.critical ? "critical" : "",
    battleTurnLogLine(turn),
  )));
  $("#battle-result").hidden = true;
  $("#skip-battle").hidden = false;
  $("#close-battle").textContent = "Вернуться на карту";
  if (!currentTournament && !pending?.tournament) $("#tournament-panel").hidden = true;
  setCombatant($("#battle-hero"), currentReport.heroBefore, battleHealth.hero);
  setCombatant($("#battle-enemy"), currentReport.enemyBefore, battleHealth.enemy);
  renderBattleSkills(currentReport);
  modalController.open($("#battle-overlay"), { initialFocus: "#skip-battle", dismissOnEscape: false, restoreFocus: false });
  document.body.classList.add("battle-open");
  gameAudio.battleStart(currentReport.activity.kind === "boss" || currentReport.activity.kind === "dungeon");
  scheduleBattleTurn();
}

function scheduleBattleTurn(): void {
  if (!currentReport) return;
  if (manualBattleSession) {
    if (manualBattleSession.isFinished) {
      if (hasLivePendingBattle()) finalizePendingBattleForUi();
      else finishBattlePlayback();
      return;
    }
    const manualButton = $("#manual-battle-step") as HTMLButtonElement;
    const heroTurn = manualBattleSession.currentActorId === "hero";
    if (heroTurn) {
      const available = hasLivePendingBattle() ? pendingBattleUi!.actions() : manualBattleSession.availableActions();
      if (!available.some((action) => action.id === selectedManualActionId && action.available)) selectedManualActionId = "basic";
      const selected = available.find((action) => action.id === selectedManualActionId) ?? available[0];
      manualButton.hidden = false;
      manualButton.disabled = !selected?.available;
      manualButton.textContent = selected ? `Применить: ${selected.name}` : "Выберите приём";
      $("#battle-action").textContent = "Ваш ход — выберите доступный приём";
      renderBattleSkills(currentReport);
      return;
    }
    manualButton.hidden = true;
    renderBattleSkills(currentReport);
    const delay = Number(($("#battle-speed") as HTMLSelectElement).value);
    battleTimer = window.setTimeout(() => playManualBattleTurn(), delay);
    return;
  }
  if (battleTurnIndex >= currentReport.turns.length) { finishBattlePlayback(); return; }
  const next = currentReport.turns[battleTurnIndex];
  const manualButton = $("#manual-battle-step") as HTMLButtonElement;
  $$("#battle-skills .battle-skill").forEach((chip) => chip.classList.remove("awaiting-input"));
  manualButton.hidden = true;
  const delay = Number(($("#battle-speed") as HTMLSelectElement).value);
  battleTimer = window.setTimeout(playBattleTurn, delay);
}

function presentBattleTurn(turn: BattleTurn): void {
  if (!currentReport) return;
  $("#manual-battle-step").hidden = true;
  $$("#battle-skills .battle-skill").forEach((chip) => chip.classList.remove("awaiting-input"));
  if (turn.actorId === "hero") { battleHealth.hero = turn.actorHealth; battleHealth.enemy = turn.targetHealth; }
  else { battleHealth.enemy = turn.actorHealth; battleHealth.hero = turn.targetHealth; }
  setCombatant($("#battle-hero"), currentReport.heroBefore, battleHealth.hero);
  setCombatant($("#battle-enemy"), currentReport.enemyBefore, battleHealth.enemy);
  $("#battle-turn").textContent = `ХОД ${turn.turn}`;
  $("#battle-action").textContent = `${turn.actorName}: ${turn.action}`;
  $("#battle-detail").textContent = battleTurnDetail(turn);
  replayAnimation($(".battle-action"), "turn-updated");
  markUsedBattleSkill(turn.actorId, turn.skillId);
  const actor = turn.actorId === "hero" ? $("#battle-hero") : $("#battle-enemy");
  const target = turn.targetId === "hero" ? $("#battle-hero") : $("#battle-enemy");
  actor.classList.remove("acting"); target.classList.remove("hit"); void actor.offsetWidth; actor.classList.add("acting"); if (turn.damage > 0) target.classList.add("hit");
  const actorClass = turn.actorId === "hero" ? currentReport.heroBefore.classId : currentReport.enemyBefore.classId;
  gameAudio.battleTurn(turn, actorClass);
  const log = element("p", turn.critical ? "critical" : "", battleTurnLogLine(turn));
  $("#battle-log").prepend(log);
}

function finalizePendingBattleForUi(): void {
  if (!game || !pendingBattleUi || !game.currentPendingBattle()) return;
  let finalized: PendingBattleFinalization;
  try {
    finalized = pendingBattleUi.finalize();
    persist({ deferFeatureUnlocks: true });
  } catch (error) {
    notifyError((error as Error).message);
    return;
  }
  currentReport = finalized.battle;
  manualBattleSession = null;
  pendingTournamentContinuation = finalized.status === "next-battle";
  if (finalized.status === "next-battle") {
    currentTournament = null;
  } else if (finalized.result && "matches" in finalized.result) {
    currentTournament = finalized.result;
    tournamentBattleIndex = Math.max(0, currentTournament.heroBattles.length - 1);
    pendingBattleCompletedForPersist = true;
  } else {
    currentTournament = null;
    if (finalized.result && "completed" in finalized.result) {
      pendingExpeditionResult = finalized.result.completed || finalized.result.retreated ? finalized.result : null;
      resumeExpeditionAfterBattle = !finalized.result.completed && !finalized.result.retreated;
    }
    pendingBattleCompletedForPersist = true;
  }
  renderTournamentBracket();
  finishBattlePlayback();
}

function playManualBattleTurn(action?: BattleAction): void {
  if (!currentReport || !manualBattleSession || manualBattleSession.isFinished) return;
  if (hasLivePendingBattle()) {
    let stepped;
    try {
      stepped = pendingBattleUi!.step(action);
      persist({ deferFeatureUnlocks: true });
    } catch (error) {
      notifyError((error as Error).message);
      return;
    }
    manualBattleSession = pendingBattleUi!.session(stepped.pendingBattle);
    currentReport = pendingBattleUi!.report(stepped.pendingBattle);
    battleTurnIndex = stepped.pendingBattle.session.turns.length;
    presentBattleTurn(stepped.turn);
    renderBattleSkills(currentReport);
    if (stepped.finished) finalizePendingBattleForUi();
    else scheduleBattleTurn();
    return;
  }
  const turn = manualBattleSession.step(action);
  battleTurnIndex = manualBattleSession.turns.length;
  presentBattleTurn(turn);
  renderBattleSkills(currentReport);
  scheduleBattleTurn();
}

function playBattleTurn(): void {
  if (!currentReport) return;
  const turn = currentReport.turns[battleTurnIndex++];
  if (!turn) { finishBattlePlayback(); return; }
  presentBattleTurn(turn);
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
  const hasNextTournamentBattle = pendingTournamentContinuation
    || Boolean(currentTournament && tournamentBattleIndex < currentTournament.heroBattles.length - 1);
  const finalTournamentBattle = Boolean(currentTournament && !hasNextTournamentBattle);
  const finalRewards = finalTournamentBattle ? currentTournament!.rewards : currentReport.rewards;
  const title = finalTournamentBattle
    ? (currentTournament!.heroWon ? "Вы — чемпион турнира" : `Турнир завершён · место ${currentTournament!.heroPlacement}`)
    : currentReport.heroWon ? "Победа" : "Поражение";
  gameAudio.battleResult(currentReport.heroWon);
  queueWorldEffect({
    eyebrow: currentReport.activity.name,
    variant: currentReport.heroWon ? "victory" : "defeat",
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
  const analysis = battleAnalyticsView(currentReport);
  if (analysis) copy.append(analysis);
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
    : pendingExpeditionResult ? "Посмотреть итоги похода"
      : resumeExpeditionAfterBattle ? "Продолжить поход" : "Вернуться на карту";
  const inventoryBefore = battleInventoryBefore;
  const newlyAcquiredItems = !hasNextTournamentBattle && game && inventoryBefore
    ? game.save.hero.inventory.filter((item) => !inventoryBefore.has(item.id))
    : [];
  if (newlyAcquiredItems.length === 0 && !hasNextTournamentBattle && finalRewards.item) newlyAcquiredItems.push(finalRewards.item);
  if (!hasNextTournamentBattle) refreshCurrentWorldView();
  if (pendingExpeditionResult && !hasNextTournamentBattle) {
    pendingExpeditionLoot = { items: newlyAcquiredItems, equipmentBefore: battleEquipmentBefore };
  } else if (!hasNextTournamentBattle && newlyAcquiredItems.length) {
    deferredBattleLoot = { items: newlyAcquiredItems, equipmentBefore: battleEquipmentBefore };
  }
}

function skipBattle(): void {
  if (!currentReport) return;
  if (hasLivePendingBattle()) {
    try {
      let pending = game!.currentPendingBattle();
      let safety = 0;
      while (pending && !pending.session.winnerId && safety < 4_000) {
        const stepped = pendingBattleUi!.step();
        pending = stepped.pendingBattle;
        safety += 1;
      }
      if (pending && !pending.session.winnerId) throw new Error("Бой не завершился в допустимое число ходов.");
      if (pending) {
        manualBattleSession = pendingBattleUi!.session(pending);
        const hero = manualBattleSession.fighterState("hero");
        const enemy = manualBattleSession.fighterState(pending.enemyId);
        battleHealth = { hero: hero.health, enemy: enemy.health };
        currentReport = pendingBattleUi!.report(pending);
      }
      persist({ deferFeatureUnlocks: true });
      finalizePendingBattleForUi();
    } catch (error) { notifyError((error as Error).message); }
    return;
  }
  if (manualBattleSession && !manualBattleSession.isFinished) {
    manualBattleSession.runAutomatic();
    const hero = manualBattleSession.fighterState("hero");
    const enemy = manualBattleSession.fighterState(currentReport.enemyBefore.id);
    battleHealth = { hero: hero.health, enemy: enemy.health };
  }
  battleTurnIndex = currentReport.turns.length;
  finishBattlePlayback();
}

function closeBattle(): void {
  if (battleTimer !== null) window.clearTimeout(battleTimer);
  battleTimer = null;
  if (pendingTournamentContinuation) {
    pendingTournamentContinuation = false;
    const pending = game?.currentPendingBattle();
    if (!pending) { notifyError("Следующий бой турнирной сетки не найден."); return; }
    renderTournamentBracket();
    openPendingBattle(pending);
    return;
  }
  if (currentTournament && tournamentBattleIndex < currentTournament.heroBattles.length - 1) {
    tournamentBattleIndex += 1;
    renderTournamentBracket();
    openBattleReport(currentTournament.heroBattles[tournamentBattleIndex]);
    return;
  }
  const completedTournament = Boolean(currentTournament);
  const expeditionResult = pendingExpeditionResult;
  const expeditionLoot = pendingExpeditionLoot;
  const continueExpedition = resumeExpeditionAfterBattle;
  const battleLoot = deferredBattleLoot;
  pendingExpeditionResult = null;
  pendingExpeditionLoot = null;
  resumeExpeditionAfterBattle = false;
  deferredBattleLoot = null;
  if (battleLoot?.items.length) document.body.classList.add("loot-notification-open");
  currentReport = null; currentTournament = null; manualBattleSession = null; battleEquipmentBefore = null; battleInventoryBefore = null; modalController.close($("#battle-overlay")); $("#tournament-panel").hidden = true; document.body.classList.remove("battle-open");
  if (completedTournament || pendingBattleCompletedForPersist) persist();
  pendingBattleCompletedForPersist = false;
  showPage(battleReturnPage, false, false);
  window.requestAnimationFrame(() => {
    window.scrollTo({ top: battleReturnScrollY, behavior: "auto" });
    if (expeditionResult) openExpeditionRewards(expeditionResult, expeditionLoot?.items ?? expeditionResult.rewards?.items ?? [], expeditionLoot?.equipmentBefore ?? null);
    else if (continueExpedition) openDungeonWindow();
    else if (battleLoot?.items.length) window.setTimeout(() => showLootReminders(battleLoot.items, battleLoot.equipmentBefore), 120);
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
  $("#creation-screen").hidden = true;
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
  [saveRepository.primaryKey, saveRepository.temporaryKey, saveRepository.backupKey].forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem(LEADER_SNAPSHOT_KEY);
  localStorage.removeItem(ELITE_SNAPSHOT_KEY);
  game = null; pendingBattleUi = null; location.reload();
}

function closeSaveMenu(): void {
  const menu = document.querySelector<HTMLDetailsElement>(".header-save-menu");
  if (menu) menu.open = false;
}

function exportSaveFile(): void {
  if (!game) return;
  try {
    const download = saveTransferController.export(game.save.hero.name, game.save.worldDay, game.save);
    const blob = new Blob([download.content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = download.fileName;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    closeSaveMenu();
  } catch (error) { notifyError((error as Error).message); }
}

async function importSaveFile(file: File): Promise<void> {
  if (!window.confirm("Заменить текущую летопись сохранением из выбранного файла? Перед заменой будет сохранена резервная копия.")) return;
  try {
    saveTransferController.import(await file.text());
    closeSaveMenu();
    location.reload();
  } catch (error) {
    notifyError(`Файл не загружен: ${(error as Error).message}`);
  }
}

function restorePreviousSave(): void {
  if (!saveTransferController.canRestoreBackup()) { notifyError("Предыдущая исправная копия ещё не создана."); return; }
  if (!window.confirm("Вернуть предыдущее исправное состояние летописи? Текущее состояние останется резервной копией.")) return;
  try {
    saveTransferController.restoreBackup();
    closeSaveMenu();
    location.reload();
  } catch (error) { notifyError(`Копия не восстановлена: ${(error as Error).message}`); }
}

function showSaveLoadFailure(message: string): void {
  $("#creation-screen").hidden = true;
  $(".game-header").hidden = true;
  $(".main-nav").hidden = true;
  $(".game-shell").hidden = true;
  $("#basic-shell").hidden = true;
  document.querySelector(".save-recovery-screen")?.remove();
  const screen = element("section", "save-recovery-screen");
  const card = element("div", "save-recovery-card");
  card.append(
    element("p", "eyebrow", "СОХРАНЕНИЕ НЕ ПРОЧИТАНО"),
    element("h1", "", "Летопись требует восстановления"),
    element("p", "", message),
    element("p", "save-recovery-note", "Игра не создаёт нового героя поверх повреждённых данных. Можно повторить чтение или осознанно начать заново."),
  );
  const actions = element("div", "save-recovery-actions");
  const retry = element("button", "button primary", "Попробовать снова");
  retry.type = "button";
  retry.addEventListener("click", () => location.reload());
  const clear = element("button", "plain-button", "Удалить повреждённую летопись");
  clear.type = "button";
  clear.addEventListener("click", () => {
    if (!window.confirm("Удалить повреждённое сохранение и его резервную копию? Отменить это действие нельзя.")) return;
    [saveRepository.primaryKey, saveRepository.temporaryKey, saveRepository.backupKey].forEach((key) => localStorage.removeItem(key));
    location.reload();
  });
  actions.append(retry, clear);
  card.append(actions);
  screen.append(card);
  document.body.append(screen);
  retry.focus();
}

function bootstrapWorld(): void {
  renderCreation();
  game = loadGame();
  if (!game) {
    if (saveLoadError) {
      showSaveLoadFailure(saveLoadError);
      return;
    }
    modalController.open($("#creation-screen"), {
      initialFocus: "#hero-name-input",
      dismissOnBackdrop: false,
      dismissOnEscape: false,
      restoreFocus: false,
    });
    return;
  }
  pendingBattleUi = new PendingBattleUiController(game);
  modalController.close($("#creation-screen"), false);
  const resumedPendingBattle = game.currentPendingBattle();
  seasonNoticeTracker.reset(game.save);
  const cycles = resumedPendingBattle ? 0 : game.simulateElapsed();
  if (cycles > 0) {
    const notice = $("#world-notice"); notice.hidden = false;
    notice.textContent = `Мир продолжал жить без вас: прошло ${cycles} дн. фоновых турниров, дуэлей и вылазок.`;
  }
  persist(); renderAll();
  if (saveRecoveredFromBackup) {
    queueWorldEffect({ eyebrow: "ВОССТАНОВЛЕНИЕ", title: "Летопись спасена", description: "Загружена последняя исправная резервная копия.", symbol: "↺", tone: "positive", duration: 3000 });
  }
  queueUnseenContextualTutorials();
  if (resumedPendingBattle) openPendingBattle(resumedPendingBattle, true);
  else if (game.save.activeExpedition) openDungeonWindow();
  else if (!game.save.tutorialCompleted) openTutorial(true);
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
  $("#creation-screen").hidden = true;
  $("#basic-shell").hidden = true;
  $(".game-header").hidden = true;
  $(".main-nav").hidden = true;
  $(".game-shell").hidden = true;
}

$("#create-hero-btn").addEventListener("click", createHero);
$("#hero-name-input").addEventListener("keydown", (event) => { if ((event as KeyboardEvent).key === "Enter") createHero(); });
$$<HTMLButtonElement>(".nav-primary button[data-nav-default]").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.navDefault!)));
$$<HTMLButtonElement>(".nav-secondary button[data-page]").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.page!)));
$$<HTMLElement>("[data-page-link]").forEach((link) => link.addEventListener("click", (event) => { event.preventDefault(); showPage(link.dataset.pageLink!); }));
$$<HTMLButtonElement>("[data-scroll-target]").forEach((button) => button.addEventListener("click", () => {
  document.getElementById(button.dataset.scrollTarget!)?.scrollIntoView({ behavior: "smooth", block: "start" });
}));
$("#new-game-btn").addEventListener("click", newGame);
$("#export-save-btn").addEventListener("click", exportSaveFile);
$("#import-save-btn").addEventListener("click", () => ($("#import-save-input") as HTMLInputElement).click());
$("#import-save-input").addEventListener("change", (event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (file) void importSaveFile(file);
});
$("#restore-backup-btn").addEventListener("click", restorePreviousSave);
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
$("#inventory-set-filter").addEventListener("change", (event) => { inventorySetFilter = (event.target as HTMLSelectElement).value; inventoryVisibleLimit = 60; pageRegistry.render("arsenal", { force: true, animate: false }); });
$("#inventory-rarity-filter").addEventListener("change", (event) => { inventoryRarityFilter = (event.target as HTMLSelectElement).value as Rarity | "all"; inventoryVisibleLimit = 60; pageRegistry.render("arsenal", { force: true, animate: false }); });
$("#inventory-sort").addEventListener("change", (event) => { inventorySort = (event.target as HTMLSelectElement).value as "newest" | "oldest"; inventoryVisibleLimit = 60; pageRegistry.render("arsenal", { force: true, animate: false }); });
$("#inventory-more").addEventListener("click", () => { inventoryVisibleLimit += 60; pageRegistry.render("arsenal", { force: true, animate: false }); });
$("#inventory-sell-unequipped").addEventListener("click", () => {
  if (!game) return;
  const equippedIds = new Set(Object.values(game.save.hero.equipped));
  const count = game.save.hero.inventory.filter((item) => !equippedIds.has(item.id) && game!.canSell(item.id)).length;
  if (count === 0) return;
  if (!window.confirm(`Продать все неиспользуемые предметы (${count})? Регалии короны и надетые вещи останутся у героя.`)) return;
  const scrollTop = window.scrollY;
  game.sellUnequipped();
  persist(); renderHeader(); pageRegistry.render("arsenal", { force: true, animate: false }); window.scrollTo(0, scrollTop);
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
$("#dismiss-tournament-reminder").addEventListener("click", () => {
  dismissedTournamentReminderKey = tournamentReminderKey(tournamentsScheduledToday());
  $("#tournament-reminder").hidden = true;
});
$("#dismiss-loot-reminder").addEventListener("click", advanceLootReminder);
$("#loot-reminder").addEventListener("pointerenter", () => setLootReminderPaused(true));
$("#loot-reminder").addEventListener("pointerleave", () => {
  if (!$("#loot-reminder").contains(document.activeElement)) setLootReminderPaused(false);
});
$("#loot-reminder").addEventListener("focusin", () => setLootReminderPaused(true));
$("#loot-reminder").addEventListener("focusout", (event) => {
  const next = (event as FocusEvent).relatedTarget;
  if (!(next instanceof Node) || !$("#loot-reminder").contains(next)) setLootReminderPaused(false);
});
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
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#tutorial-layer").hidden) finishTutorial();
});
window.addEventListener("resize", scheduleTutorialPosition);
window.addEventListener("scroll", scheduleTutorialPosition, { passive: true });
const navigateFromHash = () => {
  if (!game) return;
  showPage(pageFromHash(location.hash, PAGE_IDS, "map"), true, true, true, false);
};
window.addEventListener("hashchange", navigateFromHash);
window.addEventListener("popstate", navigateFromHash);
$("#skip-battle").addEventListener("click", skipBattle);
$("#manual-battle-step").addEventListener("click", () => confirmManualBattleTurn());
$("#close-battle").addEventListener("click", closeBattle);
window.addEventListener("beforeunload", () => persist());

bootstrap();
