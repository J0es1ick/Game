import {
  BattleAction,
  BattleActionOption,
  BattleSession,
  CombatOptions,
  combatantSnapshot,
  resolveCombat,
  unlockedSkills,
} from "./AdvancedBattle";
import {
  ARENAS,
  CLASS_DEFINITIONS,
  DUEL_BOSSES,
  DUEL_TIERS,
  DUNGEONS,
  ENDGAME_ACTIVITIES,
  EQUIPMENT_SETS,
  ITEM_TEMPLATES,
  RARITY_LABELS,
  RARITY_ORDER,
  SKILLS,
} from "../catalogs/WorldCatalog";
import { calculateItemPrice, createItem, createStarterItems, equipmentScore, ItemCreationOptions, itemPower } from "../factories/ItemFactory";
import { equipmentItemsForLoadout, evaluateCombatantPower, findBestEquipmentLoadout } from "./EquipmentLoadout";
import { buyTemperingMarks, temperingMarkPrice } from "./ShopSupplies";
import {
  CLASS_RELIC_EPITHETS,
  DEFAULT_TACTICAL_PROFILES,
  EXPEDITION_CHOICES,
  FACTIONS,
  factionReputationTier,
  FIGHTER_SCARS,
  FIGHTER_TRAITS,
  RELIC_PATHS,
  RELIC_TIER_THRESHOLDS,
  TOURNAMENT_RULES,
} from "../catalogs/WorldExpansionCatalog";
import {
  ActivityAvailability,
  ActivityDefinition,
  ArenaDefinition,
  BattleReport,
  BossDefinition,
  ContractObjective,
  ContractOffer,
  ContextualTutorialId,
  DailyActivityReport,
  DuelDefinition,
  DungeonDefinition,
  DungeonExpedition,
  EnemyProfile,
  EquipmentItem,
  EquipmentSlot,
  ExpeditionChoice,
  ExpeditionShrineChoice,
  ExpeditionShrineChoiceId,
  ExpeditionStepReport,
  FighterFeatureChange,
  GameSave,
  HeroClass,
  HeroProfile,
  LegacyHeroRecord,
  LeaderboardEntry,
  MentorRecord,
  NewGamePlusOptions,
  NewGamePlusStatus,
  NpcGoal,
  PendingBattle,
  PendingBattleFinalization,
  PendingTournamentState,
  Rarity,
  ShopOffer,
  SkillDefinition,
  Stats,
  TacticalProfile,
  TournamentMatch,
  TournamentReport,
  WorldFeatureId,
  WorldFeatureUnlock,
  WorldEvent,
  WorldRelicRecord,
} from "./WorldTypes";
import {
  enemyExperienceRequirement,
  heroExperienceRequirement,
} from "./ProgressionBalance";
import {
  buildLegacyArchive,
  defaultLegacyState,
  describeLegacyArchiveInfluence,
  epochDifficultyModifiers,
  epochFinalGoalProgress,
  eraLawModifiers,
  improveMinimumRarity,
  inheritedSkillSupportsClass,
  inheritArchiveStyleMemory,
  newGamePlusStatus,
  normalizeLegacyState,
  prepareInheritedItem,
  rewardModifiers,
  RewardContext,
} from "./NewGamePlus";
import { ERA_LAWS, LEGACY_BOONS } from "../catalogs/NewGamePlusCatalog";
import {
  byLeaderboardPosition,
  calculateEnemyWorldRating,
  calculateHeroWorldRating,
  enemyLeaderboardEntry,
  heroLeaderboardEntry,
} from "./WorldRanking";
import {
  ENEMY_ARENA_CHAMPIONSHIP_MIGRATION,
  normalizeWorldSave,
  PENDING_BATTLE_MIGRATION,
  PROGRESSION_CURVE_MIGRATION,
  STAGED_WORLD_FEATURES_MIGRATION,
} from "./WorldSaveMigration";
import { considerNpcLoot } from "./NpcEquipment";
import { assertRestorableWorldSave } from "./WorldSaveValidation";
import { createWorldRandomSnapshots, WorldRandomStreams } from "./WorldRandom";
import { RandomSource, SeededRandom } from "./RandomSource";
import { TournamentEngine } from "./TournamentEngine";
import { eventReferencesFighter, StructuredWorldEventPayload } from "./WorldEvents";
import {
  completeDungeonExploration,
  createDungeonDiscoveryState,
  dungeonMerchantTerms,
  DungeonRouteNode,
  generateDungeonRoute,
  normalizeDungeonDiscoveryState,
  reachableDungeonNodes,
  recordDungeonNodeVisit,
  resolveDungeonTrap,
  selectPersistentDungeonRival,
} from "./DungeonRoute";
import { availableNarrativeEvents, NARRATIVE_EVENTS, NarrativeChoice, NarrativeEventDefinition } from "./NarrativeEvents";
import { awardCrownSeasonPoints, createCrownSeason, CrownSeasonResult, CrownSeasonState } from "./CrownSeason";
import { factionModifier, unlockedFactionPerks } from "./FactionSystem";
import { expeditionBattleExertion, expeditionStaminaAfterBattle } from "./ExpeditionStamina";
import { relicDustYield } from "./EquipmentLegacy";
import {
  BestEquipmentEvaluation,
  evaluateBestEquipment,
  LootTarget,
  ReforgeRequest,
  ReforgeResult,
  reforgeCost,
  reforgeProperty,
  rollTargetedLoot,
} from "./LootProgression";
import { buildRivalScoutingReport, RivalScoutingReport } from "./RivalrySystem";
import {
  createEraChallengeProgress,
  eraChallengeFor,
  EraChallenge,
  EraObjectiveProgress,
  evaluateEraObjective,
  recordEraMetric,
} from "./EraChallenges";
import { MAX_ACTIVE_SKILLS } from "./WorldRules";
import {
  createFactionControlState,
  createWorldRelicRecord,
  FACTION_CONTROL_EFFECTS,
  normalizeWorldRelics,
  NPC_ACTIVITIES,
  NPC_GOALS,
} from "./LivingWorld";
import {
  countermeasureDefinition,
  createEnemyStyleMemory,
  decayEnemyStyleMemory,
  EnemyMemoryCombatRead,
  heroLoadoutSignature,
  memoryStageDefinition,
  memoryStageFor,
  readEnemyStyleMemory,
  recordEnemyStyleMemory,
} from "./EnemyMemory";
import {
  createWorldFeatureUnlock,
  WORLD_FEATURE_IDS,
  worldFeatureAvailability,
} from "./WorldFeatureProgression";
import {
  advanceNpcCareerSeason,
  chooseNpcArenaOpponent,
  cleanupNpcLifeReferences,
  createNpcLifeWorldState,
  createNpcPlanningContext,
  evolveNpcRelationships,
  normalizeNpcLifeWorldState,
  npcReferenceRetentionIds,
  planNpcDay,
  recordNpcAlliance,
  recordNpcEncounter,
  recordNpcPlanOutcome,
  refreshFutureBossAvailability,
  refreshNpcIdentity,
  type FutureBossRecord,
  type NpcLifeProfile,
} from "./NpcLifeSimulation";
import {
  awardWorldEliteSeasonPoints,
  awardWorldSeasonPoints,
  closeWorldSeason,
  createWorldSeason,
  rememberWorldSeasonFighters,
  worldSeasonRule,
  worldSeasonStandings as calculateWorldSeasonStandings,
  type WorldSeasonResult,
  type WorldSeasonStanding,
} from "./WorldSeason";
import {
  applyFactionReputationChange,
  changeFactionInfluence,
  factionArenaReward,
  factionDungeonReward,
  factionHostility,
  factionShopPrice,
  improveFactionMinimumRarity,
  resolveFactionControlCycle,
} from "./FactionEconomy";
import {
  assertWorldRelicEligible,
  deriveWorldRelicLegacy,
  isWorldRelicEligible,
  placeWorldRelicInShop,
  releaseWorldRelic,
  synchronizeWorldRelic,
  transferWorldRelic,
} from "./WorldRelics";
import { EquipmentDeedKind, recordEquipmentDeed } from "./EquipmentEvolution";
import { resolveNpcCombat } from "./NpcCombat";
import {
  claimFactionCampaignReward,
  factionCampaignViews,
  factionMentorAccess,
  recordFactionCampaignEvent,
  type FactionCampaignEventKind,
} from "./FactionCampaign";

const enemyNames = [
  "Бран", "Хельга", "Торен", "Сив", "Мартен", "Рута", "Кай", "Орса", "Флинт", "Лисса",
  "Гектор", "Нима", "Валлен", "Ингрид", "Кроу", "Мара", "Отис", "Сальма", "Рен", "Ивар",
  "Далия", "Бор", "Элин", "Стерн", "Кира", "Фарен", "Юна", "Грей", "Тиль", "Ада",
];
const enemyTitles = ["нищий с моста", "бывший стражник", "портовый стрелок", "ученик лекаря", "беглый оруженосец", "бродячий дуэлянт", "хранитель ворот", "последний из артели"];
const enemyOrigins = ["Нижний город", "Пепельная слобода", "Северный тракт", "Рыбацкий квартал", "Старые казармы", "Чёрный хребет"];
const classes = Object.keys(CLASS_DEFINITIONS) as HeroClass[];

const VISUAL_TEST_CATALOG_CLEANUP_MIGRATION = "remove-visual-test-catalog-v1";
const ELITE_SIZE = 30;
const LEGEND_COUNT = 5;
const EXPEDITION_SHRINE_CHOICES: readonly ExpeditionShrineChoice[] = [
  {
    id: "blood-oath",
    name: "Клятва крови",
    description: "Оставить часть жизненной силы алтарю и наносить больше урона до конца похода.",
    cost: "-14% запаса сил",
    benefit: "+18% к атаке в оставшихся боях",
  },
  {
    id: "guardian-vow",
    name: "Клятва хранителя",
    description: "Пожертвовать частью найденных монет ради защиты и более ценной добычи.",
    cost: "-20% накопленных монет",
    benefit: "+16% к защите и +12% к шансу целевой добычи",
  },
];
const CROWN_LEAGUE_INTERVAL = 10;
const CROWN_LEAGUE_SCHEDULE_MIGRATION = "crown-league-ten-day-schedule-v1";
const CROWN_SET_ID = "crown-sovereign";
const ARENA_POPULATION_TARGET = 16;
const ARENA_POPULATION_BASE_FLOOR = 12;
const ARENA_POPULATION_RESERVE = 4;
const BACKGROUND_LETHALITY_SCALE = 0.08;
const CONTRACT_LIFETIME = 7;
const ACTIVE_INJURY_CHANCE = 0.24;
export const CLASS_CHANGE_GOLD_COST = 25_000;
export const CLASS_CHANGE_MARK_COST = 5;
const TEMPERING_MARK_COSTS = [1, 2, 3, 5, 8] as const;
let eliteRegaliaTemplateIds: ReadonlySet<string> | undefined;

function pendingOpeningRound(seedIds: string[]): Array<[string, string?]> {
  const targetSize = 2 ** Math.ceil(Math.log2(seedIds.length));
  const byeCount = targetSize - seedIds.length;
  if (byeCount <= 0) {
    const pairs: Array<[string, string?]> = [];
    for (let index = 0; index < seedIds.length; index += 2) pairs.push([seedIds[index], seedIds[index + 1]]);
    return pairs;
  }
  const byes = seedIds.slice(0, byeCount).map((id): [string, string?] => [id]);
  const playing = seedIds.slice(byeCount);
  const matches: Array<[string, string?]> = [];
  for (let index = 0; index < playing.length / 2; index += 1) {
    matches.push([playing[index], playing[playing.length - 1 - index]]);
  }
  if (byes.length === 2) return [byes[0], ...matches, byes[1]];
  return [...byes, ...matches];
}

function starterEquipment(classId: HeroClass, random: RandomSource): { inventory: EquipmentItem[]; equipped: HeroProfile["equipped"] } {
  const inventory = createStarterItems(classId, random);
  const equipped: HeroProfile["equipped"] = {};
  inventory.forEach((item) => { equipped[item.slot] = item.id; });
  return { inventory, equipped };
}

export class WorldGame {
  public readonly save: GameSave;
  private readonly random: WorldRandomStreams;
  private featureChanges: FighterFeatureChange[] = [];
  private automaticLegendDefense?: BattleReport;

  private constructor(save: GameSave) {
    this.save = save;
    this.random = new WorldRandomStreams(save);
  }

  public static create(name: string, classId: HeroClass, now = Date.now()): WorldGame {
    const tournamentRuleSeed = Math.max(1, now % 999_999);
    const starterRandom = new SeededRandom(`${tournamentRuleSeed}:loot`);
    const starter = starterEquipment(classId, starterRandom);
    const hero: HeroProfile = {
      id: "hero", name: name.trim() || "Безымянный", classId, level: 1, experience: 0,
      experienceToNextLevel: heroExperienceRequirement(1), gold: 180, temperingMarks: 0, rating: 1000, wins: 0, losses: 0,
      tournamentMatchWins: 0, tournamentMatchLosses: 0, duelWins: 0, duelLosses: 0,
      dungeonWins: 0, dungeonLosses: 0, bossWins: 0, kills: 0, rivalries: {},
      arenaWins: ARENAS.map(() => 0), highestArena: 0, inventory: starter.inventory,
      equipped: starter.equipped, autoEquipBest: false, autoSelectSkills: true, selectedSkillIds: [], combatMode: "auto",
      traitIds: [FIGHTER_TRAITS[classes.indexOf(classId) % FIGHTER_TRAITS.length].id], scarIds: [], injuries: [],
      tacticalProfiles: DEFAULT_TACTICAL_PROFILES.map((profile) => ({ ...profile })), activeTacticalProfileId: "balanced",
      relicDust: 0, factionReputation: Object.fromEntries(FACTIONS.map((faction) => [faction.id, 0])),
      crownLeaguePoints: 0, crownLeagueWins: 0, legendHuntWins: 0, legendDefenses: 0,
      autoResolveLegendChallenges: false, classChanges: 0,
      appearance: { hairStyle: 0, faceStyle: 0 }, createdAt: now,
    };
    const randomSnapshots = createWorldRandomSnapshots(tournamentRuleSeed);
    randomSnapshots.loot = starterRandom.snapshot();
    const save: GameSave = {
      version: 3, migrations: [PROGRESSION_CURVE_MIGRATION, STAGED_WORLD_FEATURES_MIGRATION, ENEMY_ARENA_CHAMPIONSHIP_MIGRATION, PENDING_BATTLE_MIGRATION, CROWN_LEAGUE_SCHEDULE_MIGRATION], hero, enemies: [], worldDay: 1, lastSimulatedAt: now,
      dungeonClears: {}, shopDay: 1, shopOffers: [],
      factionControl: createFactionControlState(1), mentors: [], worldRelics: [],
      npcLife: createNpcLifeWorldState(1),
      worldSeason: createWorldSeason(1, 1, new SeededRandom(`${tournamentRuleSeed}:world-season:1`)),
      worldSeasonHistory: [], dungeonDiscoveries: {},
      discoveredItems: starter.inventory.map((item) => item.templateId), tournamentRegistrations: {}, defeatedBosses: [],
      huntedLegendIds: [], eliteLeagueMemberIds: [], eliteRatings: {}, eliteCrownWins: {}, tutorialCompleted: false, events: [],
      legacy: defaultLegacyState(), defeatedLegacyCycles: [],
      seenContextualTutorialIds: [], unlockedFeatureIds: [], pendingFeatureUnlocks: [],
      contractOffers: [], completedContracts: 0, tournamentRuleSeed,
      seenNarrativeEventIds: [],
      crownSeason: createCrownSeason(1, 1, TOURNAMENT_RULES.map((rule) => rule.id), new SeededRandom(`${tournamentRuleSeed}:crown-season:1`)),
      reforgeAttempts: {},
      eraChallengeProgress: createEraChallengeProgress(1),
      randomSnapshots,
    };
    const game = new WorldGame(save);
    ARENAS.forEach((_, arenaIndex) => {
      for (let index = 0; index < 19; index += 1) game.save.enemies.push(game.createEnemy(arenaIndex));
    });
    game.ensureEliteLeague();
    game.save.npcLife = normalizeNpcLifeWorldState(game.save.npcLife, game.save.enemies, game.save.worldDay);
    game.syncCrownSeason();
    game.syncCrownSet();
    game.ensurePopulations(true);
    game.rotateShop();
    game.event("system", `${hero.name} начал путь в Нижнем городе.`);
    return game;
  }

  public static restore(save: unknown): WorldGame {
    assertRestorableWorldSave(save);
    const game = new WorldGame(normalizeWorldSave(save));
    game.migrateCrownLeagueSchedule();
    game.save.npcLife = normalizeNpcLifeWorldState(game.save.npcLife, game.save.enemies, game.save.worldDay);
    game.save.enemies.forEach((enemy) => { enemy.rating = game.enemyWorldRating(enemy); });
    game.ensureEliteLeague();
    game.syncCrownSeason();
    game.syncCrownSet();
    game.ensurePopulations(false, false);
    game.cleanupVisualTestCatalog();
    game.recalculateHeroRating();
    game.syncFeatureUnlocks();
    game.refreshContracts(false);
    return game;
  }

  public get activities(): Array<ArenaDefinition | DungeonDefinition> { return [...ARENAS, ...DUNGEONS]; }

  public factionController(arenaId: string): { id: string; name: string; accent: string; effect: string } {
    const factionId = this.save.factionControl?.arenaControllers[arenaId] ?? FACTIONS[0].id;
    const faction = FACTIONS.find((candidate) => candidate.id === factionId) ?? FACTIONS[0];
    return { ...faction, effect: FACTION_CONTROL_EFFECTS[faction.id]?.arena ?? "" };
  }

  public shopController(): { id: string; name: string; accent: string; effect: string; priceModifier: number } {
    const factionId = this.save.factionControl?.shopControllerId ?? FACTIONS[0].id;
    const faction = FACTIONS.find((candidate) => candidate.id === factionId) ?? FACTIONS[0];
    return {
      ...faction,
      effect: FACTION_CONTROL_EFFECTS[faction.id]?.shop ?? "",
      priceModifier: factionShopPrice(1_000, faction.id, this.save.hero.factionReputation[faction.id] ?? 0) / 1_000,
    };
  }

  public livingMentors(): MentorRecord[] {
    return [...(this.save.mentors ?? [])].sort((first, second) => second.rating - first.rating || second.retiredDay - first.retiredDay);
  }

  public worldRelicChronicle(): WorldRelicRecord[] {
    return [...(this.save.worldRelics ?? [])].sort((first, second) => second.createdDay - first.createdDay);
  }

  public fighterSchool(fighterId: string): { name: string; mentorName: string; isMentor: boolean } | undefined {
    const mentors = this.save.mentors ?? [];
    const mentor = mentors.find((candidate) => candidate.fighterId === fighterId)
      ?? mentors.find((candidate) => candidate.studentIds.includes(fighterId));
    if (!mentor) return undefined;
    const dynasty = this.save.npcLife?.dynasties.find((candidate) => candidate.id === mentor.dynastyId);
    return {
      name: mentor.schoolName ?? dynasty?.name ?? `Школа «${mentor.name}»`,
      mentorName: mentor.name,
      isMentor: mentor.fighterId === fighterId,
    };
  }

  public currentWorldSeason() {
    const season = this.save.worldSeason!;
    return {
      ...season,
      arenaPoints: Object.fromEntries(Object.entries(season.arenaPoints).map(([arenaId, points]) => [arenaId, { ...points }])),
      elitePoints: { ...season.elitePoints },
      fighterNames: { ...season.fighterNames },
      rule: worldSeasonRule(season.ruleId),
      remainingDays: Math.max(0, season.endsDay - this.save.worldDay + 1),
    };
  }

  public completedWorldSeasons(): WorldSeasonResult[] {
    return [...(this.save.worldSeasonHistory ?? [])].reverse().map((season) => ({
      ...season,
      champions: season.champions.map((standing) => ({ ...standing })),
      eliteChampion: season.eliteChampion ? { ...season.eliteChampion } : undefined,
      promotedIds: [...season.promotedIds],
      demotedIds: [...season.demotedIds],
      retiredIds: [...season.retiredIds],
      mentorIds: [...season.mentorIds],
      newcomerIds: [...season.newcomerIds],
    }));
  }

  public worldSeasonLeaderboard(arenaId?: string): WorldSeasonStanding[] {
    const standings = calculateWorldSeasonStandings(this.save.worldSeason!, this.save.enemies, this.save.hero.name);
    return arenaId ? standings.filter((standing) => standing.arenaId === arenaId) : standings;
  }

  public npcLifeProfile(fighterId: string): NpcLifeProfile | undefined {
    const profile = this.save.npcLife?.profiles[fighterId];
    return profile ? { ...profile } : undefined;
  }

  public npcDynasties() {
    return [...(this.save.npcLife?.dynasties ?? [])]
      .sort((first, second) => second.prestige - first.prestige)
      .map((dynasty) => ({ ...dynasty, memberIds: [...dynasty.memberIds] }));
  }

  public factionCampaigns() {
    return factionCampaignViews(this.save.factionCampaigns ?? {}, this.save.hero.factionReputation);
  }

  public claimFactionCampaign(factionId: string) {
    this.requireFeature("contracts");
    this.assertNoPendingBattle();
    const claim = claimFactionCampaignReward(this.save.factionCampaigns ?? {}, this.save.hero.factionReputation, factionId);
    const templates = claim.reward.slots.map((slot) => ITEM_TEMPLATES.find((template) =>
      template.setId === claim.reward.setId && template.slot === slot
      && (template.allowedClasses === "all" || template.allowedClasses.includes(this.save.hero.classId))));
    if (templates.some((template) => !template)) throw new Error("Награда фракции недоступна для выбранного класса.");
    const items = templates.map((template) => createItem(this.save.hero.level, {
      classId: this.save.hero.classId,
      templateId: template!.id,
      rarity: claim.reward.rarity,
      randomSource: this.random.loot,
    }));
    this.save.factionCampaigns = claim.state;
    this.save.hero.gold += claim.reward.gold;
    this.save.hero.temperingMarks += claim.reward.seals;
    items.forEach((item) => this.addItem(item));
    const factionName = FACTIONS.find((faction) => faction.id === factionId)?.name ?? factionId;
    this.event("loot", `${factionName}: поручение завершено. Получены ${items.map((item) => item.name).join(", ")}, ${claim.reward.gold} монет и ${claim.reward.seals} печатей.`);
    return { items, gold: claim.reward.gold, seals: claim.reward.seals, mentorAccess: claim.reward.mentorAccess };
  }

  public factionMentors() {
    return factionMentorAccess(this.save.factionCampaigns ?? {}, this.save.hero.factionReputation).map((access) => ({
      ...access,
      name: this.save.mentors?.find((mentor) => mentor.factionId === access.factionId)?.name
        ?? `Школа: ${FACTIONS.find((faction) => faction.id === access.factionId)?.name ?? access.factionId}`,
    }));
  }

  public trainWithFactionMentor(factionId: string): DailyActivityReport {
    const mentor = this.factionMentors().find((candidate) => candidate.factionId === factionId);
    if (!mentor) throw new Error("Сначала выполните первое поручение этой фракции и сохраните её доверие.");
    return this.trainingDay(mentor.experienceMultiplier, mentor.name);
  }

  public availableFutureBosses(): FutureBossRecord[] {
    return (this.save.npcLife?.futureBosses ?? []).filter((boss) => boss.status === "available").map((boss) => ({ ...boss }));
  }

  public futureBossAvailability(bossId: string): ActivityAvailability {
    const boss = this.save.npcLife?.futureBosses.find((candidate) => candidate.id === bossId);
    if (!boss) return { unlocked: false, reason: "Эта история ещё не породила особого противника." };
    if (boss.status === "defeated") return { unlocked: false, reason: "Этот противник уже побеждён и остался в летописи." };
    if (boss.status === "dormant") {
      return { unlocked: false, reason: `След противника проявится не раньше дня ${boss.earliestAppearanceDay}.` };
    }
    return { unlocked: true, reason: `${boss.reason} Ожидаемая сила: уровень ${boss.powerLevel}.` };
  }

  public beginFutureBossFight(bossId: string): PendingBattle {
    this.assertNoPendingBattle();
    const availability = this.futureBossAvailability(bossId);
    if (!availability.unlocked) throw new Error(availability.reason);
    const boss = this.save.npcLife!.futureBosses.find((candidate) => candidate.id === bossId)!;
    this.prepareDayActivity();
    return this.createPendingBattle(
      "world-encounter",
      boss.id,
      this.futureBossEnemy(boss),
      {},
      "boss",
      undefined,
      { encounterType: "future-boss", futureBossId: boss.id, eventCursor: this.latestEventId() },
    );
  }

  public factionHunter(): EnemyProfile | undefined {
    return this.save.pendingFactionHunterId ? this.enemyById(this.save.pendingFactionHunterId) : undefined;
  }

  public factionHunterAvailability(): ActivityAvailability {
    const hunter = this.factionHunter();
    if (!hunter?.alive) return { unlocked: false, reason: "Ни одна враждебная фракция пока не отправила охотника." };
    const faction = FACTIONS.find((candidate) => candidate.id === hunter.factionId);
    return {
      unlocked: true,
      reason: `${faction?.name ?? "Враждебная фракция"} отправила ${hunter.name}. Победа ослабит давление и принесёт трофей.`,
    };
  }

  public beginFactionHunterFight(): PendingBattle {
    this.assertNoPendingBattle();
    const availability = this.factionHunterAvailability();
    const hunter = this.factionHunter();
    if (!availability.unlocked || !hunter) throw new Error(availability.reason);
    this.prepareDayActivity();
    return this.createPendingBattle(
      "world-encounter",
      `faction-hunter-${hunter.factionId ?? "unknown"}`,
      hunter,
      {},
      "duel",
      undefined,
      {
        encounterType: "faction-hunter",
        factionId: hunter.factionId,
        eventCursor: this.latestEventId(),
      },
    );
  }

  public npcGoal(goal: NpcGoal | undefined): { name: string; description: string } {
    return NPC_GOALS[goal ?? "champion"];
  }

  public pendingNarrativeEvent(): NarrativeEventDefinition | undefined {
    return NARRATIVE_EVENTS.find((event) => event.id === this.save.pendingNarrativeEventId);
  }

  public resolveNarrativeChoice(choiceId: string): { event: NarrativeEventDefinition; choice: NarrativeChoice } {
    const event = this.pendingNarrativeEvent();
    if (!event) throw new Error("Ожидающего решения события нет.");
    const choice = event.choices.find((candidate) => candidate.id === choiceId);
    if (!choice) throw new Error("Такого решения у события нет.");
    const effect = choice.effect;
    if (this.save.hero.gold + (effect.gold ?? 0) < 0) throw new Error("Для этого решения недостаточно монет.");

    this.save.hero.gold += effect.gold ?? 0;
    if (effect.experience) this.gainHeroExperience(effect.experience);
    this.save.hero.temperingMarks += effect.temperingMarks ?? 0;
    Object.entries(effect.reputation ?? {}).forEach(([factionId, delta]) => {
      this.save.hero.factionReputation[factionId] = Math.max(-20, (this.save.hero.factionReputation[factionId] ?? 0) + delta);
    });
    if (effect.injuryRecovery) {
      this.save.hero.injuries.forEach((injury) => {
        injury.remainingDays = Math.max(0, injury.remainingDays - effect.injuryRecovery!);
      });
    }
    if (effect.rivalryIntensity) {
      const rivalry = Object.values(this.save.hero.rivalries).sort((first, second) => second.lastMetDay - first.lastMetDay)[0];
      if (rivalry) rivalry.intensity = Math.max(0, (rivalry.intensity ?? 0) + effect.rivalryIntensity);
    }
    this.save.seenNarrativeEventIds = [...new Set([...this.save.seenNarrativeEventIds, event.id])];
    this.save.pendingNarrativeEventId = undefined;
    this.syncDerivedEraProgress();
    this.event("system", `${event.title}: ${choice.label}.`, {
      kind: "narrative", eventId: event.id, choiceId: choice.id, fighterId: "hero", fighterName: this.save.hero.name,
    });
    return { event, choice };
  }

  public currentCrownSeason(): CrownSeasonState {
    return {
      ...this.save.crownSeason,
      ruleIds: [...this.save.crownSeason.ruleIds],
      points: { ...this.save.crownSeason.points },
      defenses: { ...this.save.crownSeason.defenses },
    };
  }

  public lastCompletedCrownSeason(): CrownSeasonResult | undefined {
    return this.save.lastCrownSeasonResult ? { ...this.save.lastCrownSeasonResult } : undefined;
  }

  public crownSeasonStandings(): Array<{ fighterId: string; name: string; points: number; defenses: number }> {
    return Object.entries(this.save.crownSeason.points)
      .map(([fighterId, points]) => ({
        fighterId,
        name: this.fighterById(fighterId)?.name ?? fighterId,
        points,
        defenses: this.save.crownSeason.defenses[fighterId] ?? 0,
      }))
      .sort((first, second) => second.points - first.points || second.defenses - first.defenses || first.name.localeCompare(second.name));
  }

  public setLootTarget(target?: LootTarget): void {
    if (!target) {
      this.save.lootTarget = undefined;
      this.save.lootPity = undefined;
      return;
    }
    if (!target.slot && !target.setId) throw new Error("Выберите слот или комплект для целевой охоты.");
    const compatible = ITEM_TEMPLATES.some((template) =>
      (!target.slot || template.slot === target.slot)
      && (!target.setId || template.setId === target.setId)
      && (template.allowedClasses === "all" || template.allowedClasses.includes(this.save.hero.classId))
      && !template.exclusiveToBoss && !template.exclusiveToElite && !template.exclusiveToFaction);
    if (!compatible) throw new Error("Для текущего класса нет предметов выбранной цели.");
    this.save.lootTarget = { ...target };
    const key = `${target.slot ?? "any"}:${target.setId ?? "any"}`;
    if (this.save.lootPity?.targetKey !== key) this.save.lootPity = { targetKey: key, misses: 0 };
  }

  public bestEquipmentEvaluation(): BestEquipmentEvaluation {
    const hero = this.save.hero;
    return evaluateBestEquipment(equipmentItemsForLoadout(hero, findBestEquipmentLoadout(hero)), { classId: hero.classId });
  }

  public reforgeItem(itemId: string, request: Omit<ReforgeRequest, "attempt">): ReforgeResult {
    const index = this.save.hero.inventory.findIndex((item) => item.id === itemId);
    if (index < 0) throw new Error("Предмет не найден.");
    const attempt = this.save.reforgeAttempts[itemId] ?? 0;
    const source = this.save.hero.inventory[index];
    if (source.stats[request.sourceStat] === undefined) throw new Error(`У предмета нет свойства ${request.sourceStat}.`);
    if (request.targetStat && request.targetStat !== request.sourceStat && source.stats[request.targetStat] !== undefined) {
      throw new Error(`Свойство ${request.targetStat} уже присутствует на предмете.`);
    }
    const discount = Math.min(0.75, factionModifier(this.save.hero.factionReputation, "forgeDiscount"));
    const baseCost = reforgeCost(source, attempt);
    const cost = { ...baseCost, gold: Math.max(0, Math.round(baseCost.gold * (1 - discount))) };
    if (this.save.hero.gold < cost.gold) throw new Error(`Для перековки нужно ${cost.gold} монет.`);
    if (this.save.hero.temperingMarks < cost.temperingMarks) throw new Error(`Для перековки нужно печатей: ${cost.temperingMarks}.`);
    const rolled = reforgeProperty(source, { ...request, attempt }, this.random.loot);
    this.save.hero.gold -= cost.gold;
    this.save.hero.temperingMarks -= cost.temperingMarks;
    this.save.hero.inventory[index] = rolled.item;
    this.save.reforgeAttempts[itemId] = attempt + 1;
    if (rolled.item.worldRelicId) {
      const recordIndex = (this.save.worldRelics ?? []).findIndex((record) => record.id === rolled.item.worldRelicId);
      if (recordIndex >= 0) {
        this.save.worldRelics![recordIndex] = synchronizeWorldRelic(
          this.save.worldRelics![recordIndex],
          rolled.item,
          `День ${this.save.worldDay}: ${this.save.hero.name} перековал свойство реликвии.`,
          this.save.worldDay,
        );
      }
    }
    this.event("loot", `${rolled.item.name}: свойство ${request.sourceStat} перековано в ${rolled.targetStat}.`, {
      kind: "loot", fighterId: "hero", fighterName: this.save.hero.name, itemId: rolled.item.id, itemName: rolled.item.name,
    });
    return { ...rolled, cost };
  }

  public rivalScoutingReport(enemyId: string): RivalScoutingReport | undefined {
    const enemy = this.enemyById(enemyId);
    if (!enemy) return undefined;
    const equippedIds = new Set(Object.values(this.save.hero.equipped));
    const skillIds = unlockedSkills(
      this.save.hero.classId,
      this.save.hero.level,
      this.save.hero.inventory.filter((item) => equippedIds.has(item.id)),
      this.save.hero.legacySkillId ? [this.save.hero.legacySkillId] : [],
    ).map((skill) => skill.id);
    const signature = heroLoadoutSignature(this.save.hero, skillIds, this.save.worldDay);
    return buildRivalScoutingReport(enemy.heroMemory, readEnemyStyleMemory(enemy.heroMemory, signature));
  }

  public currentEraChallenge(): EraChallenge | undefined {
    return this.save.legacy.cycle >= 2 ? eraChallengeFor(this.save.legacy.cycle) : undefined;
  }

  public epochFinalGoalProgress() {
    return epochFinalGoalProgress(this.save);
  }

  public eraObjectiveProgress(): EraObjectiveProgress[] {
    const challenge = this.currentEraChallenge();
    if (!challenge) return [];
    return challenge.objectives.map((objective) => evaluateEraObjective(objective, this.save.eraChallengeProgress.metrics));
  }

  public newGamePlusStatus(): NewGamePlusStatus {
    return newGamePlusStatus(this.save);
  }

  public legacyArchives(): LegacyHeroRecord[] {
    return normalizeLegacyState(this.save.legacy).archives;
  }

  public heirloomCandidates(classId: HeroClass = this.save.hero.classId): EquipmentItem[] {
    return this.save.hero.inventory.filter((item) => {
      const template = ITEM_TEMPLATES.find((candidate) => candidate.id === item.templateId);
      if (!template || item.isVisualTestItem || template.exclusiveToElite || item.setId === CROWN_SET_ID) return false;
      const classCompatible = template.allowedClasses === "all" || template.allowedClasses.includes(classId);
      return classCompatible && inheritedSkillSupportsClass(item, classId);
    });
  }

