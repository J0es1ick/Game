import { CombatOptions, combatantSnapshot, resolveCombat, unlockedSkills } from "./AdvancedBattle";
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
import { calculateItemPrice, createItem, createStarterItems, equipmentScore, itemPower } from "../factories/ItemFactory";
import {
  CLASS_RELIC_EPITHETS,
  DEFAULT_TACTICAL_PROFILES,
  ENEMY_ADAPTATIONS,
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
  DailyActivityReport,
  DuelDefinition,
  DungeonDefinition,
  DungeonExpedition,
  EnemyProfile,
  EquipmentItem,
  EquipmentSlot,
  ExpeditionChoice,
  ExpeditionStepReport,
  FighterFeatureChange,
  GameSave,
  HeroClass,
  HeroProfile,
  LegacyHeroRecord,
  LeaderboardEntry,
  NewGamePlusOptions,
  NewGamePlusStatus,
  Rarity,
  ShopOffer,
  SkillDefinition,
  Stats,
  TacticalProfile,
  TournamentMatch,
  TournamentReport,
  WorldEvent,
} from "./WorldTypes";
import {
  enemyExperienceRequirement,
  heroExperienceRequirement,
} from "./ProgressionBalance";
import {
  buildLegacyArchive,
  defaultLegacyState,
  epochDifficultyModifiers,
  eraLawModifiers,
  improveMinimumRarity,
  inheritedSkillSupportsClass,
  newGamePlusStatus,
  normalizeLegacyState,
  prepareInheritedItem,
  rewardModifiers,
  RewardContext,
} from "./NewGamePlus";
import { ERA_LAWS, LEGACY_BOONS } from "../catalogs/NewGamePlusCatalog";
import { createRandomId, getRandomNumber, pickRandom, shuffleArray } from "../utils/randomization";
import {
  byLeaderboardPosition,
  calculateEnemyWorldRating,
  calculateHeroWorldRating,
  enemyLeaderboardEntry,
  heroLeaderboardEntry,
} from "./WorldRanking";
import { normalizeWorldSave, PROGRESSION_CURVE_MIGRATION } from "./WorldSaveMigration";
import { MAX_ACTIVE_SKILLS } from "./WorldRules";

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
const FINAL_ARENA_INTERVAL = ARENAS[ARENAS.length - 1]?.tournamentInterval ?? 14;
const CROWN_LEAGUE_INTERVAL = FINAL_ARENA_INTERVAL * 2;
const CROWN_SET_ID = "crown-sovereign";
const ARENA_POPULATION_TARGET = 16;
const ARENA_POPULATION_FLOOR = 12;
const BACKGROUND_LETHALITY_SCALE = 0.14;
const CONTRACT_LIFETIME = 7;
const ACTIVE_INJURY_CHANCE = 0.24;
export const CLASS_CHANGE_GOLD_COST = 25_000;
export const CLASS_CHANGE_MARK_COST = 5;

function starterEquipment(classId: HeroClass): { inventory: EquipmentItem[]; equipped: HeroProfile["equipped"] } {
  const inventory = createStarterItems(classId);
  const equipped: HeroProfile["equipped"] = {};
  inventory.forEach((item) => { equipped[item.slot] = item.id; });
  return { inventory, equipped };
}

export class WorldGame {
  public readonly save: GameSave;
  private featureChanges: FighterFeatureChange[] = [];
  private automaticLegendDefense?: BattleReport;

  private constructor(save: GameSave) {
    this.save = save;
  }

  public static create(name: string, classId: HeroClass, now = Date.now()): WorldGame {
    const starter = starterEquipment(classId);
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
    const save: GameSave = {
      version: 3, migrations: [PROGRESSION_CURVE_MIGRATION], hero, enemies: [], worldDay: 1, lastSimulatedAt: now,
      dungeonClears: {}, shopDay: 1, shopOffers: [],
      discoveredItems: starter.inventory.map((item) => item.templateId), tournamentRegistrations: {}, defeatedBosses: [],
      huntedLegendIds: [], eliteLeagueMemberIds: [], eliteRatings: {}, eliteCrownWins: {}, tutorialCompleted: false, events: [],
      legacy: defaultLegacyState(), defeatedLegacyCycles: [],
      contractOffers: [], completedContracts: 0, tournamentRuleSeed: Math.max(1, now % 999_999),
    };
    const game = new WorldGame(save);
    ARENAS.forEach((_, arenaIndex) => {
      for (let index = 0; index < 19; index += 1) game.save.enemies.push(game.createEnemy(arenaIndex));
    });
    game.ensureEliteLeague();
    game.syncCrownSet();
    game.ensurePopulations(true);
    game.rotateShop();
    game.refreshContracts(true);
    game.event("system", `${hero.name} начал путь в Нижнем городе.`);
    return game;
  }

  public static restore(save: GameSave): WorldGame {
    const game = new WorldGame(normalizeWorldSave(save));
    game.save.enemies.forEach((enemy) => { enemy.rating = game.enemyWorldRating(enemy); });
    game.ensureEliteLeague();
    game.syncCrownSet();
    game.ensurePopulations(false, false);
    game.cleanupVisualTestCatalog();
    game.recalculateHeroRating();
    game.refreshContracts(false);
    return game;
  }

  public get activities(): Array<ArenaDefinition | DungeonDefinition> { return [...ARENAS, ...DUNGEONS]; }

  public newGamePlusStatus(): NewGamePlusStatus {
    return newGamePlusStatus(this.save);
  }