  public beginNewChronicle(options: NewGamePlusOptions, now = Date.now()): WorldGame {
    const status = this.newGamePlusStatus();
    if (!status.unlocked) throw new Error(status.reason);
    const name = options.name.trim();
    if (name.length < 2) throw new Error("Имя наследника должно состоять минимум из двух символов.");
    if (!CLASS_DEFINITIONS[options.classId]) throw new Error("Неизвестный класс наследника.");
    const boon = LEGACY_BOONS.find((candidate) => candidate.id === options.boonId);
    if (!boon) throw new Error("Неизвестное наследие эпохи.");
    if (boon.sealCost > status.availableSeals) throw new Error("Недостаточно печатей летописи для выбранного наследия.");
    const laws = [...new Set(options.lawIds)];
    if (laws.length !== status.lawLimit || laws.some((id) => !this.isKnownEraLaw(id))) {
      throw new Error(`Для эпохи ${status.targetCycle} нужно выбрать законов: ${status.lawLimit}.`);
    }
    const sourceItem = options.heirloomItemId
      ? this.save.hero.inventory.find((item) => item.id === options.heirloomItemId)
      : undefined;
    if (options.heirloomItemId && !sourceItem) throw new Error("Выбранный предмет-наследие не найден.");
    if (sourceItem && !this.heirloomCandidates(options.classId).some((item) => item.id === sourceItem.id)) {
      throw new Error("Этот предмет нельзя передать герою выбранного класса.");
    }

    const archive = buildLegacyArchive(this.save, now);
    const previousLegacy = normalizeLegacyState(this.save.legacy);
    const next = WorldGame.create(name, options.classId, now);
    const nextSave = next.save;
    nextSave.legacy = {
      cycle: status.targetCycle,
      seals: status.availableSeals - boon.sealCost,
      totalSealsEarned: previousLegacy.totalSealsEarned + status.sealsAwarded,
      activeBoonId: boon.id,
      activeLawIds: laws,
      discoveredSkillIds: [...new Set([
        ...previousLegacy.discoveredSkillIds,
        ...this.save.hero.inventory.map((item) => item.grantedSkillId).filter((id): id is string => Boolean(id)),
        ...(this.save.hero.legacySkillId ? [this.save.hero.legacySkillId] : []),
      ])],
      archives: [...previousLegacy.archives, archive],
    };
    nextSave.defeatedLegacyCycles = [...this.save.defeatedLegacyCycles];
    nextSave.discoveredItems = [...new Set([...this.save.discoveredItems, ...nextSave.discoveredItems])];
    nextSave.tutorialCompleted = true;
    nextSave.seenContextualTutorialIds = [...this.save.seenContextualTutorialIds];
    nextSave.hero.appearance = { ...this.save.hero.appearance };
    nextSave.hero.autoEquipBest = this.save.hero.autoEquipBest;
    nextSave.hero.autoSelectSkills = this.save.hero.autoSelectSkills;
    nextSave.hero.combatMode = this.save.hero.combatMode;
    nextSave.hero.autoResolveLegendChallenges = this.save.hero.autoResolveLegendChallenges;
    nextSave.hero.tacticalProfiles = this.save.hero.tacticalProfiles.map((profile) => ({ ...profile }));
    nextSave.hero.activeTacticalProfileId = this.save.hero.activeTacticalProfileId;
    nextSave.hero.factionReputation = Object.fromEntries(FACTIONS.map((faction) => [
      faction.id,
      Math.floor((this.save.hero.factionReputation[faction.id] ?? 0) * 0.2) + (boon.id === "court-name" ? 8 : 0),
    ]));
    nextSave.factionControl = {
      arenaControllers: { ...(this.save.factionControl?.arenaControllers ?? {}) },
      arenaInfluence: Object.fromEntries(Object.entries(this.save.factionControl?.arenaInfluence ?? {}).map(([arenaId, influence]) => [
        arenaId,
        { ...influence },
      ])),
      dungeonControllers: { ...(this.save.factionControl?.dungeonControllers ?? {}) },
      dungeonInfluence: Object.fromEntries(Object.entries(this.save.factionControl?.dungeonInfluence ?? {}).map(([dungeonId, influence]) => [
        dungeonId,
        { ...influence },
      ])),
      relations: Object.fromEntries(Object.entries(this.save.factionControl?.relations ?? {}).map(([factionId, relations]) => [
        factionId,
        { ...relations },
      ])),
      shopControllerId: this.save.factionControl?.shopControllerId ?? FACTIONS[0].id,
      shopOwnerMentorId: this.save.factionControl?.shopOwnerMentorId,
      shopPriceRevision: this.save.factionControl?.shopPriceRevision ?? 0,
      lastShiftDay: 1,
    };
    nextSave.mentors = (this.save.mentors ?? []).slice(0, 12).map((mentor) => ({
      ...mentor,
      retiredDay: 1,
      studentIds: [],
      legacy: `${mentor.legacy} Его школа пережила смену эпохи.`,
    }));
    const survivingSchools = new Set(nextSave.mentors.map((mentor) => mentor.dynastyId).filter(Boolean));
    nextSave.npcLife!.dynasties = (this.save.npcLife?.dynasties ?? [])
      .filter((dynasty) => survivingSchools.has(dynasty.id))
      .map((dynasty) => ({ ...dynasty, foundedDay: 1, memberIds: [dynasty.founderId] }));
    nextSave.mentors.forEach((mentor) => {
      if (mentor.dynastyId && !nextSave.npcLife!.dynasties.some((dynasty) => dynasty.id === mentor.dynastyId)) mentor.dynastyId = undefined;
    });
    if (!nextSave.mentors.some((mentor) => mentor.id === nextSave.factionControl?.shopOwnerMentorId)) {
      nextSave.factionControl.shopOwnerMentorId = undefined;
    }
    const archiveInfluence = describeLegacyArchiveInfluence(archive);
    const influenceFactionId = archiveInfluence.factionTradition?.factionId
      ?? FACTIONS[Math.max(0, archive.cycle - 1) % FACTIONS.length].id;
    if (archiveInfluence.mentor) {
      const students = nextSave.enemies
        .filter((enemy) => enemy.alive && enemy.classId === archiveInfluence.mentor!.classId)
        .sort((first, second) => second.level - first.level || first.id.localeCompare(second.id))
        .slice(0, 3);
      const mentor: MentorRecord = {
        id: archiveInfluence.mentor.id,
        fighterId: `legacy-hero-${archive.cycle}`,
        name: archiveInfluence.mentor.name,
        classId: archiveInfluence.mentor.classId,
        factionId: influenceFactionId,
        goal: "champion",
        level: archiveInfluence.mentor.level,
        rating: archiveInfluence.mentor.rating,
        retiredDay: 1,
        studentIds: students.map((student) => student.id),
        legacy: `${archiveInfluence.summary} ${archiveInfluence.mentor.schoolName}.`,
        schoolName: archiveInfluence.mentor.schoolName,
        competes: false,
        dynastyId: `legacy-school-${archive.cycle}`,
        role: "mentor",
      };
      nextSave.mentors.unshift(mentor);
      nextSave.npcLife!.dynasties.unshift({
        id: mentor.dynastyId!,
        name: archiveInfluence.mentor.schoolName,
        founderId: mentor.fighterId,
        founderName: mentor.name,
        factionId: mentor.factionId,
        foundedDay: 1,
        memberIds: [mentor.fighterId, ...mentor.studentIds],
        prestige: Math.max(20, Math.round(archive.rating / 75) + archive.tournamentWins * 4),
      });
      students.forEach((student) => {
        student.mentorId = mentor.id;
        student.heroMemory = inheritArchiveStyleMemory(archive, 1);
        student.heroMemory.familiarity *= 0.5;
        student.heroMemory.stage = memoryStageFor(student.heroMemory.familiarity);
        student.relationships ??= {};
        student.relationships[mentor.fighterId] = {
          fighterId: mentor.fighterId,
          kind: "mentor",
          intensity: 80,
          lastChangedDay: 1,
        };
        student.history.push(`С начала эпохи обучается в школе «${archiveInfluence.mentor!.schoolName}».`);
        const profile = nextSave.npcLife!.profiles[student.id];
        if (profile) profile.dynastyId = mentor.dynastyId;
      });
    } else if (archiveInfluence.factionTradition) {
      const tradition = archiveInfluence.factionTradition;
      const followers = nextSave.enemies
        .filter((enemy) => enemy.alive && enemy.factionId === tradition.factionId)
        .sort((first, second) => second.rating - first.rating || first.id.localeCompare(second.id))
        .slice(0, 4);
      const founder: MentorRecord = {
        id: `legacy-founder-${archive.cycle}`,
        fighterId: `legacy-hero-${archive.cycle}`,
        name: archive.name,
        classId: archive.classId,
        factionId: tradition.factionId,
        goal: "elite",
        level: archive.level,
        rating: archive.rating,
        retiredDay: 1,
        studentIds: followers.map((fighter) => fighter.id),
        legacy: `${archiveInfluence.summary} Поручения этой традиции дают наследнику больше доверия и влияния.`,
        schoolName: tradition.name,
        competes: false,
        dynastyId: `legacy-tradition-${archive.cycle}`,
        role: "faction-founder",
      };
      nextSave.mentors.unshift(founder);
      nextSave.npcLife!.dynasties.unshift({
        id: founder.dynastyId!,
        name: tradition.name,
        founderId: founder.fighterId,
        founderName: founder.name,
        factionId: founder.factionId,
        foundedDay: 1,
        memberIds: [founder.fighterId, ...founder.studentIds],
        prestige: Math.max(35, Math.round(archive.rating / 55) + archive.crownLeagueWins * 15),
      });
      nextSave.hero.factionReputation[tradition.factionId] = Math.max(
        nextSave.hero.factionReputation[tradition.factionId] ?? 0,
        tradition.inheritedReputation,
      );
      Object.values(nextSave.factionControl.arenaInfluence).forEach((influence) => {
        influence[tradition.factionId] = (influence[tradition.factionId] ?? 0) + 12;
      });
      Object.values(nextSave.factionControl.dungeonInfluence ?? {}).forEach((influence) => {
        influence[tradition.factionId] = (influence[tradition.factionId] ?? 0) + 8;
      });
      followers.forEach((fighter) => {
        fighter.mentorId = founder.id;
        fighter.heroMemory = inheritArchiveStyleMemory(archive, 1);
        fighter.heroMemory.familiarity *= 0.5;
        fighter.heroMemory.stage = memoryStageFor(fighter.heroMemory.familiarity);
        fighter.history.push(`Продолжает традицию «${tradition.name}».`);
        const profile = nextSave.npcLife!.profiles[fighter.id];
        if (profile) profile.dynastyId = founder.dynastyId;
      });
    } else if (archiveInfluence.opponent?.kind === "legendary-rival") {
      const rival = next.legacyEnemy(archive);
      rival.id = archiveInfluence.opponent.id;
      rival.title = `${archive.title} · легендарный соперник эпохи ${archive.cycle}`;
      rival.origin = "Дорога между эпохами";
      rival.goal = "elite";
      rival.carriedFromCycle = archive.cycle;
      rival.joinedDay = 1;
      rival.history.push(archiveInfluence.summary);
      nextSave.enemies.push(rival);
      nextSave.npcLife!.profiles[rival.id] = {
        fighterId: rival.id,
        career: "legend",
        nickname: archive.title,
        nicknameGrantedDay: 1,
        seasonsActive: 0,
      };
    }
    nextSave.worldRelics = normalizeWorldRelics((this.save.worldRelics ?? []).map((record) => ({
      ...record,
      item: { ...record.item, stats: { ...record.item.stats }, relicHistory: [...(record.item.relicHistory ?? [])] },
      status: "lost",
      currentOwnerId: undefined,
      currentOwnerName: undefined,
      formerOwners: [...record.formerOwners],
      history: [...record.history, `Эпоха ${status.targetCycle}: реликвия пережила смену летописи и вновь затерялась в мире.`],
    })));

    if (boon.id === "masters-school") {
      nextSave.hero.legacySkillId = SKILLS
        .filter((skill) => !skill.equipmentOnly
          && (skill.classes === "all" || skill.classes.includes(options.classId))
          && skill.unlockLevel > 1)
        .sort((first, second) => second.priority - first.priority || first.unlockLevel - second.unlockLevel)[0]?.id;
    }

    if (sourceItem) {
      const inherited = prepareInheritedItem(sourceItem, options.classId, previousLegacy.cycle, this.save.hero.name, next.random.loot);
      inherited.worldRelicId = sourceItem.worldRelicId;
      next.addItem(inherited);
      nextSave.hero.equipped[inherited.slot] = inherited.id;
      nextSave.legacy.inheritedItemId = inherited.id;
      const inheritedRelic = nextSave.worldRelics.find((record) => record.id === inherited.worldRelicId);
      if (inheritedRelic) {
        inheritedRelic.status = "wielded";
        inheritedRelic.currentOwnerId = "hero";
        inheritedRelic.currentOwnerName = name;
        if (!inheritedRelic.formerOwners.includes(name)) inheritedRelic.formerOwners.push(name);
        inheritedRelic.history.push(`Эпоха ${status.targetCycle}: ${name} принял реликвию как наследие.`);
        inherited.relicHistory = [...inheritedRelic.history];
        inheritedRelic.item = { ...inherited, stats: { ...inherited.stats }, relicHistory: [...inherited.relicHistory] };
      }
    }

    archive.notableFighters.slice(0, 3).forEach((record) => {
      const veteran = next.createEnemy(Math.max(0, ARENAS.length - 2));
      veteran.name = record.name;
      veteran.title = `${record.title} · ветеран эпохи ${archive.cycle}`;
      veteran.classId = record.classId;
      veteran.level = Math.max(ARENAS[ARENAS.length - 2].enemyLevel[0], Math.min(record.level, ARENAS[ARENAS.length - 1].enemyLevel[1]));
      veteran.equipment = veteran.equipment.map((item) => createItem(veteran.level, {
        classId: veteran.classId,
        slot: item.slot,
        minimumRarity: "epic",
        randomSource: next.random.loot,
      }));
      veteran.equipped = {};
      veteran.equipment.forEach((item) => { veteran.equipped[item.slot] = item.id; });
      veteran.wins = Math.max(0, Math.floor(record.wins * 0.35));
      veteran.losses = Math.max(0, Math.floor(record.losses * 0.35));
      veteran.tournamentWins = Math.max(1, Math.floor(record.tournamentWins * 0.25));
      veteran.arenaTournamentWins = ARENAS.map((_, index) => index === veteran.arenaIndex ? veteran.tournamentWins : 0);
      veteran.carriedFromCycle = archive.cycle;
      veteran.heroMemory = inheritArchiveStyleMemory(record, 1);
      veteran.history = [`Пережил эпоху ${archive.cycle} и снова вышел на арену.`];
      veteran.rating = next.enemyWorldRating(veteran);
      nextSave.enemies.push(veteran);
    });
    next.syncEraChallenge();
    next.event("system", `Началась эпоха ${status.targetCycle}. ${name} принял наследие «${boon.name}».`);
    next.event("system", archiveInfluence.summary);
    next.ensureEliteLeague();
    next.syncCrownSet();
    return next;
  }

  public beginNewEra(options: NewGamePlusOptions, now = Date.now()): WorldGame {
    return this.beginNewChronicle(options, now);
  }

  public legacyChampionAvailability(cycle?: number): ActivityAvailability {
    const archive = cycle
      ? this.save.legacy.archives.find((candidate) => candidate.cycle === cycle)
      : this.save.legacy.archives[this.save.legacy.archives.length - 1];
    if (!archive) return { unlocked: false, reason: "В архиве ещё нет завершённых эпох." };
    const influence = describeLegacyArchiveInfluence(archive);
    if (!influence.opponent) {
      return {
        unlocked: false,
        reason: influence.mentor
          ? `${archive.name} остался в мире наставником, а не противником.`
          : `${archive.name} продолжает влиять на мир через фракционную традицию.`,
      };
    }
    if (this.save.defeatedLegacyCycles.includes(archive.cycle)) return { unlocked: false, reason: "Этот герой прошлого уже побеждён." };
    if (this.save.hero.highestArena < influence.opponent.arenaIndex || this.save.hero.level < influence.opponent.unlockLevel) {
      return {
        unlocked: false,
        reason: `Откроется на ${influence.opponent.unlockLevel} уровне после выхода на арену «${ARENAS[influence.opponent.arenaIndex].name}».`,
      };
    }
    return {
      unlocked: true,
      reason: `${influence.headline}. Победа принесёт печати летописи.`,
    };
  }

  public fightLegacyChampion(cycle?: number): BattleReport {
    this.beginLegacyChampion(cycle);
    const result = this.runPendingBattleAutomatically();
    if (!result || !("winnerId" in result)) throw new Error("Автоматический расчёт боя с героем эпохи не вернул результат.");
    return result as BattleReport;
  }

  public beginLegacyChampion(cycle?: number): PendingBattle {
    this.assertNoPendingBattle();
    const archive = cycle
      ? this.save.legacy.archives.find((candidate) => candidate.cycle === cycle)
      : this.save.legacy.archives[this.save.legacy.archives.length - 1];
    const availability = this.legacyChampionAvailability(cycle);
    if (!archive || !availability.unlocked) throw new Error(availability.reason);
    this.prepareDayActivity();
    return this.createPendingBattle("legacy-champion", `legacy-${archive.cycle}`, this.legacyEnemy(archive), {}, "boss", undefined, {
      cycle: archive.cycle,
      eventCursor: this.latestEventId(),
    });
  }

  public tournamentRules(arenaId: string, day = this.save.tournamentRegistrations[arenaId] ?? this.save.worldDay): typeof TOURNAMENT_RULES {
    const source = `${arenaId}:${day}:${this.save.tournamentRuleSeed}`;
    let hash = 0;
    for (let index = 0; index < source.length; index += 1) hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
    const first = Math.abs(hash) % TOURNAMENT_RULES.length;
    const second = Math.abs(hash * 31 + 17) % TOURNAMENT_RULES.length;
    return [TOURNAMENT_RULES[first], ...(second === first ? [] : [TOURNAMENT_RULES[second]])];
  }

  public activeTacticalProfile(): TacticalProfile {
    return this.save.hero.tacticalProfiles.find((profile) => profile.id === this.save.hero.activeTacticalProfileId)
      ?? this.save.hero.tacticalProfiles[0];
  }

  public setTacticalProfile(profileId: string): TacticalProfile {
    const profile = this.save.hero.tacticalProfiles.find((candidate) => candidate.id === profileId);
    if (!profile) throw new Error("Тактический профиль не найден.");
    this.save.hero.activeTacticalProfileId = profile.id;
    return profile;
  }

  public enemyMemoryPreview(enemyId: string): EnemyMemoryCombatRead | undefined {
    const enemy = this.enemyById(enemyId);
    if (!enemy) return undefined;
    const memory = decayEnemyStyleMemory(enemy.heroMemory, this.save.worldDay);
    const currentSkills = combatantSnapshot(this.save.hero).skills;
    return readEnemyStyleMemory(memory, heroLoadoutSignature(this.save.hero, currentSkills, this.save.worldDay));
  }

  public fighterFeatures(profile: HeroProfile | EnemyProfile): Array<{ id: string; name: string; description: string; kind: string; stats: Partial<Stats> }> {
    const ids = [
      ...(profile.traitIds ?? []).map((id) => ({ id, kind: "Черта" })),
      ...(profile.scarIds ?? []).map((id) => ({ id, kind: "Шрам" })),
    ];
    const definitions = [...FIGHTER_TRAITS, ...FIGHTER_SCARS];
    return ids.map(({ id, kind }) => {
      const feature = definitions.find((candidate) => candidate.id === id);
      return { id, kind, name: feature?.name ?? id, description: feature?.description ?? "История этого свойства ещё не записана.", stats: feature?.stats ?? {} };
    });
  }

  public consumeFeatureChanges(): FighterFeatureChange[] {
    const changes = this.featureChanges.map((change) => ({ ...change, stats: { ...change.stats } }));
    this.featureChanges = [];
    return changes;
  }

  public featureAvailability(id: WorldFeatureId): ActivityAvailability {
    return worldFeatureAvailability(this.save, id);
  }

  public isFeatureUnlocked(id: WorldFeatureId): boolean {
    return this.featureAvailability(id).unlocked;
  }

  public consumeFeatureUnlocks(): WorldFeatureUnlock[] {
    this.syncFeatureUnlocks();
    const unlocks = this.save.pendingFeatureUnlocks.map((entry) => ({ ...entry }));
    this.save.pendingFeatureUnlocks = [];
    return unlocks;
  }

  public hasSeenTutorial(id: ContextualTutorialId): boolean {
    return this.save.seenContextualTutorialIds.includes(id);
  }

  public markTutorialSeen(id: ContextualTutorialId): void {
    if (!this.save.seenContextualTutorialIds.includes(id)) this.save.seenContextualTutorialIds.push(id);
  }

  public consumeAutomaticLegendDefense(): BattleReport | undefined {
    const report = this.automaticLegendDefense;
    this.automaticLegendDefense = undefined;
    return report;
  }

  public setAutoResolveLegendChallenges(enabled: boolean): void {
    this.save.hero.autoResolveLegendChallenges = enabled;
  }

  public acceptContract(contractId: string, approach: "honor" | "profit"): ContractOffer {
    this.requireFeature("contracts");
    if (this.save.activeContract) throw new Error("Сначала завершите или отмените действующий контракт.");
    const offer = this.save.contractOffers.find((candidate) => candidate.id === contractId);
    if (!offer) throw new Error("Предложение больше недоступно.");
    if (offer.objective === "training" && this.save.hero.level >= this.trainingLevelCap()) {
      this.refreshContracts(true);
      throw new Error("Предел тренировок достигнут. Фракция заменила недоступное поручение.");
    }
    this.save.activeContract = { ...offer, approach };
    this.save.contractOffers = this.save.contractOffers.filter((candidate) => candidate.id !== contractId);
    this.event("system", `${this.save.hero.name} принял контракт «${offer.title}» (${approach === "honor" ? "честь" : "выгода"}).`);
    return this.save.activeContract;
  }

  public abandonContract(): void {
    this.requireFeature("contracts");
    const contract = this.save.activeContract;
    if (!contract) return;
    this.save.hero.factionReputation = applyFactionReputationChange(
      this.save.hero.factionReputation,
      contract.factionId,
      -2,
    ).reputation;
    this.event("system", `${this.save.hero.name} отказался от контракта «${contract.title}».`);
    this.save.activeContract = undefined;
  }

  public salvageItem(itemId: string): number {
    return this.salvageItems([itemId]);
  }

  public salvageItems(itemIds: readonly string[]): number {
    this.requireFeature("equipment-legacy");
    const uniqueIds = [...new Set(itemIds)];
    if (uniqueIds.length === 0) throw new Error("Не выбраны предметы для разбора.");
    const inventoryById = new Map(this.save.hero.inventory.map((item) => [item.id, item]));
    const items = uniqueIds.map((itemId) => {
      const item = inventoryById.get(itemId);
      if (!item) throw new Error(uniqueIds.length === 1 ? "Предмет не найден." : "Один из выбранных предметов не найден.");
      return item;
    });
    const equippedIds = new Set(Object.values(this.save.hero.equipped));
    if (items.some((item) => equippedIds.has(item.id))) throw new Error("Надетый предмет нельзя разобрать.");
    if (items.some((item) => !this.canSellItem(item))) throw new Error("Регалии короны нельзя разобрать.");
    if (items.some((item) => item.worldRelicId)) throw new Error("Мировую реликвию нельзя уничтожить: её можно продать, чтобы она вернулась в оборот мира.");
    const ids = new Set(uniqueIds);
    const dust = items.reduce((total, item) => total + relicDustYield(item), 0);
    this.save.hero.inventory = this.save.hero.inventory.filter((candidate) => !ids.has(candidate.id));
    this.save.hero.relicDust += dust;
    this.event("loot", items.length === 1
      ? `${items[0].name} разобран: получено ${dust} ед. реликтовой пыли.`
      : `Разобрано предметов: ${items.length}. Получено ${dust} ед. реликтовой пыли.`);
    return dust;
  }

  public awakenRelic(itemId: string, pathId: "might" | "guard" | "tempo"): EquipmentItem {
    this.requireFeature("equipment-legacy");
    const item = this.save.hero.inventory.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("Предмет не найден.");
    if (!rarityAtLeast(item.rarity, "legendary")) throw new Error("Историю могут обрести только легендарные, мифические и мировые реликвии.");
    if ((item.relicTier ?? 0) < 1) throw new Error("Сначала предмет должен заслужить имя в боях.");
    if (item.relicPath) throw new Error("Путь этой реликвии уже выбран.");
    const path = RELIC_PATHS.find((candidate) => candidate.id === pathId);
    if (!path) throw new Error("Путь развития не найден.");
    const cost = 8;
    if (this.save.hero.relicDust < cost) throw new Error(`Нужно реликтовой пыли: ${cost}.`);
    this.save.hero.relicDust -= cost;
    item.relicPath = path.id;
    Object.entries(path.stats).forEach(([stat, value]) => {
      const key = stat as keyof Stats;
      item.stats[key] = (item.stats[key] ?? 0) + Number(value);
    });
    const epithet = this.random.loot.pick(CLASS_RELIC_EPITHETS[this.save.hero.classId]);
    item.relicName = `${item.name} · ${epithet}`;
    item.relicHistory ??= [];
    item.relicHistory.push(`День ${this.save.worldDay}: выбран «${path.name}».`);
    if (!item.worldRelicId && isWorldRelicEligible(item)) {
      const record = createWorldRelicRecord(this.randomId("world-relic"), item, "hero", this.save.hero.name, this.save.worldDay);
      Object.assign(item, record.item, {
        stats: { ...record.item.stats },
        relicHistory: [...(record.item.relicHistory ?? [])],
        relicFeats: [...(record.item.relicFeats ?? [])],
        relicProperties: (record.item.relicProperties ?? []).map((property) => ({ ...property })),
      });
      this.save.worldRelics ??= [];
      this.save.worldRelics.push(record);
    } else if (item.worldRelicId) {
      const index = this.save.worldRelics?.findIndex((record) => record.id === item.worldRelicId) ?? -1;
      if (index >= 0) this.save.worldRelics![index] = synchronizeWorldRelic(this.save.worldRelics![index], item, undefined, this.save.worldDay);
    }
    item.appearanceVariant = `${path.id}-${item.relicTier ?? 1}`;
    this.event("loot", `${item.name} обрёл имя «${item.relicName}».`);
    return item;
  }

  public relicRecipients(itemId: string): EnemyProfile[] {
    const item = this.save.hero.inventory.find((candidate) => candidate.id === itemId);
    if (!item?.worldRelicId || Object.values(this.save.hero.equipped).includes(item.id)) return [];
    return this.save.enemies.filter((enemy) => {
      if (!enemy.alive || enemy.level < Math.max(1, item.level - 5)) return false;
      if (item.allowedClasses !== "all" && !item.allowedClasses.includes(enemy.classId)) return false;
      const current = enemy.equipment.find((candidate) => candidate.id === enemy.equipped[item.slot]);
      if (current?.worldRelicId) return false;
      return !ITEM_TEMPLATES.find((template) => template.id === current?.templateId)?.exclusiveToElite;
    }).sort((first, second) => {
      const firstMeetings = this.save.hero.rivalries[first.id]?.meetings ?? 0;
      const secondMeetings = this.save.hero.rivalries[second.id]?.meetings ?? 0;
      return secondMeetings - firstMeetings || second.rating - first.rating;
    });
  }

  public giftRelic(itemId: string, fighterId: string): WorldRelicRecord {
    this.requireFeature("equipment-legacy");
    this.assertNoPendingBattle();
    const item = this.save.hero.inventory.find((candidate) => candidate.id === itemId);
    if (!item?.worldRelicId) throw new Error("Передать можно только пробуждённую мировую реликвию.");
    if (Object.values(this.save.hero.equipped).includes(item.id)) throw new Error("Сначала снимите реликвию с героя.");
    const recipient = this.relicRecipients(itemId).find((enemy) => enemy.id === fighterId);
    if (!recipient) throw new Error("Этот боец не может принять реликвию: проверьте его класс, уровень и занятый слот.");
    const recordIndex = this.save.worldRelics?.findIndex((record) => record.id === item.worldRelicId) ?? -1;
    if (recordIndex < 0) throw new Error("Реликвия ещё не внесена в летопись мира.");
    const transfer = transferWorldRelic(
      this.save.worldRelics![recordIndex],
      item,
      recipient.id,
      recipient.name,
      `День ${this.save.worldDay}: ${this.save.hero.name} передал реликвию ${recipient.name}.`,
    );
    if (!considerNpcLoot(recipient, transfer.item)) throw new Error("Боец сохранил своё нынешнее снаряжение и не принял реликвию.");
    this.save.hero.inventory = this.save.hero.inventory.filter((candidate) => candidate.id !== item.id);
    this.save.worldRelics![recordIndex] = transfer.record;
    recipient.relationships ??= {};
    recipient.relationships.hero = { fighterId: "hero", kind: "ally", intensity: 65, lastChangedDay: this.save.worldDay };
    this.recordEnemyHistory(recipient, `Получил от ${this.save.hero.name} реликвию «${transfer.item.relicName ?? item.name}».`);
    this.event("loot", `${this.save.hero.name} передал реликвию «${transfer.item.relicName ?? item.name}» бойцу ${recipient.name}. Она останется в мире и сможет сменить владельца.`);
    return transfer.record;
  }

  public simulateElapsed(now = Date.now()): number {
    if (this.save.pendingBattle || this.save.activeExpedition) return 0;
    const elapsedDays = Math.min(14, Math.max(0, Math.floor((now - this.save.lastSimulatedAt) / 600_000)));
    let simulatedDays = 0;
    if (elapsedDays > 0) {
      for (let index = 0; index < elapsedDays; index += 1) {
        if (this.save.pendingEliteChallengeId) {
          if (!this.save.hero.autoResolveLegendChallenges) break;
          this.automaticLegendDefense = this.resolveLegendDefense(false);
        }
        this.completeDay();
        simulatedDays += 1;
      }
      this.save.lastSimulatedAt = now;
      if (simulatedDays > 0) this.event("system", `Пока вас не было, мир прожил ${simulatedDays} дн. Все арены, данжи и турниры продолжали работать.`);
      this.refreshShopIfNeeded();
    }
    return simulatedDays;
  }

  public nextTournamentDay(arenaId: string): number {
    const arena = ARENAS.find((candidate) => candidate.id === arenaId);
    if (!arena) throw new Error("Турнир не найден.");
    return (Math.floor(this.save.worldDay / arena.tournamentInterval) + 1) * arena.tournamentInterval;
  }

  public registeredTournamentDay(arenaId: string): number | undefined {
    return this.save.tournamentRegistrations[arenaId];
  }

  public registerTournament(arenaId: string): number {
    const arena = ARENAS.find((candidate) => candidate.id === arenaId);
    if (!arena) throw new Error("Турнир не найден.");
    const availability = this.availability(arena);
    if (!availability.unlocked) throw new Error(availability.reason);
    const existing = this.save.tournamentRegistrations[arenaId];
    if (existing && existing >= this.save.worldDay) return existing;
    const day = this.nextTournamentDay(arenaId);
    this.save.tournamentRegistrations[arenaId] = day;
    this.event("tournament", `${this.save.hero.name} записался на «${arena.name}» в день ${day}.`);
    return day;
  }

  public nextCrownLeagueDay(): number {
    const interval = this.crownLeagueInterval();
    return (Math.floor(this.save.worldDay / interval) + 1) * interval;
  }

  public crownLeagueInterval(): number {
    return this.hasEraLaw("crown-discord") ? Math.round(CROWN_LEAGUE_INTERVAL * 0.75) : CROWN_LEAGUE_INTERVAL;
  }

  public registeredCrownLeagueDay(): number | undefined {
    return this.save.tournamentRegistrations["crown-league"];
  }

  private migrateCrownLeagueSchedule(): void {
    const migrations = this.save.migrations ??= [];
    if (migrations.includes(CROWN_LEAGUE_SCHEDULE_MIGRATION)) return;
    const registeredDay = this.registeredCrownLeagueDay();
    if (registeredDay !== undefined && registeredDay > this.save.worldDay) {
      const nextDay = Math.min(registeredDay, this.nextCrownLeagueDay());
      this.save.tournamentRegistrations["crown-league"] = nextDay;
      if (nextDay !== registeredDay) {
        this.event("tournament", `Запись в Лигу короны перенесена с дня ${registeredDay} на день ${nextDay}: турнир теперь проходит чаще.`);
      }
    }
    migrations.push(CROWN_LEAGUE_SCHEDULE_MIGRATION);
  }

  public crownLeagueRegistrationAvailability(): ActivityAvailability {
    const qualification = this.crownLeagueQualification();
    if (!qualification.unlocked) return qualification;
    const registeredDay = this.registeredCrownLeagueDay();
    if (registeredDay && registeredDay >= this.save.worldDay) {
      return { unlocked: false, reason: `Место уже зарезервировано на день ${registeredDay}.` };
    }
    return { unlocked: true, reason: `${qualification.reason} Ближайшая Лига состоится в день ${this.nextCrownLeagueDay()}.` };
  }

  public registerCrownLeague(): number {
    const existing = this.registeredCrownLeagueDay();
    if (existing && existing >= this.save.worldDay) return existing;
    const availability = this.crownLeagueRegistrationAvailability();
    if (!availability.unlocked) throw new Error(availability.reason);
    const day = this.nextCrownLeagueDay();
    this.save.tournamentRegistrations["crown-league"] = day;
    this.event("tournament", `${this.save.hero.name} записался в Лигу короны на день ${day}.`);
    return day;
  }

  public availability(activity: ActivityDefinition): ActivityAvailability {
    const hero = this.save.hero;
    if (activity.kind === "endgame") {
      return activity.id === "crown-league" ? this.crownLeagueAvailability() : this.legendHuntAvailability();
    }
    if (activity.kind === "arena") {
      const index = ARENAS.findIndex((arena) => arena.id === activity.id);
      if (index > hero.highestArena) return { unlocked: false, reason: `Победите на арене «${ARENAS[index - 1].name}».` };
      if (hero.level < activity.minLevel) return { unlocked: false, reason: `Требуется ${activity.minLevel} уровень.` };
      const registered = this.save.tournamentRegistrations[activity.id];
      if (registered === this.save.worldDay) return { unlocked: true, reason: `Турнир проходит сегодня. Место в сетке подтверждено.` };
      if (registered && registered > this.save.worldDay) return { unlocked: true, reason: `Вы записаны на день ${registered}. До события: ${registered - this.save.worldDay} дн.` };
      return { unlocked: true, reason: `${hero.arenaWins[index]}/${activity.winsToAdvance} побед в турнирах для продвижения.` };
    }
    if (activity.kind === "duel") return this.duelAvailability(activity);
    if (activity.kind === "boss") return this.bossAvailability(activity);
    const openedByMap = this.save.legacy.activeBoonId === "old-map" && activity.id === DUNGEONS[0]?.id;
    if (!openedByMap && hero.level < activity.minLevel) return { unlocked: false, reason: `Требуется ${activity.minLevel} уровень.` };
    if (!openedByMap && hero.highestArena < activity.requiredArena) return { unlocked: false, reason: `Сначала откройте арену ${activity.requiredArena + 1}.` };
    if (!openedByMap && this.save.worldDay < activity.requiredWorldDay) return { unlocked: false, reason: `Откроется на ${activity.requiredWorldDay}-й день мира.` };
    const lastClear = this.save.dungeonClears[activity.id];
    if (lastClear && this.save.worldDay - lastClear < activity.cooldownDays) {
      return { unlocked: false, reason: `Восстановится через ${activity.cooldownDays - (this.save.worldDay - lastClear)} дн.` };
    }
    return { unlocked: true, reason: `Гарантирована добыча: ${RARITY_LABELS[activity.minimumRarity].toLowerCase()}.` };
  }

  public play(activityId: string): BattleReport {
    this.beginDungeon(activityId);
    const result = this.runPendingBattleAutomatically();
    if (!result || !("winnerId" in result) || !("turns" in result)) throw new Error("Автоматический расчёт вылазки не вернул результат.");
    return result as BattleReport;
  }

  public beginDungeon(activityId: string): PendingBattle {
    this.assertNoPendingBattle();
    const activity = DUNGEONS.find((candidate) => candidate.id === activityId);
    if (!activity) throw new Error("Подземелье не найдено.");
    const availability = this.availability(activity);
    if (!availability.unlocked) throw new Error(availability.reason);
    this.prepareDayActivity();
    const activeItemIds = new Set(Object.values(this.save.hero.equipped));
    const activeItems = this.save.hero.inventory.filter((item) => activeItemIds.has(item.id));
    const skillIds = unlockedSkills(
      this.save.hero.classId,
      this.save.hero.level,
      activeItems,
      this.save.hero.legacySkillId ? [this.save.hero.legacySkillId] : [],
    ).map((skill) => skill.id);
    const enemy = this.createDungeonEnemy(activity.enemyLevel, activity.name);
    return this.createPendingBattle("dungeon", activity.id, enemy, {}, "dungeon", undefined, {
      eventCursor: this.latestEventId(),
      skillIds,
    });
  }

  public train(): DailyActivityReport {
    return this.trainingDay();
  }

  private trainingDay(mentorMultiplier = 1, mentorName?: string): DailyActivityReport {
    if (this.save.pendingBattle) throw new Error("Сначала завершите или отмените уже начатый бой.");
    if (this.save.activeExpedition) throw new Error("Сначала завершите текущий поход или отступите.");
    const levelCap = this.trainingLevelCap();
    if (this.save.hero.level >= levelCap) {
      throw new Error(`Тренировки больше не дают уровень. Сначала продвиньтесь на следующую арену; текущий предел — ${levelCap}.`);
    }
    this.prepareDayActivity();
    const trainingBonus = 1 + factionModifier(this.save.hero.factionReputation, "trainingExperience");
    const experience = Math.round(this.epochRewards(34 + this.save.hero.level * 5, 0, "training").experience * trainingBonus * mentorMultiplier);
    const levelsGained = this.gainHeroExperience(experience, levelCap);
    this.advanceContract("training");
    this.event("system", `${this.save.hero.name} провёл день ${mentorName ? `под руководством ${mentorName}` : "на тренировочной площадке"} и получил ${experience} опыта.`);
    this.completeDay();
    return { kind: "training", title: mentorName ? "Занятие с наставником завершено" : "Тренировка завершена", description: mentorName ? `${mentorName}: на 20% больше опыта в пределах текущей арены.` : "Безопасная практика без добычи и рейтингового риска.", experience, gold: 0, levelsGained };
  }

  public trainingLevelCap(): number {
    const arena = ARENAS[Math.min(this.save.hero.highestArena, ARENAS.length - 1)];
    return arena.enemyLevel[1] + 1;
  }

  public duel(tierId = DUEL_TIERS[0].id): DailyActivityReport {
    this.beginDuel(tierId);
    const result = this.runPendingBattleAutomatically();
    if (!result || !("kind" in result) || result.kind !== "duel") {
      throw new Error("Автоматический расчёт дуэли не вернул результат.");
    }
    return result;
  }

  public beginDuel(tierId = DUEL_TIERS[0].id): PendingBattle {
    this.assertNoPendingBattle();
    const tier = DUEL_TIERS.find((candidate) => candidate.id === tierId);
    if (!tier) throw new Error("Ступень дуэлей не найдена.");
    const availability = this.duelAvailability(tier);
    if (!availability.unlocked) throw new Error(availability.reason);
    this.prepareDayActivity();
    const arenaIndex = Math.min(Math.max(tier.requiredArena, this.save.hero.highestArena), ARENAS.length - 1);
    const enemy = this.matchDuelEnemy(tier, arenaIndex);
    return this.createPendingBattle("duel", tier.id, enemy, {}, "duel");
  }

  public currentPendingBattle(): PendingBattle | undefined {
    return this.save.pendingBattle;
  }

  public pendingBattleActions(): BattleActionOption[] {
    return new BattleSession(this.requirePendingBattle().session).availableActions();
  }

  public stepPendingBattle(action?: BattleAction) {
    const pending = this.requirePendingBattle();
    const session = new BattleSession(pending.session);
    const turn = session.step(action);
    pending.session = session.snapshot();
    return { turn, finished: session.isFinished, pendingBattle: pending };
  }

  public finalizePendingBattle(): PendingBattleFinalization {
    const pending = this.requirePendingBattle();
    const session = new BattleSession(pending.session);
    if (!session.isFinished) throw new Error("Сначала завершите все ходы боя.");
    if (pending.kind === "dungeon") return this.finalizePendingDungeon(pending, session);
    if (pending.kind === "duel") return this.finalizePendingDuel(pending, session);
    if (pending.kind === "boss") return this.finalizePendingBoss(pending, session);
    if (pending.kind === "legacy-champion") return this.finalizePendingLegacyChampion(pending, session);
    if (pending.kind === "world-encounter") return this.finalizePendingWorldEncounter(pending, session);
    if (pending.kind === "legend-hunt") return this.finalizePendingLegendHunt(pending, session);
    if (pending.kind === "legend-defense") return this.finalizePendingLegendDefense(pending, session);
    if (pending.kind === "expedition") return this.finalizePendingExpedition(pending, session);
    if (pending.kind === "arena-tournament" || pending.kind === "crown-league") {
      return this.finalizePendingTournamentBattle(pending, session);
    }
    throw new Error(`Финализация ${pending.kind} ещё не поддержана.`);
  }

  public abortPendingBattle(): PendingBattleFinalization | undefined {
    const pending = this.save.pendingBattle;
    if (!pending) return undefined;
    if (pending.session.turns.length === 0) {
      this.save.pendingBattle = undefined;
      return undefined;
    }
    const session = new BattleSession(pending.session);
    session.forfeit("hero");
    pending.session = session.snapshot();
    return this.finalizePendingBattle();
  }

  public runPendingBattleAutomatically(): BattleReport | DailyActivityReport | TournamentReport | ExpeditionStepReport | undefined {
    while (this.save.pendingBattle) {
      const session = new BattleSession(this.save.pendingBattle.session);
      session.runAutomatic();
      this.save.pendingBattle.session = session.snapshot();
      const finalized = this.finalizePendingBattle();
      if (finalized.status === "complete") return finalized.result;
    }
    return undefined;
  }

  private finalizePendingDuel(pending: PendingBattle, session: BattleSession): PendingBattleFinalization {
    const tier = DUEL_TIERS.find((candidate) => candidate.id === pending.activityId);
    if (!tier) throw new Error("Ступень сохранённой дуэли больше не существует.");
    const enemy = this.enemyById(pending.enemyId) ?? pending.enemy;
    const combat = session.resolution();
    const heroWon = combat.winnerId === "hero";
    const baseExperience = heroWon ? tier.rewardExperience + enemy.level * 4 : Math.round(tier.rewardExperience * 0.28);
    const baseGold = heroWon ? tier.rewardGold + enemy.level * 4 : 0;
    const { experience, gold } = this.epochRewards(baseExperience, baseGold, "duel");
    const levelsGained = this.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    if (heroWon) { this.save.hero.wins += 1; this.save.hero.duelWins += 1; }
    else { this.save.hero.losses += 1; this.save.hero.duelLosses += 1; }
    this.recordNpcDuelWithHero(enemy, heroWon);
    this.recordHeroEncounter(enemy, heroWon, combat.turns);
    this.recordMutationVictory(enemy, heroWon);
    if (heroWon) this.advanceContract("duel");
    this.event("battle", `${this.save.hero.name} ${heroWon ? "победил" : "проиграл"} ${enemy.name} в дуэли «${tier.name}».`, {
      kind: "battle", actorId: "hero", actorName: this.save.hero.name,
      targetId: enemy.id, targetName: enemy.name, outcome: heroWon ? "won" : "lost",
    });
    const battle: BattleReport = {
      activity: tier, heroBefore: combat.hero, enemyBefore: combat.enemy,
      winnerId: combat.winnerId, loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied: false,
      turns: combat.turns, analysis: combat.analysis,
      rewards: { experience, gold, levelsGained, unlockedSkills: [], item: undefined }, worldEvents: [],
    };
    this.save.pendingBattle = undefined;
    this.completeDay();
    const result: DailyActivityReport = {
      kind: "duel", title: tier.name,
      description: heroWon ? "Победа в подобранном по силе поединке." : "Поражение без риска для жизни.",
      battle, experience, gold, levelsGained,
    };
    return { status: "complete", battle, result };
  }

  private finalizePendingDungeon(pending: PendingBattle, session: BattleSession): PendingBattleFinalization {
    const activity = DUNGEONS.find((candidate) => candidate.id === pending.activityId);
    if (!activity) throw new Error("Сохранённое подземелье больше не существует.");
    const enemy = pending.enemy;
    const combat = session.resolution();
    const heroWon = combat.winnerId === "hero";
    const baseExperience = heroWon ? activity.rewardExperience + enemy.level * 4 : Math.round(activity.rewardExperience * 0.2);
    const baseGold = heroWon ? activity.rewardGold + this.random.loot.int(0, Math.round(activity.rewardGold * 0.25)) : 0;
    const epochReward = this.epochRewards(baseExperience, baseGold, "dungeon");
    const dungeonController = this.save.factionControl?.dungeonControllers?.[activity.id];
    const controlledReward = dungeonController
      ? factionDungeonReward(dungeonController, epochReward)
      : { ...epochReward, raritySteps: 0 };
    const { experience, gold } = controlledReward;
    const levelsGained = this.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    if (heroWon) { this.save.hero.wins += 1; this.save.hero.dungeonWins += 1; }
    else { this.save.hero.losses += 1; this.save.hero.dungeonLosses += 1; }
    this.recordHeroEncounter(enemy, heroWon, combat.turns);
    this.recordMutationVictory(enemy, heroWon);

    let item: EquipmentItem | undefined;
    let temperingMarks = 0;
    if (heroWon) {
      item = this.createRewardItem(Math.min(this.save.hero.level + 2, activity.enemyLevel[1] + 1), {
        classId: this.save.hero.classId,
        minimumRarity: this.minimumRewardRarity(this.controlledDungeonMinimum(activity.id, activity.minimumRarity), "dungeon"),
      }, factionModifier(this.save.hero.factionReputation, "dungeonLootChance"));
      this.addItem(item);
      this.event("loot", `${this.save.hero.name} получил предмет: ${item.name}.`, {
        kind: "loot", fighterId: "hero", fighterName: this.save.hero.name, itemId: item.id, itemName: item.name,
      });
      if (activity.requiredArena >= ARENAS.length - 2 && this.random.loot.chance(0.22)) {
        temperingMarks = 1;
        this.save.hero.temperingMarks += 1;
        this.event("loot", `${this.save.hero.name} нашёл редкую печать закалки.`);
      }
      this.save.dungeonClears[activity.id] = this.save.worldDay;
      this.advanceContract("dungeon");
    }
    this.event("dungeon", `${this.save.hero.name} ${heroWon ? "завершил" : "не прошёл"} вылазку «${activity.name}».`, {
      kind: "dungeon", fighterId: "hero", fighterName: this.save.hero.name,
      dungeonId: activity.id, dungeonName: activity.name, outcome: heroWon ? "completed" : "retreated",
    });
    const beforeSkillIds = new Set(Array.isArray(pending.context?.skillIds) ? pending.context!.skillIds as string[] : []);
    const equippedIds = new Set(Object.values(this.save.hero.equipped));
    const unlockedNow = unlockedSkills(
      this.save.hero.classId,
      this.save.hero.level,
      this.save.hero.inventory.filter((candidate) => equippedIds.has(candidate.id)),
      this.save.hero.legacySkillId ? [this.save.hero.legacySkillId] : [],
    ).filter((skill) => !beforeSkillIds.has(skill.id));
    const battle: BattleReport = {
      activity, heroBefore: combat.hero, enemyBefore: combat.enemy, winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied: false, turns: combat.turns, analysis: combat.analysis,
      rewards: { experience, gold, item, levelsGained, unlockedSkills: unlockedNow, temperingMarks }, worldEvents: [],
    };
    const eventCursor = typeof pending.context?.eventCursor === "string" ? pending.context.eventCursor : undefined;
    this.save.pendingBattle = undefined;
    this.completeDay();
    battle.worldEvents = this.eventsSince(eventCursor);
    return { status: "complete", battle, result: battle };
  }

  private finalizePendingBoss(pending: PendingBattle, session: BattleSession): PendingBattleFinalization {
    const boss = DUEL_BOSSES.find((candidate) => candidate.id === pending.activityId);
    if (!boss) throw new Error("Сохранённый особый противник больше не существует.");
    const enemy = pending.enemy;
    const combat = session.resolution();
    const heroWon = combat.winnerId === "hero";
    const baseExperience = heroWon ? boss.rewardExperience : Math.round(boss.rewardExperience * 0.16);
    const baseGold = heroWon ? boss.rewardGold : 0;
    const { experience, gold } = this.factionAdjustedReward(this.epochRewards(baseExperience, baseGold, "boss"), "bossReward");
    const levelsGained = this.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    let item: EquipmentItem | undefined;
    let temperingMarks = 0;
    if (heroWon) {
      this.save.hero.wins += 1;
      this.save.hero.bossWins += 1;
      if (!this.save.defeatedBosses.includes(boss.id)) this.save.defeatedBosses.push(boss.id);
      temperingMarks = 1 + rewardModifiers(this.save.legacy.cycle, this.save.legacy.activeLawIds, "boss").bonusTemperingMarks;
      this.save.hero.temperingMarks += temperingMarks;
      const rarity = this.minimumRewardRarity(boss.id === "nameless-duke" ? "mythic" : "legendary", "boss");
      item = createItem(Math.min(this.save.hero.level + 2, boss.level + 2), {
        classId: this.save.hero.classId,
        templateId: boss.lootTemplateIds[this.save.hero.classId],
        rarity,
        randomSource: this.random.loot,
      });
      this.addItem(item);
      this.event("loot", `${this.save.hero.name} победил ${boss.name} и получил уникальный предмет «${item.name}».`, {
        kind: "loot", fighterId: "hero", fighterName: this.save.hero.name, itemId: item.id, itemName: item.name,
      });
      this.advanceContract("boss");
    } else {
      this.save.hero.losses += 1;
    }
    this.recordHeroEncounter(enemy, heroWon, combat.turns);
    this.recordMutationVictory(enemy, heroWon);
    const battle: BattleReport = {
      activity: boss, heroBefore: combat.hero, enemyBefore: combat.enemy, winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied: false, turns: combat.turns, analysis: combat.analysis,
      rewards: { experience, gold, item, levelsGained, unlockedSkills: [], temperingMarks }, worldEvents: [],
    };
    this.save.pendingBattle = undefined;
    this.completeDay();
    const result: DailyActivityReport = {
      kind: "duel", title: boss.name,
      description: heroWon ? "Уникальный противник побеждён навсегда." : "Босс останется доступен для новой попытки.",
      battle, experience, gold, levelsGained,
    };
    return { status: "complete", battle, result };
  }

  private finalizePendingLegacyChampion(pending: PendingBattle, session: BattleSession): PendingBattleFinalization {
    const cycle = typeof pending.context?.cycle === "number"
      ? pending.context.cycle
      : Number(pending.activityId.replace(/^legacy-/, ""));
    const archive = this.save.legacy.archives.find((candidate) => candidate.cycle === cycle);
    if (!archive) throw new Error("Архив сохранённого героя эпохи больше не существует.");
    const enemy = pending.enemy;
    const combat = session.resolution();
    const heroWon = combat.winnerId === "hero";
    const baseExperience = heroWon ? 720 + archive.level * 14 : 120;
    const baseGold = heroWon ? 4_800 + archive.rating : 0;
    const { experience, gold } = this.factionAdjustedReward(this.epochRewards(baseExperience, baseGold, "boss"), "bossReward");
    const levelsGained = this.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    let item: EquipmentItem | undefined;
    let temperingMarks = 0;
    if (heroWon) {
      this.save.hero.wins += 1;
      this.save.hero.bossWins += 1;
      if (!this.save.defeatedLegacyCycles.includes(archive.cycle)) this.save.defeatedLegacyCycles.push(archive.cycle);
      this.save.legacy.seals += 2;
      this.save.legacy.totalSealsEarned += 2;
      temperingMarks = 2 + rewardModifiers(this.save.legacy.cycle, this.save.legacy.activeLawIds, "boss").bonusTemperingMarks;
      this.save.hero.temperingMarks += temperingMarks;
      item = createItem(Math.min(this.save.hero.level + 2, archive.level), {
        classId: this.save.hero.classId, minimumRarity: "mythic", randomSource: this.random.loot,
      });
      this.addItem(item);
      this.event("loot", `${this.save.hero.name} получил реликвию после победы над героем эпохи ${archive.cycle}.`, {
        kind: "loot", fighterId: "hero", fighterName: this.save.hero.name, itemId: item.id, itemName: item.name,
      });
      this.advanceContract("boss");
    } else {
      this.save.hero.losses += 1;
    }
    this.recordHeroEncounter(enemy, heroWon, combat.turns);
    this.recordMutationVictory(enemy, heroWon);
    const activity: BossDefinition = {
      id: `legacy-${archive.cycle}`, kind: "boss", name: `${archive.name}, герой эпохи ${archive.cycle}`,
      place: "Зал отзвуков", description: "Архивный поединок с завершившим прежнюю летопись героем.",
      classId: archive.classId, level: archive.level, requiredLevel: 24, requiredDuelWins: 0,
      requiredArena: ARENAS.length - 2, rewardGold: baseGold, rewardExperience: baseExperience,
      lootTemplateIds: Object.fromEntries(classes.map((classId) => [classId, ITEM_TEMPLATES.find((template) => template.allowedClasses === "all" || template.allowedClasses.includes(classId))!.id])) as Record<HeroClass, string>,
      accent: "#715063",
    };
    this.event("battle", heroWon
      ? `${this.save.hero.name} превзошёл ${archive.name}, героя эпохи ${archive.cycle}.`
      : `${archive.name} сохранил своё место в Зале отзвуков.`, {
      kind: "battle", actorId: "hero", actorName: this.save.hero.name,
      targetId: enemy.id, targetName: enemy.name, outcome: heroWon ? "won" : "lost",
    });
    const battle: BattleReport = {
      activity, heroBefore: combat.hero, enemyBefore: combat.enemy, winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied: false, turns: combat.turns, analysis: combat.analysis,
      rewards: { experience, gold, item, levelsGained, unlockedSkills: [], temperingMarks }, worldEvents: [],
    };
    this.save.pendingBattle = undefined;
    this.completeDay();
    battle.worldEvents = this.eventsSince(typeof pending.context?.eventCursor === "string" ? pending.context.eventCursor : undefined);
    return { status: "complete", battle, result: battle };
  }

  private finalizePendingWorldEncounter(pending: PendingBattle, session: BattleSession): PendingBattleFinalization {
    const encounterType = pending.context?.encounterType === "future-boss" ? "future-boss" : "faction-hunter";
    const combat = session.resolution();
    const enemy = pending.enemy;
    const persistentEnemy = this.enemyById(pending.enemyId);
    const heroWon = combat.winnerId === "hero";
    const bossRecord = encounterType === "future-boss"
      ? this.save.npcLife?.futureBosses.find((candidate) => candidate.id === pending.context?.futureBossId)
      : undefined;
    const baseExperience = encounterType === "future-boss"
      ? (heroWon ? 520 + enemy.level * 16 : 110 + enemy.level * 2)
      : (heroWon ? 210 + enemy.level * 8 : 65 + enemy.level * 2);
    const baseGold = heroWon
      ? encounterType === "future-boss" ? 2_400 + enemy.level * 95 : 650 + enemy.level * 38
      : 0;
    const { experience, gold } = this.epochRewards(baseExperience, baseGold, encounterType === "future-boss" ? "boss" : "duel");
    const levelsGained = this.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    let item: EquipmentItem | undefined;
    let temperingMarks = 0;
    if (heroWon) {
      this.save.hero.wins += 1;
      if (encounterType === "future-boss") this.save.hero.bossWins += 1;
      else this.save.hero.duelWins += 1;
      item = this.createRewardItem(Math.min(enemy.level + 2, this.save.hero.level + 4), {
        classId: this.save.hero.classId,
        minimumRarity: encounterType === "future-boss" ? "mythic" : this.save.hero.highestArena >= 3 ? "legendary" : "epic",
      });
      temperingMarks = encounterType === "future-boss" ? 2 : 1;
      this.save.hero.temperingMarks += temperingMarks;
      this.addItem(item);
      this.advanceContract(encounterType === "future-boss" ? "boss" : "duel");
    } else {
      this.save.hero.losses += 1;
      if (encounterType === "faction-hunter") this.save.hero.duelLosses += 1;
    }
    if (persistentEnemy) {
      this.recordNpcDuelWithHero(persistentEnemy, heroWon);
      if (!heroWon) {
        if (encounterType === "faction-hunter") {
          persistentEnemy.experience += this.npcExperienceReward(60 + this.save.hero.level * 3);
          persistentEnemy.gold = (persistentEnemy.gold ?? 0) + 120 + this.save.hero.level * 12;
          this.progressEnemy(persistentEnemy, false);
        }
      }
      this.recordEnemyHistory(persistentEnemy, `${heroWon ? "Проиграл" : "Победил"} ${this.save.hero.name} в личном событии мира.`);
    }
    this.recordHeroEncounter(persistentEnemy ?? enemy, heroWon, combat.turns);
    if (encounterType === "future-boss" && bossRecord && heroWon) {
      bossRecord.status = "defeated";
      this.event("promotion", `${this.save.hero.name} завершил историю особого противника ${bossRecord.name}.`);
    }
    if (encounterType === "faction-hunter") {
      const factionId = typeof pending.context?.factionId === "string" ? pending.context.factionId : enemy.factionId;
      if (factionId) {
        this.save.hero.factionReputation = applyFactionReputationChange(
          this.save.hero.factionReputation,
          factionId,
          heroWon ? 5 : -3,
        ).reputation;
      }
      this.save.pendingFactionHunterId = undefined;
    }
    const activity = this.worldEncounterActivity(
      pending.activityId,
      encounterType === "future-boss" ? bossRecord?.name ?? enemy.name : `Охотник: ${enemy.name}`,
      encounterType === "future-boss" ? bossRecord?.reason ?? enemy.title : "Расплата за вражду с одной из фракций мира.",
      enemy,
      baseExperience,
      baseGold,
    );
    this.recordMutationVictory(enemy, heroWon);
    this.event("battle", `${this.save.hero.name} ${heroWon ? "победил" : "проиграл"} в событии «${activity.name}».`, {
      kind: "battle",
      actorId: "hero",
      actorName: this.save.hero.name,
      targetId: enemy.id,
      targetName: enemy.name,
      outcome: heroWon ? "won" : "lost",
    });
    const battle: BattleReport = {
      activity,
      heroBefore: combat.hero,
      enemyBefore: combat.enemy,
      winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero",
      heroWon,
      enemyDied: false,
      turns: combat.turns,
      analysis: combat.analysis,
      rewards: { experience, gold, item, levelsGained, unlockedSkills: [], temperingMarks },
      worldEvents: [],
    };
    this.save.pendingBattle = undefined;
    this.completeDay();
    battle.worldEvents = this.eventsSince(typeof pending.context?.eventCursor === "string" ? pending.context.eventCursor : undefined);
    return { status: "complete", battle, result: battle };
  }

  private finalizePendingLegendHunt(pending: PendingBattle, session: BattleSession): PendingBattleFinalization {
    const activity = ENDGAME_ACTIVITIES.find((candidate) => candidate.id === "legend-hunt")!;
    const enemy = this.enemyById(pending.enemyId);
    if (!enemy) throw new Error("Легенда из сохранённого вызова больше не существует.");
    const combat = session.resolution();
    const heroWon = combat.winnerId === "hero";
    const baseExperience = heroWon ? activity.rewardExperience + enemy.level * 18 : Math.round(activity.rewardExperience * 0.18);
    const baseGold = heroWon ? activity.rewardGold + enemy.tournamentWins * 120 : 0;
    const { experience, gold } = this.factionAdjustedReward(this.epochRewards(baseExperience, baseGold, "legend-hunt"), "bossReward");
    const levelsGained = this.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    this.save.lastLegendHuntDay = this.save.worldDay;
    let item: EquipmentItem | undefined;
    let temperingMarks = 0;
    if (heroWon) {
      this.save.hero.wins += 1;
      this.save.hero.legendHuntWins += 1;
      this.swapEliteMembers("hero", enemy.id);
      temperingMarks = 4;
      this.save.hero.temperingMarks += temperingMarks;
      item = this.createRewardItem(this.save.hero.level + 2, { classId: this.save.hero.classId, minimumRarity: "mythic" });
      this.addItem(item);
    } else {
      this.save.hero.losses += 1;
    }
    this.awardCrownSeason(heroWon ? "hero" : enemy.id, "win");
    this.awardCrownSeason(heroWon ? enemy.id : "hero", "loss");
    this.recordHeroEncounter(enemy, heroWon, combat.turns);
    this.recordMutationVictory(enemy, heroWon);
    this.updateEnemyAfterPlayerBattle(enemy, heroWon, false, false);
    this.syncCrownSet();
    this.event("battle", `${this.save.hero.name} ${heroWon ? `занял место ${this.heroEliteRank()} в элите` : "не смог подняться"} после боя с ${enemy.name}.`, {
      kind: "battle", actorId: "hero", actorName: this.save.hero.name,
      targetId: enemy.id, targetName: enemy.name, outcome: heroWon ? "won" : "lost",
    });
    const battle: BattleReport = {
      activity, heroBefore: combat.hero, enemyBefore: combat.enemy, winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied: false, turns: combat.turns, analysis: combat.analysis,
      rewards: { experience, gold, item, levelsGained, unlockedSkills: [], temperingMarks }, worldEvents: [],
    };
    this.save.pendingBattle = undefined;
    this.completeDay();
    battle.worldEvents = this.eventsSince(typeof pending.context?.eventCursor === "string" ? pending.context.eventCursor : undefined);
    return { status: "complete", battle, result: battle };
  }

  private finalizePendingLegendDefense(pending: PendingBattle, session: BattleSession): PendingBattleFinalization {
    const activity = ENDGAME_ACTIVITIES.find((candidate) => candidate.id === "legend-hunt")!;
    const enemy = this.enemyById(pending.enemyId);
    const rank = this.heroEliteRank();
    if (!enemy || !rank || rank > LEGEND_COUNT) throw new Error("Сохранённый вызов легенде больше не действителен.");
    const combat = session.resolution();
    const heroWon = combat.winnerId === "hero";
    if (heroWon) {
      this.save.hero.wins += 1;
      this.save.hero.legendDefenses += 1;
      this.adjustEliteRating("hero", 10);
    } else {
      this.save.hero.losses += 1;
      this.swapEliteMembers("hero", enemy.id);
    }
    this.recordHeroEncounter(enemy, heroWon, combat.turns);
    this.recordMutationVictory(enemy, heroWon);
    this.updateEnemyAfterPlayerBattle(enemy, heroWon, false, false);
    this.save.pendingEliteChallengeId = undefined;
    this.awardCrownSeason(heroWon ? "hero" : enemy.id, heroWon ? "defense" : "win");
    this.awardCrownSeason(heroWon ? enemy.id : "hero", "loss");
    this.save.lastLegendHuntDay = this.save.worldDay;
    this.syncCrownSet();
    this.event("battle", heroWon ? `${this.save.hero.name} защитил титул легенды.` : `${enemy.name} отобрал у ${this.save.hero.name} место легенды.`, {
      kind: "battle", actorId: "hero", actorName: this.save.hero.name,
      targetId: enemy.id, targetName: enemy.name, outcome: heroWon ? "won" : "lost",
    });
    const battle: BattleReport = {
      activity, heroBefore: combat.hero, enemyBefore: combat.enemy, winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied: false, turns: combat.turns, analysis: combat.analysis,
      rewards: { experience: 0, gold: 0, levelsGained: 0, unlockedSkills: [] }, worldEvents: [],
    };
    this.save.pendingBattle = undefined;
    if (pending.context?.advanceDay !== false) this.completeDay();
    battle.worldEvents = this.eventsSince(typeof pending.context?.eventCursor === "string" ? pending.context.eventCursor : undefined);
    return { status: "complete", battle, result: battle };
  }

  private finalizePendingExpedition(pending: PendingBattle, session: BattleSession): PendingBattleFinalization {
    const expedition = this.save.activeExpedition;
    if (!expedition || expedition.dungeonId !== pending.activityId) {
      throw new Error("Сохранённый поход больше не существует.");
    }
    const dungeon = DUNGEONS.find((candidate) => candidate.id === expedition.dungeonId);
    if (!dungeon) throw new Error("Подземелье сохранённого похода больше не существует.");
    const combat = session.resolution();
    const enemy = pending.enemy;
    const heroWon = combat.winnerId === "hero";
    const lastTurn = combat.turns[combat.turns.length - 1];
    const remainingHealth = heroWon
      ? (lastTurn?.actorId === "hero" ? lastTurn.actorHealth : lastTurn?.targetHealth ?? combat.hero.maxHealth)
      : 0;
    const mode = pending.context?.expeditionMode;
    const routeNode = mode === "route-node"
      ? expedition.route?.nodes.find((candidate) => candidate.id === pending.context?.nodeId)
      : undefined;
    const rawChoiceId = mode === "choice" ? pending.context?.choiceId : undefined;
    const choiceId = rawChoiceId === "safe" || rawChoiceId === "risk" ? rawChoiceId : undefined;
    if (mode === "route-node" && !routeNode) throw new Error("Узел сохранённого похода больше не существует.");
    if (mode === "choice" && choiceId !== "safe" && choiceId !== "risk") {
      throw new Error("Выбор сохранённого похода больше не существует.");
    }
    if (mode !== "route-node" && mode !== "choice") throw new Error("Неизвестный этап сохранённого похода.");
    const combatKind = routeNode?.kind === "boss" || routeNode?.kind === "alternate-boss"
      ? "boss"
      : routeNode?.kind === "elite" || routeNode?.kind === "rival"
        ? "elite"
      : choiceId === "risk" ? "elite" : "battle";
    expedition.health = expeditionStaminaAfterBattle(
      expedition.health,
      combat.hero.maxHealth,
      remainingHealth,
      expeditionBattleExertion(combatKind),
    );
    let item: EquipmentItem | undefined;
    let completedByBoss = false;
    let successMessage = "Этап похода пройден.";
    const persistentEnemyId = typeof pending.context?.persistentEnemyId === "string" ? pending.context.persistentEnemyId : undefined;
    const persistentEnemy = persistentEnemyId ? this.enemyById(persistentEnemyId) : undefined;
    if (persistentEnemy) {
      this.recordNpcDuelWithHero(persistentEnemy, heroWon);
      if (!heroWon) {
        persistentEnemy.experience += 35 + persistentEnemy.level * 2;
        persistentEnemy.gold = (persistentEnemy.gold ?? 0) + 45;
        this.progressEnemy(persistentEnemy, false);
      }
      this.recordEnemyHistory(persistentEnemy, `${heroWon ? "Проиграл" : "Победил"} ${this.save.hero.name} во время встречи в данже «${dungeon.name}».`);
    }

    if (mode === "route-node") {
      const node = routeNode!;
      expedition.visitedNodeIds = [...(expedition.visitedNodeIds ?? []), node.id];
      expedition.currentNodeId = node.id;
      expedition.stage = expedition.visitedNodeIds.length;
      expedition.path.push(`node:${node.kind}:${node.id}`);
      const elite = node.kind === "elite" || node.kind === "rival";
      const boss = node.kind === "boss" || node.kind === "alternate-boss";
      const alternateBoss = node.kind === "alternate-boss";
      completedByBoss = boss;
      if (heroWon) {
        const multiplier = node.rewardMultiplier || 1;
        expedition.accumulatedExperience += Math.round(dungeon.rewardExperience / expedition.maxStages * multiplier);
        expedition.accumulatedGold += Math.round(dungeon.rewardGold / expedition.maxStages * multiplier);
        const lootChance = boss ? 1 : elite ? 0.88 : 0.34;
        if (this.random.loot.chance(Math.min(1, lootChance + (expedition.lootChanceBonus ?? 0)))) {
          item = this.createRewardItem(Math.min(this.save.hero.level + (boss ? 3 : 2), dungeon.enemyLevel[1] + (boss ? 3 : 1)), {
            classId: this.save.hero.classId,
            minimumRarity: this.minimumRewardRarity(this.controlledDungeonMinimum(dungeon.id,
              alternateBoss
                ? improveMinimumRarity(dungeon.minimumRarity, 3)
                : boss
                  ? improveMinimumRarity(dungeon.minimumRarity, 2)
                  : elite
                    ? improveMinimumRarity(dungeon.minimumRarity, 1)
                    : dungeon.minimumRarity),
              "dungeon",
            ),
          }, (boss ? 0.35 : elite ? 0.2 : 0) + (expedition.lootChanceBonus ?? 0));
          expedition.loot.push(item);
        }
      }
      successMessage = boss
        ? `${alternateBoss ? "Тайный владыка" : "Хранитель"} «${dungeon.name}» повержен. Маршрут завершён, все трофеи сохранены.`
        : `${node.kind === "rival" ? "Соперник с арены" : elite ? "Элитный страж" : "Патруль"} повержен. Выберите следующий связанный узел маршрута.`;
    } else if (mode === "choice" && choiceId) {
      expedition.path.push(choiceId);
      if (heroWon) {
        expedition.accumulatedExperience += Math.round(dungeon.rewardExperience / expedition.maxStages * (choiceId === "risk" ? 1.55 : 1));
        expedition.accumulatedGold += Math.round(dungeon.rewardGold / expedition.maxStages * (choiceId === "risk" ? 1.7 : 1));
        if (this.random.loot.chance(choiceId === "risk" ? 0.72 : 0.34)) {
          item = this.createRewardItem(Math.min(this.save.hero.level + 2, dungeon.enemyLevel[1] + 1), {
            classId: this.save.hero.classId,
            minimumRarity: this.minimumRewardRarity(this.controlledDungeonMinimum(dungeon.id, dungeon.minimumRarity), "dungeon"),
          }, factionModifier(this.save.hero.factionReputation, "dungeonLootChance"));
          expedition.loot.push(item);
        }
        expedition.stage += 1;
      }
      successMessage = expedition.stage >= expedition.maxStages
        ? `Поход «${dungeon.name}» завершён. Все накопленные трофеи сохранены.`
        : `Этап ${expedition.stage}/${expedition.maxStages} пройден. Можно углубиться или отступить.`;
    }

    const battle: BattleReport = {
      activity: dungeon, heroBefore: combat.hero, enemyBefore: combat.enemy, winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied: false, turns: combat.turns, analysis: combat.analysis,
      rewards: { experience: 0, gold: 0, item, levelsGained: 0, unlockedSkills: [] }, worldEvents: [],
    };
    this.recordHeroEncounter(enemy, heroWon, combat.turns);
    this.recordMutationVictory(enemy, heroWon);
    this.save.pendingBattle = undefined;
    let result: ExpeditionStepReport;
    if (!heroWon) {
      result = this.finishExpedition(true, "Раненый герой отступил. Часть найденного удалось вынести.", battle);
    } else if (completedByBoss || expedition.stage >= expedition.maxStages && mode === "choice") {
      result = this.finishExpedition(false, successMessage, battle);
    } else if (expedition.health <= 0) {
      result = this.finishExpedition(true, "Герой исчерпал запас сил и вынужден отступить. Часть найденного удалось вынести.", battle);
    } else {
      result = { expedition, battle, completed: false, retreated: false, message: successMessage };
    }
    return { status: "complete", battle, result };
  }

  public fightBoss(bossId: string): DailyActivityReport {
    this.beginBoss(bossId);
    const result = this.runPendingBattleAutomatically();
    if (!result || !("kind" in result) || result.kind !== "duel") {
      throw new Error("Автоматический расчёт боя с боссом не вернул результат.");
    }
    return result;
  }

  public beginBoss(bossId: string): PendingBattle {
    this.assertNoPendingBattle();
    const boss = DUEL_BOSSES.find((candidate) => candidate.id === bossId);
    if (!boss) throw new Error("Особый противник не найден.");
    const availability = this.bossAvailability(boss);
    if (!availability.unlocked) throw new Error(availability.reason);
    this.prepareDayActivity();
    return this.createPendingBattle("boss", boss.id, this.createBossEnemy(boss), {}, "boss", undefined, {
      eventCursor: this.latestEventId(),
    });
  }

  public playTournament(arenaId: string): TournamentReport {
    this.beginTournament(arenaId);
    const result = this.runPendingBattleAutomatically();
    if (!result || !("matches" in result)) throw new Error("Автоматический расчёт турнира не вернул результат.");
    return result;
  }

  public beginTournament(arenaId: string): PendingBattle {
    this.assertNoPendingBattle();
    const arenaIndex = ARENAS.findIndex((candidate) => candidate.id === arenaId);
    const arena = ARENAS[arenaIndex];
    if (!arena) throw new Error("Турнир не найден.");
    const ruleIds = this.tournamentRules(arenaId).map((rule) => rule.id);
    if (this.save.tournamentRegistrations[arenaId] !== this.save.worldDay) {
      throw new Error("На этот турнир нет действующей записи или его день ещё не наступил.");
    }
    this.prepareDayActivity();
    const eliteIds = new Set(this.save.eliteLeagueMemberIds);
    const controllerId = this.save.factionControl?.arenaControllers[arena.id];
    const candidates = this.save.enemies
      .filter((enemy) => enemy.alive && enemy.arenaIndex === arenaIndex && !eliteIds.has(enemy.id));
    const byComparablePower = (first: EnemyProfile, second: EnemyProfile): number => (
      Math.abs(this.enemyPower(first) - this.heroPower()) - Math.abs(this.enemyPower(second) - this.heroPower())
    );
    const controlledSlots = controllerId ? Math.floor((arena.participants - 1) / 2) : 0;
    const controlled = candidates
      .filter((enemy) => enemy.factionId === controllerId)
      .sort(byComparablePower)
      .slice(0, controlledSlots);
    const controlledIds = new Set(controlled.map((enemy) => enemy.id));
    const pool = [...controlled, ...candidates.filter((enemy) => !controlledIds.has(enemy.id)).sort(byComparablePower)];
    if (pool.length < arena.participants - 1) {
      throw new Error(`На арене пока недостаточно бойцов: ${pool.length + 1}/${arena.participants}. Мир пополнит состав на следующий день.`);
    }
    const participantIds = ["hero", ...pool.slice(0, arena.participants - 1).map((enemy) => enemy.id)];
    const initialSeeds = this.random.world.shuffle(participantIds);
    const tournament: PendingTournamentState = {
      kind: "arena",
      activityId: arena.id,
      participantIds,
      initialSeeds,
      round: 1,
      pairs: pendingOpeningRound(initialSeeds),
      pairIndex: 0,
      roundWinners: [],
      matches: [],
      heroBattles: [],
      heroPlacement: arena.participants,
      ruleIds,
      eventCursor: this.latestEventId(),
    };
    const advanced = this.advancePendingTournament(tournament);
    if (!("session" in advanced)) throw new Error("Турнир завершился без боя главного героя.");
    return advanced;
  }