  public legacyArchives(): LegacyHeroRecord[] {
    return this.save.legacy.archives.map((archive) => ({
      ...archive,
      appearance: { ...archive.appearance },
      equipment: archive.equipment.map((item) => ({
        ...item,
        stats: { ...item.stats },
        allowedClasses: item.allowedClasses === "all" ? "all" : [...item.allowedClasses],
        affix: item.affix ? { ...item.affix } : undefined,
        relicHistory: [...(item.relicHistory ?? [])],
      })),
      notableFighters: archive.notableFighters.map((fighter) => ({ ...fighter })),
      fallenNames: [...archive.fallenNames],
      lawIds: [...(archive.lawIds ?? [])],
    }));
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

    // Everything above is validation. From this point on the old save is read
    // only and the transition is assembled in a fresh world atomically.
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

    if (boon.id === "masters-school") {
      nextSave.hero.legacySkillId = SKILLS
        .filter((skill) => !skill.equipmentOnly
          && (skill.classes === "all" || skill.classes.includes(options.classId))
          && skill.unlockLevel > 1)
        .sort((first, second) => second.priority - first.priority || first.unlockLevel - second.unlockLevel)[0]?.id;
    }

    if (sourceItem) {
      const inherited = prepareInheritedItem(sourceItem, options.classId, previousLegacy.cycle, this.save.hero.name);
      next.addItem(inherited);
      nextSave.hero.equipped[inherited.slot] = inherited.id;
      nextSave.legacy.inheritedItemId = inherited.id;
    }

    // A few memorable rivals survive the change of epoch. They enter the new
    // world as veterans, while the archived hero never joins ordinary pools.
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
      }));
      veteran.equipped = {};
      veteran.equipment.forEach((item) => { veteran.equipped[item.slot] = item.id; });
      veteran.wins = Math.max(0, Math.floor(record.wins * 0.35));
      veteran.losses = Math.max(0, Math.floor(record.losses * 0.35));
      veteran.tournamentWins = Math.max(1, Math.floor(record.tournamentWins * 0.25));
      veteran.carriedFromCycle = archive.cycle;
      veteran.history = [`Пережил эпоху ${archive.cycle} и снова вышел на арену.`];
      veteran.rating = next.enemyWorldRating(veteran);
      nextSave.enemies.push(veteran);
    });
    next.event("system", `Началась эпоха ${status.targetCycle}. ${name} принял наследие «${boon.name}».`);
    next.ensureEliteLeague();
    next.syncCrownSet();
    return next;
  }

  /** Alias retained for UI/tests that use the shorter NG+ wording. */
  public beginNewEra(options: NewGamePlusOptions, now = Date.now()): WorldGame {
    return this.beginNewChronicle(options, now);
  }

  public legacyChampionAvailability(cycle?: number): ActivityAvailability {
    const archive = cycle
      ? this.save.legacy.archives.find((candidate) => candidate.cycle === cycle)
      : this.save.legacy.archives[this.save.legacy.archives.length - 1];
    if (!archive) return { unlocked: false, reason: "В архиве ещё нет завершённых эпох." };
    if (this.save.defeatedLegacyCycles.includes(archive.cycle)) return { unlocked: false, reason: "Этот герой прошлого уже побеждён." };
    if (this.save.hero.highestArena < ARENAS.length - 2 || this.save.hero.level < 24) {
      return { unlocked: false, reason: "Откроется на 24 уровне после выхода на предпоследнюю арену." };
    }
    return { unlocked: true, reason: `Особый бой с героем эпохи ${archive.cycle}. Победа принесёт печати летописи.` };
  }

  public fightLegacyChampion(cycle?: number): BattleReport {
    const archive = cycle
      ? this.save.legacy.archives.find((candidate) => candidate.cycle === cycle)
      : this.save.legacy.archives[this.save.legacy.archives.length - 1];
    const availability = this.legacyChampionAvailability(cycle);
    if (!archive || !availability.unlocked) throw new Error(availability.reason);
    this.prepareDayActivity();
    const enemy = this.legacyEnemy(archive);
    const combat = this.resolveWorldCombat(enemy, {}, "boss");
    const heroWon = combat.winnerId === "hero";
    const baseExperience = heroWon ? 720 + archive.level * 14 : 120;
    const baseGold = heroWon ? 4_800 + archive.rating : 0;
    const { experience, gold } = this.epochRewards(baseExperience, baseGold, "boss");
    const levelsGained = this.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    let item: EquipmentItem | undefined;
    let temperingMarks = 0;
    if (heroWon) {
      this.save.hero.wins += 1;
      this.save.hero.bossWins += 1;
      this.save.defeatedLegacyCycles.push(archive.cycle);
      this.save.legacy.seals += 2;
      this.save.legacy.totalSealsEarned += 2;
      temperingMarks = 2 + rewardModifiers(this.save.legacy.cycle, this.save.legacy.activeLawIds, "boss").bonusTemperingMarks;
      this.save.hero.temperingMarks += temperingMarks;
      item = createItem(Math.min(this.save.hero.level + 2, archive.level), { classId: this.save.hero.classId, minimumRarity: "mythic" });
      this.addItem(item);
      this.event("loot", `${this.save.hero.name} получил реликвию после победы над героем эпохи ${archive.cycle}.`);
      this.advanceContract("boss");
    } else {
      this.save.hero.losses += 1;
    }
    this.recordHeroEncounter(enemy, heroWon);
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
      : `${archive.name} сохранил своё место в Зале отзвуков.`);
    this.completeDay();
    return {
      activity, heroBefore: combat.hero, enemyBefore: combat.enemy, winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied: false, turns: combat.turns,
      rewards: { experience, gold, item, levelsGained, unlockedSkills: [], temperingMarks }, worldEvents: [],
    };
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

  public fighterFeatures(profile: HeroProfile | EnemyProfile): Array<{ id: string; name: string; description: string; kind: string; stats: Partial<Stats> }> {
    const ids = [
      ...(profile.traitIds ?? []).map((id) => ({ id, kind: "Черта" })),
      ...(profile.scarIds ?? []).map((id) => ({ id, kind: "Шрам" })),
      ...("adaptationIds" in profile ? (profile.adaptationIds ?? []).map((id) => ({ id, kind: "Адаптация" })) : []),
    ];
    const definitions = [...FIGHTER_TRAITS, ...FIGHTER_SCARS, ...ENEMY_ADAPTATIONS];
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

  public consumeAutomaticLegendDefense(): BattleReport | undefined {
    const report = this.automaticLegendDefense;
    this.automaticLegendDefense = undefined;
    return report;
  }

  public setAutoResolveLegendChallenges(enabled: boolean): void {
    this.save.hero.autoResolveLegendChallenges = enabled;
  }

  public acceptContract(contractId: string, approach: "honor" | "profit"): ContractOffer {
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
    const contract = this.save.activeContract;
    if (!contract) return;
    this.save.hero.factionReputation[contract.factionId] = Math.max(-20, (this.save.hero.factionReputation[contract.factionId] ?? 0) - 2);
    this.event("system", `${this.save.hero.name} отказался от контракта «${contract.title}».`);
    this.save.activeContract = undefined;
  }

  public salvageItem(itemId: string): number {
    const item = this.save.hero.inventory.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("Предмет не найден.");
    if (Object.values(this.save.hero.equipped).includes(itemId)) throw new Error("Надетый предмет нельзя разобрать.");
    if (!this.canSell(itemId)) throw new Error("Регалии короны нельзя разобрать.");
    const dustByRarity: Record<Rarity, number> = { common: 1, rare: 2, epic: 4, legendary: 8, mythic: 14 };
    const dust = dustByRarity[item.rarity] + (item.enhancement ?? 0);
    this.save.hero.inventory = this.save.hero.inventory.filter((candidate) => candidate.id !== itemId);
    this.save.hero.relicDust += dust;
    this.event("loot", `${item.name} разобран: получено ${dust} ед. реликтовой пыли.`);
    return dust;
  }

  public awakenRelic(itemId: string, pathId: "might" | "guard" | "tempo"): EquipmentItem {
    const item = this.save.hero.inventory.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("Предмет не найден.");
    if (!rarityAtLeast(item.rarity, "legendary")) throw new Error("Историю могут обрести только легендарные и мифические вещи.");
    if ((item.relicTier ?? 0) < 1) throw new Error("Сначала предмет должен заслужить имя в боях.");
    if (item.relicPath) throw new Error("Путь этой реликвии уже выбран.");
    const cost = 8;
    if (this.save.hero.relicDust < cost) throw new Error(`Нужно реликтовой пыли: ${cost}.`);
    const path = RELIC_PATHS.find((candidate) => candidate.id === pathId)!;
    this.save.hero.relicDust -= cost;
    item.relicPath = path.id;
    Object.entries(path.stats).forEach(([stat, value]) => {
      const key = stat as keyof Stats;
      item.stats[key] = (item.stats[key] ?? 0) + Number(value);
    });
    const epithet = pickRandom(CLASS_RELIC_EPITHETS[this.save.hero.classId]);
    item.relicName = `${item.name} · ${epithet}`;
    item.relicHistory ??= [];
    item.relicHistory.push(`День ${this.save.worldDay}: выбран «${path.name}».`);
    this.event("loot", `${item.name} обрёл имя «${item.relicName}».`);
    return item;
  }

  public simulateElapsed(now = Date.now()): number {
    const elapsedDays = Math.min(14, Math.max(0, Math.floor((now - this.save.lastSimulatedAt) / 600_000)));
    let simulatedDays = 0;
    if (elapsedDays > 0) {
      for (let index = 0; index < elapsedDays; index += 1) {
        if (this.save.pendingEliteChallengeId) {
          if (!this.save.hero.autoResolveLegendChallenges) break;
          this.automaticLegendDefense = this.resolveLegendDefense(false);
        }
        this.simulateDailyWorld();
        this.healDailyInjuries();
        this.save.worldDay += 1;
        simulatedDays += 1;
        this.clearExpiredTournamentRegistrations();
        this.refreshContracts(false);
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
    return this.hasEraLaw("crown-discord") ? Math.max(FINAL_ARENA_INTERVAL + 1, Math.round(CROWN_LEAGUE_INTERVAL * 0.75)) : CROWN_LEAGUE_INTERVAL;
  }

  public registeredCrownLeagueDay(): number | undefined {
    return this.save.tournamentRegistrations["crown-league"];
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
    const activity = this.activities.find((candidate) => candidate.id === activityId);
    if (!activity) throw new Error("Активность не найдена.");
    const availability = this.availability(activity);
    if (!availability.unlocked) throw new Error(availability.reason);

    if (activity.kind === "arena") throw new Error("На арене проводится турнир. Сначала запишитесь через календарь.");
    this.prepareDayActivity();
    const enemy = this.createDungeonEnemy(activity.enemyLevel, activity.name);
    const activeItemIds = new Set(Object.values(this.save.hero.equipped));
    const activeItemsBefore = this.save.hero.inventory.filter((item) => activeItemIds.has(item.id));
    const heroSkillsBefore = new Set(unlockedSkills(this.save.hero.classId, this.save.hero.level, activeItemsBefore, this.save.hero.legacySkillId ? [this.save.hero.legacySkillId] : []).map((skill) => skill.id));
    const combat = this.resolveWorldCombat(enemy, {}, "dungeon");
    const heroWon = combat.winnerId === "hero";
    const enemyDied = false;
    const baseExperience = heroWon ? activity.rewardExperience + enemy.level * 4 : Math.round(activity.rewardExperience * 0.2);
    const baseGold = heroWon ? activity.rewardGold + getRandomNumber(0, Math.round(activity.rewardGold * 0.25)) : 0;
    const { experience: exp, gold } = this.epochRewards(baseExperience, baseGold, "dungeon");
    const levelsGained = this.gainHeroExperience(exp);
    this.save.hero.gold += gold;
    if (heroWon) { this.save.hero.wins += 1; this.save.hero.dungeonWins += 1; }
    else { this.save.hero.losses += 1; this.save.hero.dungeonLosses += 1; }
    this.recordHeroEncounter(enemy, heroWon);

    let item: EquipmentItem | undefined;
    let temperingMarks = 0;
    if (heroWon) {
      const rewardLevel = Math.min(this.save.hero.level + 2, activity.enemyLevel[1] + 1);
      item = createItem(rewardLevel, {
        classId: this.save.hero.classId,
        minimumRarity: this.minimumRewardRarity(activity.minimumRarity, "dungeon"),
      });
      this.addItem(item);
      this.event("loot", `${this.save.hero.name} получил предмет: ${item.name}.`);
      if (activity.requiredArena >= ARENAS.length - 2 && Math.random() < 0.22) {
        temperingMarks = 1;
        this.save.hero.temperingMarks += temperingMarks;
        this.event("loot", `${this.save.hero.name} нашёл редкую печать закалки.`);
      }
    }

    if (heroWon) {
      this.save.dungeonClears[activity.id] = this.save.worldDay;
      this.advanceContract("dungeon");
    }
    const eventsBefore = this.save.events.length;
    this.event("dungeon", `${this.save.hero.name} ${heroWon ? "завершил" : "не прошёл"} вылазку «${activity.name}».`);
    this.completeDay();
    const equippedAfterBattle = new Set(Object.values(this.save.hero.equipped));
    const unlockedNow = unlockedSkills(this.save.hero.classId, this.save.hero.level, this.save.hero.inventory.filter((item) => equippedAfterBattle.has(item.id)), this.save.hero.legacySkillId ? [this.save.hero.legacySkillId] : [])
      .filter((skill) => !heroSkillsBefore.has(skill.id));
    return {
      activity, heroBefore: combat.hero, enemyBefore: combat.enemy,
      winnerId: combat.winnerId, loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied,
      turns: combat.turns,
      rewards: { experience: exp, gold, item, levelsGained, unlockedSkills: unlockedNow, temperingMarks },
      worldEvents: this.save.events.slice(eventsBefore),
    };
  }

  public train(): DailyActivityReport {
    const levelCap = this.trainingLevelCap();
    if (this.save.hero.level >= levelCap) {
      throw new Error(`Тренировки больше не дают уровень. Сначала продвиньтесь на следующую арену; текущий предел — ${levelCap}.`);
    }
    this.prepareDayActivity();
    const experience = this.epochRewards(34 + this.save.hero.level * 5, 0, "training").experience;
    const levelsGained = this.gainHeroExperience(experience, levelCap);
    this.advanceContract("training");
    this.event("system", `${this.save.hero.name} провёл день на тренировочной площадке и получил ${experience} опыта.`);
    this.completeDay();
    return { kind: "training", title: "Тренировка завершена", description: "Безопасная практика без добычи и рейтингового риска.", experience, gold: 0, levelsGained };
  }

  public trainingLevelCap(): number {
    const arena = ARENAS[Math.min(this.save.hero.highestArena, ARENAS.length - 1)];
    return arena.enemyLevel[1] + 1;
  }

  public duel(tierId = DUEL_TIERS[0].id): DailyActivityReport {
    const tier = DUEL_TIERS.find((candidate) => candidate.id === tierId);
    if (!tier) throw new Error("Ступень дуэлей не найдена.");
    const availability = this.duelAvailability(tier);
    if (!availability.unlocked) throw new Error(availability.reason);
    this.prepareDayActivity();
    const arenaIndex = Math.min(Math.max(tier.requiredArena, this.save.hero.highestArena), ARENAS.length - 1);
    const enemy = this.matchDuelEnemy(tier, arenaIndex);
    const combat = this.resolveWorldCombat(enemy, {}, "duel");
    const heroWon = combat.winnerId === "hero";
    const baseExperience = heroWon ? tier.rewardExperience + enemy.level * 4 : Math.round(tier.rewardExperience * 0.28);
    const baseGold = heroWon ? tier.rewardGold + enemy.level * 4 : 0;
    const { experience, gold } = this.epochRewards(baseExperience, baseGold, "duel");
    const levelsGained = this.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    if (heroWon) { this.save.hero.wins += 1; this.save.hero.duelWins += 1; }
    else { this.save.hero.losses += 1; this.save.hero.duelLosses += 1; }
    heroWon ? enemy.losses += 1 : enemy.wins += 1;
    this.recordHeroEncounter(enemy, heroWon);
    if (heroWon) this.advanceContract("duel");
    this.event("battle", `${this.save.hero.name} ${heroWon ? "победил" : "проиграл"} ${enemy.name} в дуэли «${tier.name}».`);
    const battle: BattleReport = {
      activity: tier, heroBefore: combat.hero, enemyBefore: combat.enemy,
      winnerId: combat.winnerId, loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied: false,
      turns: combat.turns, rewards: { experience, gold, levelsGained, unlockedSkills: [], item: undefined }, worldEvents: [],
    };
    this.completeDay();
    return { kind: "duel", title: tier.name, description: heroWon ? "Победа в подобранном по силе поединке." : "Поражение без риска для жизни.", battle, experience, gold, levelsGained };
  }

  public fightBoss(bossId: string): DailyActivityReport {
    const boss = DUEL_BOSSES.find((candidate) => candidate.id === bossId);
    if (!boss) throw new Error("Особый противник не найден.");
    const availability = this.bossAvailability(boss);
    if (!availability.unlocked) throw new Error(availability.reason);
    this.prepareDayActivity();
    const enemy = this.createBossEnemy(boss);
    const combat = this.resolveWorldCombat(enemy, {}, "boss");
    const heroWon = combat.winnerId === "hero";
    const baseExperience = heroWon ? boss.rewardExperience : Math.round(boss.rewardExperience * 0.16);
    const baseGold = heroWon ? boss.rewardGold : 0;
    const { experience, gold } = this.epochRewards(baseExperience, baseGold, "boss");
    const levelsGained = this.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    let item: EquipmentItem | undefined;
    if (heroWon) {
      this.save.hero.wins += 1; this.save.hero.bossWins += 1; this.save.defeatedBosses.push(boss.id);
      const bossMarks = 1 + rewardModifiers(this.save.legacy.cycle, this.save.legacy.activeLawIds, "boss").bonusTemperingMarks;
      this.save.hero.temperingMarks += bossMarks;
      const rewardLevel = Math.min(this.save.hero.level + 2, boss.level + 2);
      const bossRarity = this.minimumRewardRarity(boss.id === "nameless-duke" ? "mythic" : "legendary", "boss");
      item = createItem(rewardLevel, { classId: this.save.hero.classId, templateId: boss.lootTemplateIds[this.save.hero.classId], rarity: bossRarity });
      this.addItem(item);
      this.event("loot", `${this.save.hero.name} победил ${boss.name} и получил уникальный предмет «${item.name}».`);
      this.advanceContract("boss");
    } else this.save.hero.losses += 1;
    this.recordHeroEncounter(enemy, heroWon);
    const battle: BattleReport = {
      activity: boss, heroBefore: combat.hero, enemyBefore: combat.enemy, winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied: false, turns: combat.turns,
      rewards: { experience, gold, item, levelsGained, unlockedSkills: [], temperingMarks: heroWon ? 1 + rewardModifiers(this.save.legacy.cycle, this.save.legacy.activeLawIds, "boss").bonusTemperingMarks : 0 }, worldEvents: [],
    };
    this.completeDay();
    return { kind: "duel", title: boss.name, description: heroWon ? "Уникальный противник побеждён навсегда." : "Босс останется доступен для новой попытки.", battle, experience, gold, levelsGained };
  }

  public playTournament(arenaId: string): TournamentReport {
    const arenaIndex = ARENAS.findIndex((candidate) => candidate.id === arenaId);
    const arena = ARENAS[arenaIndex];
    if (!arena) throw new Error("Турнир не найден.");
    const ruleIds = this.tournamentRules(arenaId).map((rule) => rule.id);
    if (this.save.tournamentRegistrations[arenaId] !== this.save.worldDay) {
      throw new Error("На этот турнир нет действующей записи или его день ещё не наступил.");
    }
    this.prepareDayActivity();

    const eventsBefore = this.save.events.length;
    const pool = this.save.enemies.filter((enemy) => enemy.alive && enemy.arenaIndex === arenaIndex)
      .sort((a, b) => Math.abs(this.enemyPower(a) - this.heroPower()) - Math.abs(this.enemyPower(b) - this.heroPower()));
    while (pool.length < arena.participants - 1) { const enemy = this.createEnemy(arenaIndex, true); this.save.enemies.push(enemy); pool.push(enemy); }
    const selected = shuffleArray(pool.slice(0, arena.participants - 1));
    let participants: Array<HeroProfile | EnemyProfile> = shuffleArray([this.save.hero, ...selected]);
    const matches: TournamentMatch[] = [];
    const heroBattles: BattleReport[] = [];
    let round = 1;
    let heroPlacement: number = arena.participants;

    while (participants.length > 1) {
      const winners: Array<HeroProfile | EnemyProfile> = [];
      for (let cursor = 0; cursor < participants.length; cursor += 2) {
        const first = participants[cursor];
        const second = participants[cursor + 1];
        if (!second) { winners.push(first); continue; }
        const heroInvolved = first.id === "hero" || second.id === "hero";
        let winner: HeroProfile | EnemyProfile;
        let battle: BattleReport | undefined;
        if (heroInvolved) {
          const enemy = (first.id === "hero" ? second : first) as EnemyProfile;
          const combat = this.resolveWorldCombat(enemy, { heroLevelCap: arena.enemyLevel[1] + 1, ruleIds }, "arena");
          const heroWon = combat.winnerId === "hero";
          winner = heroWon ? this.save.hero : enemy;
          const lethalMultiplier = eraLawModifiers(this.save.legacy.activeLawIds).arenaLethalityMultiplier;
          const enemyDied = heroWon && Math.random() < Math.min(0.3, arena.lethalChance * lethalMultiplier);
          battle = {
            activity: arena, heroBefore: combat.hero, enemyBefore: combat.enemy, winnerId: combat.winnerId,
            loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied, turns: combat.turns,
            rewards: { experience: 0, gold: 0, levelsGained: 0, unlockedSkills: [] }, worldEvents: [], ruleIds,
          };
          heroBattles.push(battle);
          if (heroWon) { this.save.hero.wins += 1; this.save.hero.tournamentMatchWins += 1; }
          else { this.save.hero.losses += 1; this.save.hero.tournamentMatchLosses += 1; }
          this.recordHeroEncounter(enemy, heroWon, enemyDied);
          this.updateEnemyAfterPlayerBattle(enemy, heroWon, enemyDied);
          if (!heroWon) heroPlacement = Math.max(2, Math.floor(arena.participants / (2 ** (round - 1))));
        } else {
          const firstEnemy = first as EnemyProfile;
          const secondEnemy = second as EnemyProfile;
          const chance = this.enemyPower(firstEnemy) / (this.enemyPower(firstEnemy) + this.enemyPower(secondEnemy));
          winner = Math.random() < chance ? firstEnemy : secondEnemy;
          const loser = winner.id === firstEnemy.id ? secondEnemy : firstEnemy;
          winner.wins += 1; winner.arenaWins += 1; winner.experience += 65 + arenaIndex * 24;
          loser.losses += 1;
          this.progressEnemy(winner, false);
        }
        winners.push(winner);
        matches.push({ round, match: cursor / 2 + 1, firstName: first.name, secondName: second.name, winnerName: winner.name, heroInvolved, battle });
      }
      participants = winners;
      round += 1;
    }

    const champion = participants[0];
    const heroWon = champion.id === "hero";
    if (heroWon) heroPlacement = 1;
    const roundsWon = heroBattles.filter((battle) => battle.heroWon).length;
    const baseExperience = heroWon ? arena.rewardExperience : Math.round(arena.rewardExperience * (0.12 + roundsWon * 0.13));
    const baseGold = heroWon ? arena.rewardGold : Math.round(arena.rewardGold * roundsWon * 0.04);
    const { experience, gold } = this.epochRewards(baseExperience, baseGold, "arena");
    const levelsGained = this.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    let item: EquipmentItem | undefined;
    let temperingMarks = 0;
    if (heroWon) {
      this.save.hero.arenaWins[arenaIndex] += 1;
      if (this.save.hero.arenaWins[arenaIndex] >= arena.winsToAdvance && arenaIndex < ARENAS.length - 1) this.save.hero.highestArena = Math.max(this.save.hero.highestArena, arenaIndex + 1);
      const minimum: Rarity = arenaIndex >= 4 ? "legendary" : arenaIndex >= 2 ? "epic" : "rare";
      const rewardLevel = Math.min(this.save.hero.level + 2, arena.enemyLevel[1] + 1);
      item = createItem(rewardLevel, { classId: this.save.hero.classId, minimumRarity: minimum });
      this.addItem(item);
      this.event("loot", `Чемпионский приз ${this.save.hero.name}: ${item.name}.`);
      if (arenaIndex >= 2) {
        temperingMarks = arenaIndex === ARENAS.length - 1 ? 2 : 1;
        this.save.hero.temperingMarks += temperingMarks;
        this.event("loot", `${this.save.hero.name} получил ${temperingMarks} печ. закалки за чемпионство.`);
      }
      this.advanceContract("tournament");
    }
    this.recalculateHeroRating();
    this.event("tournament", `«${arena.name}» завершён. Чемпион: ${champion.name}. Участников: ${arena.participants}.`);
    delete this.save.tournamentRegistrations[arenaId];
    this.completeDay(arenaId);
    return {
      activity: arena, day: this.save.worldDay - 1, participantCount: arena.participants, matches,
      heroBattles, championName: champion.name, heroWon, heroPlacement,
      rewards: { experience, gold, item, levelsGained, unlockedSkills: [], temperingMarks }, worldEvents: this.save.events.slice(eventsBefore), ruleIds,
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
        reason: `Сегодняшняя Лига уже завершена. Следующая — в день ${this.save.worldDay + this.crownLeagueInterval()}.`,
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
    this.save.activeExpedition = {
      dungeonId, stage: 0, maxStages: dungeon.requiredArena >= 4 ? 5 : dungeon.requiredArena >= 2 ? 4 : 3,
      health: 100, accumulatedGold: 0, accumulatedExperience: 0, loot: [], path: [],
    };
    this.event("dungeon", `${this.save.hero.name} начал поход «${dungeon.name}».`);
    return this.save.activeExpedition;
  }

  public expeditionChoices(): ExpeditionChoice[] {
    if (!this.save.activeExpedition) return [];
    const expedition = this.save.activeExpedition;
    return EXPEDITION_CHOICES.filter((choice) => choice.id !== "rest" || expedition.stage > 0 && expedition.health < 92);
  }

  public advanceExpedition(choiceId: ExpeditionChoice["id"]): ExpeditionStepReport {
    const expedition = this.save.activeExpedition;
    if (!expedition) throw new Error("Активного похода нет.");
    const dungeon = DUNGEONS.find((candidate) => candidate.id === expedition.dungeonId)!;
    const choice = this.expeditionChoices().find((candidate) => candidate.id === choiceId);
    if (!choice) throw new Error("Этот путь сейчас недоступен.");
    expedition.path.push(choice.id);

    if (choice.id === "rest") {
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
    const combat = this.resolveWorldCombat(enemy, {}, "dungeon", temporaryHero);
    const heroWon = combat.winnerId === "hero";
    const lastTurn = combat.turns[combat.turns.length - 1];
    const remainingHealth = heroWon
      ? (lastTurn?.actorId === "hero" ? lastTurn.actorHealth : lastTurn?.targetHealth ?? combat.hero.maxHealth)
      : 0;
    expedition.health = Math.max(0, Math.round(remainingHealth / combat.hero.maxHealth * 100));
    const stageExperience = Math.round(dungeon.rewardExperience / expedition.maxStages * (choice.id === "risk" ? 1.55 : 1));
    const stageGold = Math.round(dungeon.rewardGold / expedition.maxStages * (choice.id === "risk" ? 1.7 : 1));
    if (heroWon) {
      expedition.accumulatedExperience += stageExperience;
      expedition.accumulatedGold += stageGold;
      const lootChance = choice.id === "risk" ? 0.72 : 0.34;
      if (Math.random() < lootChance) {
        expedition.loot.push(createItem(Math.min(this.save.hero.level + 2, dungeon.enemyLevel[1] + 1), {
          classId: this.save.hero.classId,
          minimumRarity: this.minimumRewardRarity(dungeon.minimumRarity, "dungeon"),
        }));
      }
      expedition.stage += 1;
    }
    const battle: BattleReport = {
      activity: dungeon, heroBefore: combat.hero, enemyBefore: combat.enemy, winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied: false, turns: combat.turns,
      rewards: { experience: 0, gold: 0, levelsGained: 0, unlockedSkills: [] }, worldEvents: [],
    };
    this.recordHeroEncounter(enemy, heroWon);
    if (!heroWon) return this.finishExpedition(true, "Раненый герой отступил. Часть найденного удалось вынести.", battle);
    if (expedition.stage >= expedition.maxStages) return this.finishExpedition(false, `Поход «${dungeon.name}» завершён. Все накопленные трофеи сохранены.`, battle);
    return { expedition, battle, completed: false, retreated: false, message: `Этап ${expedition.stage}/${expedition.maxStages} пройден. Можно углубиться или отступить.` };
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
    const multiplier = retreated ? 0.55 : 1;
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
    }
    this.save.activeExpedition = undefined;
    this.event("dungeon", message);
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
    const activity = ENDGAME_ACTIVITIES.find((candidate) => candidate.id === "crown-league")!;
    const availability = this.crownLeagueAvailability();
    if (!availability.unlocked) throw new Error(availability.reason);
    this.prepareDayActivity();
    this.ensureEliteLeague();
    const ruleIds = this.tournamentRules("crown-league").map((rule) => rule.id);
    const eventsBefore = this.save.events.length;
    const wasElite = Boolean(this.heroEliteRank());
    const rosterIds = wasElite
      ? [...this.save.eliteLeagueMemberIds]
      : ["hero", ...this.save.eliteLeagueMemberIds.slice(0, ELITE_SIZE - 1)];
    let participants = shuffleArray(rosterIds.map((id) => this.fighterById(id)).filter((fighter): fighter is HeroProfile | EnemyProfile => Boolean(fighter)));
    if (participants.length !== ELITE_SIZE) throw new Error("Элитная сетка ещё не собрана.");
    const matches: TournamentMatch[] = [];
    const heroBattles: BattleReport[] = [];
    let round = 1;
    let heroPlacement = ELITE_SIZE;

    while (participants.length > 1) {
      const winners: Array<HeroProfile | EnemyProfile> = [];
      for (let cursor = 0; cursor < participants.length; cursor += 2) {
        const first = participants[cursor]; const second = participants[cursor + 1];
        if (!second) { winners.push(first); continue; }
        const heroInvolved = first.id === "hero" || second.id === "hero";
        let winner: HeroProfile | EnemyProfile; let battle: BattleReport | undefined;
        if (heroInvolved) {
          const enemy = (first.id === "hero" ? second : first) as EnemyProfile;
          const combat = this.resolveWorldCombat(enemy, { ruleIds }, "crown-league");
          const heroWon = combat.winnerId === "hero";
          winner = heroWon ? this.save.hero : enemy;
          battle = { activity, heroBefore: combat.hero, enemyBefore: combat.enemy, winnerId: combat.winnerId,
            loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied: false, turns: combat.turns,
            rewards: { experience: 0, gold: 0, levelsGained: 0, unlockedSkills: [] }, worldEvents: [], ruleIds };
          heroBattles.push(battle);
          if (heroWon) { this.save.hero.wins += 1; this.save.hero.tournamentMatchWins += 1; }
          else { this.save.hero.losses += 1; this.save.hero.tournamentMatchLosses += 1; }
          this.recordHeroEncounter(enemy, heroWon); this.updateEnemyAfterPlayerBattle(enemy, heroWon, false);
          this.adjustEliteRating("hero", heroWon ? 12 : -5); this.adjustEliteRating(enemy.id, heroWon ? -5 : 12);
          if (!heroWon) heroPlacement = Math.max(2, Math.floor(ELITE_SIZE / (2 ** (round - 1))));
        } else {
          const firstEnemy = first as EnemyProfile; const secondEnemy = second as EnemyProfile;
          const chance = this.enemyPower(firstEnemy) / (this.enemyPower(firstEnemy) + this.enemyPower(secondEnemy));
          winner = Math.random() < chance ? firstEnemy : secondEnemy;
          const loser = winner.id === firstEnemy.id ? secondEnemy : firstEnemy;
          winner.wins += 1; winner.experience += 150; loser.losses += 1;
          this.adjustEliteRating(winner.id, 12); this.adjustEliteRating(loser.id, -5); this.progressEnemy(winner, false);
        }
        winners.push(winner);
        matches.push({ round, match: cursor / 2 + 1, firstName: first.name, secondName: second.name, winnerName: winner.name, heroInvolved, battle });
      }
      participants = winners; round += 1;
    }

    const champion = participants[0];
    const heroWon = champion.id === "hero";
    if (heroWon) heroPlacement = 1;
    if (champion.id !== "hero") {
      const npc = champion as EnemyProfile; npc.tournamentWins += 1;
      this.save.eliteCrownWins[npc.id] = (this.save.eliteCrownWins[npc.id] ?? 0) + 1;
    }
    const roundsWon = heroBattles.filter((battle) => battle.heroWon).length;
    const baseExperience = heroWon ? activity.rewardExperience : Math.round(activity.rewardExperience * (0.12 + roundsWon * 0.12));
    const baseGold = heroWon ? activity.rewardGold : Math.round(activity.rewardGold * roundsWon * 0.05);
    const { experience, gold } = this.epochRewards(baseExperience, baseGold, "crown-league");
    const levelsGained = this.gainHeroExperience(experience);
    this.save.hero.gold += gold;
    let item: EquipmentItem | undefined;
    let temperingMarks = roundsWon > 0 ? 1 : 0;
    if (heroWon) {
      this.save.hero.crownLeagueWins += 1;
      this.save.hero.crownLeaguePoints += 20;
      temperingMarks = 4;
      item = createItem(this.save.hero.level + 2, { classId: this.save.hero.classId, minimumRarity: "mythic" });
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
    this.event("tournament", `Лига короны завершена. Чемпион: ${champion.name}. Сетка: ${ELITE_SIZE} бойцов.`);
    this.completeDay();
    this.recalculateHeroRating();
    return {
      activity, day: this.save.worldDay - 1, participantCount: ELITE_SIZE, matches, heroBattles,
      championName: champion.name, heroWon, heroPlacement,
      rewards: { experience, gold, item, levelsGained, unlockedSkills: [], temperingMarks },
      worldEvents: this.save.events.slice(eventsBefore), ruleIds,
    };
  }

  public huntLegend(): BattleReport {
    const activity = ENDGAME_ACTIVITIES.find((candidate) => candidate.id === "legend-hunt")!;
    const availability = this.legendHuntAvailability();
    if (!availability.unlocked) throw new Error(availability.reason);
    this.prepareDayActivity();
    const enemy = this.currentLegendTarget()!;
    const combat = this.resolveWorldCombat(enemy, {}, "legend-hunt");
    const heroWon = combat.winnerId === "hero";
    const baseExperience = heroWon ? activity.rewardExperience + enemy.level * 18 : Math.round(activity.rewardExperience * 0.18);
    const baseGold = heroWon ? activity.rewardGold + enemy.tournamentWins * 120 : 0;
    const { experience, gold } = this.epochRewards(baseExperience, baseGold, "legend-hunt");
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
      item = createItem(this.save.hero.level + 2, { classId: this.save.hero.classId, minimumRarity: "mythic" });
      this.addItem(item);
    } else this.save.hero.losses += 1;
    this.recordHeroEncounter(enemy, heroWon);
    this.updateEnemyAfterPlayerBattle(enemy, heroWon, false);
    this.syncCrownSet();
    this.event("battle", `${this.save.hero.name} ${heroWon ? `занял место ${this.heroEliteRank()} в элите` : "не смог подняться"} после боя с ${enemy.name}.`);
    this.completeDay();
    return {
      activity, heroBefore: combat.hero, enemyBefore: combat.enemy, winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied: false, turns: combat.turns,
      rewards: { experience, gold, item, levelsGained, unlockedSkills: [], temperingMarks }, worldEvents: [],
    };
  }

  public defendLegendTitle(): BattleReport {
    return this.resolveLegendDefense(true);
  }

  private resolveLegendDefense(advanceDay: boolean): BattleReport {
    const activity = ENDGAME_ACTIVITIES.find((candidate) => candidate.id === "legend-hunt")!;
    const enemy = this.pendingLegendChallenge();
    const rank = this.heroEliteRank();
    if (!enemy || !rank || rank > LEGEND_COUNT) throw new Error("Активного вызова легенде нет.");
    const combat = this.resolveWorldCombat(enemy, {}, "legend-hunt");
    const heroWon = combat.winnerId === "hero";
    if (heroWon) { this.save.hero.wins += 1; this.save.hero.legendDefenses += 1; this.adjustEliteRating("hero", 10); }
    else { this.save.hero.losses += 1; this.swapEliteMembers("hero", enemy.id); }
    this.recordHeroEncounter(enemy, heroWon); this.updateEnemyAfterPlayerBattle(enemy, heroWon, false);
    this.save.pendingEliteChallengeId = undefined;
    this.save.lastLegendHuntDay = this.save.worldDay;
    this.syncCrownSet();
    this.event("battle", heroWon ? `${this.save.hero.name} защитил титул легенды.` : `${enemy.name} отобрал у ${this.save.hero.name} место легенды.`);
    if (advanceDay) this.completeDay();
    return { activity, heroBefore: combat.hero, enemyBefore: combat.enemy, winnerId: combat.winnerId,
      loserId: heroWon ? enemy.id : "hero", heroWon, enemyDied: false, turns: combat.turns,
      rewards: { experience: 0, gold: 0, levelsGained: 0, unlockedSkills: [] }, worldEvents: [] };
  }

  public equipBest(mode: "power" | "set" = "power"): EquipmentItem[] {
    const hero = this.save.hero;
    const compatible = hero.inventory.filter((item) =>
      item.allowedClasses === "all" || item.allowedClasses.includes(hero.classId));
    let preferredSetId: string | undefined;

    if (mode === "set") {
      const candidates = EQUIPMENT_SETS
        .map((set) => {
          const items = compatible.filter((item) => item.setId === set.id);
          const slots = new Set(items.map((item) => item.slot)).size;
          const power = items.reduce((sum, item) => sum + itemPower(item), 0);
          return { id: set.id, slots, power };
        })
        .filter((set) => set.slots > 0)
        .sort((a, b) => b.slots - a.slots || b.power - a.power);
      preferredSetId = candidates[0]?.id;
    }

    const equipped: EquipmentItem[] = [];
    const slots: EquipmentSlot[] = ["weapon", "offhand", "head", "chest", "hands", "feet"];
    slots.forEach((slot) => {
      const inSlot = compatible.filter((item) => item.slot === slot);
      const preferred = preferredSetId ? inSlot.filter((item) => item.setId === preferredSetId) : [];
      const pool = preferred.length > 0 ? preferred : inSlot;
      const best = [...pool].sort((a, b) => itemPower(b) - itemPower(a) || b.level - a.level)[0];
      if (!best) return;
      hero.equipped[slot] = best.id;
      equipped.push(best);
    });
    return equipped;
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
    createStarterItems(classId).forEach((starter) => {
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
    if (!this.canSell(itemId)) throw new Error("Регалии живой короны нельзя продать, пока они принадлежат лидеру элиты.");
    const value = Math.max(1, Math.round(item.price * 0.45));
    this.save.hero.inventory = this.save.hero.inventory.filter((candidate) => candidate.id !== itemId);
    this.save.hero.gold += value;
    return value;
  }

  public canSell(itemId: string): boolean {
    const item = this.save.hero.inventory.find((candidate) => candidate.id === itemId);
    if (!item) return false;
    const template = ITEM_TEMPLATES.find((candidate) => candidate.id === item.templateId);
    return !template?.exclusiveToElite;
  }

  public sellUnequipped(): { count: number; value: number } {
    const equippedIds = new Set(Object.values(this.save.hero.equipped));
    const sellable = this.save.hero.inventory.filter((item) => !equippedIds.has(item.id) && this.canSell(item.id));
    const ids = new Set(sellable.map((item) => item.id));
    const value = sellable.reduce((total, item) => total + Math.max(1, Math.round(item.price * 0.45)), 0);
    this.save.hero.inventory = this.save.hero.inventory.filter((item) => !ids.has(item.id));
    this.save.hero.gold += value;
    return { count: sellable.length, value };
  }

  public buy(index: number): EquipmentItem {
    const offer = this.save.shopOffers[index];
    if (!offer || offer.sold) throw new Error("Предмет уже продан.");
    if (this.save.hero.gold < offer.item.price) throw new Error("Недостаточно монет.");
    this.save.hero.gold -= offer.item.price;
    offer.sold = true;
    this.addItem(offer.item);
    return offer.item;
  }

  public upgradeCost(itemId: string): number {
    const item = this.save.hero.inventory.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("Предмет не найден.");
    if (this.save.legacy.activeBoonId === "forge-tradition" && (item.enhancement ?? 0) === 0) return 0;
    const costs = [1, 2, 3, 5, 8];
    return costs[item.enhancement ?? 0] ?? 0;
  }

  public upgradeItem(itemId: string): EquipmentItem {
    const item = this.save.hero.inventory.find((candidate) => candidate.id === itemId);
    if (!item) throw new Error("Предмет не найден.");
    const current = item.enhancement ?? 0;
    if (current >= 5) throw new Error("Предмет уже достиг максимальной закалки.");
    const cost = this.upgradeCost(itemId);
    if (this.save.hero.temperingMarks < cost) throw new Error(`Нужно печатей закалки: ${cost}.`);
    this.save.hero.temperingMarks -= cost;
    item.enhancement = current + 1;
    item.level += 1;
    item.stats = Object.fromEntries(Object.entries(item.stats).map(([stat, value]) => [stat, Math.max(Number(value) + 1, Math.ceil(Number(value) * 1.08))]));
    item.price = calculateItemPrice(item.level, item.rarity);
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
      ...(!eliteIds.has("hero") ? [heroLeaderboardEntry(hero)] : []),
      ...this.save.enemies
        .filter((enemy) => enemy.alive && !eliteIds.has(enemy.id))
        .map((enemy) => enemyLeaderboardEntry(enemy)),
    ].sort(byLeaderboardPosition);
  }

  private fighterById(id: string): HeroProfile | EnemyProfile | undefined {
    return id === "hero" ? this.save.hero : this.enemyById(id);
  }

  private enemyById(id: string): EnemyProfile | undefined {
    return this.save.enemies.find((enemy) => enemy.id === id && enemy.alive);
  }

  private leaderboardEntry(id: string, elite = false): LeaderboardEntry | undefined {
    if (id === "hero") {
      const hero = this.save.hero;
      return heroLeaderboardEntry(hero, {
        rating: elite ? (this.save.eliteRatings[id] ?? hero.rating) : hero.rating,
        crownLeagueWins: hero.crownLeagueWins,
      });
    }
    const enemy = this.enemyById(id);
    if (!enemy) return undefined;
    return enemyLeaderboardEntry(enemy, {
      rating: elite ? (this.save.eliteRatings[id] ?? enemy.rating) : enemy.rating,
      crownLeagueWins: this.save.eliteCrownWins[id] ?? 0,
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
      const item = createItem(leader.level + 4, { classId: leader.classId, templateId, rarity: "mythic" });
      if (leader.id === "hero") this.addItem(item);
      else { owned.push(item); leader.equipped[item.slot] = item.id; }
    });
    this.save.crownSetOwnerId = leaderId;
  }

  private recalculateHeroRating(): void {
    this.save.hero.rating = calculateHeroWorldRating(this.save.hero);
  }

  private enemyWorldRating(enemy: EnemyProfile): number {
    return calculateEnemyWorldRating(enemy);
  }

  private addItem(item: EquipmentItem): void {
    this.save.hero.inventory.push(item);
    if (!this.save.discoveredItems.includes(item.templateId)) this.save.discoveredItems.push(item.templateId);
    if (item.grantedSkillId && !this.save.legacy.discoveredSkillIds.includes(item.grantedSkillId)) {
      this.save.legacy.discoveredSkillIds.push(item.grantedSkillId);
    }
    const compatible = item.allowedClasses === "all" || item.allowedClasses.includes(this.save.hero.classId);
    if (!this.save.hero.autoEquipBest || !compatible) return;
    const currentId = this.save.hero.equipped[item.slot];
    const current = this.save.hero.inventory.find((candidate) => candidate.id === currentId);
    if (!current || itemPower(item) > itemPower(current)) this.save.hero.equipped[item.slot] = item.id;
  }

  private isKnownEraLaw(id: string): boolean {
    return ERA_LAWS.some((law) => law.id === id);
  }

  private hasEraLaw(id: Parameters<typeof eraLawModifiers>[0][number]): boolean {
    return this.save.legacy.activeLawIds.includes(id);
  }

  private epochRewards(baseExperience: number, baseGold: number, context: RewardContext): { experience: number; gold: number } {
    const modifiers = rewardModifiers(this.save.legacy.cycle, this.save.legacy.activeLawIds, context);
    return {
      experience: Math.max(0, Math.round(baseExperience * modifiers.experienceMultiplier)),
      gold: Math.max(0, Math.round(baseGold * modifiers.goldMultiplier)),
    };
  }

  private minimumRewardRarity(rarity: Rarity, context: RewardContext): Rarity {
    const modifiers = rewardModifiers(this.save.legacy.cycle, this.save.legacy.activeLawIds, context);
    if (modifiers.forcedMinimumRarity) {
      return RARITY_ORDER[Math.max(RARITY_ORDER.indexOf(rarity), RARITY_ORDER.indexOf(modifiers.forcedMinimumRarity))];
    }
    return improveMinimumRarity(rarity, modifiers.minimumRaritySteps);
  }

  private resolveWorldCombat(
    enemy: EnemyProfile,
    options: CombatOptions = {},
    context: "arena" | "dungeon" | "duel" | "boss" | "crown-league" | "legend-hunt" = "arena",
    hero: HeroProfile = this.save.hero,
  ): ReturnType<typeof resolveCombat> {
    const epoch = epochDifficultyModifiers(this.save.legacy.cycle);
    const laws = eraLawModifiers(this.save.legacy.activeLawIds);
    const bossPower = context === "boss" ? laws.bossPowerMultiplier : 1;
    const heroDefense = 1 + laws.allFighterDefenseFlat / 100;
    const enemyDefense = (1 + (laws.allFighterDefenseFlat + laws.enemyDefenseFlat) / 100) * epoch.enemyDefenseMultiplier * bossPower;
    return resolveCombat(hero, enemy, {
      ...options,
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

  private legacyEnemy(archive: LegacyHeroRecord): EnemyProfile {
    const equipment = archive.equipment.map((item) => ({
      ...item,
      id: createRandomId("legacy-item"),
      stats: { ...item.stats },
      relicHistory: [...(item.relicHistory ?? [])],
      allowedClasses: item.allowedClasses === "all" ? "all" as const : [...item.allowedClasses],
    }));
    const equipped: EnemyProfile["equipped"] = {};
    equipment.forEach((item) => { equipped[item.slot] = item.id; });
    return {
      id: `legacy-hero-${archive.cycle}`,
      name: archive.name,
      title: `${archive.title} · герой эпохи ${archive.cycle}`,
      origin: "Зал отзвуков",
      classId: archive.classId,
      level: archive.level,
      experience: 0,
      rating: archive.rating,
      wins: archive.wins,
      losses: archive.losses,
      tournamentWins: archive.tournamentWins,
      kills: archive.kills,
      arenaIndex: ARENAS.length - 1,
      arenaWins: archive.crownLeagueWins,
      alive: true,
      equipment,
      equipped,
      history: [`Завершил эпоху ${archive.cycle} на ${archive.worldDay}-й день.`],
      traitIds: [], scarIds: [], injuries: [], adaptationIds: [], tacticalStyle: "balanced",
    };
  }

  private recordHeroEncounter(enemy: EnemyProfile, heroWon: boolean, killed = false): void {
    const hero = this.save.hero;
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
    hero.rivalries[enemy.id] = record;
    if (heroWon && !killed && record.wins >= 2 && record.wins % 2 === 0 && enemy.adaptationIds.length < ENEMY_ADAPTATIONS.length) {
      const adaptation = ENEMY_ADAPTATIONS.find((candidate) => !enemy.adaptationIds.includes(candidate.id));
      if (adaptation) {
        enemy.adaptationIds.push(adaptation.id);
        record.adaptationId = adaptation.id;
        this.featureChanges.push({
          fighterId: enemy.id, fighterName: enemy.name, kind: "Адаптация",
          name: adaptation.name, description: adaptation.description, stats: { ...adaptation.stats },
        });
        enemy.history.push(`После ${record.wins}-го поражения от ${hero.name} получил адаптацию «${adaptation.name}».`);
        this.event("battle", `${enemy.name} изучил стиль ${hero.name}: ${adaptation.name}.`);
      }
    }
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
    if (Math.random() < ACTIVE_INJURY_CHANCE && hero.injuries.length < 2) {
      const injuries = [
        { id: "bruised-ribs", name: "Ушиб рёбер", description: "Боль мешает держать удар.", stats: { health: -18, defense: -2 } },
        { id: "cut-palm", name: "Рассечённая ладонь", description: "Хват временно ослаблен.", stats: { attack: -4 } },
        { id: "sprained-ankle", name: "Растяжение", description: "Труднее перехватывать темп.", stats: { speed: -5 } },
      ];
      const injury = pickRandom(injuries);
      if (!hero.injuries.some((candidate) => candidate.id === injury.id)) {
        hero.injuries.push({ ...injury, remainingDays: getRandomNumber(2, 4), gainedDay: this.save.worldDay });
        this.featureChanges.push({
          fighterId: hero.id, fighterName: hero.name, kind: "Травма",
          name: injury.name, description: `${injury.description} Временный эффект до восстановления.`, stats: { ...injury.stats },
        });
        this.event("system", `${hero.name} получил травму «${injury.name}». Она заживёт со временем.`);
      }
    }
    if (hero.scarIds.length < 3 && this.save.hero.highestArena >= 2 && Math.random() < 0.1) {
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
    const equippedIds = new Set(Object.values(this.save.hero.equipped));
    this.save.hero.inventory.filter((item) => equippedIds.has(item.id) && rarityAtLeast(item.rarity, "legendary")).forEach((item) => {
      item.relicRenown = (item.relicRenown ?? 0) + (enemy.level >= this.save.hero.level + 2 ? 2 : 1);
      item.relicHistory ??= [];
      const previousTier = item.relicTier ?? 0;
      let nextTier = previousTier;
      RELIC_TIER_THRESHOLDS.forEach((threshold, tier) => { if ((item.relicRenown ?? 0) >= threshold) nextTier = tier as 0 | 1 | 2 | 3; });
      if (nextTier <= previousTier) return;
      item.relicTier = nextTier;
      item.relicHistory.push(`День ${this.save.worldDay}: ступень наследия ${nextTier} после боя с ${enemy.name}.`);
      const growth = nextTier === 1 ? 0.04 : nextTier === 2 ? 0.06 : 0.08;
      const previousStats = { ...item.stats };
      item.stats = Object.fromEntries(Object.entries(item.stats).map(([stat, value]) => [stat, Math.max(Number(value) + 1, Math.round(Number(value) * (1 + growth)))]));
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

  private refreshContracts(force: boolean): void {
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
    const { gold, experience } = this.epochRewards(contract.rewardExperience, baseGold, "contract");
    const reputation = Math.round(contract.rewardReputation * reputationMultiplier);
    this.save.hero.gold += gold;
    this.gainHeroExperience(experience);
    this.save.hero.factionReputation[contract.factionId] = (this.save.hero.factionReputation[contract.factionId] ?? 0) + reputation;
    this.save.completedContracts += 1;
    this.event("system", `Контракт «${contract.title}» выполнен: +${gold} ¤, репутация +${reputation}.`);
    this.save.activeContract = undefined;
    this.refreshContracts(true);
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

  private createEnemy(arenaIndex: number, newcomer = false): EnemyProfile {
    const arena = ARENAS[arenaIndex];
    const classId = pickRandom(classes);
    const newcomerLevelCeiling = Math.min(arena.enemyLevel[1], arena.enemyLevel[0] + Math.max(1, Math.ceil((arena.enemyLevel[1] - arena.enemyLevel[0]) * 0.3)));
    const level = getRandomNumber(arena.enemyLevel[0], newcomer ? newcomerLevelCeiling : arena.enemyLevel[1]);
    const gearCount = Math.min(6, 2 + Math.floor(level / 5));
    const equipment = Array.from({ length: gearCount }, (_, index) => createItem(level, {
      classId, slot: (["weapon", "offhand", "chest", "head", "hands", "feet"] as EquipmentSlot[])[index],
      minimumRarity: arenaIndex >= 4 ? "epic" : arenaIndex >= 2 ? "rare" : "common",
    }));
    const equipped: EnemyProfile["equipped"] = {};
    equipment.forEach((item) => { equipped[item.slot] = item.id; });
    const name = `${pickRandom(enemyNames)} ${String.fromCharCode(65 + getRandomNumber(0, 20))}.`;
    const wins = newcomer ? getRandomNumber(0, Math.max(1, arenaIndex)) : getRandomNumber(arenaIndex * 3, arenaIndex * 9 + 5);
    const tournamentWins = newcomer ? 0 : getRandomNumber(arenaIndex * 4, arenaIndex * 12 + 6);
    const enemy: EnemyProfile = {
      id: createRandomId("enemy"), name, title: pickRandom(enemyTitles), origin: pickRandom(enemyOrigins), classId, level,
      experience: newcomer ? getRandomNumber(0, 35 + level * 4) : getRandomNumber(0, 80 + level * 20), rating: 0, wins,
      tournamentWins, kills: newcomer ? 0 : getRandomNumber(0, Math.max(0, arenaIndex * 2)),
      losses: newcomer ? getRandomNumber(0, 1) : getRandomNumber(0, 5), arenaIndex,
      arenaWins: newcomer ? 0 : getRandomNumber(0, Math.max(1, arenaIndex)), alive: true,
      equipment, equipped, history: [`Начал путь: ${arena.name}.`],
      traitIds: [FIGHTER_TRAITS[(classes.indexOf(classId) + level + arenaIndex) % FIGHTER_TRAITS.length].id], scarIds: [], injuries: [], adaptationIds: [],
      tacticalStyle: DEFAULT_TACTICAL_PROFILES[(classes.indexOf(classId) + arenaIndex) % DEFAULT_TACTICAL_PROFILES.length].style,
    };
    if (newcomer) enemy.history = [`Прибыл на арену «${arena.name}» в день ${this.save.worldDay}.`];
    enemy.rating = this.enemyWorldRating(enemy);
    return enemy;
  }

  private createDungeonEnemy(levels: [number, number], dungeonName: string): EnemyProfile {
    const enemy = this.createEnemy(Math.min(this.save.hero.highestArena, ARENAS.length - 1));
    enemy.id = createRandomId("dungeon"); enemy.level = getRandomNumber(levels[0], levels[1]); enemy.name = `Хранитель: ${pickRandom(enemyNames)}`;
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
    const heroPower = this.heroPower();
    const closest = [...pool].sort((a, b) => Math.abs(this.enemyPower(a) - heroPower) - Math.abs(this.enemyPower(b) - heroPower));
    return closest[getRandomNumber(0, Math.min(4, closest.length - 1))];
  }

  private createBossEnemy(boss: BossDefinition): EnemyProfile {
    const enemy = this.createEnemy(Math.min(boss.requiredArena, ARENAS.length - 1));
    enemy.id = `boss-${boss.id}`; enemy.name = boss.name; enemy.classId = boss.classId; enemy.level = boss.level;
    enemy.title = "уникальный дуэльный противник"; enemy.origin = boss.place;
    enemy.equipment = (["weapon", "offhand", "head", "chest", "hands", "feet"] as EquipmentSlot[]).map((slot) =>
      createItem(boss.level + 4, { classId: boss.classId, slot, rarity: boss.id === "nameless-duke" ? "mythic" : "legendary" }));
    enemy.equipped = {}; enemy.equipment.forEach((item) => { enemy.equipped[item.slot] = item.id; });
    return enemy;
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

  private updateEnemyAfterPlayerBattle(enemy: EnemyProfile, heroWon: boolean, died: boolean): void {
    if (heroWon) {
      enemy.losses += 1;
      if (died) {
        enemy.alive = false; enemy.history.push(`Погиб в бою с ${this.save.hero.name} на арене «${ARENAS[enemy.arenaIndex].name}».`);
        this.event("death", `${enemy.name}, когда-то ${enemy.title}, погиб и больше не появится в мире.`);
      } else enemy.history.push(`Проиграл ${this.save.hero.name}, но выжил.`);
    } else {
      enemy.wins += 1; enemy.arenaWins += 1; enemy.experience += 45;
      enemy.history.push(`Победил главного героя ${this.save.hero.name}.`); this.progressEnemy(enemy);
    }
    enemy.rating = this.enemyWorldRating(enemy);
  }

  private simulateWorldFights(count: number, recordEvents: boolean, fixedArenaIndex?: number): void {
    const eliteIds = new Set(this.save.eliteLeagueMemberIds);
    for (let index = 0; index < count; index += 1) {
      const arenaIndex = fixedArenaIndex ?? getRandomNumber(0, ARENAS.length - 1);
      const pool = this.save.enemies.filter((enemy) => enemy.alive && enemy.arenaIndex === arenaIndex && !eliteIds.has(enemy.id));
      if (pool.length < 2) continue;
      const first = pickRandom(pool); let second = pickRandom(pool);
      while (second.id === first.id) second = pickRandom(pool);
      const firstChance = this.enemyPower(first) / (this.enemyPower(first) + this.enemyPower(second));
      const winner = Math.random() < firstChance ? first : second;
      const loser = winner.id === first.id ? second : first;
      winner.wins += 1; winner.arenaWins += 1; winner.experience += 70 + arenaIndex * 22;
      loser.losses += 1;
      if (recordEvents) this.event("battle", `${winner.name} победил ${loser.name} на арене «${ARENAS[arenaIndex].name}».`);
      const lethalMultiplier = eraLawModifiers(this.save.legacy.activeLawIds).arenaLethalityMultiplier;
      const lethal = Math.random() < Math.min(0.3, ARENAS[arenaIndex].lethalChance * BACKGROUND_LETHALITY_SCALE * lethalMultiplier);
      if (lethal) {
        winner.kills += 1;
        loser.alive = false; loser.history.push(`Погиб в фоновом бою против ${winner.name}.`);
        if (recordEvents) this.event("death", `${winner.name} смертельно победил ${loser.name} на арене «${ARENAS[arenaIndex].name}».`);
      }
      if (Math.random() < 0.24) {
        const item = createItem(winner.level, { classId: winner.classId, minimumRarity: arenaIndex >= 3 ? "rare" : "common" });
        winner.equipment.push(item); winner.equipped[item.slot] = item.id;
        if (recordEvents) this.event("loot", `${winner.name} получил предмет «${item.name}» после боя.`);
      }
      this.progressEnemy(winner, recordEvents);
      winner.rating = this.enemyWorldRating(winner);
    }
  }

  private simulateDailyWorld(skipTournamentArenaId?: string): void {
    this.ensureEliteLeague();
    ARENAS.forEach((arena, arenaIndex) => {
      this.simulateWorldFights(10 + arenaIndex * 3, true, arenaIndex);
      if (arena.id !== skipTournamentArenaId && this.save.worldDay % arena.tournamentInterval === 0) this.simulateBackgroundTournament(arenaIndex);
    });
    DUNGEONS.forEach((dungeon) => {
      const arenaIndex = Math.min(ARENAS.length - 1, dungeon.requiredArena);
      const eliteIds = new Set(this.save.eliteLeagueMemberIds);
      const pool = this.save.enemies.filter((enemy) => enemy.alive && enemy.arenaIndex === arenaIndex && !eliteIds.has(enemy.id));
      if (pool.length === 0) return;
      const explorer = pickRandom(pool);
      const succeeded = Math.random() < 0.68;
      if (succeeded) {
        explorer.experience += dungeon.rewardExperience * 0.7;
        const item = createItem(explorer.level, { classId: explorer.classId, minimumRarity: this.minimumRewardRarity(dungeon.minimumRarity, "dungeon") });
        explorer.equipment.push(item); explorer.equipped[item.slot] = item.id;
        this.event("dungeon", `${explorer.name} вернулся из данжа «${dungeon.name}» с предметом «${item.name}».`);
        this.progressEnemy(explorer, true);
      } else {
        this.event("dungeon", `${explorer.name} не смог пройти данж «${dungeon.name}».`);
      }
    });
    this.simulateEliteDay();
    this.ensurePopulations();
  }

  private simulateBackgroundTournament(arenaIndex: number): void {
    const arena = ARENAS[arenaIndex];
    const eliteIds = new Set(this.save.eliteLeagueMemberIds);
    const pool = shuffleArray(this.save.enemies.filter((enemy) => enemy.alive && enemy.arenaIndex === arenaIndex && !eliteIds.has(enemy.id))).slice(0, arena.participants);
    if (pool.length < 8) return;
    let contestants = pool;
    while (contestants.length > 1) {
      const winners: EnemyProfile[] = [];
      for (let cursor = 0; cursor < contestants.length; cursor += 2) {
        const first = contestants[cursor]; const second = contestants[cursor + 1];
        if (!second) { winners.push(first); continue; }
        const chance = this.enemyPower(first) / (this.enemyPower(first) + this.enemyPower(second));
        const winner = Math.random() < chance ? first : second;
        const loser = winner.id === first.id ? second : first;
        winner.wins += 1; winner.arenaWins += 1; winner.experience += 55 + arenaIndex * 18;
        loser.losses += 1; winners.push(winner);
      }
      contestants = winners;
    }
    const champion = contestants[0];
    champion.tournamentWins += 1;
    champion.rating = this.enemyWorldRating(champion);
    const prize = createItem(champion.level, { classId: champion.classId, minimumRarity: arenaIndex >= 4 ? "legendary" : arenaIndex >= 2 ? "epic" : "rare" });
    champion.equipment.push(prize); champion.equipped[prize.slot] = prize.id;
    champion.history.push(`Стал чемпионом турнира «${arena.name}» в день ${this.save.worldDay}.`);
    this.progressEnemy(champion, true);
    this.event("tournament", `Фоновый турнир «${arena.name}» завершён: ${champion.name} победил сетку из ${pool.length} бойцов.`);
  }

  private simulateEliteDay(): void {
    this.ensureEliteLeague();
    const heroRank = this.heroEliteRank();
    const challengeMultiplier = eraLawModifiers(this.save.legacy.activeLawIds).eliteChallengeChanceMultiplier;
    if (heroRank && heroRank <= LEGEND_COUNT && !this.save.pendingEliteChallengeId
      && this.save.lastLegendHuntDay !== this.save.worldDay && Math.random() < Math.min(0.24, 0.08 * challengeMultiplier)) {
      const challengerId = this.save.eliteLeagueMemberIds[Math.min(ELITE_SIZE - 1, heroRank)];
      if (challengerId && challengerId !== "hero") {
        this.save.pendingEliteChallengeId = challengerId;
        this.event("battle", `${this.enemyById(challengerId)?.name ?? "Претендент"} вызвал ${this.save.hero.name} на защиту титула легенды.`);
      }
    } else if (Math.random() < Math.min(0.35, 0.16 * challengeMultiplier)) {
      const defenderIndex = getRandomNumber(0, LEGEND_COUNT - 1);
      const challengerIndex = defenderIndex + 1;
      const defenderId = this.save.eliteLeagueMemberIds[defenderIndex];
      const challengerId = this.save.eliteLeagueMemberIds[challengerIndex];
      if (defenderId && challengerId && defenderId !== "hero" && challengerId !== "hero") {
        const defender = this.enemyById(defenderId); const challenger = this.enemyById(challengerId);
        if (defender && challenger) {
          const chance = this.enemyPower(challenger) / (this.enemyPower(challenger) + this.enemyPower(defender));
          if (Math.random() < chance) {
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
    let contestants = shuffleArray([candidate, ...this.save.eliteLeagueMemberIds.filter((id) => id !== "hero").slice(0, ELITE_SIZE - 1)
      .map((id) => this.enemyById(id)).filter((enemy): enemy is EnemyProfile => Boolean(enemy))]);
    if (contestants.length !== ELITE_SIZE) return;
    while (contestants.length > 1) {
      const winners: EnemyProfile[] = [];
      for (let cursor = 0; cursor < contestants.length; cursor += 2) {
        const first = contestants[cursor]; const second = contestants[cursor + 1];
        if (!second) { winners.push(first); continue; }
        const chance = this.enemyPower(first) / (this.enemyPower(first) + this.enemyPower(second));
        const winner = Math.random() < chance ? first : second;
        const loser = winner.id === first.id ? second : first;
        winner.wins += 1; loser.losses += 1; winners.push(winner);
        this.adjustEliteRating(winner.id, 8); this.adjustEliteRating(loser.id, -3);
      }
      contestants = winners;
    }
    const champion = contestants[0];
    champion.tournamentWins += 1;
    this.save.eliteCrownWins[champion.id] = (this.save.eliteCrownWins[champion.id] ?? 0) + 1;
    if (champion.id === candidate.id) this.promoteIntoElite(candidate.id);
    else this.sortEliteByRating();
    this.save.lastCrownLeagueDay = this.save.worldDay;
    this.event("tournament", `Фоновую Лигу короны выиграл ${champion.name}. ${candidate.name} ${champion.id === candidate.id ? "вошёл в элиту" : "остался в обычном рейтинге"}.`);
    this.syncCrownSet();
  }

  private completeDay(skipTournamentArenaId?: string): void {
    this.simulateDailyWorld(skipTournamentArenaId);
    this.healDailyInjuries();
    this.save.worldDay += 1;
    this.refreshShopIfNeeded();
    this.refreshContracts(false);
    this.save.lastSimulatedAt = Date.now();
    this.clearExpiredTournamentRegistrations();
  }

  private prepareDayActivity(): void {
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

  private progressEnemy(enemy: EnemyProfile, recordEvent = true): void {
    while (enemy.experience >= enemyExperienceRequirement(enemy.level)) {
      enemy.experience -= enemyExperienceRequirement(enemy.level);
      enemy.level += 1;
    }
    const nextArena = ARENAS[enemy.arenaIndex + 1];
    if (nextArena && enemy.arenaWins >= ARENAS[enemy.arenaIndex].winsToAdvance && enemy.level >= nextArena.minLevel) {
      const old = ARENAS[enemy.arenaIndex].name; enemy.arenaIndex += 1; enemy.arenaWins = 0;
      enemy.history.push(`Перешёл с арены «${old}» на «${nextArena.name}».`);
      if (recordEvent) this.event("promotion", `${enemy.name} покинул арену «${old}» и поднялся на «${nextArena.name}».`);
    }
    enemy.rating = this.enemyWorldRating(enemy);
  }

  private ensurePopulations(fillImmediately = false, allowRoutineRecruitment = true): void {
    const eliteIds = new Set(this.save.eliteLeagueMemberIds);
    ARENAS.forEach((_, arenaIndex) => {
      const alive = this.save.enemies.filter((enemy) => enemy.alive && enemy.arenaIndex === arenaIndex && !eliteIds.has(enemy.id)).length;
      const missing = Math.max(0, ARENA_POPULATION_TARGET - alive);
      const emergencyRecruitment = Math.max(0, ARENA_POPULATION_FLOOR - alive);
      const routineRecruitment = allowRoutineRecruitment ? Math.min(1, missing) : 0;
      const recruits = fillImmediately ? missing : Math.max(emergencyRecruitment, routineRecruitment);
      for (let index = 0; index < recruits; index += 1) {
        this.save.enemies.push(this.createEnemy(arenaIndex, !fillImmediately));
      }
    });
    if (this.save.enemies.length > 260) {
      const encounteredIds = new Set(Object.keys(this.save.hero.rivalries));
      this.save.eliteLeagueMemberIds.forEach((id) => encounteredIds.add(id));
      const encountered = this.save.enemies.filter((enemy) => encounteredIds.has(enemy.id));
      const retainedIds = new Set(encountered.map((enemy) => enemy.id));
      const population = this.save.enemies
        .filter((enemy) => !retainedIds.has(enemy.id) && (enemy.alive || enemy.history.some((line) => line.includes(this.save.hero.name))))
        .slice(-240);
      this.save.enemies = [...encountered, ...population];
    }
  }

  private refreshShopIfNeeded(): void {
    if (this.save.worldDay - this.save.shopDay >= 2) this.rotateShop();
  }

  private rotateShop(): void {
    const minimum: Rarity = this.save.hero.highestArena >= 4 ? "epic" : this.save.hero.highestArena >= 2 ? "rare" : "common";
    this.save.shopOffers = Array.from({ length: 8 }, () => ({ item: createItem(this.save.hero.level + getRandomNumber(0, 2), { classId: this.save.hero.classId, minimumRarity: Math.random() < 0.35 ? minimum : "common" }), sold: false }));
    this.save.shopDay = this.save.worldDay;
  }

  private event(type: WorldEvent["type"], message: string): void {
    this.save.events.unshift({ id: createRandomId("event"), day: this.save.worldDay, type, message });
    this.save.events = this.save.events.slice(0, 500);
  }
}

export function rarityAtLeast(rarity: Rarity, minimum: Rarity): boolean {
  return RARITY_ORDER.indexOf(rarity) >= RARITY_ORDER.indexOf(minimum);
}

export function skillById(id: string): SkillDefinition | undefined { return SKILLS.find((skill) => skill.id === id); }