  private advancePendingTournament(state: PendingTournamentState): PendingBattle | TournamentReport {
    while (true) {
      if (state.pairIndex >= state.pairs.length) {
        if (state.roundWinners.length === 1) {
          return state.kind === "arena"
            ? this.completePendingArenaTournament(state, state.roundWinners[0])
            : this.completePendingCrownTournament(state, state.roundWinners[0]);
        }
        const winners = [...state.roundWinners];
        state.round += 1;
        state.pairs = [];
        for (let index = 0; index < winners.length; index += 2) state.pairs.push([winners[index], winners[index + 1]]);
        state.pairIndex = 0;
        state.roundWinners = [];
      }
      const [firstId, secondId] = state.pairs[state.pairIndex];
      if (!secondId) {
        state.roundWinners.push(firstId);
        state.matches.push({
          round: state.round, match: state.pairIndex + 1, firstId, winnerId: firstId,
          heroInvolved: firstId === "hero", bye: true,
        });
        state.pairIndex += 1;
        continue;
      }
      if (firstId === "hero" || secondId === "hero") {
        const enemyId = firstId === "hero" ? secondId : firstId;
        const enemy = this.enemyById(enemyId);
        if (!enemy) throw new Error("Соперник из турнирной сетки больше не существует.");
        const arena = ARENAS.find((candidate) => candidate.id === state.activityId);
        const options: CombatOptions = state.kind === "arena"
          ? { heroLevelCap: (arena?.enemyLevel[1] ?? this.save.hero.level) + 1, enemyLevelCap: (arena?.enemyLevel[1] ?? this.save.hero.level) + 1, ruleIds: state.ruleIds }
          : { ruleIds: state.ruleIds };
        return this.createPendingBattle(
          state.kind === "arena" ? "arena-tournament" : "crown-league",
          state.activityId,
          enemy,
          options,
          state.kind === "arena" ? "arena" : "crown-league",
          state,
        );
      }
      const first = this.enemyById(firstId);
      const second = this.enemyById(secondId);
      if (!first || !second) throw new Error("Участник турнирной сетки больше не существует.");
      const outcome = this.resolveNpcMatch(first, second, state.kind === "crown" || state.pairs.length <= 2, state.ruleIds);
      const winnerId = outcome.winner.id;
      state.roundWinners.push(winnerId);
      state.matches.push({
        round: state.round, match: state.pairIndex + 1, firstId, secondId, winnerId,
        heroInvolved: false, bye: false,
      });
      state.pairIndex += 1;
    }
  }

  private finalizePendingTournamentBattle(pending: PendingBattle, session: BattleSession): PendingBattleFinalization {
    const state = pending.tournament;
    if (!state) throw new Error("Состояние турнирной сетки отсутствует.");
    const enemy = this.enemyById(pending.enemyId);
    if (!enemy) throw new Error("Соперник из турнирной сетки больше не существует.");
    const combat = session.resolution();
    const heroWon = combat.winnerId === "hero";
    const arena = ARENAS.find((candidate) => candidate.id === state.activityId);
    const activity = state.kind === "arena"
      ? arena
      : ENDGAME_ACTIVITIES.find((candidate) => candidate.id === "crown-league");
    if (!activity) throw new Error("Активность сохранённого турнира больше не существует.");
    const enemyDied = state.kind === "arena" && heroWon && arena
      ? this.random.world.chance(Math.min(
        0.3,
        arena.lethalChance
          * eraLawModifiers(this.save.legacy.activeLawIds).arenaLethalityMultiplier
          * worldSeasonRule(this.save.worldSeason?.ruleId).lethalityMultiplier,
      ))
      : false;
    const battle: BattleReport = {
      activity, heroBefore: combat.hero, enemyBefore: combat.enemy, winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied, turns: combat.turns, analysis: combat.analysis,
      rewards: { experience: 0, gold: 0, levelsGained: 0, unlockedSkills: [] }, worldEvents: [], ruleIds: state.ruleIds,
    };
    if (heroWon) { this.save.hero.wins += 1; this.save.hero.tournamentMatchWins += 1; }
    else { this.save.hero.losses += 1; this.save.hero.tournamentMatchLosses += 1; }
    this.recordHeroEncounter(enemy, heroWon, combat.turns, enemyDied);
    this.recordMutationVictory(enemy, heroWon);
    this.updateEnemyAfterPlayerBattle(enemy, heroWon, enemyDied);
    if (state.kind === "crown") {
      this.adjustEliteRating("hero", heroWon ? 12 : -5);
      this.adjustEliteRating(enemy.id, heroWon ? -5 : 12);
      this.awardCrownSeason(heroWon ? "hero" : enemy.id, "win");
      this.awardCrownSeason(heroWon ? enemy.id : "hero", "loss");
    } else if (arena) {
      awardWorldSeasonPoints(this.save.worldSeason!, arena.id, heroWon ? "hero" : enemy.id, "win", heroWon ? this.save.hero.name : enemy.name);
      awardWorldSeasonPoints(this.save.worldSeason!, arena.id, heroWon ? enemy.id : "hero", "loss", heroWon ? enemy.name : this.save.hero.name);
    }
    const [firstId, secondId] = state.pairs[state.pairIndex];
    const winnerId = heroWon ? "hero" : enemy.id;
    state.matches.push({
      round: state.round, match: state.pairIndex + 1, firstId, secondId, winnerId,
      heroInvolved: true, battle, bye: false,
    });
    state.heroBattles.push(battle);
    state.roundWinners.push(winnerId);
    if (!heroWon) {
      const size = state.kind === "arena" ? arena!.participants : ELITE_SIZE;
      state.heroPlacement = Math.max(2, Math.floor(size / (2 ** (state.round - 1))));
    }
    state.pairIndex += 1;
    this.save.pendingBattle = undefined;
    const advanced = this.advancePendingTournament(state);
    if ("session" in advanced) return { status: "next-battle", battle, pendingBattle: advanced };
    return { status: "complete", battle, result: advanced };
  }

  private tournamentMatches(state: PendingTournamentState): TournamentMatch[] {
    return state.matches.filter((match) => !match.bye).map((match) => {
      const first = this.fighterById(match.firstId);
      const second = match.secondId ? this.fighterById(match.secondId) : undefined;
      const winner = this.fighterById(match.winnerId);
      return {
        round: match.round,
        match: match.match,
        firstName: first?.name ?? match.firstId,
        secondName: second?.name ?? "Автоматический проход",
        winnerName: winner?.name ?? match.winnerId,
        heroInvolved: match.heroInvolved,
        battle: match.battle,
        bye: match.bye,
      };
    });
  }

  private applyPendingNpcArenaMatches(state: PendingTournamentState, arenaIndex: number): void {
    state.matches.filter((match) => !match.heroInvolved && !match.bye && match.secondId).forEach((match) => {
      const winner = this.enemyById(match.winnerId);
      const loserId = match.winnerId === match.firstId ? match.secondId! : match.firstId;
      const loser = this.enemyById(loserId);
      if (!winner || !loser) return;
      winner.wins += 1;
      winner.arenaWins += 1;
      winner.experience += this.npcExperienceReward(65 + arenaIndex * 24);
      winner.gold = (winner.gold ?? 0) + 24 + arenaIndex * 12;
      loser.losses += 1;
      this.recordNpcRivalry(winner, loser);
      this.addFactionInfluence(winner, arenaIndex, 1);
      awardWorldSeasonPoints(this.save.worldSeason!, ARENAS[arenaIndex].id, winner.id, "win", winner.name);
      awardWorldSeasonPoints(this.save.worldSeason!, ARENAS[arenaIndex].id, loser.id, "loss", loser.name);
      this.progressEnemy(winner, false);
    });
  }

  private completePendingArenaTournament(state: PendingTournamentState, championId: string): TournamentReport {
    const arenaIndex = ARENAS.findIndex((candidate) => candidate.id === state.activityId);
    const arena = ARENAS[arenaIndex];
    if (!arena) throw new Error("Арена сохранённого турнира больше не существует.");
    this.applyPendingNpcArenaMatches(state, arenaIndex);
    const champion = this.fighterById(championId);
    if (!champion) throw new Error("Чемпион сохранённого турнира больше не существует.");
    const heroWon = championId === "hero";
    if (heroWon) {
      state.heroPlacement = 1;
      this.recordEquipmentDeeds(this.save.hero, "championship", `${arena.name}, день ${this.save.worldDay}`);
    }
    const roundsWon = state.heroBattles.filter((battle) => battle.heroWon).length;
    const baseExperience = heroWon ? arena.rewardExperience : Math.round(arena.rewardExperience * (0.12 + roundsWon * 0.13));
    const baseGold = heroWon ? arena.rewardGold : Math.round(arena.rewardGold * roundsWon * 0.04);
    const controlledReward = this.controlledArenaReward(
      arena.id,
      this.factionAdjustedReward(this.epochRewards(baseExperience, baseGold, "arena"), "tournamentReward"),
    );
    const { experience, gold } = controlledReward;
    const levelsGained = this.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    let item: EquipmentItem | undefined;
    let temperingMarks = 0;
    if (heroWon) {
      this.save.hero.arenaWins[arenaIndex] += 1;
      this.addHeroFactionInfluence(arenaIndex, 8 + arenaIndex * 2);
      if (this.save.hero.arenaWins[arenaIndex] >= arena.winsToAdvance && arenaIndex < ARENAS.length - 1) {
        this.save.hero.highestArena = Math.max(this.save.hero.highestArena, arenaIndex + 1);
      }
      const baseMinimum: Rarity = arenaIndex >= 4 ? "legendary" : arenaIndex >= 2 ? "epic" : "rare";
      const minimum = this.save.factionControl?.arenaControllers[arena.id] === "red-ledger"
        ? improveMinimumRarity(baseMinimum, 1)
        : baseMinimum;
      item = this.createRewardItem(Math.min(this.save.hero.level + 2, arena.enemyLevel[1] + 1), { classId: this.save.hero.classId, minimumRarity: minimum });
      this.addItem(item);
      if (arenaIndex >= 2) {
        temperingMarks = arenaIndex === ARENAS.length - 1 ? 2 : 1;
        this.save.hero.temperingMarks += temperingMarks;
      }
      this.advanceContract("tournament");
    } else {
      const npcChampion = champion as EnemyProfile;
      this.recordArenaChampionship(npcChampion, arenaIndex);
      npcChampion.gold = (npcChampion.gold ?? 0) + arena.rewardGold;
      this.addFactionInfluence(npcChampion, arenaIndex, 14 + arenaIndex * 2);
      this.maybeAwakenWorldRelic(npcChampion, false);
      this.recordEnemyHistory(npcChampion, `Стал чемпионом турнира «${arena.name}» в день ${this.save.worldDay}.`);
      npcChampion.rating = this.enemyWorldRating(npcChampion);
    }
    awardWorldSeasonPoints(this.save.worldSeason!, arena.id, championId, "champion", champion.name);
    this.recalculateHeroRating();
    this.event("tournament", `«${arena.name}» завершён. Чемпион: ${champion.name}. Участников: ${arena.participants}.`, {
      kind: "tournament", tournamentId: arena.id, tournamentName: arena.name,
      championId: champion.id, championName: champion.name, participants: arena.participants,
    });
    this.applyOfficialTournamentRecovery();
    delete this.save.tournamentRegistrations[arena.id];
    this.save.pendingBattle = undefined;
    this.completeDay(arena.id);
    return {
      activity: arena,
      day: this.save.worldDay - 1,
      participantCount: arena.participants,
      matches: this.tournamentMatches(state),
      heroBattles: state.heroBattles,
      championName: champion.name,
      heroWon,
      heroPlacement: state.heroPlacement,
      rewards: { experience, gold, item, levelsGained, unlockedSkills: [], temperingMarks },
      worldEvents: this.eventsSince(state.eventCursor),
      ruleIds: state.ruleIds,
    };
  }

  private completePendingCrownTournament(state: PendingTournamentState, championId: string): TournamentReport {
    const activity = ENDGAME_ACTIVITIES.find((candidate) => candidate.id === "crown-league")!;
    const wasElite = Boolean(state.wasElite);

    state.matches.filter((match) => !match.heroInvolved && !match.bye && match.secondId).forEach((match) => {
      const winner = this.enemyById(match.winnerId);
      const loserId = match.winnerId === match.firstId ? match.secondId! : match.firstId;
      const loser = this.enemyById(loserId);
      if (!winner || !loser) return;
      winner.wins += 1;
      winner.experience += 150;
      loser.losses += 1;
      this.adjustEliteRating(winner.id, 12);
      this.adjustEliteRating(loser.id, -5);
      this.awardCrownSeason(winner.id, "win");
      this.awardCrownSeason(loser.id, "loss");
      this.progressEnemy(winner, false);
    });

    const champion = this.fighterById(championId);
    if (!champion) throw new Error("Чемпион сохранённой Лиги короны больше не существует.");
    this.recordEquipmentDeeds(champion, "championship", `Лига короны, день ${this.save.worldDay}`);
    this.awardCrownSeason(champion.id, "champion");
    const heroWon = championId === "hero";
    if (heroWon) state.heroPlacement = 1;
    if (!heroWon) {
      const npc = champion as EnemyProfile;
      npc.tournamentWins += 1;
      this.save.eliteCrownWins[npc.id] = (this.save.eliteCrownWins[npc.id] ?? 0) + 1;
    }

    const roundsWon = state.heroBattles.filter((battle) => battle.heroWon).length;
    const baseExperience = heroWon ? activity.rewardExperience : Math.round(activity.rewardExperience * (0.12 + roundsWon * 0.12));
    const baseGold = heroWon ? activity.rewardGold : Math.round(activity.rewardGold * roundsWon * 0.05);
    const { experience, gold } = this.factionAdjustedReward(this.epochRewards(baseExperience, baseGold, "crown-league"), "tournamentReward");
    const levelsGained = this.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    let item: EquipmentItem | undefined;
    let temperingMarks = roundsWon > 0 ? 1 : 0;
    if (heroWon) {
      this.save.hero.crownLeagueWins += 1;
      this.save.hero.crownLeaguePoints += 20;
      temperingMarks = 4;
      item = this.createRewardItem(this.save.hero.level + 2, { classId: this.save.hero.classId, minimumRarity: "mythic" });
      this.addItem(item);
      if (!wasElite) this.promoteIntoElite("hero");
      else this.adjustEliteRating("hero", 28);
      this.advanceContract("tournament");
    } else if (wasElite) {
      this.save.hero.crownLeaguePoints += roundsWon * 3;
    }
    this.save.hero.temperingMarks += temperingMarks;
    this.save.lastCrownLeagueDay = this.save.worldDay;
    delete this.save.tournamentRegistrations["crown-league"];
    if (wasElite || !heroWon) this.sortEliteByRating();
    this.syncCrownSet();
    this.event("tournament", `Лига короны завершена. Чемпион: ${champion.name}. Сетка: ${ELITE_SIZE} бойцов.`, {
      kind: "tournament", tournamentId: activity.id, tournamentName: activity.name,
      championId: champion.id, championName: champion.name, participants: ELITE_SIZE,
    });
    this.applyOfficialTournamentRecovery();
    this.save.pendingBattle = undefined;
    this.completeDay();
    this.recalculateHeroRating();
    const rewards = { experience, gold, item, levelsGained, unlockedSkills: [] as SkillDefinition[], temperingMarks };
    const finalBattle = state.heroBattles[state.heroBattles.length - 1];
    if (finalBattle) finalBattle.rewards = rewards;
    return {
      activity, day: this.save.worldDay - 1, participantCount: ELITE_SIZE,
      matches: this.tournamentMatches(state), heroBattles: state.heroBattles,
      championName: champion.name, heroWon, heroPlacement: state.heroPlacement,
      rewards, worldEvents: this.eventsSince(state.eventCursor), ruleIds: state.ruleIds,
    };
  }

  public equip(itemId: string): void {
    const item = this.save.hero.inventory.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("Предмет не найден.");
    if (item.allowedClasses !== "all" && !item.allowedClasses.includes(this.save.hero.classId)) throw new Error("Этот класс не может использовать предмет.");
    this.save.hero.equipped[item.slot] = item.id;
  }

  public crownLeagueAvailability(): ActivityAvailability {
    const qualification = this.crownLeagueQualification();
    if (!qualification.unlocked) return qualification;
    const registeredDay = this.registeredCrownLeagueDay();
    const lastLeagueDay = this.save.lastCrownLeagueDay;
    if (registeredDay && registeredDay > this.save.worldDay) {
      return {
        unlocked: false,
        reason: `${qualification.reason} Вы записаны на день ${registeredDay}; до события ${registeredDay - this.save.worldDay} дн.`,
      };
    }
    if (lastLeagueDay === this.save.worldDay) {
      return {
        unlocked: false,
        reason: `Сегодняшняя Лига уже завершена. Следующая — в день ${this.nextCrownLeagueDay()}.`,
      };
    }
    if (registeredDay === this.save.worldDay) {
      return { unlocked: true, reason: `${qualification.reason} Сегодня день Лиги короны, место в сетке подтверждено.` };
    }
    return {
      unlocked: false,
      reason: `${qualification.reason} Для участия нужна предварительная запись; ближайшая Лига — в день ${this.nextCrownLeagueDay()}.`,
    };
  }

  public startExpedition(dungeonId: string): DungeonExpedition {
    if (this.save.activeExpedition) return this.save.activeExpedition;
    const dungeon = DUNGEONS.find((candidate) => candidate.id === dungeonId);
    if (!dungeon) throw new Error("Данж не найден.");
    const availability = this.availability(dungeon);
    if (!availability.unlocked) throw new Error(availability.reason);
    this.prepareDayActivity();
    const maxStages = dungeon.requiredArena >= 4 ? 5 : dungeon.requiredArena >= 2 ? 4 : 3;
    const discovery = this.dungeonDiscovery(dungeonId);
    const maxSupplies = maxStages + 1;
    this.save.activeExpedition = {
      dungeonId, stage: 0, maxStages,
      health: 100, accumulatedGold: 0, accumulatedExperience: 0, loot: [], path: [],
      route: generateDungeonRoute(dungeonId, maxStages, this.random.world),
      visitedNodeIds: [],
      discoveredNodeIds: [...discovery.discoveredNodeIds],
      encounteredFighterIds: [],
      supplies: maxSupplies,
      maxSupplies,
    };
    this.event("dungeon", `${this.save.hero.name} начал поход «${dungeon.name}».`, {
      kind: "dungeon", fighterId: "hero", fighterName: this.save.hero.name,
      dungeonId: dungeon.id, dungeonName: dungeon.name, outcome: "started",
    });
    return this.save.activeExpedition;
  }

  public expeditionRoute() {
    return this.save.activeExpedition?.route;
  }

  public dungeonDiscovery(dungeonId: string) {
    const source = this.save.dungeonDiscoveries?.[dungeonId];
    const normalized = normalizeDungeonDiscoveryState(dungeonId, source);
    const discovery = { ...normalized, alternateBossDefeated: source?.alternateBossDefeated ?? false };
    this.save.dungeonDiscoveries ??= {};
    this.save.dungeonDiscoveries[dungeonId] = discovery;
    return discovery;
  }

  public reachableExpeditionNodes(): DungeonRouteNode[] {
    const expedition = this.save.activeExpedition;
    if (!expedition?.route || expedition.pendingShrineNodeId || expedition.pendingMerchantNodeId) return [];
    return reachableDungeonNodes(
      expedition.route,
      expedition.visitedNodeIds ?? [],
      this.dungeonDiscovery(expedition.dungeonId),
    );
  }

  public expeditionShrineChoices(): ExpeditionShrineChoice[] {
    if (!this.save.activeExpedition?.pendingShrineNodeId) return [];
    return EXPEDITION_SHRINE_CHOICES.map((choice) => ({ ...choice }));
  }

  public resolveExpeditionShrine(choiceId: ExpeditionShrineChoiceId): ExpeditionStepReport {
    const expedition = this.save.activeExpedition;
    if (!expedition?.pendingShrineNodeId) throw new Error("Святилище не ожидает решения.");
    const choice = EXPEDITION_SHRINE_CHOICES.find((candidate) => candidate.id === choiceId);
    if (!choice) throw new Error("Такой клятвы у святилища нет.");
    if (choice.id === "blood-oath") {
      expedition.health = Math.max(1, expedition.health - 14);
      expedition.attackMultiplier = Math.max(1, expedition.attackMultiplier ?? 1) + 0.18;
    } else {
      expedition.accumulatedGold = Math.floor(expedition.accumulatedGold * 0.8);
      expedition.defenseMultiplier = Math.max(1, expedition.defenseMultiplier ?? 1) + 0.16;
      expedition.lootChanceBonus = Math.max(0, expedition.lootChanceBonus ?? 0) + 0.12;
    }
    expedition.path.push(`shrine:${choice.id}`);
    expedition.pendingShrineNodeId = undefined;
    this.event("dungeon", `${this.save.hero.name} принял клятву «${choice.name}».`, {
      kind: "dungeon", fighterId: "hero", fighterName: this.save.hero.name,
      dungeonId: expedition.dungeonId, outcome: "progressed",
    });
    return {
      expedition,
      completed: false,
      retreated: false,
      message: `${choice.name}: ${choice.benefit}. Цена: ${choice.cost}.`,
    };
  }

  public expeditionMerchantOptions(): Array<{ id: "healing" | "supplies" | "leave"; name: string; description: string; price: number }> {
    const expedition = this.save.activeExpedition;
    if (!expedition?.pendingMerchantNodeId || !expedition.route) return [];
    const node = expedition.route.nodes.find((candidate) => candidate.id === expedition.pendingMerchantNodeId);
    if (!node) return [];
    const terms = dungeonMerchantTerms(node, this.save.hero.level);
    return [
      { id: "healing", name: "Перевязать раны", description: `Восстановить ${terms.staminaRestored}% запаса сил.`, price: terms.healingPrice },
      { id: "supplies", name: "Купить припасы", description: "Восстановить две единицы провизии.", price: Math.max(1, Math.round(terms.healingPrice * 0.72)) },
      { id: "leave", name: "Продолжить путь", description: "Не тратить найденные монеты.", price: 0 },
    ];
  }

  public resolveExpeditionMerchant(choiceId: "healing" | "supplies" | "leave"): ExpeditionStepReport {
    const expedition = this.save.activeExpedition;
    if (!expedition?.pendingMerchantNodeId || !expedition.route) throw new Error("Торговец сейчас не ожидает решения.");
    const option = this.expeditionMerchantOptions().find((candidate) => candidate.id === choiceId);
    if (!option) throw new Error("Такого предложения у торговца нет.");
    const node = expedition.route.nodes.find((candidate) => candidate.id === expedition.pendingMerchantNodeId);
    if (!node) throw new Error("Торговец из маршрута больше не найден.");
    if (expedition.accumulatedGold < option.price) throw new Error(`Нужно найденных монет: ${option.price}.`);
    expedition.accumulatedGold -= option.price;
    if (choiceId === "healing") {
      const terms = dungeonMerchantTerms(node, this.save.hero.level);
      expedition.health = Math.min(100, expedition.health + terms.staminaRestored);
    } else if (choiceId === "supplies") {
      expedition.supplies = Math.min(expedition.maxSupplies ?? expedition.maxStages + 1, (expedition.supplies ?? 0) + 2);
    }
    expedition.path.push(`merchant:${choiceId}`);
    expedition.pendingMerchantNodeId = undefined;
    this.event("dungeon", choiceId === "leave"
      ? `${this.save.hero.name} отказался от сделки с подземным торговцем.`
      : `${this.save.hero.name} приобрёл у подземного торговца: ${option.name.toLocaleLowerCase("ru-RU")}.`, {
      kind: "dungeon", fighterId: "hero", fighterName: this.save.hero.name,
      dungeonId: expedition.dungeonId, outcome: "progressed",
    });
    return {
      expedition,
      completed: false,
      retreated: false,
      message: choiceId === "leave" ? "Торговец остался позади." : `${option.name}: потрачено ${option.price} найденных монет.`,
    };
  }

  public advanceExpeditionNode(nodeId: string): ExpeditionStepReport {
    const started = this.beginExpeditionNode(nodeId);
    if (!("version" in started)) return started;
    const result = this.runPendingBattleAutomatically();
    if (!result || !("completed" in result)) throw new Error("Автоматический расчёт этапа похода не вернул результат.");
    return result as ExpeditionStepReport;
  }

  public beginExpeditionNode(nodeId: string): PendingBattle | ExpeditionStepReport {
    this.assertNoPendingBattle();
    const expedition = this.save.activeExpedition;
    if (!expedition?.route) throw new Error("Для текущего похода маршрут ещё не построен.");
    if (expedition.pendingShrineNodeId) throw new Error("Сначала завершите выбор у святилища.");
    if (expedition.pendingMerchantNodeId) throw new Error("Сначала завершите разговор с подземным торговцем.");
    const node = this.reachableExpeditionNodes().find((candidate) => candidate.id === nodeId);
    if (!node) throw new Error("Этот узел не связан с текущим положением экспедиции.");
    this.consumeExpeditionSupply(expedition);
    const discovery = recordDungeonNodeVisit(expedition.route, this.dungeonDiscovery(expedition.dungeonId), node.id);
    this.save.dungeonDiscoveries![expedition.dungeonId] = {
      ...discovery,
      alternateBossDefeated: this.save.dungeonDiscoveries?.[expedition.dungeonId]?.alternateBossDefeated ?? false,
    };
    expedition.discoveredNodeIds = [...discovery.discoveredNodeIds];
    if (node.kind === "cache" || node.kind === "camp" || node.kind === "shrine" || node.kind === "trap" || node.kind === "merchant") {
      expedition.visitedNodeIds = [...(expedition.visitedNodeIds ?? []), node.id];
      expedition.currentNodeId = node.id;
      expedition.stage = expedition.visitedNodeIds.length;
      expedition.path.push(`node:${node.kind}:${node.id}`);
      if (node.kind === "cache") return this.resolveExpeditionCache(node);
      if (node.kind === "camp") return this.resolveExpeditionCamp(node);
      if (node.kind === "trap") return this.resolveExpeditionTrap(node);
      if (node.kind === "merchant") {
        expedition.pendingMerchantNodeId = node.id;
        return {
          expedition, completed: false, retreated: false, requiresChoice: true,
          message: "Подземный торговец предлагает восстановить силы или пополнить припасы.",
        };
      }
      expedition.pendingShrineNodeId = node.id;
      return {
        expedition, completed: false, retreated: false, requiresChoice: true,
        message: "Святилище требует клятвы. Выберите силу и примите её цену.",
      };
    }
    const dungeon = DUNGEONS.find((candidate) => candidate.id === expedition.dungeonId)!;
    const elite = node.kind === "elite" || node.kind === "rival";
    const boss = node.kind === "boss" || node.kind === "alternate-boss";
    const alternateBoss = node.kind === "alternate-boss";
    const levelBonus = node.depth + (boss ? 5 : elite ? 3 : 0);
    const persistentRival = node.kind === "rival"
      ? selectPersistentDungeonRival(
        node,
        this.save.enemies.filter((enemy) => enemy.alive && enemy.arenaIndex >= dungeon.requiredArena),
        expedition.encounteredFighterIds,
      )
      : undefined;
    const enemy = persistentRival ?? this.createDungeonEnemy([
      Math.min(dungeon.enemyLevel[1] + (boss ? 3 : 1), dungeon.enemyLevel[0] + levelBonus),
      Math.min(dungeon.enemyLevel[1] + (boss ? 4 : 2), dungeon.enemyLevel[0] + levelBonus + 2),
    ], dungeon.name);
    if (persistentRival) {
      expedition.encounteredFighterIds = [...new Set([...(expedition.encounteredFighterIds ?? []), persistentRival.id])];
      if (node.event?.type === "rival") node.event.opponentId = persistentRival.id;
    } else if (elite) {
      enemy.name = `Элитный страж: ${enemy.name.replace(/^Хранитель:\s*/, "")}`;
      enemy.title = `именной хранитель «${dungeon.name}»`;
    } else if (boss) {
      enemy.name = `${alternateBoss ? "Тайный владыка" : "Владыка глубин"}: ${enemy.name.replace(/^Хранитель:\s*/, "")}`;
      enemy.title = `${alternateBoss ? "скрытый хозяин" : "финальный хранитель"} «${dungeon.name}»`;
    }
    const wear = Math.max(0, Math.round((100 - expedition.health) * 1.8));
    const temporaryHero: HeroProfile = {
      ...this.save.hero,
      injuries: [...this.save.hero.injuries, ...(wear > 0 ? [{
        id: "expedition-wear", name: "Усталость похода", description: "Накопленная усталость снижает запас сил.",
        remainingDays: 1, stats: { health: -wear }, gainedDay: this.save.worldDay,
      }] : [])],
    };
    const enemyMultiplier = alternateBoss ? 1.52 : boss ? 1.28 : elite ? 1.14 : 1;
    return this.createPendingBattle("expedition", dungeon.id, enemy, {
      heroStatMultipliers: { attack: expedition.attackMultiplier ?? 1, defense: expedition.defenseMultiplier ?? 1 },
      enemyStatMultipliers: { health: enemyMultiplier, attack: alternateBoss ? 1.26 : boss ? 1.16 : elite ? 1.08 : 1, defense: enemyMultiplier },
    }, boss ? "boss" : "dungeon", undefined, {
      expeditionMode: "route-node", nodeId: node.id, nodeKind: node.kind,
      persistentEnemyId: persistentRival?.id,
    }, temporaryHero);
  }

  private resolveExpeditionCache(node: DungeonRouteNode): ExpeditionStepReport {
    const expedition = this.save.activeExpedition!;
    const dungeon = DUNGEONS.find((candidate) => candidate.id === expedition.dungeonId)!;
    const gold = Math.max(1, Math.round(dungeon.rewardGold / expedition.maxStages * node.rewardMultiplier));
    expedition.accumulatedGold += gold;
    let item: EquipmentItem | undefined;
    const lootChance = Math.min(0.9, 0.42 + (expedition.lootChanceBonus ?? 0)
      + factionModifier(this.save.hero.factionReputation, "dungeonLootChance"));
    if (this.random.loot.chance(lootChance)) {
      item = this.createRewardItem(Math.min(this.save.hero.level + 1, dungeon.enemyLevel[1]), {
        classId: this.save.hero.classId,
        minimumRarity: this.minimumRewardRarity(this.controlledDungeonMinimum(dungeon.id, dungeon.minimumRarity), "dungeon"),
      }, 0.08 + (expedition.lootChanceBonus ?? 0));
      expedition.loot.push(item);
    }
    this.event("loot", `${this.save.hero.name} нашёл тайник: ${gold} монет${item ? ` и «${item.name}»` : ""}.`, {
      kind: "loot", fighterId: "hero", fighterName: this.save.hero.name,
      itemId: item?.id, itemName: item?.name, rarity: item?.rarity, source: `dungeon-cache:${dungeon.id}`,
    });
    return {
      expedition,
      completed: false,
      retreated: false,
      message: `Тайник открыт без боя. Найдено ${gold} монет${item ? ` и предмет «${item.name}»` : ""}.`,
    };
  }

  private resolveExpeditionTrap(node: DungeonRouteNode): ExpeditionStepReport {
    const expedition = this.save.activeExpedition!;
    const resolution = resolveDungeonTrap(node, expedition.health, expedition.accumulatedGold);
    expedition.health = resolution.staminaAfter;
    expedition.accumulatedGold = resolution.goldAfter;
    this.event("dungeon", `${this.save.hero.name} попал в ловушку: -${resolution.staminaLost}% сил, -${resolution.goldLost} найденных монет.`, {
      kind: "dungeon", fighterId: "hero", fighterName: this.save.hero.name,
      dungeonId: expedition.dungeonId, outcome: "progressed",
    });
    if (expedition.health <= 0) {
      return this.finishExpedition(true, "Ловушка исчерпала запас сил. Герой вынужден покинуть данж.");
    }
    return {
      expedition,
      completed: false,
      retreated: false,
      message: `Ловушка отняла ${resolution.staminaLost}% сил и ${resolution.goldLost} монет, но открыла сведения о скрытом пути.`,
    };
  }

  private resolveExpeditionCamp(_node: DungeonRouteNode): ExpeditionStepReport {
    const expedition = this.save.activeExpedition!;
    const before = expedition.health;
    expedition.health = Math.min(100, expedition.health + 30);
    expedition.supplies = Math.min(expedition.maxSupplies ?? expedition.maxStages + 1, (expedition.supplies ?? 0) + 1);
    expedition.daysSpent = (expedition.daysSpent ?? 0) + 1;
    let incident = "";
    if (this.random.world.chance(0.18)) {
      const loss = this.random.world.int(6, 11);
      expedition.health = Math.max(1, expedition.health - loss);
      incident = ` Ночью патруль потревожил лагерь: потеряно ${loss}% запаса сил.`;
    }
    const recovered = Math.max(0, expedition.health - before);
    this.event("dungeon", `${this.save.hero.name} устроил лагерь в походе и восстановил ${recovered}% запаса сил.${incident}`, {
      kind: "dungeon", fighterId: "hero", fighterName: this.save.hero.name,
      dungeonId: expedition.dungeonId, outcome: "progressed",
    });
    this.completeDay();
    return {
      expedition,
      completed: false,
      retreated: false,
      message: `Лагерь восстановил ${recovered}% запаса сил и занял один день.${incident}`,
    };
  }

  private resolveExpeditionBattleNode(node: DungeonRouteNode): ExpeditionStepReport {
    const expedition = this.save.activeExpedition!;
    const dungeon = DUNGEONS.find((candidate) => candidate.id === expedition.dungeonId)!;
    const elite = node.kind === "elite";
    const boss = node.kind === "boss";
    const levelBonus = node.depth + (boss ? 5 : elite ? 3 : 0);
    const enemy = this.createDungeonEnemy([
      Math.min(dungeon.enemyLevel[1] + (boss ? 3 : 1), dungeon.enemyLevel[0] + levelBonus),
      Math.min(dungeon.enemyLevel[1] + (boss ? 4 : 2), dungeon.enemyLevel[0] + levelBonus + 2),
    ], dungeon.name);
    if (elite) {
      enemy.name = `Элитный страж: ${enemy.name.replace(/^Хранитель:\s*/, "")}`;
      enemy.title = `именной хранитель «${dungeon.name}»`;
    } else if (boss) {
      enemy.name = `Владыка глубин: ${enemy.name.replace(/^Хранитель:\s*/, "")}`;
      enemy.title = `финальный хранитель «${dungeon.name}»`;
    }
    const wear = Math.max(0, Math.round((100 - expedition.health) * 1.8));
    const temporaryHero: HeroProfile = {
      ...this.save.hero,
      injuries: [...this.save.hero.injuries, ...(wear > 0 ? [{
        id: "expedition-wear", name: "Усталость похода", description: "Накопленная усталость снижает запас сил.",
        remainingDays: 1, stats: { health: -wear }, gainedDay: this.save.worldDay,
      }] : [])],
    };
    const enemyMultiplier = boss ? 1.28 : elite ? 1.14 : 1;
    const combat = this.resolveWorldCombat(enemy, {
      heroStatMultipliers: {
        attack: expedition.attackMultiplier ?? 1,
        defense: expedition.defenseMultiplier ?? 1,
      },
      enemyStatMultipliers: {
        health: enemyMultiplier,
        attack: boss ? 1.16 : elite ? 1.08 : 1,
        defense: enemyMultiplier,
      },
    }, boss ? "boss" : "dungeon", temporaryHero);
    const heroWon = combat.winnerId === "hero";
    const lastTurn = combat.turns[combat.turns.length - 1];
    const remainingHealth = heroWon
      ? (lastTurn?.actorId === "hero" ? lastTurn.actorHealth : lastTurn?.targetHealth ?? combat.hero.maxHealth)
      : 0;
    expedition.health = expeditionStaminaAfterBattle(
      expedition.health,
      combat.hero.maxHealth,
      remainingHealth,
      expeditionBattleExertion(boss ? "boss" : elite ? "elite" : "battle"),
    );
    const multiplier = node.rewardMultiplier || 1;
    const stageExperience = Math.round(dungeon.rewardExperience / expedition.maxStages * multiplier);
    const stageGold = Math.round(dungeon.rewardGold / expedition.maxStages * multiplier);
    let item: EquipmentItem | undefined;
    if (heroWon) {
      expedition.accumulatedExperience += stageExperience;
      expedition.accumulatedGold += stageGold;
      const lootChance = boss ? 1 : elite ? 0.88 : 0.34;
      if (this.random.loot.chance(Math.min(1, lootChance + (expedition.lootChanceBonus ?? 0)))) {
        item = this.createRewardItem(Math.min(this.save.hero.level + (boss ? 3 : 2), dungeon.enemyLevel[1] + (boss ? 3 : 1)), {
          classId: this.save.hero.classId,
          minimumRarity: this.minimumRewardRarity(this.controlledDungeonMinimum(
            dungeon.id,
            boss ? improveMinimumRarity(dungeon.minimumRarity, 2) : elite ? improveMinimumRarity(dungeon.minimumRarity, 1) : dungeon.minimumRarity,
          ),
            "dungeon",
          ),
        }, (boss ? 0.35 : elite ? 0.2 : 0) + (expedition.lootChanceBonus ?? 0));
        expedition.loot.push(item);
      }
    }
    const battle: BattleReport = {
      activity: dungeon, heroBefore: combat.hero, enemyBefore: combat.enemy, winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied: false, turns: combat.turns, analysis: combat.analysis,
      rewards: { experience: 0, gold: 0, item, levelsGained: 0, unlockedSkills: [] }, worldEvents: [],
    };
    this.recordHeroEncounter(enemy, heroWon, combat.turns);
    if (!heroWon) return this.finishExpedition(true, "Раненый герой отступил. Часть найденного удалось вынести.", battle);
    if (boss) return this.finishExpedition(false, `Хранитель «${dungeon.name}» повержен. Маршрут завершён, все трофеи сохранены.`, battle);
    if (expedition.health <= 0) {
      return this.finishExpedition(true, "Герой исчерпал запас сил и вынужден отступить. Часть найденного удалось вынести.", battle);
    }
    return {
      expedition,
      battle,
      completed: false,
      retreated: false,
      message: `${elite ? "Элитный страж" : "Патруль"} повержен. Выберите следующий связанный узел маршрута.`,
    };
  }

  private consumeExpeditionSupply(expedition: DungeonExpedition): void {
    const remaining = Math.max(0, expedition.supplies ?? expedition.maxStages + 1);
    if (remaining > 0) {
      expedition.supplies = remaining - 1;
      return;
    }
    expedition.supplies = 0;
    expedition.health = Math.max(1, expedition.health - 9);
    expedition.path.push("exhausted-supplies");
  }

  public expeditionChoices(): ExpeditionChoice[] {
    if (!this.save.activeExpedition) return [];
    const expedition = this.save.activeExpedition;
    return EXPEDITION_CHOICES.filter((choice) => choice.id !== "rest" || expedition.stage > 0 && expedition.health < 92);
  }

  public advanceExpedition(choiceId: ExpeditionChoice["id"]): ExpeditionStepReport {
    const started = this.beginExpeditionChoice(choiceId);
    if (!("version" in started)) return started;
    const result = this.runPendingBattleAutomatically();
    if (!result || !("completed" in result)) throw new Error("Автоматический расчёт этапа похода не вернул результат.");
    return result as ExpeditionStepReport;
  }

  public beginExpeditionChoice(choiceId: ExpeditionChoice["id"]): PendingBattle | ExpeditionStepReport {
    this.assertNoPendingBattle();
    const expedition = this.save.activeExpedition;
    if (!expedition) throw new Error("Активного похода нет.");
    const dungeon = DUNGEONS.find((candidate) => candidate.id === expedition.dungeonId)!;
    const choice = this.expeditionChoices().find((candidate) => candidate.id === choiceId);
    if (!choice) throw new Error("Этот путь сейчас недоступен.");

    if (choice.id === "rest") {
      expedition.path.push(choice.id);
      expedition.health = Math.min(100, expedition.health + 28);
      expedition.stage += 1;
      if (expedition.stage >= expedition.maxStages) return this.finishExpedition(false, `Герой закрепил добычу и нашёл выход из «${dungeon.name}».`);
      return { expedition, completed: false, retreated: false, message: "Лагерь восстановил силы, но приблизил поход к развязке." };
    }

    const levelBonus = expedition.stage + (choice.id === "risk" ? 3 : 0);
    const enemy = this.createDungeonEnemy([
      Math.min(dungeon.enemyLevel[1] + 2, dungeon.enemyLevel[0] + levelBonus),
      Math.min(dungeon.enemyLevel[1] + 3, dungeon.enemyLevel[0] + levelBonus + 2),
    ], dungeon.name);
    const wear = Math.max(0, Math.round((100 - expedition.health) * 1.8));
    const temporaryHero: HeroProfile = {
      ...this.save.hero,
      injuries: [...this.save.hero.injuries, ...(wear > 0 ? [{ id: "expedition-wear", name: "Усталость похода", description: "Накопленная усталость снижает запас сил.", remainingDays: 1, stats: { health: -wear }, gainedDay: this.save.worldDay }] : [])],
    };
    return this.createPendingBattle("expedition", dungeon.id, enemy, {}, "dungeon", undefined, {
      expeditionMode: "choice", choiceId: choice.id,
    }, temporaryHero);
  }

  public retreatExpedition(): ExpeditionStepReport {
    if (!this.save.activeExpedition) throw new Error("Активного похода нет.");
    return this.finishExpedition(true, "Герой добровольно вернулся наверх и сохранил часть добычи.");
  }

  private finishExpedition(retreated: boolean, message: string, battle?: BattleReport): ExpeditionStepReport {
    const expedition = this.save.activeExpedition!;
    const finishedExpedition: DungeonExpedition = {
      ...expedition,
      loot: [...expedition.loot],
      path: [...expedition.path],
    };
    const dungeon = DUNGEONS.find((candidate) => candidate.id === expedition.dungeonId)!;
    const dungeonController = this.save.factionControl?.dungeonControllers?.[dungeon.id];
    const multiplier = retreated
      ? Math.min(0.95, 0.55 + factionModifier(this.save.hero.factionReputation, "retreatRetention"))
      : 1;
    const baseExperience = Math.round(expedition.accumulatedExperience * multiplier);
    const baseGold = Math.round(expedition.accumulatedGold * multiplier);
    const { experience, gold } = this.epochRewards(baseExperience, baseGold, "dungeon");
    const keptCount = retreated ? Math.ceil(expedition.loot.length / 2) : expedition.loot.length;
    const items = expedition.loot.slice(0, keptCount);
    items.forEach((item) => this.addItem(item));
    this.save.hero.gold += gold;
    const levelsGained = this.gainHeroExperience(experience);
    if (retreated) { this.save.hero.losses += 1; this.save.hero.dungeonLosses += 1; }
    else {
      this.save.hero.wins += 1; this.save.hero.dungeonWins += 1;
      this.save.dungeonClears[dungeon.id] = this.save.worldDay;
      this.advanceContract("dungeon");
      const preferred = FACTIONS
        .map((faction) => ({ id: faction.id, reputation: this.save.hero.factionReputation[faction.id] ?? 0 }))
        .sort((first, second) => second.reputation - first.reputation)[0];
      const supportedFactionId = preferred && preferred.reputation > 0
        ? preferred.id
        : dungeonController ?? FACTIONS[0].id;
      this.save.factionControl = changeFactionInfluence(
        this.save.factionControl ?? createFactionControlState(this.save.worldDay),
        "dungeon",
        dungeon.id,
        supportedFactionId,
        7 + dungeon.requiredArena * 2,
      );
    }
    if (expedition.route) {
      const source = this.dungeonDiscovery(dungeon.id);
      const next = retreated
        ? source
        : completeDungeonExploration(expedition.route, source, expedition.visitedNodeIds ?? []);
      this.save.dungeonDiscoveries![dungeon.id] = {
        ...next,
        alternateBossDefeated: source.alternateBossDefeated
          || !retreated && expedition.path.some((entry) => entry.includes("alternate-boss")),
      };
    }
    this.save.activeExpedition = undefined;
    this.event("dungeon", message, {
      kind: "dungeon", fighterId: "hero", fighterName: this.save.hero.name,
      dungeonId: dungeon.id, dungeonName: dungeon.name, outcome: retreated ? "retreated" : "completed",
    });
    this.completeDay();
    const rewards = { experience, gold, item: items[0], items, levelsGained, unlockedSkills: [] };
    if (battle) battle.rewards = rewards;
    return {
      expedition: finishedExpedition, battle, completed: !retreated, retreated, message,
      rewards,
    };
  }

  private crownLeagueQualification(): ActivityAvailability {
    const hero = this.save.hero;
    const finalArenaIndex = ARENAS.length - 1;
    if (hero.highestArena < finalArenaIndex || (hero.arenaWins[finalArenaIndex] ?? 0) < 1) {
      return { unlocked: false, reason: `Сначала станьте чемпионом турнира «${ARENAS[finalArenaIndex].name}».` };
    }
    const eliteRank = this.heroEliteRank();
    if (eliteRank) {
      return { unlocked: true, reason: `Место в элите: #${eliteRank}. Вы входите в сетку из ${ELITE_SIZE} бойцов.` };
    }
    const ordinaryRank = this.heroRank();
    if (!ordinaryRank || ordinaryRank > 2) {
      return { unlocked: false, reason: `Для квалификации нужно место #1–2 обычного рейтинга. Сейчас: #${ordinaryRank || "—"}.` };
    }
    return { unlocked: true, reason: `Квалификация с места #${ordinaryRank}: только чемпион турнира войдёт в элиту.` };
  }

  public legendHuntAvailability(): ActivityAvailability {
    const eliteRank = this.heroEliteRank();
    if (!eliteRank) return { unlocked: false, reason: "Сначала войдите в элитную тридцатку через Лигу короны." };
    if (eliteRank > LEGEND_COUNT + 1) return { unlocked: false, reason: `Поднимитесь до #${LEGEND_COUNT + 1} в элите. Сейчас: #${eliteRank}.` };
    if (eliteRank === 1) return { unlocked: false, reason: "Вы — первая легенда. Осталось защищать корону от претендентов." };
    const lastHunt = this.save.lastLegendHuntDay;
    if (lastHunt !== undefined && this.save.worldDay - lastHunt < 4) {
      return { unlocked: false, reason: `Новая легенда появится через ${4 - (this.save.worldDay - lastHunt)} дн.` };
    }
    const target = this.currentLegendTarget();
    if (!target) return { unlocked: false, reason: "Следующий соперник в элите пока не определён." };
    return { unlocked: true, reason: `Следующая ступень: #${eliteRank - 1} ${target.name}. Перепрыгнуть через неё нельзя.` };
  }

  public crownLeagueTier(): { name: string; index: number; nextAt?: number } {
    const rank = this.heroEliteRank();
    if (!rank) return { name: "Претендент", index: 0 };
    if (rank === 1) return { name: "Первая легенда", index: 3 };
    if (rank <= LEGEND_COUNT) return { name: `Легенда #${rank}`, index: 2 };
    return { name: `Элита #${rank}`, index: 1, nextAt: LEGEND_COUNT };
  }

  public eliteLeaderboard(): LeaderboardEntry[] {
    return this.save.eliteLeagueMemberIds
      .map((id) => this.leaderboardEntry(id, true))
      .filter((entry): entry is LeaderboardEntry => Boolean(entry));
  }

  public heroEliteRank(): number | undefined {
    const index = this.save.eliteLeagueMemberIds.indexOf("hero");
    return index >= 0 ? index + 1 : undefined;
  }

  public legendTitle(rank: number): string | undefined {
    return ["Первая корона", "Правая рука короны", "Железное имя", "Четвёртое знамя", "Последняя легенда"][rank - 1];
  }

  public currentLegendTarget(): EnemyProfile | undefined {
    const rank = this.heroEliteRank();
    if (!rank || rank <= 1 || rank > LEGEND_COUNT + 1) return undefined;
    return this.enemyById(this.save.eliteLeagueMemberIds[rank - 2]);
  }

  public pendingLegendChallenge(): EnemyProfile | undefined {
    return this.save.pendingEliteChallengeId ? this.enemyById(this.save.pendingEliteChallengeId) : undefined;
  }

  public playCrownLeague(): TournamentReport {
    this.beginCrownLeague();
    const result = this.runPendingBattleAutomatically();
    if (!result || !("matches" in result)) throw new Error("Автоматический расчёт Лиги короны не вернул результат.");
    return result;
  }

  public beginCrownLeague(): PendingBattle {
    this.assertNoPendingBattle();
    const availability = this.crownLeagueAvailability();
    if (!availability.unlocked) throw new Error(availability.reason);
    this.prepareDayActivity();
    this.ensureEliteLeague();
    const wasElite = Boolean(this.heroEliteRank());
    const rosterIds = wasElite
      ? [...this.save.eliteLeagueMemberIds]
      : ["hero", ...this.save.eliteLeagueMemberIds.slice(0, ELITE_SIZE - 1)];
    const initialSeeds = rosterIds
      .map((id) => this.fighterById(id))
      .filter((fighter): fighter is HeroProfile | EnemyProfile => Boolean(fighter))
      .sort((first, second) => this.fighterTournamentSeed(second) - this.fighterTournamentSeed(first))
      .map((fighter) => fighter.id);
    if (initialSeeds.length !== ELITE_SIZE || new Set(initialSeeds).size !== ELITE_SIZE) {
      throw new Error("Элитная сетка ещё не собрана.");
    }
    const tournament: PendingTournamentState = {
      kind: "crown",
      activityId: "crown-league",
      participantIds: [...initialSeeds],
      initialSeeds,
      round: 1,
      pairs: pendingOpeningRound(initialSeeds),
      pairIndex: 0,
      roundWinners: [],
      matches: [],
      heroBattles: [],
      heroPlacement: ELITE_SIZE,
      ruleIds: [...this.save.crownSeason.ruleIds],
      wasElite,
      eventCursor: this.latestEventId(),
    };
    const advanced = this.advancePendingTournament(tournament);
    if (!("session" in advanced)) throw new Error("Лига короны завершилась без боя главного героя.");
    return advanced;
  }

  public huntLegend(): BattleReport {
    this.beginLegendHunt();
    const result = this.runPendingBattleAutomatically();
    if (!result || !("winnerId" in result)) throw new Error("Автоматический расчёт охоты на легенду не вернул результат.");
    return result as BattleReport;
  }

  public beginLegendHunt(): PendingBattle {
    this.assertNoPendingBattle();
    const availability = this.legendHuntAvailability();
    if (!availability.unlocked) throw new Error(availability.reason);
    this.prepareDayActivity();
    return this.createPendingBattle("legend-hunt", "legend-hunt", this.currentLegendTarget()!, {}, "legend-hunt", undefined, {
      eventCursor: this.latestEventId(),
    });
  }

  public defendLegendTitle(): BattleReport {
    this.beginLegendDefense(true);
    const result = this.runPendingBattleAutomatically();
    if (!result || !("winnerId" in result)) throw new Error("Автоматический расчёт защиты легенды не вернул результат.");
    return result as BattleReport;
  }

  public beginLegendDefense(advanceDay = true): PendingBattle {
    this.assertNoPendingBattle();
    if (this.save.activeExpedition) throw new Error("Сначала завершите текущий поход или отступите.");
    const enemy = this.pendingLegendChallenge();
    const rank = this.heroEliteRank();
    if (!enemy || !rank || rank > LEGEND_COUNT) throw new Error("Активного вызова легенде нет.");
    return this.createPendingBattle("legend-defense", "legend-defense", enemy, {}, "legend-hunt", undefined, {
      advanceDay,
      eventCursor: this.latestEventId(),
    });
  }

  private resolveLegendDefense(advanceDay: boolean): BattleReport {
    this.beginLegendDefense(advanceDay);
    const result = this.runPendingBattleAutomatically();
    if (!result || !("winnerId" in result)) throw new Error("Автоматический расчёт защиты легенды не вернул результат.");
    return result as BattleReport;
  }

  public equipBest(mode: "power" | "set" = "power"): EquipmentItem[] {
    const hero = this.save.hero;
    hero.equipped = findBestEquipmentLoadout(hero, mode);
    return equipmentItemsForLoadout(hero, hero.equipped);
  }

  public setAutoEquipBest(enabled: boolean): void {
    this.save.hero.autoEquipBest = enabled;
    if (enabled) this.equipBest();
  }

  public setAutoSelectSkills(enabled: boolean): void {
    this.save.hero.autoSelectSkills = enabled;
  }

  public setSelectedSkills(skillIds: string[]): SkillDefinition[] {
    const hero = this.save.hero;
    const equippedIds = new Set(Object.values(hero.equipped));
    const available = unlockedSkills(hero.classId, hero.level, hero.inventory.filter((item) => equippedIds.has(item.id)), hero.legacySkillId ? [hero.legacySkillId] : []);
    const availableById = new Map(available.map((skill) => [skill.id, skill]));
    const selected = skillIds
      .filter((id, index, values) => values.indexOf(id) === index && availableById.has(id))
      .slice(0, MAX_ACTIVE_SKILLS);
    hero.selectedSkillIds = selected;
    return selected.map((id) => availableById.get(id)!);
  }

  public setCombatMode(mode: "auto" | "manual"): void {
    this.save.hero.combatMode = mode;
  }

  public classChangeAvailability(): ActivityAvailability {
    const hero = this.save.hero;
    if (this.save.pendingBattle) return { unlocked: false, reason: "Сначала завершите или отмените начатый бой." };
    if (this.save.activeExpedition) return { unlocked: false, reason: "Сначала завершите текущий поход или отступите." };
    const finalArenaIndex = ARENAS.length - 1;
    if (hero.highestArena < finalArenaIndex || (hero.arenaWins[finalArenaIndex] ?? 0) < 1) {
      return { unlocked: false, reason: `Смена класса откроется после чемпионства на арене «${ARENAS[finalArenaIndex].name}».` };
    }
    if (hero.gold < CLASS_CHANGE_GOLD_COST) return { unlocked: false, reason: `Нужно ${CLASS_CHANGE_GOLD_COST.toLocaleString("ru-RU")} монет.` };
    if (hero.temperingMarks < CLASS_CHANGE_MARK_COST) return { unlocked: false, reason: `Нужно печатей закалки: ${CLASS_CHANGE_MARK_COST}.` };
    return { unlocked: true, reason: `Стоимость: ${CLASS_CHANGE_GOLD_COST.toLocaleString("ru-RU")} ¤ и ${CLASS_CHANGE_MARK_COST} печатей.` };
  }

  public changeHeroClass(classId: HeroClass): EquipmentItem[] {
    const hero = this.save.hero;
    if (classId === hero.classId) throw new Error("Этот класс уже выбран.");
    const availability = this.classChangeAvailability();
    if (!availability.unlocked) throw new Error(availability.reason);
    hero.gold -= CLASS_CHANGE_GOLD_COST;
    hero.temperingMarks -= CLASS_CHANGE_MARK_COST;
    hero.classId = classId;
    hero.classChanges += 1;
    hero.selectedSkillIds = [];
    (Object.keys(hero.equipped) as EquipmentSlot[]).forEach((slot) => {
      const item = hero.inventory.find((candidate) => candidate.id === hero.equipped[slot]);
      if (item && item.allowedClasses !== "all" && !item.allowedClasses.includes(classId)) delete hero.equipped[slot];
    });
    createStarterItems(classId, this.random.loot).forEach((starter) => {
      const hasCompatibleSlot = hero.inventory.some((item) => item.slot === starter.slot
        && (item.allowedClasses === "all" || item.allowedClasses.includes(classId)));
      if (!hasCompatibleSlot) this.addItem(starter);
    });
    const equipped = this.equipBest();
    this.event("system", `${hero.name} сменил класс и теперь следует пути «${CLASS_DEFINITIONS[classId].name}».`);
    return equipped;
  }

  public unequip(slot: EquipmentSlot): void {
    delete this.save.hero.equipped[slot];
  }

  public sell(itemId: string): number {
    const item = this.save.hero.inventory.find((candidate) => candidate.id === itemId);
    if (!item) return 0;
    if (Object.values(this.save.hero.equipped).includes(itemId)) throw new Error("Сначала снимите предмет.");
    if (!this.canSellItem(item)) throw new Error("Регалии живой короны нельзя продать, пока они принадлежат лидеру элиты.");
    const value = Math.max(1, Math.round(item.price * 0.45));
    this.returnHeroRelicToWorld(item, `День ${this.save.worldDay}: ${this.save.hero.name} продал реликвию обратно в мир.`);
    this.save.hero.inventory = this.save.hero.inventory.filter((candidate) => candidate.id !== itemId);
    this.save.hero.gold += value;
    return value;
  }

  public canSell(itemId: string): boolean {
    const item = this.save.hero.inventory.find((candidate) => candidate.id === itemId);
    return item ? this.canSellItem(item) : false;
  }

  public canSellItem(item: Readonly<Pick<EquipmentItem, "templateId">>): boolean {
    eliteRegaliaTemplateIds ??= new Set(ITEM_TEMPLATES.filter((template) => template.exclusiveToElite).map((template) => template.id));
    return !eliteRegaliaTemplateIds.has(item.templateId);
  }

  public sellUnequipped(): { count: number; value: number } {
    const equippedIds = new Set(Object.values(this.save.hero.equipped));
    const sellable = this.save.hero.inventory.filter((item) => !equippedIds.has(item.id) && this.canSellItem(item));
    const ids = new Set(sellable.map((item) => item.id));
    const value = sellable.reduce((total, item) => total + Math.max(1, Math.round(item.price * 0.45)), 0);
    sellable.forEach((item) => this.returnHeroRelicToWorld(item, `День ${this.save.worldDay}: реликвия покинула инвентарь ${this.save.hero.name}.`));
    this.save.hero.inventory = this.save.hero.inventory.filter((item) => !ids.has(item.id));
    this.save.hero.gold += value;
    return { count: sellable.length, value };
  }

  public temperingMarkPrice(): number {
    return temperingMarkPrice(this.save);
  }

  public buyTemperingMarks(quantity = 1): { quantity: number; cost: number } {
    return buyTemperingMarks(this.save, quantity);
  }

  public buy(index: number): EquipmentItem {
    const offer = this.save.shopOffers[index];
    if (!offer || offer.sold) throw new Error("Предмет уже продан.");
    if (this.save.hero.gold < offer.item.price) throw new Error("Недостаточно монет.");
    this.save.hero.gold -= offer.item.price;
    offer.sold = true;
    this.addItem(offer.item);
    if (offer.item.worldRelicId) {
      const recordIndex = (this.save.worldRelics ?? []).findIndex((candidate) => candidate.id === offer.item.worldRelicId);
      if (recordIndex >= 0) {
        const transfer = transferWorldRelic(
          this.save.worldRelics![recordIndex],
          offer.item,
          "hero",
          this.save.hero.name,
          `День ${this.save.worldDay}: реликвию приобрёл ${this.save.hero.name}.`,
        );
        this.save.worldRelics![recordIndex] = transfer.record;
        const inventoryIndex = this.save.hero.inventory.findIndex((item) => item.id === offer.item.id);
        if (inventoryIndex >= 0) this.save.hero.inventory[inventoryIndex] = transfer.item;
        offer.item = transfer.item;
      }
    }
    return offer.item;
  }

  public upgradeCost(itemId: string): number {
    const item = this.save.hero.inventory.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("Предмет не найден.");
    return this.upgradeCostFor(item);
  }

  public upgradeCostFor(item: Readonly<Pick<EquipmentItem, "enhancement">>): number {
    if (this.save.legacy.activeBoonId === "forge-tradition" && (item.enhancement ?? 0) === 0) return 0;
    return TEMPERING_MARK_COSTS[item.enhancement ?? 0] ?? 0;
  }

  public upgradeItem(itemId: string): EquipmentItem {
    const item = this.save.hero.inventory.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("Предмет не найден.");
    const current = item.enhancement ?? 0;
    if (current >= 5) throw new Error("Предмет уже достиг максимальной закалки.");
    const cost = this.upgradeCostFor(item);
    if (this.save.hero.temperingMarks < cost) throw new Error(`Нужно печатей закалки: ${cost}.`);
    this.save.hero.temperingMarks -= cost;
    item.enhancement = current + 1;
    item.level += 1;
    item.stats = Object.fromEntries(Object.entries(item.stats).map(([stat, value]) => [stat, Math.max(Number(value) + 1, Math.ceil(Number(value) * 1.08))]));
    item.price = calculateItemPrice(item.level, item.rarity);
    if (item.worldRelicId) {
      const recordIndex = (this.save.worldRelics ?? []).findIndex((record) => record.id === item.worldRelicId);
      if (recordIndex >= 0) this.save.worldRelics![recordIndex] = synchronizeWorldRelic(
        this.save.worldRelics![recordIndex],
        item,
        `День ${this.save.worldDay}: ${this.save.hero.name} закалил реликвию до +${item.enhancement}.`,
        this.save.worldDay,
      );
    }
    this.event("loot", `${item.name} улучшен в кузнице до +${item.enhancement}.`);
    return item;
  }

  public leaderboard(): LeaderboardEntry[] {
    return this.leaderboardAll().slice(0, 100);
  }

  public heroRank(): number | undefined {
    const index = this.leaderboardAll().findIndex((entry) => entry.id === "hero");
    return index >= 0 ? index + 1 : undefined;
  }

  private leaderboardAll(): LeaderboardEntry[] {
    const hero = this.save.hero;
    const eliteIds = new Set(this.save.eliteLeagueMemberIds);
    return [
      ...(!eliteIds.has("hero") ? [this.leaderboardEntry("hero")!] : []),
      ...this.save.enemies
        .filter((enemy) => enemy.alive && !eliteIds.has(enemy.id))
        .map((enemy) => this.leaderboardEntry(enemy.id)!),
    ].sort(byLeaderboardPosition);
  }

  private fighterById(id: string): HeroProfile | EnemyProfile | undefined {
    return id === "hero" ? this.save.hero : this.enemyById(id);
  }

  private enemyById(id: string): EnemyProfile | undefined {
    return this.save.enemies.find((enemy) => enemy.id === id && enemy.alive);
  }

  private leaderboardEntry(id: string, elite = false): LeaderboardEntry | undefined {
    const school = this.fighterSchool(id);
    if (id === "hero") {
      const hero = this.save.hero;
      return heroLeaderboardEntry(hero, {
        rating: elite ? (this.save.eliteRatings[id] ?? hero.rating) : hero.rating,
        crownLeagueWins: hero.crownLeagueWins,
        ...school && { schoolName: school.name, mentorName: school.mentorName, isMentor: school.isMentor },
      });
    }
    const enemy = this.enemyById(id);
    if (!enemy) return undefined;
    return enemyLeaderboardEntry(enemy, {
      rating: elite ? (this.save.eliteRatings[id] ?? enemy.rating) : enemy.rating,
      crownLeagueWins: this.save.eliteCrownWins[id] ?? 0,
      ...school && { schoolName: school.name, mentorName: school.mentorName, isMentor: school.isMentor },
    });
  }

  private ensureEliteLeague(): void {
    const finalArenaIndex = ARENAS.length - 1;
    const valid = new Set(this.save.enemies.filter((enemy) => enemy.alive).map((enemy) => enemy.id));
    if (this.save.eliteLeagueMemberIds.includes("hero")) valid.add("hero");
    this.save.eliteLeagueMemberIds = this.save.eliteLeagueMemberIds
      .filter((id, index, values) => valid.has(id) && values.indexOf(id) === index)
      .slice(0, ELITE_SIZE);

    const current = new Set(this.save.eliteLeagueMemberIds);
    let eligible = this.save.enemies.filter((enemy) => enemy.alive && enemy.arenaIndex === finalArenaIndex && enemy.tournamentWins > 0 && !current.has(enemy.id));
    while (this.save.eliteLeagueMemberIds.length + eligible.length < ELITE_SIZE) {
      const recruit = this.createEnemy(finalArenaIndex);
      recruit.tournamentWins = Math.max(1, recruit.tournamentWins);
      recruit.rating = this.enemyWorldRating(recruit);
      this.save.enemies.push(recruit); eligible.push(recruit);
    }
    eligible.sort((a, b) => (this.enemyPower(b) + b.rating) - (this.enemyPower(a) + a.rating));
    this.save.eliteLeagueMemberIds.push(...eligible.slice(0, ELITE_SIZE - this.save.eliteLeagueMemberIds.length).map((enemy) => enemy.id));
    this.save.eliteLeagueMemberIds.forEach((id, index) => {
      const fighter = this.fighterById(id);
      this.save.eliteRatings[id] ??= 6200 - index * 45 + (fighter ? Math.round((fighter.level + (id === "hero" ? this.heroPower() : this.enemyPower(fighter as EnemyProfile))) / 8) : 0);
      this.save.eliteCrownWins[id] ??= 0;
    });
  }

  private adjustEliteRating(id: string, amount: number): void {
    if (!this.save.eliteLeagueMemberIds.includes(id) && id !== "hero") return;
    const fallback = id === "hero" ? this.save.hero.rating : this.enemyById(id)?.rating ?? 1000;
    this.save.eliteRatings[id] = Math.max(1000, (this.save.eliteRatings[id] ?? fallback) + amount);
  }

  private sortEliteByRating(): void {
    this.save.eliteLeagueMemberIds.sort((first, second) =>
      (this.save.eliteRatings[second] ?? 0) - (this.save.eliteRatings[first] ?? 0));
  }

  private swapEliteMembers(winnerId: string, loserId: string): void {
    const winnerIndex = this.save.eliteLeagueMemberIds.indexOf(winnerId);
    const loserIndex = this.save.eliteLeagueMemberIds.indexOf(loserId);
    if (winnerIndex < 0 || loserIndex < 0) return;
    [this.save.eliteLeagueMemberIds[winnerIndex], this.save.eliteLeagueMemberIds[loserIndex]] =
      [this.save.eliteLeagueMemberIds[loserIndex], this.save.eliteLeagueMemberIds[winnerIndex]];
    const high = Math.max(this.save.eliteRatings[winnerId] ?? 0, this.save.eliteRatings[loserId] ?? 0) + 1;
    this.save.eliteRatings[winnerId] = high;
    this.save.eliteRatings[loserId] = Math.max(1000, high - 12);
  }

  private promoteIntoElite(id: string): void {
    if (this.save.eliteLeagueMemberIds.includes(id)) return;
    const demoted = this.save.eliteLeagueMemberIds.pop();
    if (demoted) {
      delete this.save.eliteRatings[demoted]; delete this.save.eliteCrownWins[demoted];
      this.event("promotion", `${this.fighterById(demoted)?.name ?? "Последний участник"} покинул элиту и вернулся в обычный рейтинг.`);
    }
    const tailRating = this.save.eliteLeagueMemberIds.length
      ? this.save.eliteRatings[this.save.eliteLeagueMemberIds[this.save.eliteLeagueMemberIds.length - 1]] ?? 4200
      : 4200;
    this.save.eliteLeagueMemberIds.push(id);
    this.save.eliteRatings[id] = Math.max(1000, tailRating - 1);
    this.save.eliteCrownWins[id] ??= 0;
    this.event("promotion", `${this.fighterById(id)?.name ?? "Претендент"} выиграл квалификацию и вошёл в элитную тридцатку.`);
  }

  private syncCrownSet(): void {
    const leaderId = this.save.eliteLeagueMemberIds[0];
    if (!leaderId) return;
    const templateIds = new Set(EQUIPMENT_SETS.find((set) => set.id === CROWN_SET_ID)?.pieces ?? []);
    const strip = (fighter: HeroProfile | EnemyProfile) => {
      const removed = new Set<string>();
      const equipment = fighter.id === "hero" ? (fighter as HeroProfile).inventory : (fighter as EnemyProfile).equipment;
      equipment.filter((item) => templateIds.has(item.templateId)).forEach((item) => removed.add(item.id));
      if (fighter.id === leaderId) return;
      if (fighter.id === "hero") (fighter as HeroProfile).inventory = equipment.filter((item) => !removed.has(item.id));
      else (fighter as EnemyProfile).equipment = equipment.filter((item) => !removed.has(item.id));
      (Object.keys(fighter.equipped) as EquipmentSlot[]).forEach((slot) => {
        if (removed.has(fighter.equipped[slot]!)) delete fighter.equipped[slot];
      });
    };
    strip(this.save.hero); this.save.enemies.forEach(strip);
    if (this.save.crownSetOwnerId === leaderId) return;
    const leader = this.fighterById(leaderId);
    if (!leader) return;
    const owned = leader.id === "hero" ? (leader as HeroProfile).inventory : (leader as EnemyProfile).equipment;
    templateIds.forEach((templateId) => {
      if (owned.some((item) => item.templateId === templateId)) return;
      const item = createItem(leader.level + 4, { classId: leader.classId, templateId, rarity: "mythic", randomSource: this.random.loot });
      if (leader.id === "hero") this.addItem(item);
      else considerNpcLoot(leader as EnemyProfile, item);
    });
    this.save.crownSetOwnerId = leaderId;
  }

  private recalculateHeroRating(): void {
    this.save.hero.rating = calculateHeroWorldRating(this.save.hero);
  }

  private enemyWorldRating(enemy: EnemyProfile): number {
    return calculateEnemyWorldRating(enemy);
  }

  private recordArenaChampionship(enemy: EnemyProfile, arenaIndex: number): void {
    enemy.tournamentWins += 1;
    enemy.arenaTournamentWins ??= ARENAS.map(() => 0);
    enemy.arenaTournamentWins[arenaIndex] = (enemy.arenaTournamentWins[arenaIndex] ?? 0) + 1;
    this.recordEquipmentDeeds(enemy, "championship", `${ARENAS[arenaIndex].name}, день ${this.save.worldDay}`);
    const rewardStage = [3, 6, 10].indexOf(enemy.tournamentWins);
    if (rewardStage >= 0 && enemy.factionId) {
      const slots: EquipmentSlot[][] = [["hands", "feet"], ["head", "chest"], ["weapon", "offhand"]];
      ITEM_TEMPLATES.filter((template) => template.exclusiveToFaction === enemy.factionId && slots[rewardStage].includes(template.slot))
        .forEach((template) => {
          const item = createItem(enemy.level, {
            classId: enemy.classId, templateId: template.id, rarity: rewardStage === 2 ? "mythic" : "legendary", randomSource: this.random.loot,
          });
          if (considerNpcLoot(enemy, item)) this.recordEnemyHistory(enemy, `Фракция наградила за ${enemy.tournamentWins} чемпионства предметом «${item.name}».`);
        });
    }
  }

  private addItem(item: EquipmentItem): void {
    this.save.hero.inventory.push(item);
    if (!this.save.discoveredItems.includes(item.templateId)) this.save.discoveredItems.push(item.templateId);
    if (item.grantedSkillId && !this.save.legacy.discoveredSkillIds.includes(item.grantedSkillId)) {
      this.save.legacy.discoveredSkillIds.push(item.grantedSkillId);
    }
    const compatible = item.allowedClasses === "all" || item.allowedClasses.includes(this.save.hero.classId);
    if (!this.save.hero.autoEquipBest || !compatible) return;
    this.equipBest();
  }

  private returnHeroRelicToWorld(item: EquipmentItem, history: string): void {
    if (!item.worldRelicId) return;
    const recordIndex = (this.save.worldRelics ?? []).findIndex((candidate) => candidate.id === item.worldRelicId);
    if (recordIndex < 0) return;
    this.save.worldRelics![recordIndex] = releaseWorldRelic(
      this.save.worldRelics![recordIndex],
      item,
      history,
    ).record;
  }

  private isKnownEraLaw(id: string): boolean {
    return ERA_LAWS.some((law) => law.id === id);
  }

  private hasEraLaw(id: Parameters<typeof eraLawModifiers>[0][number]): boolean {
    return this.save.legacy.activeLawIds.includes(id);
  }

  private epochRewards(baseExperience: number, baseGold: number, context: RewardContext): { experience: number; gold: number } {
    const modifiers = rewardModifiers(this.save.legacy.cycle, this.save.legacy.activeLawIds, context);
    const season = worldSeasonRule(this.save.worldSeason?.ruleId);
    const dungeonMultiplier = context === "dungeon" ? season.dungeonRewardMultiplier : 1;
    return {
      experience: Math.max(0, Math.round(baseExperience * modifiers.experienceMultiplier * dungeonMultiplier)),
      gold: Math.max(0, Math.round(baseGold * modifiers.goldMultiplier * season.goldMultiplier * dungeonMultiplier)),
    };
  }

  private controlledArenaReward(arenaId: string, reward: { experience: number; gold: number }): { experience: number; gold: number } {
    const controller = this.save.factionControl?.arenaControllers[arenaId];
    if (!controller) return reward;
    const adjusted = factionArenaReward(controller, reward);
    return { experience: adjusted.experience, gold: adjusted.gold };
  }

  private createRewardItem(
    level: number,
    options: Omit<ItemCreationOptions, "randomSource">,
    targetChanceBonus = 0,
  ): EquipmentItem {
    const target = this.save.lootTarget;
    if (!target || options.templateId || options.rarity) {
      return createItem(level, { ...options, randomSource: this.random.loot });
    }
    const targetTemplates = ITEM_TEMPLATES.filter((template) =>
      !template.exclusiveToBoss && !template.exclusiveToElite && !template.exclusiveToFaction
      && (!target.slot || template.slot === target.slot)
      && (!target.setId || template.setId === target.setId)
      && (template.allowedClasses === "all" || template.allowedClasses.includes(this.save.hero.classId)));
    if (targetTemplates.length === 0) return createItem(level, { ...options, randomSource: this.random.loot });
    const pool = Array.from({ length: 6 }, () => createItem(level, { ...options, randomSource: this.random.loot }));
    targetTemplates.slice(0, 3).forEach((template) => {
      pool.push(createItem(level, { ...options, templateId: template.id, randomSource: this.random.loot }));
    });
    const result = rollTargetedLoot(pool, target, this.save.lootPity, this.random.loot, {
      baseChance: Math.min(0.8, 0.18 + Math.max(0, targetChanceBonus)),
    });
    this.save.lootPity = result.pity;
    return result.item;
  }

  private factionAdjustedReward(
    reward: { experience: number; gold: number },
    modifier: "tournamentReward" | "bossReward" | "contractReward",
    factionId?: string,
  ): { experience: number; gold: number } {
    const bonus = factionId
      ? unlockedFactionPerks(factionId, this.save.hero.factionReputation[factionId] ?? 0)
        .reduce((total, perk) => total + (typeof perk.modifiers[modifier] === "number" ? perk.modifiers[modifier]! as number : 0), 0)
      : factionModifier(this.save.hero.factionReputation, modifier);
    const multiplier = 1 + bonus;
    return {
      experience: Math.round(reward.experience * multiplier),
      gold: Math.round(reward.gold * multiplier),
    };
  }

  private awardCrownSeason(fighterId: string, result: "win" | "loss" | "defense" | "champion"): void {
    this.save.crownSeason = awardCrownSeasonPoints(this.save.crownSeason, fighterId, result);
    awardWorldEliteSeasonPoints(this.save.worldSeason!, fighterId, result, this.fighterById(fighterId)?.name);
  }

  private syncCrownSeason(): void {
    if (this.save.worldDay <= this.save.crownSeason.endsDay) return;
    const completed = this.save.crownSeason;
    const standings = Object.entries(completed.points)
      .map(([fighterId, points]) => ({
        fighterId,
        points,
        defenses: completed.defenses[fighterId] ?? 0,
        seed: this.fighterById(fighterId) ? this.fighterTournamentSeed(this.fighterById(fighterId)!) : 0,
      }))
      .sort((first, second) => second.points - first.points
        || second.defenses - first.defenses
        || second.seed - first.seed
        || first.fighterId.localeCompare(second.fighterId));
    const heroIndex = standings.findIndex((entry) => entry.fighterId === "hero");
    const heroRank = heroIndex >= 0 ? heroIndex + 1 : undefined;
    const heroPoints = heroIndex >= 0 ? standings[heroIndex].points : 0;
    const rewardGold = heroRank === 1 ? 5_000 : heroRank && heroRank <= 5 ? 2_500 : heroRank && heroRank <= 15 ? 1_000 : 0;
    const rewardTemperingMarks = heroRank === 1 ? 3 : heroRank && heroRank <= 5 ? 2 : heroRank && heroRank <= 15 ? 1 : 0;
    this.save.hero.gold += rewardGold;
    this.save.hero.temperingMarks += rewardTemperingMarks;
    const championId = standings[0]?.fighterId;
    const championName = championId ? this.fighterById(championId)?.name : undefined;
    this.save.lastCrownSeasonResult = {
      season: completed.number,
      completedDay: completed.endsDay,
      championId,
      championName,
      heroRank,
      heroPoints,
      rewardGold,
      rewardTemperingMarks,
    };
    this.event("tournament", heroRank
      ? `Сезон ${completed.number} Лиги короны завершён. Место героя: #${heroRank}; награда: ${rewardGold} золота и ${rewardTemperingMarks} печ. закалки.`
      : `Сезон ${completed.number} Лиги короны завершён. Герой не набрал сезонных очков.`, {
      kind: "system", code: "crown-season-result",
      values: { season: completed.number, heroRank: heroRank ?? 0, heroPoints, rewardGold, rewardTemperingMarks },
    });
    const nextNumber = completed.number + 1;
    this.save.crownSeason = createCrownSeason(
      this.save.worldDay,
      nextNumber,
      TOURNAMENT_RULES.map((rule) => rule.id),
      new SeededRandom(`${this.save.tournamentRuleSeed}:crown-season:${nextNumber}`),
    );
    this.event("tournament", `Начался сезон ${nextNumber} Лиги короны. Новые правила действуют до дня ${this.save.crownSeason.endsDay}.`, {
      kind: "system", code: "crown-season-start", values: { season: nextNumber, endsDay: this.save.crownSeason.endsDay },
    });
  }

  private syncNarrativeEvent(): void {
    if (this.save.pendingNarrativeEventId) return;
    const candidates = availableNarrativeEvents({
      day: this.save.worldDay,
      heroLevel: this.save.hero.level,
      classId: this.save.hero.classId,
      gold: this.save.hero.gold,
      highestArena: this.save.hero.highestArena,
      injuries: this.save.hero.injuries.filter((injury) => injury.remainingDays > 0).length,
      rivalries: Object.keys(this.save.hero.rivalries).length,
    }, this.save.seenNarrativeEventIds);
    if (candidates.length === 0) return;
    this.save.pendingNarrativeEventId = this.random.world.pick(candidates).id;
    const event = this.pendingNarrativeEvent()!;
    this.event("system", `Новое событие: ${event.title}.`, {
      kind: "system", code: "narrative-pending", values: { eventId: event.id },
    });
  }

  private syncDerivedEraProgress(): void {
    let state = this.save.eraChallengeProgress;
    const arenaChampionships = this.save.hero.arenaWins.filter((wins) => wins > 0).length;
    state = recordEraMetric(state, "arenaChampionships", arenaChampionships, "max");
    state = recordEraMetric(state, "uniqueDungeonsCompleted", Object.keys(this.save.dungeonClears).length, "max");
    state = recordEraMetric(state, "uniqueRivalsDefeated", state.defeatedRivalIds.length, "max");
    state = recordEraMetric(state, "awakenedRelics", this.save.hero.inventory.filter((item) => (item.relicTier ?? 0) >= 3).length, "max");
    state = recordEraMetric(state, "alliedFactions", Object.values(this.save.hero.factionReputation).filter((value) => value >= 45).length, "max");
    state = recordEraMetric(state, "classesMastered", state.masteredClassIds.length, "max");
    state = recordEraMetric(state, "longestWinStreak", state.metrics.longestWinStreak ?? 0, "max");
    const challenge = this.currentEraChallenge();
    if (challenge) {
      const completed = challenge.objectives
        .filter((objective) => evaluateEraObjective(objective, state.metrics).completed)
        .map((objective) => objective.id);
      const rewarded = new Set(state.rewardedObjectiveIds ?? []);
      challenge.objectives.filter((objective) => completed.includes(objective.id) && !rewarded.has(objective.id))
        .forEach((objective) => {
          rewarded.add(objective.id);
          const gold = 500 + challenge.cycle * 250;
          this.save.hero.gold += gold;
          this.save.hero.temperingMarks += 1;
          this.save.legacy.seals += 1;
          this.save.legacy.totalSealsEarned += 1;
          this.event("system", `Испытание эпохи «${objective.name}» завершено: +1 печать наследия, +1 печать закалки и ${gold} золота.`, {
            kind: "system", code: "era-objective-reward",
            values: { objectiveId: objective.id, cycle: challenge.cycle, gold },
          });
        });
      state.completedObjectiveIds = completed;
      state.rewardedObjectiveIds = [...rewarded];
    }
    this.save.eraChallengeProgress = state;
  }

  private recordEraBattle(heroWon: boolean, enemy: EnemyProfile): void {
    let state = this.save.eraChallengeProgress;
    state.currentWinStreak = heroWon ? state.currentWinStreak + 1 : 0;
    state = recordEraMetric(state, "longestWinStreak", state.currentWinStreak, "max");
    if (heroWon) {
      state.masteredClassIds = [...new Set([...state.masteredClassIds, this.save.hero.classId])];
      if (this.save.enemies.some((candidate) => candidate.id === enemy.id)) {
        state.defeatedRivalIds = [...new Set([...state.defeatedRivalIds, enemy.id])];
      }
    }
    this.save.eraChallengeProgress = state;
    this.syncDerivedEraProgress();
  }

  private syncEraChallenge(): void {
    this.save.eraChallengeProgress = createEraChallengeProgress(this.save.legacy.cycle);
    if (this.save.legacy.cycle < 2) return;
    const challenge = eraChallengeFor(this.save.legacy.cycle);
    this.save.enemies.forEach((enemy) => {
      const mutation = challenge.mutations[enemy.classId];
      enemy.eraMutationId = mutation.id;
      enemy.eraMutationPotency = mutation.potency;
    });
  }

  private minimumRewardRarity(rarity: Rarity, context: RewardContext): Rarity {
    const modifiers = rewardModifiers(this.save.legacy.cycle, this.save.legacy.activeLawIds, context);
    if (modifiers.forcedMinimumRarity) {
      return RARITY_ORDER[Math.max(RARITY_ORDER.indexOf(rarity), RARITY_ORDER.indexOf(modifiers.forcedMinimumRarity))];
    }
    return improveMinimumRarity(rarity, modifiers.minimumRaritySteps);
  }

  private controlledDungeonMinimum(dungeonId: string, rarity: Rarity): Rarity {
    const controller = this.save.factionControl?.dungeonControllers?.[dungeonId];
    return controller ? improveFactionMinimumRarity(rarity, controller) : rarity;
  }

  private resolveWorldCombat(
    enemy: EnemyProfile,
    options: CombatOptions = {},
    context: "arena" | "dungeon" | "duel" | "boss" | "crown-league" | "legend-hunt" = "arena",
    hero: HeroProfile = this.save.hero,
  ): ReturnType<typeof resolveCombat> {
    return this.createWorldBattleSession(enemy, options, context, hero, this.random.combat).runAutomatic();
  }

  private createWorldBattleSession(
    enemy: EnemyProfile,
    options: CombatOptions = {},
    context: "arena" | "dungeon" | "duel" | "boss" | "crown-league" | "legend-hunt" = "arena",
    hero: HeroProfile = this.save.hero,
    randomSource = options.randomSource ?? this.random.combat,
  ): BattleSession {
    enemy.heroMemory = decayEnemyStyleMemory(enemy.heroMemory ?? createEnemyStyleMemory(this.save.worldDay), this.save.worldDay);
    const epoch = epochDifficultyModifiers(this.save.legacy.cycle);
    const laws = eraLawModifiers(this.save.legacy.activeLawIds);
    const bossPower = context === "boss" ? laws.bossPowerMultiplier : 1;
    const heroDefense = 1 + laws.allFighterDefenseFlat / 100;
    const enemyDefense = (1 + (laws.allFighterDefenseFlat + laws.enemyDefenseFlat) / 100) * epoch.enemyDefenseMultiplier * bossPower;
    const bossCritBonus = context === "boss"
      ? Object.entries(this.save.hero.factionReputation).flatMap(([factionId, reputation]) => unlockedFactionPerks(factionId, reputation))
        .reduce((total, perk) => total + (perk.modifiers.combatStats?.crit ?? 0), 0)
      : 0;
    const combatHero: HeroProfile = bossCritBonus > 0
      ? {
        ...hero,
        injuries: [...hero.injuries, {
          id: "faction-boss-knowledge", name: "Список слабостей",
          description: "Репутационная подготовка повышает критический шанс против босса.",
          remainingDays: 1, stats: { crit: bossCritBonus }, gainedDay: this.save.worldDay,
        }],
      }
      : hero;
    return new BattleSession(combatHero, enemy, {
      ...options,
      randomSource,
      heroStatMultipliers: {
        ...options.heroStatMultipliers,
        health: options.heroStatMultipliers?.health ?? 1,
        attack: options.heroStatMultipliers?.attack ?? 1,
        defense: (options.heroStatMultipliers?.defense ?? 1) * heroDefense,
      },
      enemyStatMultipliers: {
        ...options.enemyStatMultipliers,
        health: (options.enemyStatMultipliers?.health ?? 1) * epoch.enemyHealthMultiplier * bossPower,
        attack: (options.enemyStatMultipliers?.attack ?? 1) * epoch.enemyAttackMultiplier * bossPower,
        defense: (options.enemyStatMultipliers?.defense ?? 1) * enemyDefense,
      },
    });
  }

  private createPendingBattle(
    kind: PendingBattle["kind"],
    activityId: string,
    enemy: EnemyProfile,
    options: CombatOptions,
    combatContext: "arena" | "dungeon" | "duel" | "boss" | "crown-league" | "legend-hunt",
    tournament?: PendingTournamentState,
    pendingContext?: PendingBattle["context"],
    heroOverride: HeroProfile = this.save.hero,
  ): PendingBattle {
    const seed = `${this.save.tournamentRuleSeed}:pending:${kind}:${this.save.worldDay}:${this.random.combat.int(0, 0x7fffffff)}`;
    const detachedEnemy = JSON.parse(JSON.stringify(enemy)) as EnemyProfile;
    const session = this.createWorldBattleSession(detachedEnemy, options, combatContext, heroOverride, new SeededRandom(seed));
    const pending: PendingBattle = {
      version: 1,
      id: `pending-${kind}-${this.save.worldDay}-${this.random.world.int(0, 0x7fffffff).toString(36)}`,
      kind,
      activityId,
      enemyId: enemy.id,
      enemy: detachedEnemy,
      startedDay: this.save.worldDay,
      session: session.snapshot(),
      tournament,
      context: pendingContext,
    };
    this.save.pendingBattle = pending;
    return pending;
  }

  private requirePendingBattle(): PendingBattle {
    const pending = this.save.pendingBattle;
    if (!pending) throw new Error("Незавершённого боя нет.");
    if (pending.startedDay !== this.save.worldDay) {
      throw new Error("День мира изменился во время боя. Восстановите или отмените незавершённый бой.");
    }
    return pending;
  }

  private assertNoPendingBattle(): void {
    if (this.save.pendingBattle) throw new Error("Сначала завершите или отмените уже начатый бой.");
  }

  private recordMutationVictory(enemy: EnemyProfile, heroWon: boolean): void {
    if (!heroWon || !enemy.eraMutationId) return;
    this.save.eraChallengeProgress = recordEraMetric(this.save.eraChallengeProgress, "mutationVictories", 1);
    this.syncDerivedEraProgress();
  }

  private recordEnemyHistory(enemy: EnemyProfile, message: string): void {
    enemy.history.push(message);
    if (enemy.history.length > 50) enemy.history.splice(0, enemy.history.length - 50);
  }

  private legacyEnemy(archive: LegacyHeroRecord): EnemyProfile {
    const influence = describeLegacyArchiveInfluence(archive);
    const opponent = influence.opponent;
    const powerMultiplier = opponent?.powerMultiplier ?? 1;
    const equipment = archive.equipment.map((item) => ({
      ...item,
      id: this.randomId("legacy-item"),
      stats: Object.fromEntries(Object.entries(item.stats).map(([stat, value]) => [
        stat,
        Math.max(0, Math.round((value ?? 0) * powerMultiplier)),
      ])) as Partial<Stats>,
      relicHistory: [...(item.relicHistory ?? [])],
      relicFeats: [...(item.relicFeats ?? [])],
      relicProperties: item.relicProperties?.map((property) => ({ ...property })),
      allowedClasses: item.allowedClasses === "all" ? "all" as const : [...item.allowedClasses],
    }));
    const equipped: EnemyProfile["equipped"] = {};
    equipment.forEach((item) => { equipped[item.slot] = item.id; });
    return {
      id: opponent?.id ?? `legacy-hero-${archive.cycle}`,
      name: archive.name,
      title: opponent
        ? `${archive.title} · ${opponent.kind === "legacy-boss" ? "босс" : "легендарный соперник"} эпохи ${archive.cycle}`
        : `${archive.title} · герой эпохи ${archive.cycle}`,
      origin: opponent?.kind === "legendary-rival" ? "Дорога между эпохами" : "Зал отзвуков",
      classId: archive.classId,
      level: opponent?.level ?? archive.level,
      experience: 0,
      rating: opponent?.rating ?? archive.rating,
      wins: archive.wins,
      losses: archive.losses,
      tournamentWins: archive.tournamentWins,
      arenaTournamentWins: ARENAS.map((_, index) => index === ARENAS.length - 1 ? archive.tournamentWins : 0),
      kills: archive.kills,
      arenaIndex: opponent?.arenaIndex ?? ARENAS.length - 1,
      arenaWins: archive.crownLeagueWins,
      alive: true,
      equipment,
      equipped,
      history: [`Завершил эпоху ${archive.cycle} на ${archive.worldDay}-й день.`],
      traitIds: [], scarIds: [], injuries: [], adaptationIds: [], tacticalStyle: "balanced",
      heroMemory: inheritArchiveStyleMemory(archive, this.save.worldDay),
      carriedFromCycle: archive.cycle,
      goal: opponent?.kind === "legacy-boss" ? "vengeance" : "elite",
      joinedDay: 1,
    };
  }

  private recordHeroEncounter(enemy: EnemyProfile, heroWon: boolean, turns: BattleReport["turns"], killed = false): void {
    const hero = this.save.hero;
    this.recordEraBattle(heroWon, enemy);
    if (heroWon) {
      if (killed) this.recordEquipmentDeeds(hero, "lethal", enemy.name);
      if (enemy.legendSinceDay !== undefined || this.save.eliteLeagueMemberIds.slice(0, LEGEND_COUNT).includes(enemy.id)) {
        this.recordEquipmentDeeds(hero, "legend", enemy.name);
      }
      this.recordSurvivalDeed(hero, enemy.name, turns);
    } else {
      this.recordSurvivalDeed(enemy, hero.name, turns);
    }
    const isTournamentFighter = this.save.enemies.some((candidate) => candidate.id === enemy.id);
    if (!isTournamentFighter) {
      this.applyBattleConsequences(heroWon, enemy);
      return;
    }
    const record = hero.rivalries[enemy.id] ?? {
      enemyId: enemy.id, name: enemy.name, classId: enemy.classId,
      wins: 0, losses: 0, killed: false, lastMetDay: this.save.worldDay,
    };
    record.name = enemy.name;
    record.classId = enemy.classId;
    record.lastMetDay = this.save.worldDay;
    record.meetings = (record.meetings ?? record.wins + record.losses) + 1;
    record.intensity = Math.min(5, 1 + Math.floor(record.meetings / 2));
    if (heroWon) record.wins += 1;
    else record.losses += 1;
    if (killed && !record.killed) {
      record.killed = true;
      hero.kills += 1;
    }
    const observation = recordEnemyStyleMemory(enemy.heroMemory, hero, turns, this.save.worldDay);
    enemy.heroMemory = observation.memory;
    record.memoryStage = observation.memory.stage;
    record.memoryFamiliarity = observation.memory.familiarity;
    record.memorySimilarity = observation.memory.currentSimilarity;
    record.countermeasureIds = [...observation.memory.countermeasureIds];
    hero.rivalries[enemy.id] = record;

    if (observation.update.stage !== observation.update.previousStage) {
      const stage = memoryStageDefinition(observation.update.stage);
      this.featureChanges.push({
        fighterId: enemy.id, fighterName: enemy.name, kind: "Адаптация",
        name: `Память: ${stage.name}`, description: stage.description, stats: {},
      });
      this.recordEnemyHistory(enemy, `Начал лучше читать стиль ${hero.name}: «${stage.name}».`);
      this.event("battle", `${enemy.name}: ${stage.name.toLowerCase()} стиль ${hero.name}.`);
    }
    observation.update.newCountermeasureIds.forEach((id) => {
      const countermeasure = countermeasureDefinition(id);
      if (!countermeasure) return;
      this.featureChanges.push({
        fighterId: enemy.id, fighterName: enemy.name, kind: "Адаптация",
        name: countermeasure.name, description: `${countermeasure.description} ${countermeasure.effect}`, stats: {},
      });
      this.recordEnemyHistory(enemy, `Подготовил против ${hero.name} контрмеру «${countermeasure.name}».`);
      this.event("battle", `${enemy.name} подготовил контрмеру против знакомого стиля: ${countermeasure.name}.`);
    });
    this.applyBattleConsequences(heroWon, enemy);
  }

  private applyBattleConsequences(heroWon: boolean, enemy: EnemyProfile): void {
    const hero = this.save.hero;
    if (heroWon) {
      this.gainRelicRenown(enemy);
      if (hero.traitIds.length < 3 && hero.wins >= hero.traitIds.length * 12) {
        const trait = FIGHTER_TRAITS.find((candidate) => !hero.traitIds.includes(candidate.id));
        if (trait) {
          hero.traitIds.push(trait.id);
          this.featureChanges.push({
            fighterId: hero.id, fighterName: hero.name, kind: "Черта",
            name: trait.name, description: trait.description, stats: { ...trait.stats },
          });
          this.event("system", `${hero.name} приобрёл черту «${trait.name}».`);
        }
      }
      return;
    }
    if (this.random.world.chance(ACTIVE_INJURY_CHANCE) && hero.injuries.length < 2) {
      const injuries = [
        { id: "bruised-ribs", name: "Ушиб рёбер", description: "Боль мешает держать удар.", stats: { health: -18, defense: -2 } },
        { id: "cut-palm", name: "Рассечённая ладонь", description: "Хват временно ослаблен.", stats: { attack: -4 } },
        { id: "sprained-ankle", name: "Растяжение", description: "Труднее перехватывать темп.", stats: { speed: -5 } },
      ];
      const injury = this.random.world.pick(injuries);
      if (!hero.injuries.some((candidate) => candidate.id === injury.id)) {
        hero.injuries.push({ ...injury, remainingDays: this.random.world.int(2, 4), gainedDay: this.save.worldDay });
        this.featureChanges.push({
          fighterId: hero.id, fighterName: hero.name, kind: "Травма",
          name: injury.name, description: `${injury.description} Временный эффект до восстановления.`, stats: { ...injury.stats },
        });
        this.event("system", `${hero.name} получил травму «${injury.name}». Она заживёт со временем.`);
      }
    }
    if (hero.scarIds.length < 3 && this.save.hero.highestArena >= 2 && this.random.world.chance(0.1)) {
      const scar = FIGHTER_SCARS.find((candidate) => !hero.scarIds.includes(candidate.id));
      if (scar) {
        hero.scarIds.push(scar.id);
        this.featureChanges.push({
          fighterId: hero.id, fighterName: hero.name, kind: "Шрам",
          name: scar.name, description: scar.description, stats: { ...scar.stats },
        });
        this.event("system", `${hero.name} выжил и сохранил шрам «${scar.name}».`);
      }
    }
  }

  private gainRelicRenown(enemy: EnemyProfile): void {
    if (!this.isFeatureUnlocked("equipment-legacy")) return;
    const equippedIds = new Set(Object.values(this.save.hero.equipped));
    this.save.hero.inventory.filter((item) => equippedIds.has(item.id) && rarityAtLeast(item.rarity, "legendary")).forEach((item) => {
      item.relicRenown = (item.relicRenown ?? 0) + (enemy.level >= this.save.hero.level + 2 ? 2 : 1);
      item.relicHistory ??= [];
      const previousTier = item.relicTier ?? 0;
      let nextTier = previousTier;
      RELIC_TIER_THRESHOLDS.forEach((threshold, tier) => { if ((item.relicRenown ?? 0) >= threshold) nextTier = tier as 0 | 1 | 2 | 3; });
      const notable = enemy.legendSinceDay !== undefined
        || this.save.eliteLeagueMemberIds.includes(enemy.id)
        || enemy.tournamentWins >= 8;
      item.relicFeats ??= [];
      if (notable) {
        const feat = `Победа над ${enemy.name}, ${enemy.title}`;
        if (!item.relicFeats.includes(feat)) item.relicFeats = [...item.relicFeats, feat].slice(-40);
      }
      let previousStats: Partial<Stats> | undefined;
      if (nextTier > previousTier) {
        item.relicTier = nextTier;
        item.relicHistory.push(`День ${this.save.worldDay}: ступень наследия ${nextTier} после боя с ${enemy.name}.`);
        item.appearanceVariant = `${item.relicPath ?? "unbound"}-${nextTier}`;
        const growth = nextTier === 1 ? 0.04 : nextTier === 2 ? 0.06 : 0.08;
        previousStats = { ...item.stats };
        item.stats = Object.fromEntries(Object.entries(item.stats).map(([stat, value]) => [stat, Math.max(Number(value) + 1, Math.round(Number(value) * (1 + growth)))]));
      }
      if (item.worldRelicId) {
        const recordIndex = this.save.worldRelics?.findIndex((candidate) => candidate.id === item.worldRelicId) ?? -1;
        if (recordIndex >= 0) {
          const record = synchronizeWorldRelic(
            this.save.worldRelics![recordIndex],
            item,
            notable ? `День ${this.save.worldDay}: реликвия участвовала в победе над ${enemy.name}.` : undefined,
            this.save.worldDay,
          );
          this.save.worldRelics![recordIndex] = record;
          Object.assign(item, record.item, {
            stats: { ...record.item.stats },
            relicHistory: [...(record.item.relicHistory ?? [])],
            relicFeats: [...(record.item.relicFeats ?? [])],
            relicProperties: (record.item.relicProperties ?? []).map((property) => ({ ...property })),
          });
        }
      }
      if (!previousStats) return;
      const statGrowth = Object.fromEntries(Object.entries(item.stats).map(([stat, value]) => [stat, Number(value) - Number(previousStats[stat as keyof Stats] ?? 0)]));
      this.featureChanges.push({
        fighterId: this.save.hero.id, fighterName: this.save.hero.name, kind: "Наследие",
        name: `${item.relicName ?? item.name}: ступень ${nextTier}`,
        description: "Снаряжение запомнило победу и навсегда усилило собственные характеристики.",
        stats: statGrowth,
      });
      this.event("loot", `${item.relicName ?? item.name} достиг ступени наследия ${nextTier}.`);
    });
  }

  private recordEquipmentDeeds(fighter: HeroProfile | EnemyProfile, kind: EquipmentDeedKind, witness: string): void {
    if (fighter.id === "hero" && !this.isFeatureUnlocked("equipment-legacy")) return;
    const inventory = fighter.id === "hero" ? (fighter as HeroProfile).inventory : (fighter as EnemyProfile).equipment;
    const equipped = new Set(Object.values(fighter.equipped));
    inventory.filter((item) => equipped.has(item.id)).forEach((item) => {
      const deed = recordEquipmentDeed(item, kind, witness, this.save.worldDay);
      if (deed.item === item) return;
      Object.assign(item, deed.item);
      const recordIndex = (this.save.worldRelics ?? []).findIndex((record) => record.id === item.worldRelicId);
      if (recordIndex >= 0) {
        const record = synchronizeWorldRelic(this.save.worldRelics![recordIndex], item, undefined, this.save.worldDay);
        this.save.worldRelics![recordIndex] = record;
        Object.assign(item, record.item, {
          stats: { ...record.item.stats },
          relicHistory: [...(record.item.relicHistory ?? [])],
          relicFeats: [...(record.item.relicFeats ?? [])],
          relicProperties: (record.item.relicProperties ?? []).map((property) => ({ ...property })),
        });
      }
      if (!deed.changed || !deed.property || fighter.id !== "hero") return;
      this.featureChanges.push({
        fighterId: fighter.id, fighterName: fighter.name, kind: "Наследие",
        name: `${item.relicName ?? item.name}: ${deed.property.name}`,
        description: deed.property.description, stats: deed.growth,
      });
      this.event("loot", `${item.relicName ?? item.name} приобрёл свойство «${deed.property.name}».`);
    });
  }

  private recordSurvivalDeed(fighter: HeroProfile | EnemyProfile, opponentName: string, turns: BattleReport["turns"]): void {
    const health = turns.map((turn) => turn.actorId === fighter.id ? turn.actorHealth : turn.targetHealth);
    const livingHealth = health.filter((value) => value > 0);
    if (livingHealth.length === 0) return;
    const maximum = combatantSnapshot(fighter).maxHealth;
    if (Math.min(...livingHealth) <= maximum * 0.1) {
      this.recordEquipmentDeeds(fighter, "survival", opponentName);
    }
  }

  private healDailyInjuries(): void {
    const update = (profile: HeroProfile | EnemyProfile) => {
      profile.injuries.forEach((injury) => { injury.remainingDays = Math.max(0, injury.remainingDays - 1); });
      const healed = profile.injuries.filter((injury) => injury.remainingDays === 0);
      profile.injuries = profile.injuries.filter((injury) => injury.remainingDays > 0);
      if (profile.id === "hero") healed.forEach((injury) => this.event("system", `${profile.name}: травма «${injury.name}» зажила.`));
    };
    update(this.save.hero);
    this.save.enemies.filter((enemy) => enemy.alive).forEach(update);
  }

  private applyOfficialTournamentRecovery(): void {
    const days = Math.max(0, Math.floor(factionModifier(this.save.hero.factionReputation, "injuryRecoveryDays")));
    if (days === 0) return;
    this.save.hero.injuries.forEach((injury) => {
      injury.remainingDays = Math.max(0, injury.remainingDays - days);
    });
  }

  private refreshContracts(force: boolean): void {
    if (!this.isFeatureUnlocked("contracts")) {
      this.save.contractOffers = [];
      this.save.activeContract = undefined;
      return;
    }
    let active = this.save.activeContract;
    const trainingAvailable = this.save.hero.level < this.trainingLevelCap();
    if (active?.objective === "training" && !trainingAvailable) {
      this.event("system", `Контракт «${active.title}» отозван без штрафа: герой достиг предела тренировок текущей арены.`);
      this.save.activeContract = undefined;
      active = undefined;
    }
    if (active && active.expiresDay < this.save.worldDay) {
      this.event("system", `Срок контракта «${active.title}» истёк.`);
      this.save.activeContract = undefined;
    }
    const stillValid = this.save.contractOffers.filter((offer) =>
      offer.expiresDay >= this.save.worldDay && (offer.objective !== "training" || trainingAvailable));
    if (!force && stillValid.length >= FACTIONS.length) { this.save.contractOffers = stillValid; return; }
    const labels: Record<ContractObjective, string[]> = {
      training: ["Показательная выучка", "День дисциплины"], duel: ["Честный вызов", "Долг клинка"],
      dungeon: ["След пропавшего отряда", "Груз из глубин"], tournament: ["Знамя на трибуне", "Место для имени"],
      boss: ["Закрыть старый счёт", "Охота за печатью"],
    };
    this.save.contractOffers = FACTIONS.map((faction, index) => {
      const available = faction.objectives.filter((objective) =>
        (objective !== "boss" || this.save.hero.highestArena >= 2)
        && (objective !== "training" || trainingAvailable));
      const objective = available[(this.save.worldDay + index + this.save.completedContracts) % available.length];
      const target = objective === "training" ? 2 : objective === "duel" ? 3 : 1;
      const reputation = this.save.hero.factionReputation[faction.id] ?? 0;
      const rewardMultiplier = 1 + factionReputationTier(reputation).contractRewardBonus;
      return {
        id: `contract-${faction.id}-${this.save.worldDay}-${this.save.completedContracts}`, factionId: faction.id, title: labels[objective][(this.save.worldDay + index) % 2],
        description: `${faction.name} просит выполнить задачу: ${objective === "training" ? "провести тренировочные дни" : objective === "duel" ? "победить в дуэлях" : objective === "dungeon" ? "завершить поход в данж" : objective === "tournament" ? "стать чемпионом турнира" : "победить особого противника"}.`,
        objective, target, progress: 0, rewardGold: Math.round((450 + this.save.hero.level * 55 + index * 130) * rewardMultiplier),
        rewardExperience: Math.round((70 + this.save.hero.level * 9) * rewardMultiplier), rewardReputation: 5 + index,
        createdDay: this.save.worldDay, expiresDay: this.save.worldDay + CONTRACT_LIFETIME,
      };
    });
  }

  private advanceContract(objective: ContractObjective): void {
    if (!this.isFeatureUnlocked("contracts")) return;
    if (objective === "tournament" || objective === "dungeon" || objective === "boss") this.advanceFactionCampaign(objective);
    const contract = this.save.activeContract;
    if (!contract || contract.objective !== objective) return;
    contract.progress = Math.min(contract.target, contract.progress + 1);
    if (contract.progress < contract.target) {
      this.event("system", `Контракт «${contract.title}»: ${contract.progress}/${contract.target}.`);
      return;
    }
    const profitMultiplier = contract.approach === "profit" ? 1.35 : 1;
    const reputationMultiplier = contract.approach === "honor" ? 1.5 : 1;
    const baseGold = Math.round(contract.rewardGold * profitMultiplier);
    const { gold, experience } = this.factionAdjustedReward(
      this.epochRewards(contract.rewardExperience, baseGold, "contract"),
      "contractReward",
      contract.factionId,
    );
    const reputation = Math.round(contract.rewardReputation * reputationMultiplier);
    this.save.hero.gold += gold;
    this.gainHeroExperience(experience);
    this.save.hero.factionReputation = applyFactionReputationChange(
      this.save.hero.factionReputation,
      contract.factionId,
      reputation,
    ).reputation;
    const control = this.save.factionControl ??= createFactionControlState(this.save.worldDay);
    if (contract.objective === "dungeon") {
      const supportedDungeon = [...DUNGEONS]
        .reverse()
        .find((dungeon) => dungeon.requiredArena <= this.save.hero.highestArena) ?? DUNGEONS[0];
      this.save.factionControl = changeFactionInfluence(
        control,
        "dungeon",
        supportedDungeon.id,
        contract.factionId,
        reputation,
      );
    } else {
      const supportedArena = ARENAS[this.save.hero.highestArena];
      this.save.factionControl = changeFactionInfluence(
        control,
        "arena",
        supportedArena.id,
        contract.factionId,
        reputation,
      );
    }
    this.save.completedContracts += 1;
    this.advanceFactionCampaign("contract", contract.factionId);
    this.event("system", `Контракт «${contract.title}» выполнен: +${gold} ¤, репутация +${reputation}.`);
    this.save.activeContract = undefined;
    this.refreshContracts(true);
  }

  private advanceFactionCampaign(kind: FactionCampaignEventKind, factionId?: string): void {
    const before = new Set(this.factionCampaigns().filter((entry) => entry.claimable).map((entry) => entry.factionId));
    this.save.factionCampaigns = recordFactionCampaignEvent(
      this.save.factionCampaigns ?? {},
      this.save.hero.factionReputation,
      { kind, factionId },
    );
    this.factionCampaigns().filter((entry) => entry.claimable && !before.has(entry.factionId)).forEach((entry) => {
      this.event("system", `Поручение «${entry.current!.title}» выполнено. Во фракциях можно забрать уникальную награду.`);
    });
  }

  private cleanupVisualTestCatalog(): void {
    this.save.migrations ??= [];
    const visualItems = this.save.hero.inventory.filter((item) => item.isVisualTestItem);

    if (visualItems.length > 0) {
      const visualItemIds = new Set(visualItems.map((item) => item.id));
      const pollutedTemplateIds = new Set(visualItems.map((item) => item.templateId));
      this.save.hero.inventory = this.save.hero.inventory.filter((item) => !visualItemIds.has(item.id));

      (Object.keys(this.save.hero.equipped) as EquipmentSlot[]).forEach((slot) => {
        const equippedId = this.save.hero.equipped[slot];
        if (!equippedId || !visualItemIds.has(equippedId)) return;
        delete this.save.hero.equipped[slot];
        const replacement = this.save.hero.inventory.find((item) =>
          item.slot === slot
          && (item.allowedClasses === "all" || item.allowedClasses.includes(this.save.hero.classId)));
        if (replacement) this.save.hero.equipped[slot] = replacement.id;
      });

      const legitimatelyOwnedTemplates = new Set(this.save.hero.inventory.map((item) => item.templateId));
      this.save.discoveredItems = this.save.discoveredItems.filter((templateId) =>
        !pollutedTemplateIds.has(templateId) || legitimatelyOwnedTemplates.has(templateId));
    }

    if (!this.save.migrations.includes(VISUAL_TEST_CATALOG_CLEANUP_MIGRATION)) {
      this.save.migrations.push(VISUAL_TEST_CATALOG_CLEANUP_MIGRATION);
    }
  }

  private gainHeroExperience(amount: number, levelCap = Number.POSITIVE_INFINITY): number {
    const hero = this.save.hero;
    if (hero.level >= levelCap) {
      hero.experience = Math.min(hero.experience + amount, Math.max(0, hero.experienceToNextLevel - 1));
      return 0;
    }
    hero.experience += amount;
    let levels = 0;
    while (hero.experience >= hero.experienceToNextLevel && hero.level < levelCap) {
      hero.experience -= hero.experienceToNextLevel;
      hero.level += 1; levels += 1;
      hero.experienceToNextLevel = heroExperienceRequirement(hero.level);
    }
    if (hero.level >= levelCap) hero.experience = Math.min(hero.experience, Math.max(0, hero.experienceToNextLevel - 1));
    return levels;
  }

  private createEnemy(arenaIndex: number, newcomer = false, levelOverride?: number): EnemyProfile {
    const arena = ARENAS[arenaIndex];
    const classId = this.random.world.pick(classes);
    const newcomerLevelCeiling = Math.min(arena.enemyLevel[1], arena.enemyLevel[0] + Math.max(1, Math.ceil((arena.enemyLevel[1] - arena.enemyLevel[0]) * 0.3)));
    const level = levelOverride ?? this.random.world.int(arena.enemyLevel[0], newcomer ? newcomerLevelCeiling : arena.enemyLevel[1]);
    const gearCount = Math.min(6, 2 + Math.floor(level / 5));
    const equipment = Array.from({ length: gearCount }, (_, index) => createItem(level, {
      classId, slot: (["weapon", "offhand", "chest", "head", "hands", "feet"] as EquipmentSlot[])[index],
      minimumRarity: arenaIndex >= 4 ? "epic" : arenaIndex >= 2 ? "rare" : "common",
      randomSource: this.random.loot,
    }));
    const equipped: EnemyProfile["equipped"] = {};
    equipment.forEach((item) => { equipped[item.slot] = item.id; });
    const name = `${this.random.world.pick(enemyNames)} ${String.fromCharCode(65 + this.random.world.int(0, 20))}.`;
    const wins = newcomer ? this.random.world.int(0, Math.max(1, arenaIndex)) : this.random.world.int(arenaIndex * 3, arenaIndex * 9 + 5);
    const tournamentWins = newcomer ? 0 : this.random.world.int(arenaIndex * 4, arenaIndex * 12 + 6);
    const enemy: EnemyProfile = {
      id: this.randomId("enemy"), name, title: this.random.world.pick(enemyTitles), origin: this.random.world.pick(enemyOrigins), classId, level,
      experience: newcomer ? this.random.world.int(0, 35 + level * 4) : this.random.world.int(0, 80 + level * 20), rating: 0, wins,
      tournamentWins, arenaTournamentWins: ARENAS.map((_, index) => index === arenaIndex ? tournamentWins : 0),
      kills: newcomer ? 0 : this.random.world.int(0, Math.max(0, arenaIndex * 2)),
      losses: newcomer ? this.random.world.int(0, 1) : this.random.world.int(0, 5), arenaIndex,
      arenaWins: newcomer ? 0 : this.random.world.int(0, Math.max(1, arenaIndex)), alive: true,
      equipment, equipped, history: [`Начал путь: ${arena.name}.`],
      traitIds: [FIGHTER_TRAITS[(classes.indexOf(classId) + level + arenaIndex) % FIGHTER_TRAITS.length].id], scarIds: [], injuries: [], adaptationIds: [],
      heroMemory: createEnemyStyleMemory(this.save.worldDay),
      tacticalStyle: DEFAULT_TACTICAL_PROFILES[(classes.indexOf(classId) + arenaIndex) % DEFAULT_TACTICAL_PROFILES.length].style,
      factionId: FACTIONS[(classes.indexOf(classId) + arenaIndex + this.random.world.int(0, 2)) % FACTIONS.length].id,
      gold: Math.max(40, level * 55 + wins * 14 + this.random.world.int(0, 180)),
      goal: this.random.world.pick<NpcGoal>(arenaIndex >= ARENAS.length - 2
        ? ["champion", "relic", "elite", "vengeance"]
        : ["champion", "wealth", "relic", "vengeance"]),
      joinedDay: this.save.worldDay,
      relationships: {},
    };
    if (this.save.legacy.cycle >= 2) {
      const mutation = eraChallengeFor(this.save.legacy.cycle).mutations[classId];
      enemy.eraMutationId = mutation.id;
      enemy.eraMutationPotency = mutation.potency;
    }
    if (newcomer) enemy.history = [`Прибыл на арену «${arena.name}» в день ${this.save.worldDay}.`];
    enemy.rating = this.enemyWorldRating(enemy);
    return enemy;
  }

  private createDungeonEnemy(levels: [number, number], dungeonName: string): EnemyProfile {
    const level = this.random.world.int(levels[0], levels[1]);
    const arenaIndex = ARENAS.reduce((selected, arena, index) => arena.enemyLevel[0] <= level ? index : selected, 0);
    const enemy = this.createEnemy(arenaIndex, false, level);
    enemy.id = this.randomId("dungeon"); enemy.name = `Хранитель: ${this.random.world.pick(enemyNames)}`;
    enemy.title = `страж локации «${dungeonName}»`; enemy.rating += 100; return enemy;
  }

  private matchDuelEnemy(tier: DuelDefinition, arenaIndex: number): EnemyProfile {
    const [minOffset, maxOffset] = tier.enemyLevelOffset;
    const minLevel = Math.max(1, this.save.hero.level + minOffset);
    const maxLevel = Math.max(minLevel, this.save.hero.level + maxOffset);
    const localFighters = this.save.enemies.filter((enemy) => enemy.alive && enemy.arenaIndex === arenaIndex);
    const eligible = localFighters.filter((enemy) => enemy.level >= minLevel && enemy.level <= maxLevel);
    const pool = eligible.length > 0 ? eligible : localFighters;
    if (pool.length === 0) {
      const enemy = this.createEnemy(arenaIndex, true);
      this.save.enemies.push(enemy);
      return enemy;
    }
    const heroPower = evaluateCombatantPower(combatantSnapshot(this.save.hero));
    const ranked = pool.map((enemy) => ({ enemy, distance: Math.abs(evaluateCombatantPower(combatantSnapshot(enemy)) - heroPower) }))
      .sort((a, b) => a.distance - b.distance);
    const closest = ranked.filter((candidate) => candidate.distance <= ranked[0].distance + Math.log(1.15)).slice(0, 5);
    return closest[this.random.world.int(0, closest.length - 1)].enemy;
  }

  private createBossEnemy(boss: BossDefinition): EnemyProfile {
    const enemy = this.createEnemy(Math.min(boss.requiredArena, ARENAS.length - 1));
    enemy.id = `boss-${boss.id}`; enemy.name = boss.name; enemy.classId = boss.classId; enemy.level = boss.level;
    enemy.title = "уникальный дуэльный противник"; enemy.origin = boss.place;
    enemy.equipment = (["weapon", "offhand", "head", "chest", "hands", "feet"] as EquipmentSlot[]).map((slot) =>
      createItem(boss.level + 4, { classId: boss.classId, slot, rarity: boss.id === "nameless-duke" ? "mythic" : "legendary", randomSource: this.random.loot }));
    enemy.equipped = {}; enemy.equipment.forEach((item) => { enemy.equipped[item.slot] = item.id; });
    return enemy;
  }

  private futureBossEnemy(record: FutureBossRecord): EnemyProfile {
    const source = this.enemyById(record.fighterId);
    const enemy = source
      ? JSON.parse(JSON.stringify(source)) as EnemyProfile
      : this.createEnemy(Math.min(this.save.hero.highestArena, ARENAS.length - 1), true);
    const previousLevel = Math.max(1, enemy.level);
    const growth = 1 + Math.max(0, record.powerLevel - previousLevel) * 0.035;
    const sourceBySlot = new Map(enemy.equipment
      .filter((item) => Object.values(enemy.equipped).includes(item.id))
      .map((item) => [item.slot, item]));
    enemy.id = record.fighterId;
    enemy.name = record.name;
    enemy.title = record.archetype === "nemesis"
      ? "противник, вернувшийся за последним боем"
      : record.archetype === "relic-bearer"
        ? "носитель прославленной мировой реликвии"
        : "наследник школы старого мастера";
    enemy.origin = "Летопись живого мира";
    enemy.classId = record.classId;
    enemy.level = record.powerLevel;
    enemy.alive = true;
    enemy.injuries = [];
    enemy.equipment = (["weapon", "offhand", "head", "chest", "hands", "feet"] as EquipmentSlot[]).map((slot) => {
      const existing = sourceBySlot.get(slot);
      if (!existing) {
        return createItem(record.powerLevel + 2, {
          classId: record.classId,
          slot,
          minimumRarity: record.powerLevel >= 30 ? "mythic" : "legendary",
          randomSource: this.random.loot,
        });
      }
      return {
        ...existing,
        id: this.randomId(`future-boss-${slot}`),
        level: Math.max(existing.level, record.powerLevel),
        stats: Object.fromEntries(Object.entries(existing.stats).map(([stat, value]) => [stat, Math.max(1, Math.round(Number(value) * growth))])),
        allowedClasses: existing.allowedClasses === "all" ? "all" as const : [...existing.allowedClasses],
        affix: existing.affix ? { ...existing.affix } : undefined,
        relicHistory: [...(existing.relicHistory ?? [])],
        relicFeats: [...(existing.relicFeats ?? [])],
        relicProperties: (existing.relicProperties ?? []).map((property) => ({ ...property })),
      };
    });
    enemy.equipped = {};
    enemy.equipment.forEach((item) => { enemy.equipped[item.slot] = item.id; });
    enemy.rating = this.enemyWorldRating(enemy);
    return enemy;
  }

  private worldEncounterActivity(
    id: string,
    name: string,
    description: string,
    enemy: EnemyProfile,
    rewardExperience: number,
    rewardGold: number,
  ): BossDefinition {
    return {
      id,
      kind: "boss",
      name,
      place: enemy.origin,
      description,
      classId: enemy.classId,
      level: enemy.level,
      requiredLevel: 1,
      requiredDuelWins: 0,
      requiredArena: Math.max(0, Math.min(ARENAS.length - 1, enemy.arenaIndex)),
      rewardGold,
      rewardExperience,
      lootTemplateIds: Object.fromEntries(classes.map((classId) => [
        classId,
        ITEM_TEMPLATES.find((template) => !template.exclusiveToElite
          && !template.exclusiveToBoss && !template.exclusiveToFaction
          && (template.allowedClasses === "all" || template.allowedClasses.includes(classId)))!.id,
      ])) as Record<HeroClass, string>,
      accent: "#6f5548",
    };
  }

  private duelAvailability(duel: DuelDefinition): ActivityAvailability {
    const hero = this.save.hero;
    if (hero.level < duel.minLevel) return { unlocked: false, reason: `Требуется ${duel.minLevel} уровень.` };
    if (hero.duelWins < duel.requiredDuelWins) return { unlocked: false, reason: `Нужно побед в дуэлях: ${hero.duelWins}/${duel.requiredDuelWins}.` };
    if (hero.highestArena < duel.requiredArena) return { unlocked: false, reason: `Нужно открыть арену «${ARENAS[duel.requiredArena].name}».` };
    return { unlocked: true, reason: `Подбор: уровень героя ${duel.enemyLevelOffset[0] >= 0 ? "+" : ""}${duel.enemyLevelOffset[0]}…+${duel.enemyLevelOffset[1]}.` };
  }

  private bossAvailability(boss: BossDefinition): ActivityAvailability {
    const hero = this.save.hero;
    const requirementMultiplier = this.save.legacy.activeBoonId === "hunters-notes" ? 0.8 : 1;
    const requiredLevel = Math.ceil(boss.requiredLevel * requirementMultiplier);
    const requiredDuelWins = Math.ceil(boss.requiredDuelWins * requirementMultiplier);
    if (this.save.defeatedBosses.includes(boss.id)) return { unlocked: false, reason: "Побеждён. Повторный бой невозможен." };
    if (hero.level < requiredLevel) return { unlocked: false, reason: `Требуется ${requiredLevel} уровень.` };
    if (hero.duelWins < requiredDuelWins) return { unlocked: false, reason: `Нужно побед в дуэлях: ${hero.duelWins}/${requiredDuelWins}.` };
    if (hero.highestArena < boss.requiredArena) return { unlocked: false, reason: `Нужно открыть арену «${ARENAS[boss.requiredArena].name}».` };
    if (boss.requiredDungeon && !this.save.dungeonClears[boss.requiredDungeon]) {
      return { unlocked: false, reason: `Нужно пройти данж «${DUNGEONS.find((dungeon) => dungeon.id === boss.requiredDungeon)?.name}».` };
    }
    if (boss.requiredBoss && !this.save.defeatedBosses.includes(boss.requiredBoss)) {
      return { unlocked: false, reason: `Сначала победите: ${DUEL_BOSSES.find((candidate) => candidate.id === boss.requiredBoss)?.name}.` };
    }
    return { unlocked: true, reason: `Одноразовая награда: уникальный предмет. Уровень босса ${boss.level}.` };
  }

  private enemyPower(enemy: EnemyProfile): number {
    return enemy.level * 35 + equipmentScore(enemy.equipment.filter((item) => Object.values(enemy.equipped).includes(item.id)));
  }

  private heroPower(): number {
    return this.save.hero.level * 35 + equipmentScore(this.save.hero.inventory.filter((item) => Object.values(this.save.hero.equipped).includes(item.id)));
  }

  private fighterTournamentSeed(fighter: HeroProfile | EnemyProfile): number {
    return (this.save.eliteRatings[fighter.id] ?? fighter.rating) * 10_000
      + (fighter.id === "hero" ? this.heroPower() : this.enemyPower(fighter as EnemyProfile));
  }

  private recordNpcDuelWithHero(enemy: EnemyProfile, heroWon: boolean): void {
    if (heroWon) {
      enemy.losses += 1;
      enemy.duelLosses = (enemy.duelLosses ?? 0) + 1;
    } else {
      enemy.wins += 1;
      enemy.duelWins = (enemy.duelWins ?? 0) + 1;
    }
    enemy.rating = this.enemyWorldRating(enemy);
  }

  private updateEnemyAfterPlayerBattle(enemy: EnemyProfile, heroWon: boolean, died: boolean, arenaMatch = true): void {
    if (heroWon) {
      enemy.losses += 1;
      if (!arenaMatch) enemy.duelLosses = (enemy.duelLosses ?? 0) + 1;
      if (died) {
        enemy.alive = false;
        const mentor = this.save.mentors?.find((candidate) => candidate.fighterId === enemy.id);
        if (mentor) mentor.competes = false;
        this.recordEnemyHistory(enemy, `Погиб в бою с ${this.save.hero.name} на арене «${ARENAS[enemy.arenaIndex].name}».`);
        this.releaseWorldRelics(enemy, `День ${this.save.worldDay}: ${enemy.name} погиб в бою с ${this.save.hero.name}.`);
        this.event("death", `${enemy.name}, когда-то ${enemy.title}, погиб и больше не появится в мире.`, {
          kind: "death", fighterId: enemy.id, fighterName: enemy.name, killerId: "hero", killerName: this.save.hero.name,
        });
      } else {
        this.recordEnemyHistory(enemy, `Проиграл ${this.save.hero.name}, но выжил.`);
        if (enemy.losses >= 2) enemy.goal = "vengeance";
      }
    } else {
      enemy.wins += 1;
      if (arenaMatch) enemy.arenaWins += 1;
      else enemy.duelWins = (enemy.duelWins ?? 0) + 1;
      enemy.experience += this.npcExperienceReward(45);
      enemy.gold = (enemy.gold ?? 0) + 45 + enemy.arenaIndex * 18;
      if (arenaMatch) this.addFactionInfluence(enemy, enemy.arenaIndex, 4);
      this.recordEnemyHistory(enemy, `Победил главного героя ${this.save.hero.name}.`); this.progressEnemy(enemy);
    }
    enemy.rating = this.enemyWorldRating(enemy);
  }

  private simulateWorldFights(count: number, recordEvents: boolean, fixedArenaIndex?: number): void {
    const eliteIds = new Set(this.save.eliteLeagueMemberIds);
    for (let index = 0; index < count; index += 1) {
      const arenaIndex = fixedArenaIndex ?? this.random.world.int(0, ARENAS.length - 1);
      const pool = this.save.enemies.filter((enemy) => enemy.alive && enemy.arenaIndex === arenaIndex && !eliteIds.has(enemy.id));
      if (pool.length < 2) continue;
      const first = this.random.world.pick(pool);
      const second = this.random.world.pick(pool.filter((enemy) => enemy.id !== first.id));
      const { winner, loser } = this.resolveNpcMatch(first, second);
      winner.wins += 1; winner.arenaWins += 1; winner.experience += this.npcExperienceReward(70 + arenaIndex * 22);
      winner.gold = (winner.gold ?? 0) + 24 + arenaIndex * 12;
      loser.losses += 1;
      this.recordNpcRivalry(winner, loser);
      this.addFactionInfluence(winner, arenaIndex, 1);
      awardWorldSeasonPoints(this.save.worldSeason!, ARENAS[arenaIndex].id, winner.id, "win", winner.name);
      awardWorldSeasonPoints(this.save.worldSeason!, ARENAS[arenaIndex].id, loser.id, "loss", loser.name);
      if (recordEvents) this.event("battle", `${winner.name} победил ${loser.name} на арене «${ARENAS[arenaIndex].name}».`, {
        kind: "battle", actorId: winner.id, actorName: winner.name,
        targetId: loser.id, targetName: loser.name, outcome: "won",
      });
      const lethalMultiplier = eraLawModifiers(this.save.legacy.activeLawIds).arenaLethalityMultiplier
        * worldSeasonRule(this.save.worldSeason?.ruleId).lethalityMultiplier;
      const lethal = this.random.world.chance(Math.min(0.3, ARENAS[arenaIndex].lethalChance * BACKGROUND_LETHALITY_SCALE * lethalMultiplier));
      if (lethal) {
        winner.kills += 1;
        this.recordEquipmentDeeds(winner, "lethal", loser.name);
        loser.alive = false;
        const mentor = this.save.mentors?.find((candidate) => candidate.fighterId === loser.id);
        if (mentor) mentor.competes = false;
        this.recordEnemyHistory(loser, `Погиб в фоновом бою против ${winner.name}.`);
        this.releaseWorldRelics(loser, `День ${this.save.worldDay}: владелец ${loser.name} погиб на арене.`);
        if (recordEvents) this.event("death", `${winner.name} смертельно победил ${loser.name} на арене «${ARENAS[arenaIndex].name}».`, {
          kind: "death", fighterId: loser.id, fighterName: loser.name, killerId: winner.id, killerName: winner.name,
        });
      }
      if (this.random.loot.chance(0.24)) {
        const item = createItem(winner.level, { classId: winner.classId, minimumRarity: arenaIndex >= 3 ? "rare" : "common", randomSource: this.random.loot });
        const equipped = considerNpcLoot(winner, item);
        if (equipped && recordEvents) this.event("loot", `${winner.name} усилил снаряжение предметом «${item.name}» после боя.`, {
          kind: "loot", fighterId: winner.id, fighterName: winner.name, itemId: item.id, itemName: item.name,
        });
      }
      this.progressEnemy(winner, recordEvents);
      this.maybeAwakenWorldRelic(winner, false);
      winner.rating = this.enemyWorldRating(winner);
    }
  }

  private recordNpcRivalry(winner: EnemyProfile, loser: EnemyProfile): void {
    winner.relationships ??= {};
    loser.relationships ??= {};
    const respectedAlly = winner.factionId === loser.factionId && this.random.world.chance(0.14);
    const update = (owner: EnemyProfile, rival: EnemyProfile): void => {
      const current = owner.relationships?.[rival.id];
      owner.relationships![rival.id] = {
        fighterId: rival.id,
        kind: respectedAlly ? "ally" : "rival",
        intensity: Math.min(100, (current?.intensity ?? 0) + 6),
        lastChangedDay: this.save.worldDay,
      };
    };
    update(winner, loser);
    update(loser, winner);
    if (loser.relationships[winner.id]?.kind === "rival" && (loser.relationships[winner.id]?.intensity ?? 0) >= 30) {
      loser.goal = "vengeance";
    }
  }

  private addFactionInfluence(enemy: EnemyProfile, arenaIndex: number, amount: number): void {
    const factionId = enemy.factionId ?? FACTIONS[0].id;
    const arena = ARENAS[arenaIndex];
    const control = this.save.factionControl ??= createFactionControlState(this.save.worldDay);
    control.arenaInfluence[arena.id] ??= Object.fromEntries(FACTIONS.map((faction) => [faction.id, 0]));
    const scaled = Math.max(1, Math.round(amount * worldSeasonRule(this.save.worldSeason?.ruleId).factionInfluenceMultiplier));
    control.arenaInfluence[arena.id][factionId] = (control.arenaInfluence[arena.id][factionId] ?? 0) + scaled;
  }

  private addHeroFactionInfluence(arenaIndex: number, amount: number): void {
    const arena = ARENAS[arenaIndex];
    const control = this.save.factionControl ??= createFactionControlState(this.save.worldDay);
    const preferred = FACTIONS
      .map((faction) => ({ id: faction.id, reputation: this.save.hero.factionReputation[faction.id] ?? 0 }))
      .sort((first, second) => second.reputation - first.reputation)[0];
    const factionId = preferred && preferred.reputation > 0
      ? preferred.id
      : control.arenaControllers[arena.id] ?? FACTIONS[0].id;
    control.arenaInfluence[arena.id] ??= Object.fromEntries(FACTIONS.map((faction) => [faction.id, 0]));
    const scaled = Math.max(1, Math.round(amount * worldSeasonRule(this.save.worldSeason?.ruleId).factionInfluenceMultiplier));
    control.arenaInfluence[arena.id][factionId] = (control.arenaInfluence[arena.id][factionId] ?? 0) + scaled;
  }

  private resolveFactionControl(): void {
    const control = this.save.factionControl ??= createFactionControlState(this.save.worldDay);
    const interval = this.save.worldSeason?.ruleId === "faction-war" ? 4 : 7;
    const resolution = resolveFactionControlCycle(control, this.save.worldDay, interval);
    this.save.factionControl = resolution.state;
    resolution.arenaChanges.forEach((change) => {
      const arena = ARENAS.find((candidate) => candidate.id === change.arenaId);
      const faction = FACTIONS.find((candidate) => candidate.id === change.nextFactionId);
      if (arena && faction) this.event("promotion", `${faction.name} установила контроль над ареной «${arena.name}».`);
    });
    resolution.dungeonChanges.forEach((change) => {
      const dungeon = DUNGEONS.find((candidate) => candidate.id === change.dungeonId);
      const faction = FACTIONS.find((candidate) => candidate.id === change.nextFactionId);
      if (dungeon && faction) this.event("promotion", `${faction.name} взяла под контроль пути к данжу «${dungeon.name}».`);
    });
    if (resolution.shopChange) {
      this.event("system", `${FACTIONS.find((faction) => faction.id === resolution.shopChange!.nextFactionId)?.name} получила право снабжать лавку Ионы.`);
    }
  }

  private simulateNpcAgencyDay(): void {
    const eliteIds = new Set(this.save.eliteLeagueMemberIds);
    const active = this.save.enemies.filter((enemy) => enemy.alive);
    const life = this.save.npcLife = normalizeNpcLifeWorldState(this.save.npcLife, this.save.enemies, this.save.worldDay);
    const planningContext = createNpcPlanningContext({
      day: this.save.worldDay,
      fighters: active,
      eliteIds,
      mentors: this.save.mentors,
      random: this.random.world,
    }, life);
    const plans = new Map(active.map((enemy) => [enemy.id, planNpcDay(enemy, life, planningContext)]));
    const resolvedFighters = new Set<string>();
    active.forEach((enemy) => {
      const plan = plans.get(enemy.id)!;
      const activity = plan.activity;
      let success = true;
      let acquiredTemplateId: string | undefined;
      let description = `${enemy.name}: ${plan.reason}`;
      if (activity === "training") {
        const mentor = this.save.mentors?.find((candidate) => candidate.id === enemy.mentorId);
        const season = worldSeasonRule(this.save.worldSeason?.ruleId);
        enemy.experience += Math.round((20 + enemy.level * 2 + (mentor ? 18 : 0)) * season.npcExperienceMultiplier);
        if (mentor) description = `${enemy.name} тренировался в школе наставника ${mentor.name}. ${plan.reason}`;
        this.progressEnemy(enemy, false);
      } else if (activity === "shopping" && (enemy.gold ?? 0) >= 120) {
        const candidate = createItem(enemy.level + this.random.loot.int(0, 1), {
          classId: enemy.classId,
          templateId: plan.targetTemplateId,
          minimumRarity: enemy.goal === "relic" && enemy.arenaIndex >= 3 ? "epic" : enemy.arenaIndex >= 2 ? "rare" : "common",
          randomSource: this.random.loot,
        });
        const price = Math.max(40, Math.round(candidate.price * 0.62));
        if ((enemy.gold ?? 0) >= price && considerNpcLoot(enemy, candidate)) {
          enemy.gold = (enemy.gold ?? 0) - price;
          acquiredTemplateId = candidate.templateId;
          description = `${enemy.name} купил в лавке предмет «${candidate.name}».`;
          if (RARITY_ORDER.indexOf(candidate.rarity) >= RARITY_ORDER.indexOf("legendary")) {
            this.event("loot", description);
          }
        } else success = false;
      } else if (activity === "forging" && (enemy.gold ?? 0) >= 180) {
        const worn = enemy.equipment.filter((item) => Object.values(enemy.equipped).includes(item.id) && (item.enhancement ?? 0) < 5);
        if (worn.length > 0) {
          const item = [...worn].sort((first, second) => (first.enhancement ?? 0) - (second.enhancement ?? 0))[0];
          const cost = 110 + (item.enhancement ?? 0) * 75;
          if ((enemy.gold ?? 0) >= cost) {
            enemy.gold = (enemy.gold ?? 0) - cost;
            item.enhancement = (item.enhancement ?? 0) + 1;
            item.stats = Object.fromEntries(Object.entries(item.stats).map(([stat, value]) => [
              stat,
              Math.max(1, Math.round((value ?? 0) * 1.04)),
            ]));
            if (item.worldRelicId) {
              const index = (this.save.worldRelics ?? []).findIndex((record) => record.id === item.worldRelicId);
              if (index >= 0) this.save.worldRelics![index] = synchronizeWorldRelic(
                this.save.worldRelics![index],
                item,
                `День ${this.save.worldDay}: ${enemy.name} усилил реликвию до +${item.enhancement}.`,
              );
            }
            description = `${enemy.name} закалил предмет «${item.relicName ?? item.name}» до +${item.enhancement}.`;
          }
        } else success = false;
      } else if (activity === "rest") {
        enemy.injuries.forEach((injury) => { injury.remainingDays = Math.max(0, injury.remainingDays - 1); });
        description = `${enemy.name} взял день на восстановление.`;
      } else if (activity === "dungeon") {
        const dungeon = DUNGEONS[Math.min(DUNGEONS.length - 1, Math.max(0, enemy.arenaIndex))];
        const companion = plan.companionFighterId ? this.enemyById(plan.companionFighterId) : undefined;
        const season = worldSeasonRule(this.save.worldSeason?.ruleId);
        const chance = Math.min(0.88, 0.48 + enemy.level / Math.max(20, dungeon.enemyLevel[1] * 3) + (companion ? 0.08 : 0));
        success = this.random.world.chance(chance);
        if (success) {
          enemy.experience += this.npcExperienceReward(dungeon.rewardExperience * 0.55 * season.dungeonRewardMultiplier);
          enemy.gold = (enemy.gold ?? 0) + Math.round(dungeon.rewardGold * 0.52 * season.goldMultiplier * season.dungeonRewardMultiplier);
          const item = createItem(enemy.level + this.random.loot.int(0, 2), {
            classId: enemy.classId,
            templateId: plan.targetTemplateId,
            minimumRarity: this.minimumRewardRarity(this.controlledDungeonMinimum(dungeon.id, dungeon.minimumRarity), "dungeon"),
            randomSource: this.random.loot,
          });
          if (considerNpcLoot(enemy, item)) acquiredTemplateId = item.templateId;
          this.progressEnemy(enemy, false);
          if (companion) recordNpcAlliance(life, enemy, companion, this.save.worldDay, 5);
          this.save.factionControl = changeFactionInfluence(
            this.save.factionControl ?? createFactionControlState(this.save.worldDay),
            "dungeon",
            dungeon.id,
            enemy.factionId ?? FACTIONS[0].id,
            Math.max(1, Math.round((2 + dungeon.requiredArena) * season.factionInfluenceMultiplier)),
          );
          description = `${enemy.name}${companion ? ` вместе с ${companion.name}` : ""} вернулся из «${dungeon.name}»${acquiredTemplateId ? ` с предметом «${item.name}»` : " без улучшения"}.`;
        } else {
          enemy.injuries.push({
            id: this.randomId("npc-dungeon-injury"),
            name: "Рана из глубин",
            description: `Получена в походе «${dungeon.name}».`,
            remainingDays: this.random.world.int(1, 3),
            stats: { health: -Math.max(4, enemy.level * 2) },
            gainedDay: this.save.worldDay,
          });
          description = `${enemy.name} не завершил поход «${dungeon.name}» и ушёл восстанавливаться.`;
        }
      } else if (activity === "arena" && !resolvedFighters.has(enemy.id)) {
        const opponent = chooseNpcArenaOpponent(plan, enemy, active.filter((candidate) => candidate.arenaIndex === enemy.arenaIndex));
        if (opponent && !resolvedFighters.has(opponent.id)) {
          const targeted = enemy.goal === "vengeance" && plan.targetFighterId === opponent.id;
          const result = this.resolvePlannedNpcFight(enemy, opponent, targeted);
          resolvedFighters.add(enemy.id);
          resolvedFighters.add(opponent.id);
          success = result.winner.id === enemy.id;
          description = `${result.winner.name} победил ${result.loser.name} ${targeted ? "в личной дуэли" : "в бою текущей арены"}.`;
          recordNpcPlanOutcome(life, opponent, plans.get(opponent.id) ?? plan, { day: this.save.worldDay, success: result.winner.id === opponent.id });
        } else success = false;
      }
      enemy.lastActivity = { day: this.save.worldDay, activity, description };
      recordNpcPlanOutcome(life, enemy, plan, { day: this.save.worldDay, success, acquiredTemplateId });
      const nickname = refreshNpcIdentity(life, enemy, this.save.worldDay);
      if (nickname && enemy.title !== nickname && this.save.worldDay === life.profiles[enemy.id]?.nicknameGrantedDay) {
        enemy.title = nickname;
        this.recordEnemyHistory(enemy, `Получил прозвище «${nickname}» в день ${this.save.worldDay}.`);
        this.event("promotion", `${enemy.name} отныне известен как «${nickname}».`);
      }
      if (enemy.arenaIndex >= ARENAS.length - 1 && enemy.tournamentWins >= 2) enemy.goal = "elite";
    });
    (this.save.mentors ?? []).forEach((mentor) => {
      mentor.studentIds.forEach((studentId) => {
        const student = this.enemyById(studentId);
        if (!student) return;
        student.experience += 10 + Math.round(mentor.level * 0.5);
        this.progressEnemy(student, false);
      });
    });
    evolveNpcRelationships(active, life, this.save.worldDay);
  }

  private resolvePlannedNpcFight(first: EnemyProfile, second: EnemyProfile, targeted: boolean): {
    winner: EnemyProfile;
    loser: EnemyProfile;
    fullCombat: boolean;
  } {
    const { winner, loser, fullCombat } = this.resolveNpcMatch(first, second, targeted);
    winner.wins += 1;
    if (!targeted) winner.arenaWins += 1;
    winner.experience += this.npcExperienceReward(28 + winner.arenaIndex * 9);
    winner.gold = (winner.gold ?? 0) + 12 + winner.arenaIndex * 7;
    loser.losses += 1;
    recordNpcEncounter(this.save.npcLife!, winner, loser, { day: this.save.worldDay, kind: targeted ? "duel" : "arena" });
    this.recordNpcRivalry(winner, loser);
    if (!targeted) {
      this.addFactionInfluence(winner, winner.arenaIndex, 1);
      awardWorldSeasonPoints(this.save.worldSeason!, ARENAS[winner.arenaIndex].id, winner.id, "win", winner.name);
      awardWorldSeasonPoints(this.save.worldSeason!, ARENAS[loser.arenaIndex].id, loser.id, "loss", loser.name);
    }
    this.progressEnemy(winner, false);
    if (fullCombat) this.event("battle", `${winner.name} победил ${loser.name} в личной встрече, которую мир запомнил подробно.`);
    return { winner, loser, fullCombat };
  }

  private resolveNpcMatch(first: EnemyProfile, second: EnemyProfile, forceFull = false, ruleIds?: string[]) {
    const result = resolveNpcCombat(first, second, {
      worldRandom: this.random.world,
      combatRandom: this.random.combat,
      eliteIds: this.save.eliteLeagueMemberIds,
      forceFull,
      ruleIds,
      lawIds: this.save.legacy.activeLawIds,
    });
    if (result.fullCombat) {
      this.recordSurvivalDeed(result.winner, result.loser.name, result.turns);
      if (this.save.eliteLeagueMemberIds.slice(0, LEGEND_COUNT).includes(result.loser.id)) {
        this.recordEquipmentDeeds(result.winner, "legend", result.loser.name);
      }
      const decision = result.analysis?.decidingEffect;
      this.recordEnemyHistory(result.winner, `День ${this.save.worldDay}: победил ${result.loser.name} за ${result.turns.length} действий${decision ? `; ${decision}` : ""}.`);
    }
    return result;
  }

  private maybeRetireEnemy(enemy: EnemyProfile): void {
    const age = this.save.worldDay - (enemy.joinedDay ?? this.save.worldDay);
    if (age < 90 || enemy.level < 18 || enemy.tournamentWins < 2) return;
    const chance = enemy.losses > enemy.wins ? 0.0015 : 0.00045;
    if (!this.random.world.chance(chance)) return;
    this.maybeAwakenWorldRelic(enemy, true);
    enemy.retiredDay = this.save.worldDay;
    const candidates = this.save.enemies
      .filter((candidate) => candidate.alive && candidate.id !== enemy.id
        && (candidate.classId === enemy.classId || candidate.factionId === enemy.factionId))
      .sort((first, second) => first.level - second.level)
      .slice(0, 2);
    const mentor: MentorRecord = {
      id: this.randomId("mentor"), fighterId: enemy.id, name: enemy.name, classId: enemy.classId,
      factionId: enemy.factionId ?? FACTIONS[0].id, goal: enemy.goal ?? "champion", level: enemy.level,
      rating: enemy.rating, retiredDay: this.save.worldDay, studentIds: candidates.map((candidate) => candidate.id),
      legacy: `${enemy.tournamentWins} турнирных побед, ${enemy.wins} побед в боях и ${enemy.kills} смертельных исходов.`,
      schoolName: `Школа «${enemy.name.replace(/\s+[A-ZА-ЯЁ]\.\s*$/u, "").trim()}»`,
      competes: (enemy.goal === "champion" || enemy.goal === "elite")
        && enemy.level >= 24
        && enemy.wins >= Math.max(8, Math.round(enemy.losses * 0.75)),
    };
    enemy.alive = mentor.competes === true;
    candidates.forEach((candidate) => {
      candidate.mentorId = mentor.id;
      candidate.relationships ??= {};
      candidate.relationships[enemy.id] = { fighterId: enemy.id, kind: "mentor", intensity: 70, lastChangedDay: this.save.worldDay };
    });
    this.save.mentors ??= [];
    this.save.mentors.unshift(mentor);
    this.save.mentors = this.save.mentors.slice(0, 40);
    if (!mentor.competes) this.releaseWorldRelics(enemy, `День ${this.save.worldDay}: ${enemy.name} завершил карьеру и передал оружие миру.`);
    this.recordEnemyHistory(enemy, `Завершил карьеру и стал наставником в день ${this.save.worldDay}.`);
    this.event("promotion", `${enemy.name} завершил карьеру бойца и стал наставником для ${candidates.length || "нового поколения"}.`);
  }

  private maybeAwakenWorldRelic(enemy: EnemyProfile, force: boolean): void {
    if ((this.save.worldRelics ?? []).some((record) => record.currentOwnerId === enemy.id || record.formerOwners.includes(enemy.name))) return;
    if (!force && enemy.tournamentWins < 2 && enemy.kills < 4) return;
    if (!force && !this.random.world.chance(0.012)) return;
    const candidate = enemy.equipment
      .filter((item) => Object.values(enemy.equipped).includes(item.id)
        && !item.worldRelicId
        && isWorldRelicEligible(item)
        && RARITY_ORDER.indexOf(item.rarity) >= RARITY_ORDER.indexOf("legendary"))
      .sort((first, second) => itemPower(second) - itemPower(first))[0];
    if (!candidate) return;
    assertWorldRelicEligible(candidate);
    const created = createWorldRelicRecord(this.randomId("world-relic"), candidate, enemy.id, enemy.name, this.save.worldDay);
    const record = synchronizeWorldRelic(
      created,
      created.item,
      `${enemy.name}: ${enemy.tournamentWins} турнирных побед и ${enemy.kills} смертельных побед.`,
      this.save.worldDay,
    );
    Object.assign(candidate, record.item, {
      stats: { ...record.item.stats },
      relicHistory: [...(record.item.relicHistory ?? [])],
      relicFeats: [...(record.item.relicFeats ?? [])],
      relicProperties: (record.item.relicProperties ?? []).map((property) => ({ ...property })),
    });
    this.save.worldRelics ??= [];
    this.save.worldRelics.push(record);
    this.event("loot", `В мире появилась реликвия «${candidate.relicName}», выкованная победами ${enemy.name}.`);
  }

  private releaseWorldRelics(enemy: EnemyProfile, history: string): void {
    const records = (this.save.worldRelics ?? []).filter((record) => record.currentOwnerId === enemy.id);
    records.forEach((record) => {
      const actualItem = enemy.equipment.find((item) => item.worldRelicId === record.id);
      const released = releaseWorldRelic(record, actualItem ?? record.item, history);
      const recordIndex = this.save.worldRelics!.findIndex((candidate) => candidate.id === record.id);
      if (recordIndex >= 0) this.save.worldRelics![recordIndex] = released.record;
      enemy.equipment = enemy.equipment.filter((item) => item.worldRelicId !== record.id);
      (Object.keys(enemy.equipped) as EquipmentSlot[]).forEach((slot) => {
        if (!enemy.equipment.some((item) => item.id === enemy.equipped[slot])) delete enemy.equipped[slot];
      });
    });
  }

  private circulateWorldRelics(): void {
    const lost = (this.save.worldRelics ?? []).filter((record) => record.status === "lost");
    lost.forEach((record) => {
      if (!this.random.world.chance(0.045)) return;
      const candidates = this.save.enemies.filter((enemy) => enemy.alive
        && (record.item.allowedClasses === "all" || record.item.allowedClasses.includes(enemy.classId))
        && enemy.level >= Math.max(1, record.item.level - 8));
      if (candidates.length === 0) return;
      const owner = this.random.world.pick(candidates);
      const item = { ...record.item, stats: { ...record.item.stats }, relicHistory: [...record.history] };
      if (!considerNpcLoot(owner, item)) return;
      const line = `День ${this.save.worldDay}: реликвию нашёл ${owner.name}.`;
      const transfer = transferWorldRelic(record, item, owner.id, owner.name, line);
      const recordIndex = this.save.worldRelics!.findIndex((candidate) => candidate.id === record.id);
      if (recordIndex >= 0) this.save.worldRelics![recordIndex] = transfer.record;
      const itemIndex = owner.equipment.findIndex((candidate) => candidate.id === item.id);
      if (itemIndex >= 0) owner.equipment[itemIndex] = transfer.item;
      this.event("loot", `${owner.name} нашёл мировую реликвию «${transfer.item.relicName ?? transfer.item.name}».`);
    });
  }

  private syncLegendCareers(): void {
    const legends = new Set(this.save.eliteLeagueMemberIds.slice(0, 5));
    this.save.enemies.forEach((enemy) => {
      if (legends.has(enemy.id) && !enemy.legendSinceDay) {
        enemy.legendSinceDay = this.save.worldDay;
        enemy.goal = "elite";
        this.recordEnemyHistory(enemy, `Признан легендой элиты в день ${this.save.worldDay}.`);
        if (this.save.worldDay > 1) this.event("promotion", `${enemy.name} вошёл в пятёрку легенд мира.`);
      }
    });
  }

  private simulateDailyWorld(skipTournamentArenaId?: string): void {
    this.ensureEliteLeague();
    this.syncLegendCareers();
    this.simulateNpcAgencyDay();
    ARENAS.forEach((arena, arenaIndex) => {
      this.simulateWorldFights(10 + arenaIndex * 3, true, arenaIndex);
      if (arena.id !== skipTournamentArenaId && this.save.worldDay % arena.tournamentInterval === 0) this.simulateBackgroundTournament(arenaIndex);
    });
    DUNGEONS.forEach((dungeon) => {
      const arenaIndex = Math.min(ARENAS.length - 1, dungeon.requiredArena);
      const eliteIds = new Set(this.save.eliteLeagueMemberIds);
      const pool = this.save.enemies.filter((enemy) => enemy.alive && enemy.arenaIndex === arenaIndex && !eliteIds.has(enemy.id));
      if (pool.length === 0) return;
      const explorer = this.random.world.pick(pool);
      const succeeded = this.random.world.chance(0.68);
      if (succeeded) {
        const season = worldSeasonRule(this.save.worldSeason?.ruleId);
        const controller = this.save.factionControl?.dungeonControllers?.[dungeon.id] ?? FACTIONS[0].id;
        const reward = factionDungeonReward(controller, {
          experience: this.npcExperienceReward(dungeon.rewardExperience * 0.7 * season.dungeonRewardMultiplier),
          gold: Math.round(dungeon.rewardGold * 0.65 * season.goldMultiplier * season.dungeonRewardMultiplier),
        });
        explorer.experience += reward.experience;
        explorer.gold = (explorer.gold ?? 0) + reward.gold;
        this.save.factionControl = changeFactionInfluence(
          this.save.factionControl ?? createFactionControlState(this.save.worldDay),
          "dungeon",
          dungeon.id,
          explorer.factionId ?? FACTIONS[0].id,
          Math.max(1, Math.round(3 * season.factionInfluenceMultiplier)),
        );
        const item = createItem(explorer.level, { classId: explorer.classId, minimumRarity: this.minimumRewardRarity(this.controlledDungeonMinimum(dungeon.id, dungeon.minimumRarity), "dungeon"), randomSource: this.random.loot });
        const equipped = considerNpcLoot(explorer, item);
        this.event("dungeon", equipped
          ? `${explorer.name} вернулся из данжа «${dungeon.name}» и усилил снаряжение предметом «${item.name}».`
          : `${explorer.name} прошёл данж «${dungeon.name}», но не нашёл улучшения.`);
        this.progressEnemy(explorer, true);
      } else {
        this.event("dungeon", `${explorer.name} не смог пройти данж «${dungeon.name}».`);
      }
    });
    this.simulateEliteDay();
    this.resolveFactionControl();
    this.circulateWorldRelics();
    this.ensurePopulations();
  }

  private simulateBackgroundTournament(arenaIndex: number): void {
    const arena = ARENAS[arenaIndex];
    const eliteIds = new Set(this.save.eliteLeagueMemberIds);
    const candidates = this.random.world.shuffle(this.save.enemies
      .filter((enemy) => enemy.alive && enemy.arenaIndex === arenaIndex && !eliteIds.has(enemy.id)));
    const controllerId = this.save.factionControl?.arenaControllers[arena.id];
    const controlled = candidates
      .filter((enemy) => enemy.factionId === controllerId)
      .slice(0, Math.floor(arena.participants / 2));
    const controlledIds = new Set(controlled.map((enemy) => enemy.id));
    const pool = [...controlled, ...candidates.filter((enemy) => !controlledIds.has(enemy.id))].slice(0, arena.participants);
    if (pool.length < arena.participants) return;
    const ruleIds = this.tournamentRules(arena.id, this.save.worldDay).map((rule) => rule.id);
    const bracket = TournamentEngine.run(pool, (first, second, round) => {
        const { winner, loser } = this.resolveNpcMatch(first, second, round >= Math.ceil(Math.log2(pool.length)) - 1, ruleIds);
        winner.wins += 1; winner.arenaWins += 1; winner.experience += this.npcExperienceReward(55 + arenaIndex * 18);
        winner.gold = (winner.gold ?? 0) + 20 + arenaIndex * 10;
        loser.losses += 1;
        this.recordNpcRivalry(winner, loser);
        this.addFactionInfluence(winner, arenaIndex, 1);
        recordNpcEncounter(this.save.npcLife!, winner, loser, { day: this.save.worldDay, kind: "tournament" });
        awardWorldSeasonPoints(this.save.worldSeason!, arena.id, winner.id, "win", winner.name);
        awardWorldSeasonPoints(this.save.worldSeason!, arena.id, loser.id, "loss", loser.name);
        return { winner };
      }, { seeded: true });
    const champion = bracket.champion;
    this.recordArenaChampionship(champion, arenaIndex);
    awardWorldSeasonPoints(this.save.worldSeason!, arena.id, champion.id, "champion", champion.name);
    champion.gold = (champion.gold ?? 0) + arena.rewardGold;
    this.addFactionInfluence(champion, arenaIndex, 14 + arenaIndex * 2);
    champion.rating = this.enemyWorldRating(champion);
    const prize = createItem(champion.level, { classId: champion.classId, minimumRarity: arenaIndex >= 4 ? "legendary" : arenaIndex >= 2 ? "epic" : "rare", randomSource: this.random.loot });
    considerNpcLoot(champion, prize);
    this.recordEnemyHistory(champion, `Стал чемпионом турнира «${arena.name}» в день ${this.save.worldDay}.`);
    this.progressEnemy(champion, true);
    this.maybeAwakenWorldRelic(champion, false);
    this.event("tournament", `Фоновый турнир «${arena.name}» завершён: ${champion.name} победил сетку из ${pool.length} бойцов.`, {
      kind: "tournament", tournamentId: arena.id, tournamentName: arena.name,
      championId: champion.id, championName: champion.name, participants: pool.length,
    });
  }

  private simulateEliteDay(): void {
    this.ensureEliteLeague();
    const heroRank = this.heroEliteRank();
    const challengeMultiplier = eraLawModifiers(this.save.legacy.activeLawIds).eliteChallengeChanceMultiplier;
    if (heroRank && heroRank <= LEGEND_COUNT && !this.save.pendingEliteChallengeId
      && this.save.lastLegendHuntDay !== this.save.worldDay && this.random.world.chance(Math.min(0.24, 0.08 * challengeMultiplier))) {
      const challengerId = this.save.eliteLeagueMemberIds[Math.min(ELITE_SIZE - 1, heroRank)];
      if (challengerId && challengerId !== "hero") {
        this.save.pendingEliteChallengeId = challengerId;
        this.event("battle", `${this.enemyById(challengerId)?.name ?? "Претендент"} вызвал ${this.save.hero.name} на защиту титула легенды.`);
      }
    } else if (this.random.world.chance(Math.min(0.35, 0.16 * challengeMultiplier))) {
      const defenderIndex = this.random.world.int(0, LEGEND_COUNT - 1);
      const challengerIndex = defenderIndex + 1;
      const defenderId = this.save.eliteLeagueMemberIds[defenderIndex];
      const challengerId = this.save.eliteLeagueMemberIds[challengerIndex];
      if (defenderId && challengerId && defenderId !== "hero" && challengerId !== "hero") {
        const defender = this.enemyById(defenderId); const challenger = this.enemyById(challengerId);
        if (defender && challenger) {
          const result = this.resolveNpcMatch(challenger, defender, true);
          result.winner.wins += 1;
          result.loser.losses += 1;
          recordNpcEncounter(this.save.npcLife!, result.winner, result.loser, { day: this.save.worldDay, kind: "duel" });
          this.awardCrownSeason(result.winner.id, result.winner.id === defender.id ? "defense" : "win");
          this.awardCrownSeason(result.loser.id, "loss");
          if (result.winner.id === challenger.id) {
            this.swapEliteMembers(challenger.id, defender.id);
            this.event("battle", `${challenger.name} победил легенду ${defender.name} и занял место #${defenderIndex + 1}.`);
          }
        }
      }
    }

    if (this.registeredCrownLeagueDay() === this.save.worldDay) {
      this.syncCrownSet();
      return;
    }
    const lastLeague = this.save.lastCrownLeagueDay ?? 0;
    if (this.save.worldDay % this.crownLeagueInterval() !== 0 || this.save.worldDay === lastLeague) {
      this.syncCrownSet(); return;
    }
    const elite = new Set(this.save.eliteLeagueMemberIds);
    const candidate = this.save.enemies
      .filter((enemy) => enemy.alive && !elite.has(enemy.id) && enemy.arenaIndex === ARENAS.length - 1 && enemy.tournamentWins > 0)
      .sort((a, b) => b.rating - a.rating || this.enemyPower(b) - this.enemyPower(a))[0];
    if (!candidate) return;
    const contestants = [candidate, ...this.save.eliteLeagueMemberIds.filter((id) => id !== "hero").slice(0, ELITE_SIZE - 1)
      .map((id) => this.enemyById(id)).filter((enemy): enemy is EnemyProfile => Boolean(enemy))]
      .sort((first, second) => this.fighterTournamentSeed(second) - this.fighterTournamentSeed(first));
    if (contestants.length !== ELITE_SIZE) return;
    const bracket = TournamentEngine.run(contestants, (first, second) => {
        const { winner, loser } = this.resolveNpcMatch(first, second, true, this.save.crownSeason.ruleIds);
        winner.wins += 1; loser.losses += 1;
        this.adjustEliteRating(winner.id, 8); this.adjustEliteRating(loser.id, -3);
        this.awardCrownSeason(winner.id, "win");
        this.awardCrownSeason(loser.id, "loss");
        return { winner };
      }, { seeded: true });
    const champion = bracket.champion;
    this.awardCrownSeason(champion.id, "champion");
    this.recordEquipmentDeeds(champion, "championship", `Лига короны, день ${this.save.worldDay}`);
    champion.tournamentWins += 1;
    this.save.eliteCrownWins[champion.id] = (this.save.eliteCrownWins[champion.id] ?? 0) + 1;
    if (champion.id === candidate.id) this.promoteIntoElite(candidate.id);
    else this.sortEliteByRating();
    this.save.lastCrownLeagueDay = this.save.worldDay;
    this.event("tournament", `Фоновую Лигу короны выиграл ${champion.name}. ${candidate.name} ${champion.id === candidate.id ? "вошёл в элиту" : "остался в обычном рейтинге"}.`, {
      kind: "tournament", tournamentId: "crown-league", tournamentName: "Лига короны",
      championId: champion.id, championName: champion.name, participants: contestants.length,
    });
    this.syncCrownSet();
  }

  private completeDay(skipTournamentArenaId?: string): void {
    this.simulateDailyWorld(skipTournamentArenaId);
    this.healDailyInjuries();
    this.save.worldDay += 1;
    this.syncWorldSeason();
    this.syncFutureBosses();
    this.syncFactionHunter();
    this.syncCrownSeason();
    this.syncNarrativeEvent();
    this.syncDerivedEraProgress();
    this.syncFeatureUnlocks();
    this.refreshShopIfNeeded();
    this.refreshContracts(false);
    this.save.lastSimulatedAt = Date.now();
    this.clearExpiredTournamentRegistrations();
  }

  private syncWorldSeason(): void {
    const season = this.save.worldSeason!;
    if (this.save.worldDay <= season.endsDay) return;
    const life = this.save.npcLife = normalizeNpcLifeWorldState(this.save.npcLife, this.save.enemies, this.save.worldDay);
    const mentors = this.save.mentors ??= [];
    const seasonLength = Math.max(7, season.endsDay - season.startsDay + 1);
    const career = advanceNpcCareerSeason(this.save.enemies, mentors, life, {
      day: this.save.worldDay,
      eliteIds: this.save.eliteLeagueMemberIds,
      random: this.random.world,
      seasonLength,
      maxRetirements: 2,
    });
    career.transitions.forEach((transition) => {
      const fighter = this.save.enemies.find((candidate) => candidate.id === transition.fighterId);
      if (fighter) this.recordEnemyHistory(fighter, transition.description);
      this.event("promotion", transition.description);
      const mentor = transition.mentorId ? mentors.find((candidate) => candidate.id === transition.mentorId) : undefined;
      if (transition.kind === "became-mentor" && fighter && !mentor?.competes) {
        this.releaseWorldRelics(fighter, `День ${this.save.worldDay}: ${fighter.name} завершил карьеру и передал реликвии следующему поколению.`);
      }
    });
    career.mentorsCreated.forEach((mentor, index) => {
      const dynasty = career.dynastiesCreated.find((candidate) => candidate.founderId === mentor.fighterId);
      mentor.dynastyId = dynasty?.id;
      mentor.role = !mentor.competes && index === 0 && season.number % 3 === 0
        ? "shop-owner"
        : !mentor.competes && index === 0 && season.number % 3 === 2
          ? "faction-founder"
          : "mentor";
      if (mentor.role === "shop-owner") {
        const control = this.save.factionControl ??= createFactionControlState(this.save.worldDay);
        control.shopOwnerMentorId = mentor.id;
        control.shopControllerId = mentor.factionId;
        control.shopPriceRevision = (control.shopPriceRevision ?? 0) + 1;
        this.event("promotion", `${mentor.name} принял управление лавкой и открыл поставки своей школы.`);
      }
      if (mentor.role === "faction-founder") {
        const control = this.save.factionControl ??= createFactionControlState(this.save.worldDay);
        ARENAS.forEach((arena) => {
          control.arenaInfluence[arena.id] ??= {};
          control.arenaInfluence[arena.id][mentor.factionId] = (control.arenaInfluence[arena.id][mentor.factionId] ?? 0) + 6;
        });
        this.event("promotion", `${mentor.name} превратил свою школу в новую силу внутри фракции.`);
      }
    });

    const newcomerIds: string[] = [];
    const generationSize = season.ruleId === "new-blood" ? 2 : 1;
    ARENAS.forEach((arena, arenaIndex) => {
      for (let index = 0; index < generationSize; index += 1) {
        const newcomer = this.createEnemy(arenaIndex, true);
        const mentor = mentors
          .filter((candidate) => candidate.classId === newcomer.classId || candidate.factionId === newcomer.factionId)
          .sort((first, second) => second.rating - first.rating)[0];
        if (mentor) {
          newcomer.mentorId = mentor.id;
          mentor.studentIds = [...new Set([...mentor.studentIds, newcomer.id])];
          newcomer.relationships ??= {};
          newcomer.relationships[mentor.fighterId] = {
            fighterId: mentor.fighterId,
            kind: "mentor",
            intensity: 72,
            lastChangedDay: this.save.worldDay,
          };
          const profile = life.profiles[newcomer.id] ??= {
            fighterId: newcomer.id,
            career: "active",
            seasonsActive: 0,
          };
          profile.dynastyId = mentor.dynastyId;
          const dynasty = life.dynasties.find((candidate) => candidate.id === mentor.dynastyId);
          if (dynasty) dynasty.memberIds = [...new Set([...dynasty.memberIds, newcomer.id])];
          newcomer.history.push(`Принят в школу наставника ${mentor.name}.`);
        }
        this.save.enemies.push(newcomer);
        newcomerIds.push(newcomer.id);
      }
    });

    const result = closeWorldSeason(season, this.save.enemies, mentors, this.save.hero.name, newcomerIds);
    const promotedIds: string[] = [];
    const demotedIds: string[] = [];
    const promoted = new Set(result.promotedIds);
    result.promotedIds.forEach((fighterId) => {
      const fighter = this.enemyById(fighterId);
      if (!fighter?.alive || this.save.eliteLeagueMemberIds.includes(fighter.id) || fighter.arenaIndex >= ARENAS.length - 1) return;
      const previous = ARENAS[fighter.arenaIndex];
      fighter.arenaIndex += 1;
      fighter.arenaWins = 0;
      fighter.rating = this.enemyWorldRating(fighter);
      promotedIds.push(fighter.id);
      this.recordEnemyHistory(fighter, `Повышен по итогам сезона ${season.number}: «${previous.name}» → «${ARENAS[fighter.arenaIndex].name}».`);
    });
    result.demotedIds.forEach((fighterId) => {
      const fighter = this.enemyById(fighterId);
      if (!fighter?.alive || promoted.has(fighter.id) || this.save.eliteLeagueMemberIds.includes(fighter.id) || fighter.arenaIndex <= 0) return;
      const previous = ARENAS[fighter.arenaIndex];
      fighter.arenaIndex -= 1;
      fighter.arenaWins = 0;
      fighter.rating = this.enemyWorldRating(fighter);
      demotedIds.push(fighter.id);
      this.recordEnemyHistory(fighter, `Понижен по итогам сезона ${season.number}: «${previous.name}» → «${ARENAS[fighter.arenaIndex].name}».`);
    });
    result.promotedIds = promotedIds;
    result.demotedIds = demotedIds;
    result.retiredIds = career.transitions.filter((transition) => transition.kind === "became-mentor").map((transition) => transition.fighterId);
    result.mentorIds = career.mentorsCreated.map((mentor) => mentor.id);
    result.summary = `Сезон ${season.number} завершён: чемпионов арен — ${result.champions.length}, повышений — ${promotedIds.length}, понижений — ${demotedIds.length}, наставников — ${result.mentorIds.length}, новых бойцов — ${newcomerIds.length}.`;
    this.save.worldSeasonHistory ??= [];
    this.save.worldSeasonHistory.push(result);
    this.save.worldSeasonHistory = this.save.worldSeasonHistory.slice(-12);
    this.event("tournament", result.summary, {
      kind: "system",
      code: "world-season-result",
      values: { season: season.number, promotions: promotedIds.length, demotions: demotedIds.length, newcomers: newcomerIds.length },
    });
    const nextNumber = season.number + 1;
    this.save.worldSeason = createWorldSeason(
      this.save.worldDay,
      nextNumber,
      new SeededRandom(`${this.save.tournamentRuleSeed}:world-season:${nextNumber}`),
    );
    const rule = worldSeasonRule(this.save.worldSeason.ruleId);
    this.event("system", `Начался мировой сезон ${nextNumber}: «${rule.name}». ${rule.description}`);
    cleanupNpcLifeReferences(this.save.enemies, mentors, life);
    this.ensurePopulations(false, false);
  }

  private syncFutureBosses(): void {
    const life = this.save.npcLife = normalizeNpcLifeWorldState(this.save.npcLife, this.save.enemies, this.save.worldDay);
    refreshFutureBossAvailability(life, this.save.worldDay).forEach((boss) => {
      this.event("promotion", `${boss.name} появился среди особых противников. ${boss.reason}`);
    });
  }

  private syncFactionHunter(): void {
    const current = this.factionHunter();
    if (current?.alive) return;
    this.save.pendingFactionHunterId = undefined;
    if (this.save.worldDay < 10 || this.save.hero.highestArena < 1) return;
    const relations = this.save.factionControl?.relations;
    const hostile = FACTIONS.map((faction) => ({
      faction,
      hostility: factionHostility(this.save.hero.factionReputation, faction.id, relations),
    })).sort((first, second) => second.hostility - first.hostility)[0];
    if (!hostile || hostile.hostility < 35) return;
    const interval = Math.max(5, 11 - Math.floor(hostile.hostility / 14));
    if (this.save.worldDay % interval !== 0 || !this.random.world.chance(Math.min(0.9, 0.38 + hostile.hostility / 160))) return;
    const heroPower = this.heroPower();
    const candidates = this.save.enemies
      .filter((enemy) => enemy.alive && enemy.factionId === hostile.faction.id && !this.save.eliteLeagueMemberIds.includes(enemy.id))
      .sort((first, second) => {
        const firstVengeance = first.goal === "vengeance" ? -250 : 0;
        const secondVengeance = second.goal === "vengeance" ? -250 : 0;
        return Math.abs(this.enemyPower(first) - heroPower) + firstVengeance
          - (Math.abs(this.enemyPower(second) - heroPower) + secondVengeance);
      });
    if (candidates.length === 0) return;
    const hunter = candidates[this.random.world.int(0, Math.min(3, candidates.length - 1))];
    this.save.pendingFactionHunterId = hunter.id;
    hunter.goal = "vengeance";
    const profile = this.save.npcLife?.profiles[hunter.id];
    if (profile) profile.revengeTargetId = "hero";
    this.recordEnemyHistory(hunter, `${hostile.faction.name} отправила его охотиться на ${this.save.hero.name}.`);
    this.event("battle", `${hostile.faction.name} выставила охотника ${hunter.name} против ${this.save.hero.name}.`);
  }

  private syncFeatureUnlocks(): WorldFeatureUnlock[] {
    const newlyUnlocked: WorldFeatureUnlock[] = [];
    WORLD_FEATURE_IDS.forEach((id) => {
      if (this.save.unlockedFeatureIds.includes(id) || !worldFeatureAvailability(this.save, id).unlocked) return;
      this.save.unlockedFeatureIds.push(id);
      const unlock = createWorldFeatureUnlock(this.save, id);
      if (!this.save.pendingFeatureUnlocks.some((pending) => pending.id === id)) {
        this.save.pendingFeatureUnlocks.push(unlock);
      }
      newlyUnlocked.push(unlock);
      this.event("system", unlock.title + ". " + unlock.description);
    });
    return newlyUnlocked;
  }

  private requireFeature(id: WorldFeatureId): void {
    const availability = this.featureAvailability(id);
    if (!availability.unlocked) throw new Error(availability.reason);
    this.syncFeatureUnlocks();
  }

  private prepareDayActivity(): void {
    if (this.save.pendingBattle) throw new Error("Сначала завершите или отмените уже начатый бой.");
    if (this.save.activeExpedition) throw new Error("Сначала завершите текущий поход или отступите.");
    if (!this.save.pendingEliteChallengeId) return;
    if (!this.save.hero.autoResolveLegendChallenges) {
      throw new Error("Сначала защитите место легенды или включите автоматический расчёт защиты в разделе эндгейма.");
    }
    this.automaticLegendDefense = this.resolveLegendDefense(false);
  }

  private clearExpiredTournamentRegistrations(): void {
    Object.entries(this.save.tournamentRegistrations).forEach(([arenaId, day]) => {
      if (day < this.save.worldDay) {
        const arena = ARENAS.find((candidate) => candidate.id === arenaId);
        const name = arena?.name ?? (arenaId === "crown-league" ? "Лига короны" : arenaId);
        this.event("tournament", `${this.save.hero.name} пропустил запись на «${name}» в день ${day}.`);
        delete this.save.tournamentRegistrations[arenaId];
      }
    });
  }

  private npcExperienceReward(baseExperience: number): number {
    return Math.max(0, Math.round(baseExperience * worldSeasonRule(this.save.worldSeason?.ruleId).npcExperienceMultiplier));
  }

  private progressEnemy(enemy: EnemyProfile, recordEvent = true): void {
    while (enemy.experience >= enemyExperienceRequirement(enemy.level)) {
      enemy.experience -= enemyExperienceRequirement(enemy.level);
      enemy.level += 1;
    }
    const nextArena = ARENAS[enemy.arenaIndex + 1];
    if (nextArena && enemy.arenaWins >= ARENAS[enemy.arenaIndex].winsToAdvance && enemy.level >= nextArena.minLevel) {
      const old = ARENAS[enemy.arenaIndex].name; enemy.arenaIndex += 1; enemy.arenaWins = 0;
      this.recordEnemyHistory(enemy, `Перешёл с арены «${old}» на «${nextArena.name}».`);
      if (recordEvent) this.event("promotion", `${enemy.name} покинул арену «${old}» и поднялся на «${nextArena.name}».`, {
        kind: "promotion", fighterId: enemy.id, fighterName: enemy.name, fromArena: old, toArena: nextArena.name,
      });
    }
    enemy.rating = this.enemyWorldRating(enemy);
  }

  private ensurePopulations(fillImmediately = false, allowRoutineRecruitment = true): void {
    const eliteIds = new Set(this.save.eliteLeagueMemberIds);
    ARENAS.forEach((arena, arenaIndex) => {
      const alive = this.save.enemies.filter((enemy) => enemy.alive && enemy.arenaIndex === arenaIndex && !eliteIds.has(enemy.id)).length;
      const floor = Math.max(ARENA_POPULATION_BASE_FLOOR, arena.participants);
      const target = Math.max(ARENA_POPULATION_TARGET, floor + ARENA_POPULATION_RESERVE);
      const missing = Math.max(0, target - alive);
      const emergencyRecruitment = Math.max(0, floor - alive);
      const routineRecruitment = allowRoutineRecruitment ? Math.min(1, missing) : 0;
      const recruits = fillImmediately
        ? missing
        : Math.max(emergencyRecruitment, routineRecruitment);
      for (let index = 0; index < recruits; index += 1) {
        this.save.enemies.push(this.createEnemy(arenaIndex, !fillImmediately));
      }
    });
    if (this.save.enemies.length > 260) {
      rememberWorldSeasonFighters(this.save.worldSeason!, [this.save.hero, ...this.save.enemies]);
      const previousEnemyIds = new Set(this.save.enemies.map((enemy) => enemy.id));
      const encounteredIds = new Set(Object.keys(this.save.hero.rivalries));
      this.save.eliteLeagueMemberIds.forEach((id) => encounteredIds.add(id));
      const life = this.save.npcLife = normalizeNpcLifeWorldState(this.save.npcLife, this.save.enemies, this.save.worldDay);
      npcReferenceRetentionIds(this.save.enemies, this.save.mentors ?? [], life).forEach((id) => encounteredIds.add(id));
      (this.save.worldRelics ?? []).forEach((record) => {
        if (record.currentOwnerId && record.currentOwnerId !== "hero") encounteredIds.add(record.currentOwnerId);
      });
      ARENAS.forEach((arena, arenaIndex) => {
        this.save.enemies
          .filter((enemy) => enemy.alive && enemy.arenaIndex === arenaIndex && !eliteIds.has(enemy.id))
          .sort((first, second) => second.rating - first.rating
            || second.tournamentWins - first.tournamentWins
            || second.history.length - first.history.length)
          .slice(0, Math.max(ARENA_POPULATION_BASE_FLOOR, arena.participants))
          .forEach((enemy) => encounteredIds.add(enemy.id));
      });
      const encountered = this.save.enemies.filter((enemy) => encounteredIds.has(enemy.id));
      const retainedIds = new Set(encountered.map((enemy) => enemy.id));
      const populationLimit = Math.max(0, 260 - encountered.length);
      const population = this.save.enemies
        .filter((enemy) => !retainedIds.has(enemy.id) && (enemy.alive || enemy.history.some((line) => line.includes(this.save.hero.name))))
        .sort((first, second) => Number(second.alive) - Number(first.alive)
          || second.rating - first.rating
          || second.tournamentWins - first.tournamentWins
          || second.history.length - first.history.length)
        .slice(0, populationLimit);
      this.save.enemies = [...encountered, ...population];
      const retainedEnemyIds = new Set(this.save.enemies.map((enemy) => enemy.id));
      const removedEnemyIds = [...previousEnemyIds].filter((id) => !retainedEnemyIds.has(id));
      if (removedEnemyIds.length > 0) {
        this.save.events = this.save.events.filter((event) =>
          !removedEnemyIds.some((fighterId) => eventReferencesFighter(event.payload, fighterId)));
      }
    }
    cleanupNpcLifeReferences(this.save.enemies, this.save.mentors ?? [], this.save.npcLife!);
  }

  private refreshShopIfNeeded(): void {
    if (this.save.worldDay - this.save.shopDay >= 2) this.rotateShop();
  }

  private rotateShop(): void {
    this.save.shopOffers.filter((offer) => !offer.sold && offer.item.worldRelicId).forEach((offer) => {
      const recordIndex = (this.save.worldRelics ?? []).findIndex((candidate) => candidate.id === offer.item.worldRelicId);
      if (recordIndex < 0) return;
      this.save.worldRelics![recordIndex] = releaseWorldRelic(
        this.save.worldRelics![recordIndex],
        offer.item,
        `День ${this.save.worldDay}: лавка сняла реликвию с продажи.`,
      ).record;
    });
    const controllerId = this.save.factionControl?.shopControllerId ?? FACTIONS[0].id;
    const baseMinimum: Rarity = this.save.hero.highestArena >= 4 ? "epic" : this.save.hero.highestArena >= 2 ? "rare" : "common";
    const minimum = controllerId === "red-ledger" ? improveMinimumRarity(baseMinimum, 1) : baseMinimum;
    const offers: ShopOffer[] = Array.from({ length: 8 }, () => {
      const universalTemplate = controllerId === "free-company" && this.random.loot.chance(0.48)
        ? this.random.loot.pick(ITEM_TEMPLATES.filter((template) => template.allowedClasses === "all" && !template.exclusiveToElite && !template.exclusiveToBoss && !template.exclusiveToFaction))
        : undefined;
      const item = createItem(this.save.hero.level + this.random.loot.int(0, 2), {
        classId: this.save.hero.classId,
        templateId: universalTemplate?.id,
        minimumRarity: this.random.loot.chance(controllerId === "red-ledger" ? 0.58 : 0.35) ? minimum : "common",
        randomSource: this.random.loot,
      });
      item.price = factionShopPrice(
        item.price,
        controllerId,
        this.save.hero.factionReputation[controllerId] ?? 0,
      );
      return { item, sold: false };
    });
    const lostRelics = (this.save.worldRelics ?? []).filter((record) => record.status === "lost"
      && (record.item.allowedClasses === "all" || record.item.allowedClasses.includes(this.save.hero.classId)));
    if (lostRelics.length > 0 && this.random.world.chance(0.28)) {
      const record = this.random.world.pick(lostRelics);
      const placed = placeWorldRelicInShop(record, "Лавка Ионы", `День ${this.save.worldDay}: реликвия появилась в лавке Ионы.`);
      placed.item.price = factionShopPrice(
        Math.max(placed.item.price, calculateItemPrice(placed.item.level, placed.item.rarity)),
        controllerId,
        this.save.hero.factionReputation[controllerId] ?? 0,
        true,
      );
      offers[this.random.world.int(0, offers.length - 1)] = { item: placed.item, sold: false };
      const recordIndex = this.save.worldRelics!.findIndex((candidate) => candidate.id === record.id);
      if (recordIndex >= 0) this.save.worldRelics![recordIndex] = placed.record;
    }
    this.save.shopOffers = offers;
    this.save.shopDay = this.save.worldDay;
  }

  private latestEventId(): string | undefined {
    return this.save.events[0]?.id;
  }

  private eventsSince(cursor?: string): WorldEvent[] {
    if (!cursor) return [...this.save.events];
    const cursorIndex = this.save.events.findIndex((event) => event.id === cursor);
    return cursorIndex < 0 ? [...this.save.events] : this.save.events.slice(0, cursorIndex);
  }

  private randomId(prefix: string): string {
    const first = this.random.world.int(0, 0x7fffffff).toString(36);
    const second = this.random.world.int(0, 0x7fffffff).toString(36);
    return `${prefix}-${first}-${second}`;
  }

  private event(type: WorldEvent["type"], message: string, payload?: StructuredWorldEventPayload): void {
    this.save.events.unshift({ id: this.randomId("event"), day: this.save.worldDay, type, message, payload });
    this.save.events = this.save.events.slice(0, 500);
  }
}

export function rarityAtLeast(rarity: Rarity, minimum: Rarity): boolean {
  return RARITY_ORDER.indexOf(rarity) >= RARITY_ORDER.indexOf(minimum);
}

export function skillById(id: string): SkillDefinition | undefined { return SKILLS.find((skill) => skill.id === id); }
