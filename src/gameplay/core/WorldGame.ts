import {
  ARENAS,
  DUEL_BOSSES,
  DUEL_TIERS,
  DUNGEONS,
  EQUIPMENT_SETS,
  ITEM_TEMPLATES,
  RARITY_LABELS,
  RARITY_ORDER,
  SKILLS,
} from "../../catalogs/WorldCatalog";
import {
  DEFAULT_TACTICAL_PROFILES,
  FACTIONS,
  FIGHTER_SCARS,
  FIGHTER_TRAITS,
  RELIC_TIER_THRESHOLDS,
  TOURNAMENT_RULES,
} from "../../catalogs/WorldExpansionCatalog";
import {
  createItem,
  equipmentScore,
  ItemCreationOptions,
} from "../../factories/ItemFactory";
import {
  BattleAction,
  BattleActionOption,
  BattleSession,
  combatantSnapshot,
  CombatOptions,
  unlockedSkills,
} from "../combat/AdvancedBattle";
import { BattleFinalizationService } from "../combat/BattleFinalizationService";
import {
  countermeasureDefinition,
  createEnemyStyleMemory,
  decayEnemyStyleMemory,
  EnemyMemoryCombatRead,
  heroLoadoutSignature,
  memoryStageDefinition,
  readEnemyStyleMemory,
  recordEnemyStyleMemory,
} from "../combat/EnemyMemory";
import {
  buildRivalScoutingReport,
  RivalScoutingReport,
} from "../combat/RivalrySystem";
import { DungeonRouteNode } from "../dungeons/DungeonRoute";
import { ExpeditionService } from "../dungeons/ExpeditionService";
import {
  EquipmentDeedKind,
  recordEquipmentDeed,
} from "../equipment/EquipmentEvolution";
import { evaluateCombatantPower } from "../equipment/EquipmentLoadout";
import { HeroEquipmentService } from "../equipment/HeroEquipmentService";
import {
  BestEquipmentEvaluation,
  LootTarget,
  ReforgeRequest,
  ReforgeResult,
  rollTargetedLoot,
} from "../equipment/LootProgression";
import { considerNpcLoot } from "../equipment/NpcEquipment";
import { ShopService } from "../equipment/ShopService";
import { synchronizeWorldRelic } from "../equipment/WorldRelics";
import { beginNewChronicle } from "../progression/ChronicleTransition";
import {
  defaultLegacyState,
  describeLegacyArchiveInfluence,
  epochDifficultyModifiers,
  epochFinalGoalProgress,
  eraLawModifiers,
  improveMinimumRarity,
  inheritArchiveStyleMemory,
  inheritedSkillSupportsClass,
  newGamePlusStatus,
  normalizeLegacyState,
  RewardContext,
  rewardModifiers,
} from "../progression/NewGamePlus";
import { heroExperienceRequirement } from "../progression/ProgressionBalance";
import {
  ENEMY_ARENA_CHAMPIONSHIP_MIGRATION,
  normalizeWorldSave,
  PENDING_BATTLE_MIGRATION,
  PROGRESSION_CURVE_MIGRATION,
  STAGED_WORLD_FEATURES_MIGRATION,
} from "../save/WorldSaveMigration";
import { assertRestorableWorldSave } from "../save/WorldSaveValidation";
import { TournamentService } from "../tournaments/TournamentService";
import { ContractService } from "../world/ContractService";
import {
  awardCrownSeasonPoints,
  createCrownSeason,
  CrownSeasonResult,
  CrownSeasonState,
} from "../world/CrownSeason";
import {
  createEraChallengeProgress,
  EraChallenge,
  eraChallengeFor,
  EraObjectiveProgress,
  evaluateEraObjective,
  recordEraMetric,
} from "../world/EraChallenges";
import { claimFactionCampaignReward } from "../world/FactionCampaign";
import {
  factionArenaReward,
  improveFactionMinimumRarity,
} from "../world/FactionEconomy";
import { factionModifier, unlockedFactionPerks } from "../world/FactionSystem";
import { createFactionControlState } from "../world/LivingWorld";
import {
  availableNarrativeEvents,
  NarrativeChoice,
  NarrativeEventDefinition,
} from "../world/NarrativeEvents";
import {
  createNpcLifeWorldState,
  normalizeNpcLifeWorldState,
  type FutureBossRecord,
  type NpcLifeProfile,
} from "../world/NpcLifeSimulation";
import { NpcSimulationService } from "../world/NpcSimulationService";
import { SeasonService } from "../world/SeasonService";
import { StructuredWorldEventPayload } from "../world/WorldEvents";
import {
  createWorldFeatureUnlock,
  WORLD_FEATURE_IDS,
  worldFeatureAvailability,
} from "../world/WorldFeatureProgression";
import { WorldPopulationService } from "../world/WorldPopulationService";
import * as worldQueries from "../world/WorldQueries";
import {
  byLeaderboardPosition,
  calculateEnemyWorldRating,
  calculateHeroWorldRating,
  enemyLeaderboardEntry,
  heroLeaderboardEntry,
} from "../world/WorldRanking";
import {
  awardWorldEliteSeasonPoints,
  createWorldSeason,
  worldSeasonRule,
  type WorldSeasonResult,
  type WorldSeasonStanding,
} from "../world/WorldSeason";
import { SeededRandom } from "./RandomSource";
import { starterEquipment } from "./WorldCreation";
import {
  ACTIVE_INJURY_CHANCE,
  CROWN_LEAGUE_INTERVAL,
  CROWN_LEAGUE_SCHEDULE_MIGRATION,
  CROWN_SET_ID,
  ELITE_SIZE,
  ENEMY_NAMES,
  HERO_CLASSES,
  LEGEND_COUNT,
  VISUAL_TEST_CATALOG_CLEANUP_MIGRATION,
} from "./WorldGameConfig";
import { createWorldRandomSnapshots, WorldRandomStreams } from "./WorldRandom";
import {
  ActivityAvailability,
  ActivityDefinition,
  ArenaDefinition,
  BattleReport,
  BossDefinition,
  ContextualTutorialId,
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
  ExpeditionShrineChoice,
  ExpeditionShrineChoiceId,
  ExpeditionStepReport,
  FighterFeatureChange,
  GameSave,
  HeroClass,
  HeroProfile,
  LeaderboardEntry,
  LegacyHeroRecord,
  MentorRecord,
  NewGamePlusOptions,
  NewGamePlusStatus,
  NpcGoal,
  PendingBattle,
  PendingBattleFinalization,
  PendingTournamentState,
  Rarity,
  SkillDefinition,
  Stats,
  TacticalProfile,
  TournamentMatch,
  TournamentReport,
  WorldEvent,
  WorldFeatureId,
  WorldFeatureUnlock,
  WorldRelicRecord,
} from "./WorldTypes";

export {
  CLASS_CHANGE_GOLD_COST,
  CLASS_CHANGE_MARK_COST,
} from "./WorldGameConfig";

export class WorldGame {
  public readonly save: GameSave;
  private readonly random: WorldRandomStreams;
  private readonly equipment: HeroEquipmentService;
  private readonly contracts: ContractService;
  private readonly population: WorldPopulationService;
  private readonly seasons: SeasonService;
  private readonly shop: ShopService;
  private readonly expeditions: ExpeditionService;
  private readonly battleFinalization: BattleFinalizationService;
  private readonly tournaments: TournamentService;
  private readonly npcSimulation: NpcSimulationService;
  private featureChanges: FighterFeatureChange[] = [];
  private automaticLegendDefense?: BattleReport;

  private constructor(save: GameSave) {
    this.save = save;
    this.random = new WorldRandomStreams(save);
    this.npcSimulation = new NpcSimulationService(save, this.random, {
      enemyWorldRating: (...args) => this.enemyWorldRating(...args),
      recordEnemyHistory: (...args) => this.recordEnemyHistory(...args),
      event: (...args) => this.event(...args),
      recordEquipmentDeeds: (...args) => this.recordEquipmentDeeds(...args),
      synchronizeOwnedWorldRelic: (...args) =>
        this.synchronizeOwnedWorldRelic(...args),
      enemyById: (...args) => this.enemyById(...args),
      minimumRewardRarity: (...args) => this.minimumRewardRarity(...args),
      controlledDungeonMinimum: (...args) =>
        this.controlledDungeonMinimum(...args),
      randomId: (...args) => this.randomId(...args),
      recordSurvivalDeed: (...args) => this.recordSurvivalDeed(...args),
      ensureEliteLeague: (...args) => this.ensureEliteLeague(...args),
      ensurePopulations: (...args) => this.ensurePopulations(...args),
      tournamentRules: (...args) => this.tournamentRules(...args),
      recordArenaChampionship: (...args) =>
        this.recordArenaChampionship(...args),
      heroEliteRank: (...args) => this.heroEliteRank(...args),
      awardCrownSeason: (...args) => this.awardCrownSeason(...args),
      swapEliteMembers: (...args) => this.swapEliteMembers(...args),
      registeredCrownLeagueDay: (...args) =>
        this.registeredCrownLeagueDay(...args),
      syncCrownSet: (...args) => this.syncCrownSet(...args),
      crownLeagueInterval: (...args) => this.crownLeagueInterval(...args),
      enemyPower: (...args) => this.enemyPower(...args),
      fighterTournamentSeed: (...args) => this.fighterTournamentSeed(...args),
      adjustEliteRating: (...args) => this.adjustEliteRating(...args),
      promoteIntoElite: (...args) => this.promoteIntoElite(...args),
      sortEliteByRating: (...args) => this.sortEliteByRating(...args),
      factionHunter: (...args) => this.factionHunter(...args),
      heroPower: (...args) => this.heroPower(...args),
    });
    this.tournaments = new TournamentService(save, this.random, {
      runPendingBattleAutomatically: (...args) =>
        this.runPendingBattleAutomatically(...args),
      assertNoPendingBattle: (...args) => this.assertNoPendingBattle(...args),
      tournamentRules: (...args) => this.tournamentRules(...args),
      prepareDayActivity: (...args) => this.prepareDayActivity(...args),
      enemyPower: (...args) => this.enemyPower(...args),
      heroPower: (...args) => this.heroPower(...args),
      latestEventId: (...args) => this.latestEventId(...args),
      enemyById: (...args) => this.enemyById(...args),
      createPendingBattle: (...args) => this.createPendingBattle(...args),
      resolveNpcMatch: (...args) => this.resolveNpcMatch(...args),
      recordHeroEncounter: (...args) => this.recordHeroEncounter(...args),
      recordMutationVictory: (...args) => this.recordMutationVictory(...args),
      updateEnemyAfterPlayerBattle: (...args) =>
        this.updateEnemyAfterPlayerBattle(...args),
      adjustEliteRating: (...args) => this.adjustEliteRating(...args),
      awardCrownSeason: (...args) => this.awardCrownSeason(...args),
      fighterById: (...args) => this.fighterById(...args),
      npcExperienceReward: (...args) => this.npcExperienceReward(...args),
      recordNpcRivalry: (...args) => this.recordNpcRivalry(...args),
      addFactionInfluence: (...args) => this.addFactionInfluence(...args),
      progressEnemy: (...args) => this.progressEnemy(...args),
      recordEquipmentDeeds: (...args) => this.recordEquipmentDeeds(...args),
      controlledArenaReward: (...args) => this.controlledArenaReward(...args),
      factionAdjustedReward: (...args) => this.factionAdjustedReward(...args),
      epochRewards: (...args) => this.epochRewards(...args),
      gainHeroExperience: (...args) => this.gainHeroExperience(...args),
      addHeroFactionInfluence: (...args) =>
        this.addHeroFactionInfluence(...args),
      createRewardItem: (...args) => this.createRewardItem(...args),
      addItem: (...args) => this.addItem(...args),
      advanceContract: (...args) => this.advanceContract(...args),
      recordArenaChampionship: (...args) =>
        this.recordArenaChampionship(...args),
      maybeAwakenWorldRelic: (...args) => this.maybeAwakenWorldRelic(...args),
      recordEnemyHistory: (...args) => this.recordEnemyHistory(...args),
      enemyWorldRating: (...args) => this.enemyWorldRating(...args),
      recalculateHeroRating: (...args) => this.recalculateHeroRating(...args),
      event: (...args) => this.event(...args),
      applyOfficialTournamentRecovery: (...args) =>
        this.applyOfficialTournamentRecovery(...args),
      completeDay: (...args) => this.completeDay(...args),
      eventsSince: (...args) => this.eventsSince(...args),
      promoteIntoElite: (...args) => this.promoteIntoElite(...args),
      sortEliteByRating: (...args) => this.sortEliteByRating(...args),
      syncCrownSet: (...args) => this.syncCrownSet(...args),
      crownLeagueAvailability: (...args) =>
        this.crownLeagueAvailability(...args),
      ensureEliteLeague: (...args) => this.ensureEliteLeague(...args),
      heroEliteRank: (...args) => this.heroEliteRank(...args),
      fighterTournamentSeed: (...args) => this.fighterTournamentSeed(...args),
    });
    this.battleFinalization = new BattleFinalizationService(save, this.random, {
      requirePendingBattle: (...args) => this.requirePendingBattle(...args),
      finalizePendingTournamentBattle: (...args) =>
        this.finalizePendingTournamentBattle(...args),
      enemyById: (...args) => this.enemyById(...args),
      epochRewards: (...args) => this.epochRewards(...args),
      gainHeroExperience: (...args) => this.gainHeroExperience(...args),
      recordNpcDuelWithHero: (...args) => this.recordNpcDuelWithHero(...args),
      recordHeroEncounter: (...args) => this.recordHeroEncounter(...args),
      recordMutationVictory: (...args) => this.recordMutationVictory(...args),
      advanceContract: (...args) => this.advanceContract(...args),
      event: (...args) => this.event(...args),
      completeDay: (...args) => this.completeDay(...args),
      createRewardItem: (...args) => this.createRewardItem(...args),
      minimumRewardRarity: (...args) => this.minimumRewardRarity(...args),
      controlledDungeonMinimum: (...args) =>
        this.controlledDungeonMinimum(...args),
      addItem: (...args) => this.addItem(...args),
      eventsSince: (...args) => this.eventsSince(...args),
      factionAdjustedReward: (...args) => this.factionAdjustedReward(...args),
      npcExperienceReward: (...args) => this.npcExperienceReward(...args),
      progressEnemy: (...args) => this.progressEnemy(...args),
      recordEnemyHistory: (...args) => this.recordEnemyHistory(...args),
      worldEncounterActivity: (...args) => this.worldEncounterActivity(...args),
      swapEliteMembers: (...args) => this.swapEliteMembers(...args),
      awardCrownSeason: (...args) => this.awardCrownSeason(...args),
      updateEnemyAfterPlayerBattle: (...args) =>
        this.updateEnemyAfterPlayerBattle(...args),
      syncCrownSet: (...args) => this.syncCrownSet(...args),
      heroEliteRank: (...args) => this.heroEliteRank(...args),
      adjustEliteRating: (...args) => this.adjustEliteRating(...args),
      consumeExpeditionSupply: (...args) =>
        this.consumeExpeditionSupply(...args),
      dungeonDiscovery: (...args) => this.dungeonDiscovery(...args),
      finishExpedition: (...args) => this.finishExpedition(...args),
    });
    this.expeditions = new ExpeditionService(save, this.random, {
      availability: (...args) => this.availability(...args),
      runPendingBattleAutomatically: (...args) =>
        this.runPendingBattleAutomatically(...args),
      addItem: (...args) => this.addItem(...args),
      epochRewards: (...args) => this.epochRewards(...args),
      createRewardItem: (...args) => this.createRewardItem(...args),
      minimumRewardRarity: (...args) => this.minimumRewardRarity(...args),
      controlledDungeonMinimum: (...args) =>
        this.controlledDungeonMinimum(...args),
      createPendingBattle: (...args) => this.createPendingBattle(...args),
      assertNoPendingBattle: (...args) => this.assertNoPendingBattle(...args),
      advanceContract: (...args) => this.advanceContract(...args),
      gainHeroExperience: (...args) => this.gainHeroExperience(...args),
      createDungeonEnemy: (...args) => this.createDungeonEnemy(...args),
      completeDay: (...args) => this.completeDay(...args),
      prepareDayActivity: (...args) => this.prepareDayActivity(...args),
      event: (...args) => this.event(...args),
    });
    this.population = new WorldPopulationService(save, this.random, {
      randomId: (prefix) => this.randomId(prefix),
      enemyWorldRating: (enemy) => this.enemyWorldRating(enemy),
    });
    this.seasons = new SeasonService(save, this.random, {
      event: (type, message, payload) => this.event(type, message, payload),
      fighterById: (id) => this.fighterById(id),
      fighterTournamentSeed: (fighter) => this.fighterTournamentSeed(fighter),
      recordEnemyHistory: (enemy, message) =>
        this.recordEnemyHistory(enemy, message),
      releaseWorldRelics: (enemy, history) =>
        this.releaseWorldRelics(enemy, history),
      createEnemy: (arenaIndex, newcomer) =>
        this.createEnemy(arenaIndex, newcomer),
      enemyById: (id) => this.enemyById(id),
      enemyWorldRating: (enemy) => this.enemyWorldRating(enemy),
      ensurePopulations: (immediately, routine) =>
        this.ensurePopulations(immediately, routine),
    });
    this.shop = new ShopService(save, this.random);
    this.contracts = new ContractService(save, {
      event: (type, message, payload) => this.event(type, message, payload),
      requireFeature: (id) => this.requireFeature(id),
      isFeatureUnlocked: (id) => this.isFeatureUnlocked(id),
      trainingLevelCap: () => this.trainingLevelCap(),
      gainHeroExperience: (amount) => this.gainHeroExperience(amount),
      reward: (experience, gold, factionId) =>
        this.factionAdjustedReward(
          this.epochRewards(experience, gold, "contract"),
          "contractReward",
          factionId,
        ),
    });
    this.equipment = new HeroEquipmentService(save, this.random, {
      event: (type, message, payload) => this.event(type, message, payload),
      randomId: (prefix) => this.randomId(prefix),
      requireFeature: (id) => this.requireFeature(id),
      assertNoPendingBattle: () => this.assertNoPendingBattle(),
      recordEnemyHistory: (enemy, message) =>
        this.recordEnemyHistory(enemy, message),
    });
  }

  public static create(
    name: string,
    classId: HeroClass,
    now = Date.now(),
  ): WorldGame {
    const tournamentRuleSeed = Math.max(1, now % 999_999);
    const starterRandom = new SeededRandom(`${tournamentRuleSeed}:loot`);
    const starter = starterEquipment(classId, starterRandom);
    const hero: HeroProfile = {
      id: "hero",
      name: name.trim() || "Безымянный",
      classId,
      level: 1,
      experience: 0,
      experienceToNextLevel: heroExperienceRequirement(1),
      gold: 180,
      temperingMarks: 0,
      rating: 1000,
      wins: 0,
      losses: 0,
      tournamentMatchWins: 0,
      tournamentMatchLosses: 0,
      duelWins: 0,
      duelLosses: 0,
      dungeonWins: 0,
      dungeonLosses: 0,
      bossWins: 0,
      kills: 0,
      rivalries: {},
      arenaWins: ARENAS.map(() => 0),
      highestArena: 0,
      inventory: starter.inventory,
      equipped: starter.equipped,
      autoEquipBest: false,
      autoSelectSkills: true,
      selectedSkillIds: [],
      combatMode: "auto",
      traitIds: [
        FIGHTER_TRAITS[HERO_CLASSES.indexOf(classId) % FIGHTER_TRAITS.length]
          .id,
      ],
      scarIds: [],
      injuries: [],
      tacticalProfiles: DEFAULT_TACTICAL_PROFILES.map((profile) => ({
        ...profile,
      })),
      activeTacticalProfileId: "balanced",
      relicDust: 0,
      factionReputation: Object.fromEntries(
        FACTIONS.map((faction) => [faction.id, 0]),
      ),
      crownLeaguePoints: 0,
      crownLeagueWins: 0,
      legendHuntWins: 0,
      legendDefenses: 0,
      autoResolveLegendChallenges: false,
      classChanges: 0,
      appearance: { hairStyle: 0, faceStyle: 0 },
      createdAt: now,
    };
    const randomSnapshots = createWorldRandomSnapshots(tournamentRuleSeed);
    randomSnapshots.loot = starterRandom.snapshot();
    const save: GameSave = {
      version: 3,
      migrations: [
        PROGRESSION_CURVE_MIGRATION,
        STAGED_WORLD_FEATURES_MIGRATION,
        ENEMY_ARENA_CHAMPIONSHIP_MIGRATION,
        PENDING_BATTLE_MIGRATION,
        CROWN_LEAGUE_SCHEDULE_MIGRATION,
      ],
      hero,
      enemies: [],
      worldDay: 1,
      lastSimulatedAt: now,
      dungeonClears: {},
      shopDay: 1,
      shopOffers: [],
      factionControl: createFactionControlState(1),
      mentors: [],
      worldRelics: [],
      npcLife: createNpcLifeWorldState(1),
      worldSeason: createWorldSeason(
        1,
        1,
        new SeededRandom(`${tournamentRuleSeed}:world-season:1`),
      ),
      worldSeasonHistory: [],
      dungeonDiscoveries: {},
      discoveredItems: starter.inventory.map((item) => item.templateId),
      tournamentRegistrations: {},
      defeatedBosses: [],
      huntedLegendIds: [],
      eliteLeagueMemberIds: [],
      eliteRatings: {},
      eliteCrownWins: {},
      tutorialCompleted: false,
      events: [],
      legacy: defaultLegacyState(),
      defeatedLegacyCycles: [],
      seenContextualTutorialIds: [],
      unlockedFeatureIds: [],
      pendingFeatureUnlocks: [],
      contractOffers: [],
      completedContracts: 0,
      tournamentRuleSeed,
      seenNarrativeEventIds: [],
      crownSeason: createCrownSeason(
        1,
        1,
        TOURNAMENT_RULES.map((rule) => rule.id),
        new SeededRandom(`${tournamentRuleSeed}:crown-season:1`),
      ),
      reforgeAttempts: {},
      eraChallengeProgress: createEraChallengeProgress(1),
      randomSnapshots,
    };
    const game = new WorldGame(save);
    ARENAS.forEach((_, arenaIndex) => {
      for (let index = 0; index < 19; index += 1)
        game.save.enemies.push(game.createEnemy(arenaIndex));
    });
    game.ensureEliteLeague();
    game.save.npcLife = normalizeNpcLifeWorldState(
      game.save.npcLife,
      game.save.enemies,
      game.save.worldDay,
    );
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
    game.save.npcLife = normalizeNpcLifeWorldState(
      game.save.npcLife,
      game.save.enemies,
      game.save.worldDay,
    );
    game.save.enemies.forEach((enemy) => {
      enemy.rating = game.enemyWorldRating(enemy);
    });
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

  public get activities(): Array<ArenaDefinition | DungeonDefinition> {
    return [...ARENAS, ...DUNGEONS];
  }

  public factionController(arenaId: string): {
    id: string;
    name: string;
    accent: string;
    effect: string;
  } {
    return worldQueries.factionController(this.save, arenaId);
  }

  public shopController(): {
    id: string;
    name: string;
    accent: string;
    effect: string;
    priceModifier: number;
  } {
    return worldQueries.shopController(this.save);
  }

  public livingMentors(): MentorRecord[] {
    return worldQueries.livingMentors(this.save);
  }

  public worldRelicChronicle(): WorldRelicRecord[] {
    return worldQueries.worldRelicChronicle(this.save);
  }

  public fighterSchool(
    fighterId: string,
  ): { name: string; mentorName: string; isMentor: boolean } | undefined {
    return worldQueries.fighterSchool(this.save, fighterId);
  }

  public currentWorldSeason() {
    return worldQueries.currentWorldSeason(this.save);
  }

  public completedWorldSeasons(): WorldSeasonResult[] {
    return worldQueries.completedWorldSeasons(this.save);
  }

  public worldSeasonLeaderboard(arenaId?: string): WorldSeasonStanding[] {
    return worldQueries.worldSeasonLeaderboard(this.save, arenaId);
  }

  public npcLifeProfile(fighterId: string): NpcLifeProfile | undefined {
    return worldQueries.npcLifeProfile(this.save, fighterId);
  }

  public npcDynasties() {
    return worldQueries.npcDynasties(this.save);
  }

  public factionCampaigns() {
    return worldQueries.factionCampaigns(this.save);
  }

  public claimFactionCampaign(factionId: string) {
    this.requireFeature("contracts");
    this.assertNoPendingBattle();
    const claim = claimFactionCampaignReward(
      this.save.factionCampaigns ?? {},
      this.save.hero.factionReputation,
      factionId,
    );
    const templates = claim.reward.slots.map((slot) =>
      ITEM_TEMPLATES.find(
        (template) =>
          template.setId === claim.reward.setId &&
          template.slot === slot &&
          (template.allowedClasses === "all" ||
            template.allowedClasses.includes(this.save.hero.classId)),
      ),
    );
    if (templates.some((template) => !template))
      throw new Error("Награда фракции недоступна для выбранного класса.");
    const items = templates.map((template) =>
      createItem(this.save.hero.level, {
        classId: this.save.hero.classId,
        templateId: template!.id,
        rarity: claim.reward.rarity,
        randomSource: this.random.loot,
      }),
    );
    this.save.factionCampaigns = claim.state;
    this.save.hero.gold += claim.reward.gold;
    this.save.hero.temperingMarks += claim.reward.seals;
    items.forEach((item) => this.addItem(item));
    const factionName =
      FACTIONS.find((faction) => faction.id === factionId)?.name ?? factionId;
    this.event(
      "loot",
      `${factionName}: поручение завершено. Получены ${items.map((item) => item.name).join(", ")}, ${claim.reward.gold} монет и ${claim.reward.seals} печатей.`,
    );
    return {
      items,
      gold: claim.reward.gold,
      seals: claim.reward.seals,
      mentorAccess: claim.reward.mentorAccess,
    };
  }

  public factionMentors() {
    return worldQueries.factionMentors(this.save);
  }

  public trainWithFactionMentor(factionId: string): DailyActivityReport {
    const mentor = this.factionMentors().find(
      (candidate) => candidate.factionId === factionId,
    );
    if (!mentor)
      throw new Error(
        "Сначала выполните первое поручение этой фракции и сохраните её доверие.",
      );
    return this.trainingDay(mentor.experienceMultiplier, mentor.name);
  }

  public availableFutureBosses(): FutureBossRecord[] {
    return worldQueries.availableFutureBosses(this.save);
  }

  public futureBossAvailability(bossId: string): ActivityAvailability {
    return worldQueries.futureBossAvailability(this.save, bossId);
  }

  public beginFutureBossFight(bossId: string): PendingBattle {
    this.assertNoPendingBattle();
    const availability = this.futureBossAvailability(bossId);
    if (!availability.unlocked) throw new Error(availability.reason);
    const boss = this.save.npcLife!.futureBosses.find(
      (candidate) => candidate.id === bossId,
    )!;
    this.prepareDayActivity();
    return this.createPendingBattle(
      "world-encounter",
      boss.id,
      this.futureBossEnemy(boss),
      {},
      "boss",
      undefined,
      {
        encounterType: "future-boss",
        futureBossId: boss.id,
        eventCursor: this.latestEventId(),
      },
    );
  }

  public factionHunter(): EnemyProfile | undefined {
    return this.save.pendingFactionHunterId
      ? this.enemyById(this.save.pendingFactionHunterId)
      : undefined;
  }

  public factionHunterAvailability(): ActivityAvailability {
    const hunter = this.factionHunter();
    if (!hunter?.alive)
      return {
        unlocked: false,
        reason: "Ни одна враждебная фракция пока не отправила охотника.",
      };
    const faction = FACTIONS.find(
      (candidate) => candidate.id === hunter.factionId,
    );
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

  public npcGoal(goal: NpcGoal | undefined): {
    name: string;
    description: string;
  } {
    return worldQueries.npcGoal(goal);
  }

  public pendingNarrativeEvent(): NarrativeEventDefinition | undefined {
    return worldQueries.pendingNarrativeEvent(this.save);
  }

  public resolveNarrativeChoice(choiceId: string): {
    event: NarrativeEventDefinition;
    choice: NarrativeChoice;
  } {
    const event = this.pendingNarrativeEvent();
    if (!event) throw new Error("Ожидающего решения события нет.");
    const choice = event.choices.find((candidate) => candidate.id === choiceId);
    if (!choice) throw new Error("Такого решения у события нет.");
    const effect = choice.effect;
    if (this.save.hero.gold + (effect.gold ?? 0) < 0)
      throw new Error("Для этого решения недостаточно монет.");

    this.save.hero.gold += effect.gold ?? 0;
    if (effect.experience) this.gainHeroExperience(effect.experience);
    this.save.hero.temperingMarks += effect.temperingMarks ?? 0;
    Object.entries(effect.reputation ?? {}).forEach(([factionId, delta]) => {
      this.save.hero.factionReputation[factionId] = Math.max(
        -20,
        (this.save.hero.factionReputation[factionId] ?? 0) + delta,
      );
    });
    if (effect.injuryRecovery) {
      this.save.hero.injuries.forEach((injury) => {
        injury.remainingDays = Math.max(
          0,
          injury.remainingDays - effect.injuryRecovery!,
        );
      });
    }
    if (effect.rivalryIntensity) {
      const rivalry = Object.values(this.save.hero.rivalries).sort(
        (first, second) => second.lastMetDay - first.lastMetDay,
      )[0];
      if (rivalry)
        rivalry.intensity = Math.max(
          0,
          (rivalry.intensity ?? 0) + effect.rivalryIntensity,
        );
    }
    this.save.seenNarrativeEventIds = [
      ...new Set([...this.save.seenNarrativeEventIds, event.id]),
    ];
    this.save.pendingNarrativeEventId = undefined;
    this.syncDerivedEraProgress();
    this.event("system", `${event.title}: ${choice.label}.`, {
      kind: "narrative",
      eventId: event.id,
      choiceId: choice.id,
      fighterId: "hero",
      fighterName: this.save.hero.name,
    });
    return { event, choice };
  }

  public currentCrownSeason(): CrownSeasonState {
    return worldQueries.currentCrownSeason(this.save);
  }

  public lastCompletedCrownSeason(): CrownSeasonResult | undefined {
    return worldQueries.lastCompletedCrownSeason(this.save);
  }

  public crownSeasonStandings(): Array<{
    fighterId: string;
    name: string;
    points: number;
    defenses: number;
  }> {
    return worldQueries.crownSeasonStandings(this.save);
  }

  public setLootTarget(target?: LootTarget): void {
    return this.equipment.setLootTarget(target);
  }

  public bestEquipmentEvaluation(): BestEquipmentEvaluation {
    return this.equipment.bestEquipmentEvaluation();
  }

  public reforgeItem(
    itemId: string,
    request: Omit<ReforgeRequest, "attempt">,
  ): ReforgeResult {
    return this.equipment.reforgeItem(itemId, request);
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
    const signature = heroLoadoutSignature(
      this.save.hero,
      skillIds,
      this.save.worldDay,
    );
    return buildRivalScoutingReport(
      enemy.heroMemory,
      readEnemyStyleMemory(enemy.heroMemory, signature),
    );
  }

  public currentEraChallenge(): EraChallenge | undefined {
    return this.save.legacy.cycle >= 2
      ? eraChallengeFor(this.save.legacy.cycle)
      : undefined;
  }

  public epochFinalGoalProgress() {
    return epochFinalGoalProgress(this.save);
  }

  public eraObjectiveProgress(): EraObjectiveProgress[] {
    const challenge = this.currentEraChallenge();
    if (!challenge) return [];
    return challenge.objectives.map((objective) =>
      evaluateEraObjective(objective, this.save.eraChallengeProgress.metrics),
    );
  }

  public newGamePlusStatus(): NewGamePlusStatus {
    return newGamePlusStatus(this.save);
  }

  public legacyArchives(): LegacyHeroRecord[] {
    return normalizeLegacyState(this.save.legacy).archives;
  }

  public heirloomCandidates(
    classId: HeroClass = this.save.hero.classId,
  ): EquipmentItem[] {
    return this.save.hero.inventory.filter((item) => {
      const template = ITEM_TEMPLATES.find(
        (candidate) => candidate.id === item.templateId,
      );
      if (
        !template ||
        item.isVisualTestItem ||
        template.exclusiveToElite ||
        item.setId === CROWN_SET_ID
      )
        return false;
      const classCompatible =
        template.allowedClasses === "all" ||
        template.allowedClasses.includes(classId);
      return classCompatible && inheritedSkillSupportsClass(item, classId);
    });
  }

  public beginNewChronicle(
    options: NewGamePlusOptions,
    now = Date.now(),
  ): WorldGame {
    return beginNewChronicle(this.save, options, now, {
      heirloomCandidates: (classId) => this.heirloomCandidates(classId),
      create: (name, classId, createdAt) => {
        const next = WorldGame.create(name, classId, createdAt);
        return {
          result: next,
          save: next.save,
          random: next.random,
          initializeCrossEraPopulation: (...args) =>
            next.initializeCrossEraPopulation(...args),
          legacyEnemy: (archive) => next.legacyEnemy(archive),
          addItem: (item) => next.addItem(item),
          syncEraChallenge: () => next.syncEraChallenge(),
          event: (type, message, payload) => next.event(type, message, payload),
          ensureEliteLeague: () => next.ensureEliteLeague(),
          syncCrownSet: () => next.syncCrownSet(),
        };
      },
    });
  }

  public beginNewEra(options: NewGamePlusOptions, now = Date.now()): WorldGame {
    return this.beginNewChronicle(options, now);
  }

  public legacyChampionAvailability(cycle?: number): ActivityAvailability {
    const archive = cycle
      ? this.save.legacy.archives.find((candidate) => candidate.cycle === cycle)
      : this.save.legacy.archives[this.save.legacy.archives.length - 1];
    if (!archive)
      return { unlocked: false, reason: "В архиве ещё нет завершённых эпох." };
    const influence = describeLegacyArchiveInfluence(archive);
    if (!influence.opponent) {
      return {
        unlocked: false,
        reason: influence.mentor
          ? `${archive.name} остался в мире наставником, а не противником.`
          : `${archive.name} продолжает влиять на мир через фракционную традицию.`,
      };
    }
    if (this.save.defeatedLegacyCycles.includes(archive.cycle))
      return { unlocked: false, reason: "Этот герой прошлого уже побеждён." };
    if (
      this.save.hero.highestArena < influence.opponent.arenaIndex ||
      this.save.hero.level < influence.opponent.unlockLevel
    ) {
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
    if (!result || !("winnerId" in result))
      throw new Error(
        "Автоматический расчёт боя с героем эпохи не вернул результат.",
      );
    return result as BattleReport;
  }

  public beginLegacyChampion(cycle?: number): PendingBattle {
    this.assertNoPendingBattle();
    const archive = cycle
      ? this.save.legacy.archives.find((candidate) => candidate.cycle === cycle)
      : this.save.legacy.archives[this.save.legacy.archives.length - 1];
    const availability = this.legacyChampionAvailability(cycle);
    if (!archive || !availability.unlocked)
      throw new Error(availability.reason);
    this.prepareDayActivity();
    return this.createPendingBattle(
      "legacy-champion",
      `legacy-${archive.cycle}`,
      this.legacyEnemy(archive),
      {},
      "boss",
      undefined,
      {
        cycle: archive.cycle,
        eventCursor: this.latestEventId(),
      },
    );
  }

  public tournamentRules(
    arenaId: string,
    day = this.save.tournamentRegistrations[arenaId] ?? this.save.worldDay,
  ): typeof TOURNAMENT_RULES {
    const source = `${arenaId}:${day}:${this.save.tournamentRuleSeed}`;
    let hash = 0;
    for (let index = 0; index < source.length; index += 1)
      hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
    const first = Math.abs(hash) % TOURNAMENT_RULES.length;
    const second = Math.abs(hash * 31 + 17) % TOURNAMENT_RULES.length;
    return [
      TOURNAMENT_RULES[first],
      ...(second === first ? [] : [TOURNAMENT_RULES[second]]),
    ];
  }

  public activeTacticalProfile(): TacticalProfile {
    return (
      this.save.hero.tacticalProfiles.find(
        (profile) => profile.id === this.save.hero.activeTacticalProfileId,
      ) ?? this.save.hero.tacticalProfiles[0]
    );
  }

  public setTacticalProfile(profileId: string): TacticalProfile {
    const profile = this.save.hero.tacticalProfiles.find(
      (candidate) => candidate.id === profileId,
    );
    if (!profile) throw new Error("Тактический профиль не найден.");
    this.save.hero.activeTacticalProfileId = profile.id;
    return profile;
  }

  public enemyMemoryPreview(
    enemyId: string,
  ): EnemyMemoryCombatRead | undefined {
    const enemy = this.enemyById(enemyId);
    if (!enemy) return undefined;
    const memory = decayEnemyStyleMemory(enemy.heroMemory, this.save.worldDay);
    const currentSkills = combatantSnapshot(this.save.hero).skills;
    return readEnemyStyleMemory(
      memory,
      heroLoadoutSignature(this.save.hero, currentSkills, this.save.worldDay),
    );
  }

  public fighterFeatures(profile: HeroProfile | EnemyProfile): Array<{
    id: string;
    name: string;
    description: string;
    kind: string;
    stats: Partial<Stats>;
  }> {
    const ids = [
      ...(profile.traitIds ?? []).map((id) => ({ id, kind: "Черта" })),
      ...(profile.scarIds ?? []).map((id) => ({ id, kind: "Шрам" })),
    ];
    const definitions = [...FIGHTER_TRAITS, ...FIGHTER_SCARS];
    return ids.map(({ id, kind }) => {
      const feature = definitions.find((candidate) => candidate.id === id);
      return {
        id,
        kind,
        name: feature?.name ?? id,
        description:
          feature?.description ?? "История этого свойства ещё не записана.",
        stats: feature?.stats ?? {},
      };
    });
  }

  public consumeFeatureChanges(): FighterFeatureChange[] {
    const changes = this.featureChanges.map((change) => ({
      ...change,
      stats: { ...change.stats },
    }));
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
    const unlocks = this.save.pendingFeatureUnlocks.map((entry) => ({
      ...entry,
    }));
    this.save.pendingFeatureUnlocks = [];
    return unlocks;
  }

  public hasSeenTutorial(id: ContextualTutorialId): boolean {
    return this.save.seenContextualTutorialIds.includes(id);
  }

  public markTutorialSeen(id: ContextualTutorialId): void {
    if (!this.save.seenContextualTutorialIds.includes(id))
      this.save.seenContextualTutorialIds.push(id);
  }

  public consumeAutomaticLegendDefense(): BattleReport | undefined {
    const report = this.automaticLegendDefense;
    this.automaticLegendDefense = undefined;
    return report;
  }

  public setAutoResolveLegendChallenges(enabled: boolean): void {
    this.save.hero.autoResolveLegendChallenges = enabled;
  }

  public acceptContract(
    contractId: string,
    approach: "honor" | "profit",
  ): ContractOffer {
    return this.contracts.acceptContract(contractId, approach);
  }

  public abandonContract(): void {
    return this.contracts.abandonContract();
  }

  public salvageItem(itemId: string): number {
    return this.equipment.salvageItem(itemId);
  }

  public salvageItems(itemIds: readonly string[]): number {
    return this.equipment.salvageItems(itemIds);
  }

  public awakenRelic(
    itemId: string,
    pathId: "might" | "guard" | "tempo",
  ): EquipmentItem {
    return this.equipment.awakenRelic(itemId, pathId);
  }

  public relicRecipients(itemId: string): EnemyProfile[] {
    return this.equipment.relicRecipients(itemId);
  }

  public giftRelic(itemId: string, fighterId: string): WorldRelicRecord {
    return this.equipment.giftRelic(itemId, fighterId);
  }

  public simulateElapsed(now = Date.now()): number {
    if (this.save.pendingBattle || this.save.activeExpedition) return 0;
    const elapsedDays = Math.min(
      14,
      Math.max(0, Math.floor((now - this.save.lastSimulatedAt) / 600_000)),
    );
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
      if (simulatedDays > 0)
        this.event(
          "system",
          `Пока вас не было, мир прожил ${simulatedDays} дн. Все арены, данжи и турниры продолжали работать.`,
        );
      this.refreshShopIfNeeded();
    }
    return simulatedDays;
  }

  public nextTournamentDay(arenaId: string): number {
    const arena = ARENAS.find((candidate) => candidate.id === arenaId);
    if (!arena) throw new Error("Турнир не найден.");
    return (
      (Math.floor(this.save.worldDay / arena.tournamentInterval) + 1) *
      arena.tournamentInterval
    );
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
    this.event(
      "tournament",
      `${this.save.hero.name} записался на «${arena.name}» в день ${day}.`,
    );
    return day;
  }

  public nextCrownLeagueDay(): number {
    const interval = this.crownLeagueInterval();
    return (Math.floor(this.save.worldDay / interval) + 1) * interval;
  }

  public crownLeagueInterval(): number {
    return this.hasEraLaw("crown-discord")
      ? Math.round(CROWN_LEAGUE_INTERVAL * 0.75)
      : CROWN_LEAGUE_INTERVAL;
  }

  public registeredCrownLeagueDay(): number | undefined {
    return this.save.tournamentRegistrations["crown-league"];
  }

  private migrateCrownLeagueSchedule(): void {
    const migrations = (this.save.migrations ??= []);
    if (migrations.includes(CROWN_LEAGUE_SCHEDULE_MIGRATION)) return;
    const registeredDay = this.registeredCrownLeagueDay();
    if (registeredDay !== undefined && registeredDay > this.save.worldDay) {
      const nextDay = Math.min(registeredDay, this.nextCrownLeagueDay());
      this.save.tournamentRegistrations["crown-league"] = nextDay;
      if (nextDay !== registeredDay) {
        this.event(
          "tournament",
          `Запись в Лигу короны перенесена с дня ${registeredDay} на день ${nextDay}: турнир теперь проходит чаще.`,
        );
      }
    }
    migrations.push(CROWN_LEAGUE_SCHEDULE_MIGRATION);
  }

  public crownLeagueRegistrationAvailability(): ActivityAvailability {
    const qualification = this.crownLeagueQualification();
    if (!qualification.unlocked) return qualification;
    const registeredDay = this.registeredCrownLeagueDay();
    if (registeredDay && registeredDay >= this.save.worldDay) {
      return {
        unlocked: false,
        reason: `Место уже зарезервировано на день ${registeredDay}.`,
      };
    }
    return {
      unlocked: true,
      reason: `${qualification.reason} Ближайшая Лига состоится в день ${this.nextCrownLeagueDay()}.`,
    };
  }

  public registerCrownLeague(): number {
    const existing = this.registeredCrownLeagueDay();
    if (existing && existing >= this.save.worldDay) return existing;
    const availability = this.crownLeagueRegistrationAvailability();
    if (!availability.unlocked) throw new Error(availability.reason);
    const day = this.nextCrownLeagueDay();
    this.save.tournamentRegistrations["crown-league"] = day;
    this.event(
      "tournament",
      `${this.save.hero.name} записался в Лигу короны на день ${day}.`,
    );
    return day;
  }

  public availability(activity: ActivityDefinition): ActivityAvailability {
    const hero = this.save.hero;
    if (activity.kind === "endgame") {
      return activity.id === "crown-league"
        ? this.crownLeagueAvailability()
        : this.legendHuntAvailability();
    }
    if (activity.kind === "arena") {
      const index = ARENAS.findIndex((arena) => arena.id === activity.id);
      if (index > hero.highestArena)
        return {
          unlocked: false,
          reason: `Победите на арене «${ARENAS[index - 1].name}».`,
        };
      if (hero.level < activity.minLevel)
        return {
          unlocked: false,
          reason: `Требуется ${activity.minLevel} уровень.`,
        };
      const registered = this.save.tournamentRegistrations[activity.id];
      if (registered === this.save.worldDay)
        return {
          unlocked: true,
          reason: `Турнир проходит сегодня. Место в сетке подтверждено.`,
        };
      if (registered && registered > this.save.worldDay)
        return {
          unlocked: true,
          reason: `Вы записаны на день ${registered}. До события: ${registered - this.save.worldDay} дн.`,
        };
      return {
        unlocked: true,
        reason: `${hero.arenaWins[index]}/${activity.winsToAdvance} побед в турнирах для продвижения.`,
      };
    }
    if (activity.kind === "duel") return this.duelAvailability(activity);
    if (activity.kind === "boss") return this.bossAvailability(activity);
    const openedByMap =
      this.save.legacy.activeBoonId === "old-map" &&
      activity.id === DUNGEONS[0]?.id;
    if (!openedByMap && hero.level < activity.minLevel)
      return {
        unlocked: false,
        reason: `Требуется ${activity.minLevel} уровень.`,
      };
    if (!openedByMap && hero.highestArena < activity.requiredArena)
      return {
        unlocked: false,
        reason: `Сначала откройте арену ${activity.requiredArena + 1}.`,
      };
    if (!openedByMap && this.save.worldDay < activity.requiredWorldDay)
      return {
        unlocked: false,
        reason: `Откроется на ${activity.requiredWorldDay}-й день мира.`,
      };
    const lastClear = this.save.dungeonClears[activity.id];
    if (lastClear && this.save.worldDay - lastClear < activity.cooldownDays) {
      return {
        unlocked: false,
        reason: `Восстановится через ${activity.cooldownDays - (this.save.worldDay - lastClear)} дн.`,
      };
    }
    return {
      unlocked: true,
      reason: `Гарантирована добыча: ${RARITY_LABELS[activity.minimumRarity].toLowerCase()}.`,
    };
  }

  public play(activityId: string): BattleReport {
    this.beginDungeon(activityId);
    const result = this.runPendingBattleAutomatically();
    if (!result || !("winnerId" in result) || !("turns" in result))
      throw new Error("Автоматический расчёт вылазки не вернул результат.");
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
    const activeItems = this.save.hero.inventory.filter((item) =>
      activeItemIds.has(item.id),
    );
    const skillIds = unlockedSkills(
      this.save.hero.classId,
      this.save.hero.level,
      activeItems,
      this.save.hero.legacySkillId ? [this.save.hero.legacySkillId] : [],
    ).map((skill) => skill.id);
    const enemy = this.createDungeonEnemy(activity.enemyLevel, activity.name);
    return this.createPendingBattle(
      "dungeon",
      activity.id,
      enemy,
      {},
      "dungeon",
      undefined,
      {
        eventCursor: this.latestEventId(),
        skillIds,
      },
    );
  }

  public train(): DailyActivityReport {
    return this.trainingDay();
  }

  private trainingDay(
    mentorMultiplier = 1,
    mentorName?: string,
  ): DailyActivityReport {
    if (this.save.pendingBattle)
      throw new Error("Сначала завершите или отмените уже начатый бой.");
    if (this.save.activeExpedition)
      throw new Error("Сначала завершите текущий поход или отступите.");
    const levelCap = this.trainingLevelCap();
    if (this.save.hero.level >= levelCap) {
      throw new Error(
        `Тренировки больше не дают уровень. Сначала продвиньтесь на следующую арену; текущий предел — ${levelCap}.`,
      );
    }
    this.prepareDayActivity();
    const trainingBonus =
      1 +
      factionModifier(this.save.hero.factionReputation, "trainingExperience");
    const experience = Math.round(
      this.epochRewards(34 + this.save.hero.level * 5, 0, "training")
        .experience *
        trainingBonus *
        mentorMultiplier,
    );
    const levelsGained = this.gainHeroExperience(experience, levelCap);
    this.advanceContract("training");
    this.event(
      "system",
      `${this.save.hero.name} провёл день ${mentorName ? `под руководством ${mentorName}` : "на тренировочной площадке"} и получил ${experience} опыта.`,
    );
    this.completeDay();
    return {
      kind: "training",
      title: mentorName
        ? "Занятие с наставником завершено"
        : "Тренировка завершена",
      description: mentorName
        ? `${mentorName}: на 20% больше опыта в пределах текущей арены.`
        : "Безопасная практика без добычи и рейтингового риска.",
      experience,
      gold: 0,
      levelsGained,
    };
  }

  public trainingLevelCap(): number {
    const arena =
      ARENAS[Math.min(this.save.hero.highestArena, ARENAS.length - 1)];
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
    const arenaIndex = Math.min(
      Math.max(tier.requiredArena, this.save.hero.highestArena),
      ARENAS.length - 1,
    );
    const enemy = this.matchDuelEnemy(tier, arenaIndex);
    return this.createPendingBattle("duel", tier.id, enemy, {}, "duel");
  }

  public currentPendingBattle(): PendingBattle | undefined {
    return this.save.pendingBattle;
  }

  public pendingBattleActions(): BattleActionOption[] {
    return new BattleSession(
      this.requirePendingBattle().session,
    ).availableActions();
  }

  public stepPendingBattle(action?: BattleAction) {
    const pending = this.requirePendingBattle();
    const session = new BattleSession(pending.session);
    const turn = session.step(action);
    pending.session = session.snapshot();
    return { turn, finished: session.isFinished, pendingBattle: pending };
  }

  public finalizePendingBattle(): PendingBattleFinalization {
    return this.battleFinalization.finalizePendingBattle();
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

  public runPendingBattleAutomatically():
    | BattleReport
    | DailyActivityReport
    | TournamentReport
    | ExpeditionStepReport
    | undefined {
    while (this.save.pendingBattle) {
      const session = new BattleSession(this.save.pendingBattle.session);
      session.runAutomatic();
      this.save.pendingBattle.session = session.snapshot();
      const finalized = this.finalizePendingBattle();
      if (finalized.status === "complete") return finalized.result;
    }
    return undefined;
  }

  private finalizePendingDuel(
    pending: PendingBattle,
    session: BattleSession,
  ): PendingBattleFinalization {
    return this.battleFinalization.finalizePendingDuel(pending, session);
  }

  private finalizePendingDungeon(
    pending: PendingBattle,
    session: BattleSession,
  ): PendingBattleFinalization {
    return this.battleFinalization.finalizePendingDungeon(pending, session);
  }

  private finalizePendingBoss(
    pending: PendingBattle,
    session: BattleSession,
  ): PendingBattleFinalization {
    return this.battleFinalization.finalizePendingBoss(pending, session);
  }

  private finalizePendingLegacyChampion(
    pending: PendingBattle,
    session: BattleSession,
  ): PendingBattleFinalization {
    return this.battleFinalization.finalizePendingLegacyChampion(
      pending,
      session,
    );
  }

  private finalizePendingWorldEncounter(
    pending: PendingBattle,
    session: BattleSession,
  ): PendingBattleFinalization {
    return this.battleFinalization.finalizePendingWorldEncounter(
      pending,
      session,
    );
  }

  private finalizePendingLegendHunt(
    pending: PendingBattle,
    session: BattleSession,
  ): PendingBattleFinalization {
    return this.battleFinalization.finalizePendingLegendHunt(pending, session);
  }

  private finalizePendingLegendDefense(
    pending: PendingBattle,
    session: BattleSession,
  ): PendingBattleFinalization {
    return this.battleFinalization.finalizePendingLegendDefense(
      pending,
      session,
    );
  }

  private finalizePendingExpedition(
    pending: PendingBattle,
    session: BattleSession,
  ): PendingBattleFinalization {
    return this.battleFinalization.finalizePendingExpedition(pending, session);
  }

  public fightBoss(bossId: string): DailyActivityReport {
    this.beginBoss(bossId);
    const result = this.runPendingBattleAutomatically();
    if (!result || !("kind" in result) || result.kind !== "duel") {
      throw new Error(
        "Автоматический расчёт боя с боссом не вернул результат.",
      );
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
    return this.createPendingBattle(
      "boss",
      boss.id,
      this.createBossEnemy(boss),
      {},
      "boss",
      undefined,
      {
        eventCursor: this.latestEventId(),
      },
    );
  }

  public playTournament(arenaId: string): TournamentReport {
    return this.tournaments.playTournament(arenaId);
  }

  public beginTournament(arenaId: string): PendingBattle {
    return this.tournaments.beginTournament(arenaId);
  }

  private advancePendingTournament(
    state: PendingTournamentState,
  ): PendingBattle | TournamentReport {
    return this.tournaments.advancePendingTournament(state);
  }

  private finalizePendingTournamentBattle(
    pending: PendingBattle,
    session: BattleSession,
  ): PendingBattleFinalization {
    return this.tournaments.finalizePendingTournamentBattle(pending, session);
  }

  private tournamentMatches(state: PendingTournamentState): TournamentMatch[] {
    return this.tournaments.tournamentMatches(state);
  }

  private applyPendingNpcArenaMatches(
    state: PendingTournamentState,
    arenaIndex: number,
  ): void {
    return this.tournaments.applyPendingNpcArenaMatches(state, arenaIndex);
  }

  private completePendingArenaTournament(
    state: PendingTournamentState,
    championId: string,
  ): TournamentReport {
    return this.tournaments.completePendingArenaTournament(state, championId);
  }

  private completePendingCrownTournament(
    state: PendingTournamentState,
    championId: string,
  ): TournamentReport {
    return this.tournaments.completePendingCrownTournament(state, championId);
  }

  public equip(itemId: string): void {
    return this.equipment.equip(itemId);
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
      return {
        unlocked: true,
        reason: `${qualification.reason} Сегодня день Лиги короны, место в сетке подтверждено.`,
      };
    }
    return {
      unlocked: false,
      reason: `${qualification.reason} Для участия нужна предварительная запись; ближайшая Лига — в день ${this.nextCrownLeagueDay()}.`,
    };
  }

  public startExpedition(dungeonId: string): DungeonExpedition {
    return this.expeditions.startExpedition(dungeonId);
  }

  public expeditionRoute() {
    return this.expeditions.expeditionRoute();
  }

  public dungeonDiscovery(dungeonId: string) {
    return this.expeditions.dungeonDiscovery(dungeonId);
  }

  public reachableExpeditionNodes(): DungeonRouteNode[] {
    return this.expeditions.reachableExpeditionNodes();
  }

  public expeditionShrineChoices(): ExpeditionShrineChoice[] {
    return this.expeditions.expeditionShrineChoices();
  }

  public resolveExpeditionShrine(
    choiceId: ExpeditionShrineChoiceId,
  ): ExpeditionStepReport {
    return this.expeditions.resolveExpeditionShrine(choiceId);
  }

  public expeditionMerchantOptions(): Array<{
    id: "healing" | "supplies" | "leave";
    name: string;
    description: string;
    price: number;
  }> {
    return this.expeditions.expeditionMerchantOptions();
  }

  public resolveExpeditionMerchant(
    choiceId: "healing" | "supplies" | "leave",
  ): ExpeditionStepReport {
    return this.expeditions.resolveExpeditionMerchant(choiceId);
  }

  public advanceExpeditionNode(nodeId: string): ExpeditionStepReport {
    return this.expeditions.advanceExpeditionNode(nodeId);
  }

  public beginExpeditionNode(
    nodeId: string,
  ): PendingBattle | ExpeditionStepReport {
    return this.expeditions.beginExpeditionNode(nodeId);
  }

  private consumeExpeditionSupply(expedition: DungeonExpedition): void {
    return this.expeditions.consumeExpeditionSupply(expedition);
  }

  public expeditionChoices(): ExpeditionChoice[] {
    return this.expeditions.expeditionChoices();
  }

  public advanceExpedition(
    choiceId: ExpeditionChoice["id"],
  ): ExpeditionStepReport {
    return this.expeditions.advanceExpedition(choiceId);
  }

  public beginExpeditionChoice(
    choiceId: ExpeditionChoice["id"],
  ): PendingBattle | ExpeditionStepReport {
    return this.expeditions.beginExpeditionChoice(choiceId);
  }

  public retreatExpedition(): ExpeditionStepReport {
    return this.expeditions.retreatExpedition();
  }

  private finishExpedition(
    retreated: boolean,
    message: string,
    battle?: BattleReport,
  ): ExpeditionStepReport {
    return this.expeditions.finishExpedition(retreated, message, battle);
  }

  private crownLeagueQualification(): ActivityAvailability {
    const hero = this.save.hero;
    const finalArenaIndex = ARENAS.length - 1;
    if (
      hero.highestArena < finalArenaIndex ||
      (hero.arenaWins[finalArenaIndex] ?? 0) < 1
    ) {
      return {
        unlocked: false,
        reason: `Сначала станьте чемпионом турнира «${ARENAS[finalArenaIndex].name}».`,
      };
    }
    const eliteRank = this.heroEliteRank();
    if (eliteRank) {
      return {
        unlocked: true,
        reason: `Место в элите: #${eliteRank}. Вы входите в сетку из ${ELITE_SIZE} бойцов.`,
      };
    }
    const ordinaryRank = this.heroRank();
    if (!ordinaryRank || ordinaryRank > 2) {
      return {
        unlocked: false,
        reason: `Для квалификации нужно место #1–2 обычного рейтинга. Сейчас: #${ordinaryRank || "—"}.`,
      };
    }
    return {
      unlocked: true,
      reason: `Квалификация с места #${ordinaryRank}: только чемпион турнира войдёт в элиту.`,
    };
  }

  public legendHuntAvailability(): ActivityAvailability {
    const eliteRank = this.heroEliteRank();
    if (!eliteRank)
      return {
        unlocked: false,
        reason: "Сначала войдите в элитную тридцатку через Лигу короны.",
      };
    if (eliteRank > LEGEND_COUNT + 1)
      return {
        unlocked: false,
        reason: `Поднимитесь до #${LEGEND_COUNT + 1} в элите. Сейчас: #${eliteRank}.`,
      };
    if (eliteRank === 1)
      return {
        unlocked: false,
        reason:
          "Вы — первая легенда. Осталось защищать корону от претендентов.",
      };
    const lastHunt = this.save.lastLegendHuntDay;
    if (lastHunt !== undefined && this.save.worldDay - lastHunt < 4) {
      return {
        unlocked: false,
        reason: `Новая легенда появится через ${4 - (this.save.worldDay - lastHunt)} дн.`,
      };
    }
    const target = this.currentLegendTarget();
    if (!target)
      return {
        unlocked: false,
        reason: "Следующий соперник в элите пока не определён.",
      };
    return {
      unlocked: true,
      reason: `Следующая ступень: #${eliteRank - 1} ${target.name}. Перепрыгнуть через неё нельзя.`,
    };
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
    return [
      "Первая корона",
      "Правая рука короны",
      "Железное имя",
      "Четвёртое знамя",
      "Последняя легенда",
    ][rank - 1];
  }

  public currentLegendTarget(): EnemyProfile | undefined {
    const rank = this.heroEliteRank();
    if (!rank || rank <= 1 || rank > LEGEND_COUNT + 1) return undefined;
    return this.enemyById(this.save.eliteLeagueMemberIds[rank - 2]);
  }

  public pendingLegendChallenge(): EnemyProfile | undefined {
    return this.save.pendingEliteChallengeId
      ? this.enemyById(this.save.pendingEliteChallengeId)
      : undefined;
  }

  public playCrownLeague(): TournamentReport {
    return this.tournaments.playCrownLeague();
  }

  public beginCrownLeague(): PendingBattle {
    return this.tournaments.beginCrownLeague();
  }

  public huntLegend(): BattleReport {
    this.beginLegendHunt();
    const result = this.runPendingBattleAutomatically();
    if (!result || !("winnerId" in result))
      throw new Error(
        "Автоматический расчёт охоты на легенду не вернул результат.",
      );
    return result as BattleReport;
  }

  public beginLegendHunt(): PendingBattle {
    this.assertNoPendingBattle();
    const availability = this.legendHuntAvailability();
    if (!availability.unlocked) throw new Error(availability.reason);
    this.prepareDayActivity();
    return this.createPendingBattle(
      "legend-hunt",
      "legend-hunt",
      this.currentLegendTarget()!,
      {},
      "legend-hunt",
      undefined,
      {
        eventCursor: this.latestEventId(),
      },
    );
  }

  public defendLegendTitle(): BattleReport {
    this.beginLegendDefense(true);
    const result = this.runPendingBattleAutomatically();
    if (!result || !("winnerId" in result))
      throw new Error(
        "Автоматический расчёт защиты легенды не вернул результат.",
      );
    return result as BattleReport;
  }

  public beginLegendDefense(advanceDay = true): PendingBattle {
    this.assertNoPendingBattle();
    if (this.save.activeExpedition)
      throw new Error("Сначала завершите текущий поход или отступите.");
    const enemy = this.pendingLegendChallenge();
    const rank = this.heroEliteRank();
    if (!enemy || !rank || rank > LEGEND_COUNT)
      throw new Error("Активного вызова легенде нет.");
    return this.createPendingBattle(
      "legend-defense",
      "legend-defense",
      enemy,
      {},
      "legend-hunt",
      undefined,
      {
        advanceDay,
        eventCursor: this.latestEventId(),
      },
    );
  }

  private resolveLegendDefense(advanceDay: boolean): BattleReport {
    this.beginLegendDefense(advanceDay);
    const result = this.runPendingBattleAutomatically();
    if (!result || !("winnerId" in result))
      throw new Error(
        "Автоматический расчёт защиты легенды не вернул результат.",
      );
    return result as BattleReport;
  }

  public equipBest(mode: "power" | "set" = "power"): EquipmentItem[] {
    return this.equipment.equipBest(mode);
  }

  public setAutoEquipBest(enabled: boolean): void {
    return this.equipment.setAutoEquipBest(enabled);
  }

  public setAutoSelectSkills(enabled: boolean): void {
    return this.equipment.setAutoSelectSkills(enabled);
  }

  public setSelectedSkills(skillIds: string[]): SkillDefinition[] {
    return this.equipment.setSelectedSkills(skillIds);
  }

  public setCombatMode(mode: "auto" | "manual"): void {
    return this.equipment.setCombatMode(mode);
  }

  public classChangeAvailability(): ActivityAvailability {
    return this.equipment.classChangeAvailability();
  }

  public changeHeroClass(classId: HeroClass): EquipmentItem[] {
    return this.equipment.changeHeroClass(classId);
  }

  public unequip(slot: EquipmentSlot): void {
    return this.equipment.unequip(slot);
  }

  public sell(itemId: string): number {
    return this.equipment.sell(itemId);
  }

  public canSell(itemId: string): boolean {
    return this.equipment.canSell(itemId);
  }

  public canSellItem(
    item: Readonly<Pick<EquipmentItem, "templateId">>,
  ): boolean {
    return this.equipment.canSellItem(item);
  }

  public canBulkSellItem(
    item: Readonly<
      Pick<EquipmentItem, "templateId" | "worldRelicId" | "rarity">
    >,
  ): boolean {
    return this.equipment.canBulkSellItem(item);
  }

  public sellUnequippedQuote(): { count: number; value: number } {
    return this.equipment.sellUnequippedQuote();
  }

  public sellUnequipped(): { count: number; value: number } {
    return this.equipment.sellUnequipped();
  }

  public temperingMarkPrice(): number {
    return this.equipment.temperingMarkPrice();
  }

  public buyTemperingMarks(quantity = 1): { quantity: number; cost: number } {
    return this.equipment.buyTemperingMarks(quantity);
  }

  public buy(index: number): EquipmentItem {
    return this.equipment.buy(index);
  }

  public upgradeCost(itemId: string): number {
    return this.equipment.upgradeCost(itemId);
  }

  public upgradeCostFor(
    item: Readonly<Pick<EquipmentItem, "enhancement">>,
  ): number {
    return this.equipment.upgradeCostFor(item);
  }

  public upgradeItem(itemId: string): EquipmentItem {
    return this.equipment.upgradeItem(itemId);
  }

  public leaderboard(): LeaderboardEntry[] {
    return this.leaderboardAll().slice(0, 100);
  }

  public heroRank(): number | undefined {
    const index = this.leaderboardAll().findIndex(
      (entry) => entry.id === "hero",
    );
    return index >= 0 ? index + 1 : undefined;
  }

  private leaderboardAll(): LeaderboardEntry[] {
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

  private leaderboardEntry(
    id: string,
    elite = false,
  ): LeaderboardEntry | undefined {
    const school = this.fighterSchool(id);
    if (id === "hero") {
      const hero = this.save.hero;
      return heroLeaderboardEntry(hero, {
        rating: elite
          ? (this.save.eliteRatings[id] ?? hero.rating)
          : hero.rating,
        crownLeagueWins: hero.crownLeagueWins,
        ...(school && {
          schoolName: school.name,
          mentorName: school.mentorName,
          isMentor: school.isMentor,
        }),
      });
    }
    const enemy = this.enemyById(id);
    if (!enemy) return undefined;
    return enemyLeaderboardEntry(enemy, {
      rating: elite
        ? (this.save.eliteRatings[id] ?? enemy.rating)
        : enemy.rating,
      crownLeagueWins: this.save.eliteCrownWins[id] ?? 0,
      ...(school && {
        schoolName: school.name,
        mentorName: school.mentorName,
        isMentor: school.isMentor,
      }),
    });
  }

  private ensureEliteLeague(): void {
    const finalArenaIndex = ARENAS.length - 1;
    const valid = new Set(
      this.save.enemies.filter((enemy) => enemy.alive).map((enemy) => enemy.id),
    );
    if (this.save.eliteLeagueMemberIds.includes("hero")) valid.add("hero");
    this.save.eliteLeagueMemberIds = this.save.eliteLeagueMemberIds
      .filter(
        (id, index, values) => valid.has(id) && values.indexOf(id) === index,
      )
      .slice(0, ELITE_SIZE);

    const current = new Set(this.save.eliteLeagueMemberIds);
    let eligible = this.save.enemies.filter(
      (enemy) =>
        enemy.alive &&
        enemy.arenaIndex === finalArenaIndex &&
        enemy.tournamentWins > 0 &&
        !current.has(enemy.id),
    );
    while (
      this.save.eliteLeagueMemberIds.length + eligible.length <
      ELITE_SIZE
    ) {
      const recruit = this.createEnemy(finalArenaIndex);
      recruit.tournamentWins = Math.max(1, recruit.tournamentWins);
      recruit.rating = this.enemyWorldRating(recruit);
      this.save.enemies.push(recruit);
      eligible.push(recruit);
    }
    eligible.sort(
      (a, b) => this.enemyPower(b) + b.rating - (this.enemyPower(a) + a.rating),
    );
    this.save.eliteLeagueMemberIds.push(
      ...eligible
        .slice(0, ELITE_SIZE - this.save.eliteLeagueMemberIds.length)
        .map((enemy) => enemy.id),
    );
    this.save.eliteLeagueMemberIds.forEach((id, index) => {
      const fighter = this.fighterById(id);
      this.save.eliteRatings[id] ??=
        6200 -
        index * 45 +
        (fighter
          ? Math.round(
              (fighter.level +
                (id === "hero"
                  ? this.heroPower()
                  : this.enemyPower(fighter as EnemyProfile))) /
                8,
            )
          : 0);
      this.save.eliteCrownWins[id] ??= 0;
    });
  }

  private adjustEliteRating(id: string, amount: number): void {
    if (!this.save.eliteLeagueMemberIds.includes(id) && id !== "hero") return;
    const fallback =
      id === "hero"
        ? this.save.hero.rating
        : (this.enemyById(id)?.rating ?? 1000);
    this.save.eliteRatings[id] = Math.max(
      1000,
      (this.save.eliteRatings[id] ?? fallback) + amount,
    );
  }

  private sortEliteByRating(): void {
    this.save.eliteLeagueMemberIds.sort(
      (first, second) =>
        (this.save.eliteRatings[second] ?? 0) -
        (this.save.eliteRatings[first] ?? 0),
    );
  }

  private swapEliteMembers(winnerId: string, loserId: string): void {
    const winnerIndex = this.save.eliteLeagueMemberIds.indexOf(winnerId);
    const loserIndex = this.save.eliteLeagueMemberIds.indexOf(loserId);
    if (winnerIndex < 0 || loserIndex < 0) return;
    [
      this.save.eliteLeagueMemberIds[winnerIndex],
      this.save.eliteLeagueMemberIds[loserIndex],
    ] = [
      this.save.eliteLeagueMemberIds[loserIndex],
      this.save.eliteLeagueMemberIds[winnerIndex],
    ];
    const high =
      Math.max(
        this.save.eliteRatings[winnerId] ?? 0,
        this.save.eliteRatings[loserId] ?? 0,
      ) + 1;
    this.save.eliteRatings[winnerId] = high;
    this.save.eliteRatings[loserId] = Math.max(1000, high - 12);
  }

  private promoteIntoElite(id: string): void {
    if (this.save.eliteLeagueMemberIds.includes(id)) return;
    const demoted = this.save.eliteLeagueMemberIds.pop();
    if (demoted) {
      delete this.save.eliteRatings[demoted];
      delete this.save.eliteCrownWins[demoted];
      this.event(
        "promotion",
        `${this.fighterById(demoted)?.name ?? "Последний участник"} покинул элиту и вернулся в обычный рейтинг.`,
      );
    }
    const tailRating = this.save.eliteLeagueMemberIds.length
      ? (this.save.eliteRatings[
          this.save.eliteLeagueMemberIds[
            this.save.eliteLeagueMemberIds.length - 1
          ]
        ] ?? 4200)
      : 4200;
    this.save.eliteLeagueMemberIds.push(id);
    this.save.eliteRatings[id] = Math.max(1000, tailRating - 1);
    this.save.eliteCrownWins[id] ??= 0;
    this.event(
      "promotion",
      `${this.fighterById(id)?.name ?? "Претендент"} выиграл квалификацию и вошёл в элитную тридцатку.`,
    );
  }

  private syncCrownSet(): void {
    const leaderId = this.save.eliteLeagueMemberIds[0];
    if (!leaderId) return;
    const templateIds = new Set(
      EQUIPMENT_SETS.find((set) => set.id === CROWN_SET_ID)?.pieces ?? [],
    );
    const strip = (fighter: HeroProfile | EnemyProfile) => {
      const removed = new Set<string>();
      const equipment =
        fighter.id === "hero"
          ? (fighter as HeroProfile).inventory
          : (fighter as EnemyProfile).equipment;
      equipment
        .filter((item) => templateIds.has(item.templateId))
        .forEach((item) => removed.add(item.id));
      if (fighter.id === leaderId) return;
      if (fighter.id === "hero")
        (fighter as HeroProfile).inventory = equipment.filter(
          (item) => !removed.has(item.id),
        );
      else
        (fighter as EnemyProfile).equipment = equipment.filter(
          (item) => !removed.has(item.id),
        );
      (Object.keys(fighter.equipped) as EquipmentSlot[]).forEach((slot) => {
        if (removed.has(fighter.equipped[slot]!)) delete fighter.equipped[slot];
      });
    };
    strip(this.save.hero);
    this.save.enemies.forEach(strip);
    if (this.save.crownSetOwnerId === leaderId) return;
    const leader = this.fighterById(leaderId);
    if (!leader) return;
    const owned =
      leader.id === "hero"
        ? (leader as HeroProfile).inventory
        : (leader as EnemyProfile).equipment;
    templateIds.forEach((templateId) => {
      if (owned.some((item) => item.templateId === templateId)) return;
      const item = createItem(leader.level + 4, {
        classId: leader.classId,
        templateId,
        rarity: "mythic",
        randomSource: this.random.loot,
      });
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

  private recordArenaChampionship(
    enemy: EnemyProfile,
    arenaIndex: number,
  ): void {
    enemy.tournamentWins += 1;
    enemy.arenaTournamentWins ??= ARENAS.map(() => 0);
    enemy.arenaTournamentWins[arenaIndex] =
      (enemy.arenaTournamentWins[arenaIndex] ?? 0) + 1;
    this.recordEquipmentDeeds(
      enemy,
      "championship",
      `${ARENAS[arenaIndex].name}, день ${this.save.worldDay}`,
    );
    const rewardStage = [3, 6, 10].indexOf(enemy.tournamentWins);
    if (rewardStage >= 0 && enemy.factionId) {
      const slots: EquipmentSlot[][] = [
        ["hands", "feet"],
        ["head", "chest"],
        ["weapon", "offhand"],
      ];
      ITEM_TEMPLATES.filter(
        (template) =>
          template.exclusiveToFaction === enemy.factionId &&
          slots[rewardStage].includes(template.slot),
      ).forEach((template) => {
        const item = createItem(enemy.level, {
          classId: enemy.classId,
          templateId: template.id,
          rarity: rewardStage === 2 ? "mythic" : "legendary",
          randomSource: this.random.loot,
        });
        if (considerNpcLoot(enemy, item))
          this.recordEnemyHistory(
            enemy,
            `Фракция наградила за ${enemy.tournamentWins} чемпионства предметом «${item.name}».`,
          );
      });
    }
  }

  private addItem(item: EquipmentItem): void {
    return this.equipment.addItem(item);
  }

  private synchronizeOwnedWorldRelic(
    item: EquipmentItem,
    history?: string,
  ): WorldRelicRecord | undefined {
    return this.equipment.synchronizeOwnedWorldRelic(item, history);
  }

  private hasEraLaw(
    id: Parameters<typeof eraLawModifiers>[0][number],
  ): boolean {
    return this.save.legacy.activeLawIds.includes(id);
  }

  private epochRewards(
    baseExperience: number,
    baseGold: number,
    context: RewardContext,
  ): { experience: number; gold: number } {
    const modifiers = rewardModifiers(
      this.save.legacy.cycle,
      this.save.legacy.activeLawIds,
      context,
    );
    const season = worldSeasonRule(this.save.worldSeason?.ruleId);
    const dungeonMultiplier =
      context === "dungeon" ? season.dungeonRewardMultiplier : 1;
    return {
      experience: Math.max(
        0,
        Math.round(
          baseExperience * modifiers.experienceMultiplier * dungeonMultiplier,
        ),
      ),
      gold: Math.max(
        0,
        Math.round(
          baseGold *
            modifiers.goldMultiplier *
            season.goldMultiplier *
            dungeonMultiplier,
        ),
      ),
    };
  }

  private controlledArenaReward(
    arenaId: string,
    reward: { experience: number; gold: number },
  ): { experience: number; gold: number } {
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
    const targetTemplates = ITEM_TEMPLATES.filter(
      (template) =>
        !template.exclusiveToBoss &&
        !template.exclusiveToElite &&
        !template.exclusiveToFaction &&
        (!target.slot || template.slot === target.slot) &&
        (!target.setId || template.setId === target.setId) &&
        (template.allowedClasses === "all" ||
          template.allowedClasses.includes(this.save.hero.classId)),
    );
    if (targetTemplates.length === 0)
      return createItem(level, { ...options, randomSource: this.random.loot });
    const pool = Array.from({ length: 6 }, () =>
      createItem(level, { ...options, randomSource: this.random.loot }),
    );
    targetTemplates.slice(0, 3).forEach((template) => {
      pool.push(
        createItem(level, {
          ...options,
          templateId: template.id,
          randomSource: this.random.loot,
        }),
      );
    });
    const result = rollTargetedLoot(
      pool,
      target,
      this.save.lootPity,
      this.random.loot,
      {
        baseChance: Math.min(0.8, 0.18 + Math.max(0, targetChanceBonus)),
      },
    );
    this.save.lootPity = result.pity;
    return result.item;
  }

  private factionAdjustedReward(
    reward: { experience: number; gold: number },
    modifier: "tournamentReward" | "bossReward" | "contractReward",
    factionId?: string,
  ): { experience: number; gold: number } {
    const bonus = factionId
      ? unlockedFactionPerks(
          factionId,
          this.save.hero.factionReputation[factionId] ?? 0,
        ).reduce(
          (total, perk) =>
            total +
            (typeof perk.modifiers[modifier] === "number"
              ? (perk.modifiers[modifier]! as number)
              : 0),
          0,
        )
      : factionModifier(this.save.hero.factionReputation, modifier);
    const multiplier = 1 + bonus;
    return {
      experience: Math.round(reward.experience * multiplier),
      gold: Math.round(reward.gold * multiplier),
    };
  }

  private awardCrownSeason(
    fighterId: string,
    result: "win" | "loss" | "defense" | "champion",
  ): void {
    this.save.crownSeason = awardCrownSeasonPoints(
      this.save.crownSeason,
      fighterId,
      result,
    );
    awardWorldEliteSeasonPoints(
      this.save.worldSeason!,
      fighterId,
      result,
      this.fighterById(fighterId)?.name,
    );
  }

  private syncCrownSeason(): void {
    return this.seasons.syncCrownSeason();
  }

  private syncNarrativeEvent(): void {
    if (this.save.pendingNarrativeEventId) return;
    const candidates = availableNarrativeEvents(
      {
        day: this.save.worldDay,
        heroLevel: this.save.hero.level,
        classId: this.save.hero.classId,
        gold: this.save.hero.gold,
        highestArena: this.save.hero.highestArena,
        injuries: this.save.hero.injuries.filter(
          (injury) => injury.remainingDays > 0,
        ).length,
        rivalries: Object.keys(this.save.hero.rivalries).length,
      },
      this.save.seenNarrativeEventIds,
    );
    if (candidates.length === 0) return;
    this.save.pendingNarrativeEventId = this.random.world.pick(candidates).id;
    const event = this.pendingNarrativeEvent()!;
    this.event("system", `Новое событие: ${event.title}.`, {
      kind: "system",
      code: "narrative-pending",
      values: { eventId: event.id },
    });
  }

  private syncDerivedEraProgress(): void {
    let state = this.save.eraChallengeProgress;
    const arenaChampionships = this.save.hero.arenaWins.filter(
      (wins) => wins > 0,
    ).length;
    state = recordEraMetric(
      state,
      "arenaChampionships",
      arenaChampionships,
      "max",
    );
    state = recordEraMetric(
      state,
      "uniqueDungeonsCompleted",
      Object.keys(this.save.dungeonClears).length,
      "max",
    );
    state = recordEraMetric(
      state,
      "uniqueRivalsDefeated",
      state.defeatedRivalIds.length,
      "max",
    );
    state = recordEraMetric(
      state,
      "awakenedRelics",
      this.save.hero.inventory.filter((item) => (item.relicTier ?? 0) >= 3)
        .length,
      "max",
    );
    state = recordEraMetric(
      state,
      "alliedFactions",
      Object.values(this.save.hero.factionReputation).filter(
        (value) => value >= 45,
      ).length,
      "max",
    );
    state = recordEraMetric(
      state,
      "classesMastered",
      state.masteredClassIds.length,
      "max",
    );
    state = recordEraMetric(
      state,
      "longestWinStreak",
      state.metrics.longestWinStreak ?? 0,
      "max",
    );
    const challenge = this.currentEraChallenge();
    if (challenge) {
      const completed = challenge.objectives
        .filter(
          (objective) =>
            evaluateEraObjective(objective, state.metrics).completed,
        )
        .map((objective) => objective.id);
      const rewarded = new Set(state.rewardedObjectiveIds ?? []);
      challenge.objectives
        .filter(
          (objective) =>
            completed.includes(objective.id) && !rewarded.has(objective.id),
        )
        .forEach((objective) => {
          rewarded.add(objective.id);
          const gold = 500 + challenge.cycle * 250;
          this.save.hero.gold += gold;
          this.save.hero.temperingMarks += 1;
          this.save.legacy.seals += 1;
          this.save.legacy.totalSealsEarned += 1;
          this.event(
            "system",
            `Испытание эпохи «${objective.name}» завершено: +1 печать наследия, +1 печать закалки и ${gold} золота.`,
            {
              kind: "system",
              code: "era-objective-reward",
              values: {
                objectiveId: objective.id,
                cycle: challenge.cycle,
                gold,
              },
            },
          );
        });
      state.completedObjectiveIds = completed;
      state.rewardedObjectiveIds = [...rewarded];
    }
    this.save.eraChallengeProgress = state;
  }

  private recordEraBattle(heroWon: boolean, enemy: EnemyProfile): void {
    let state = this.save.eraChallengeProgress;
    state.currentWinStreak = heroWon ? state.currentWinStreak + 1 : 0;
    state = recordEraMetric(
      state,
      "longestWinStreak",
      state.currentWinStreak,
      "max",
    );
    if (heroWon) {
      state.masteredClassIds = [
        ...new Set([...state.masteredClassIds, this.save.hero.classId]),
      ];
      if (this.save.enemies.some((candidate) => candidate.id === enemy.id)) {
        state.defeatedRivalIds = [
          ...new Set([...state.defeatedRivalIds, enemy.id]),
        ];
      }
    }
    this.save.eraChallengeProgress = state;
    this.syncDerivedEraProgress();
  }

  private syncEraChallenge(): void {
    this.save.eraChallengeProgress = createEraChallengeProgress(
      this.save.legacy.cycle,
    );
    if (this.save.legacy.cycle < 2) return;
    const challenge = eraChallengeFor(this.save.legacy.cycle);
    this.save.enemies.forEach((enemy) => {
      const mutation = challenge.mutations[enemy.classId];
      enemy.eraMutationId = mutation.id;
      enemy.eraMutationPotency = mutation.potency;
    });
  }

  private minimumRewardRarity(rarity: Rarity, context: RewardContext): Rarity {
    const modifiers = rewardModifiers(
      this.save.legacy.cycle,
      this.save.legacy.activeLawIds,
      context,
    );
    if (modifiers.forcedMinimumRarity) {
      return RARITY_ORDER[
        Math.max(
          RARITY_ORDER.indexOf(rarity),
          RARITY_ORDER.indexOf(modifiers.forcedMinimumRarity),
        )
      ];
    }
    return improveMinimumRarity(rarity, modifiers.minimumRaritySteps);
  }

  private controlledDungeonMinimum(dungeonId: string, rarity: Rarity): Rarity {
    const controller =
      this.save.factionControl?.dungeonControllers?.[dungeonId];
    return controller
      ? improveFactionMinimumRarity(rarity, controller)
      : rarity;
  }

  private createWorldBattleSession(
    enemy: EnemyProfile,
    options: CombatOptions = {},
    context:
      | "arena"
      | "dungeon"
      | "duel"
      | "boss"
      | "crown-league"
      | "legend-hunt" = "arena",
    hero: HeroProfile = this.save.hero,
    randomSource = options.randomSource ?? this.random.combat,
  ): BattleSession {
    enemy.heroMemory = decayEnemyStyleMemory(
      enemy.heroMemory ?? createEnemyStyleMemory(this.save.worldDay),
      this.save.worldDay,
    );
    const epoch = epochDifficultyModifiers(this.save.legacy.cycle);
    const laws = eraLawModifiers(this.save.legacy.activeLawIds);
    const bossPower = context === "boss" ? laws.bossPowerMultiplier : 1;
    const heroDefense = 1 + laws.allFighterDefenseFlat / 100;
    const enemyDefense =
      (1 + (laws.allFighterDefenseFlat + laws.enemyDefenseFlat) / 100) *
      epoch.enemyDefenseMultiplier *
      bossPower;
    const bossCritBonus =
      context === "boss"
        ? Object.entries(this.save.hero.factionReputation)
            .flatMap(([factionId, reputation]) =>
              unlockedFactionPerks(factionId, reputation),
            )
            .reduce(
              (total, perk) => total + (perk.modifiers.combatStats?.crit ?? 0),
              0,
            )
        : 0;
    const combatHero: HeroProfile =
      bossCritBonus > 0
        ? {
            ...hero,
            injuries: [
              ...hero.injuries,
              {
                id: "faction-boss-knowledge",
                name: "Список слабостей",
                description:
                  "Репутационная подготовка повышает критический шанс против босса.",
                remainingDays: 1,
                stats: { crit: bossCritBonus },
                gainedDay: this.save.worldDay,
              },
            ],
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
        health:
          (options.enemyStatMultipliers?.health ?? 1) *
          epoch.enemyHealthMultiplier *
          bossPower,
        attack:
          (options.enemyStatMultipliers?.attack ?? 1) *
          epoch.enemyAttackMultiplier *
          bossPower,
        defense: (options.enemyStatMultipliers?.defense ?? 1) * enemyDefense,
      },
    });
  }

  private createPendingBattle(
    kind: PendingBattle["kind"],
    activityId: string,
    enemy: EnemyProfile,
    options: CombatOptions,
    combatContext:
      "arena" | "dungeon" | "duel" | "boss" | "crown-league" | "legend-hunt",
    tournament?: PendingTournamentState,
    pendingContext?: PendingBattle["context"],
    heroOverride: HeroProfile = this.save.hero,
  ): PendingBattle {
    const seed = `${this.save.tournamentRuleSeed}:pending:${kind}:${this.save.worldDay}:${this.random.combat.int(0, 0x7fffffff)}`;
    const detachedEnemy = JSON.parse(JSON.stringify(enemy)) as EnemyProfile;
    const session = this.createWorldBattleSession(
      detachedEnemy,
      options,
      combatContext,
      heroOverride,
      new SeededRandom(seed),
    );
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
      throw new Error(
        "День мира изменился во время боя. Восстановите или отмените незавершённый бой.",
      );
    }
    return pending;
  }

  private assertNoPendingBattle(): void {
    if (this.save.pendingBattle)
      throw new Error("Сначала завершите или отмените уже начатый бой.");
  }

  private recordMutationVictory(enemy: EnemyProfile, heroWon: boolean): void {
    if (!heroWon || !enemy.eraMutationId) return;
    this.save.eraChallengeProgress = recordEraMetric(
      this.save.eraChallengeProgress,
      "mutationVictories",
      1,
    );
    this.syncDerivedEraProgress();
  }

  private recordEnemyHistory(enemy: EnemyProfile, message: string): void {
    enemy.history.push(message);
    if (enemy.history.length > 50)
      enemy.history.splice(0, enemy.history.length - 50);
  }

  private legacyEnemy(archive: LegacyHeroRecord): EnemyProfile {
    const influence = describeLegacyArchiveInfluence(archive);
    const opponent = influence.opponent;
    const powerMultiplier = opponent?.powerMultiplier ?? 1;
    const equipment = archive.equipment.map((item) => ({
      ...item,
      id: this.randomId("legacy-item"),
      stats: Object.fromEntries(
        Object.entries(item.stats).map(([stat, value]) => [
          stat,
          Math.max(0, Math.round((value ?? 0) * powerMultiplier)),
        ]),
      ) as Partial<Stats>,
      relicHistory: [...(item.relicHistory ?? [])],
      relicFeats: [...(item.relicFeats ?? [])],
      relicProperties: item.relicProperties?.map((property) => ({
        ...property,
      })),
      allowedClasses:
        item.allowedClasses === "all"
          ? ("all" as const)
          : [...item.allowedClasses],
    }));
    const equipped: EnemyProfile["equipped"] = {};
    equipment.forEach((item) => {
      equipped[item.slot] = item.id;
    });
    return {
      id: opponent?.id ?? `legacy-hero-${archive.cycle}`,
      name: archive.name,
      title: opponent
        ? `${archive.title} · ${opponent.kind === "legacy-boss" ? "босс" : "легендарный соперник"} эпохи ${archive.cycle}`
        : `${archive.title} · герой эпохи ${archive.cycle}`,
      origin:
        opponent?.kind === "legendary-rival"
          ? "Дорога между эпохами"
          : "Зал отзвуков",
      classId: archive.classId,
      level: opponent?.level ?? archive.level,
      experience: 0,
      rating: opponent?.rating ?? archive.rating,
      wins: archive.wins,
      losses: archive.losses,
      tournamentWins: archive.tournamentWins,
      arenaTournamentWins: ARENAS.map((_, index) =>
        index === ARENAS.length - 1 ? archive.tournamentWins : 0,
      ),
      kills: archive.kills,
      arenaIndex: opponent?.arenaIndex ?? ARENAS.length - 1,
      arenaWins: archive.crownLeagueWins,
      alive: true,
      equipment,
      equipped,
      history: [
        `Завершил эпоху ${archive.cycle} на ${archive.worldDay}-й день.`,
      ],
      traitIds: [],
      scarIds: [],
      injuries: [],
      adaptationIds: [],
      tacticalStyle: "balanced",
      heroMemory: inheritArchiveStyleMemory(archive, this.save.worldDay),
      carriedFromCycle: archive.cycle,
      goal: opponent?.kind === "legacy-boss" ? "vengeance" : "elite",
      joinedDay: 1,
    };
  }

  private recordHeroEncounter(
    enemy: EnemyProfile,
    heroWon: boolean,
    turns: BattleReport["turns"],
    killed = false,
  ): void {
    const hero = this.save.hero;
    this.recordEraBattle(heroWon, enemy);
    if (heroWon) {
      if (killed) this.recordEquipmentDeeds(hero, "lethal", enemy.name);
      if (
        enemy.legendSinceDay !== undefined ||
        this.save.eliteLeagueMemberIds.slice(0, LEGEND_COUNT).includes(enemy.id)
      ) {
        this.recordEquipmentDeeds(hero, "legend", enemy.name);
      }
      this.recordSurvivalDeed(hero, enemy.name, turns);
    } else {
      this.recordSurvivalDeed(enemy, hero.name, turns);
    }
    const isTournamentFighter = this.save.enemies.some(
      (candidate) => candidate.id === enemy.id,
    );
    if (!isTournamentFighter) {
      this.applyBattleConsequences(heroWon, enemy);
      return;
    }
    const record = hero.rivalries[enemy.id] ?? {
      enemyId: enemy.id,
      name: enemy.name,
      classId: enemy.classId,
      wins: 0,
      losses: 0,
      killed: false,
      lastMetDay: this.save.worldDay,
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
    const observation = recordEnemyStyleMemory(
      enemy.heroMemory,
      hero,
      turns,
      this.save.worldDay,
    );
    enemy.heroMemory = observation.memory;
    record.memoryStage = observation.memory.stage;
    record.memoryFamiliarity = observation.memory.familiarity;
    record.memorySimilarity = observation.memory.currentSimilarity;
    record.countermeasureIds = [...observation.memory.countermeasureIds];
    hero.rivalries[enemy.id] = record;

    if (observation.update.stage !== observation.update.previousStage) {
      const stage = memoryStageDefinition(observation.update.stage);
      this.featureChanges.push({
        fighterId: enemy.id,
        fighterName: enemy.name,
        kind: "Адаптация",
        name: `Память: ${stage.name}`,
        description: stage.description,
        stats: {},
      });
      this.recordEnemyHistory(
        enemy,
        `Начал лучше читать стиль ${hero.name}: «${stage.name}».`,
      );
      this.event(
        "battle",
        `${enemy.name}: ${stage.name.toLowerCase()} стиль ${hero.name}.`,
      );
    }
    observation.update.newCountermeasureIds.forEach((id) => {
      const countermeasure = countermeasureDefinition(id);
      if (!countermeasure) return;
      this.featureChanges.push({
        fighterId: enemy.id,
        fighterName: enemy.name,
        kind: "Адаптация",
        name: countermeasure.name,
        description: `${countermeasure.description} ${countermeasure.effect}`,
        stats: {},
      });
      this.recordEnemyHistory(
        enemy,
        `Подготовил против ${hero.name} контрмеру «${countermeasure.name}».`,
      );
      this.event(
        "battle",
        `${enemy.name} подготовил контрмеру против знакомого стиля: ${countermeasure.name}.`,
      );
    });
    this.applyBattleConsequences(heroWon, enemy);
  }

  private applyBattleConsequences(heroWon: boolean, enemy: EnemyProfile): void {
    const hero = this.save.hero;
    if (heroWon) {
      this.gainRelicRenown(enemy);
      if (hero.traitIds.length < 3 && hero.wins >= hero.traitIds.length * 12) {
        const trait = FIGHTER_TRAITS.find(
          (candidate) => !hero.traitIds.includes(candidate.id),
        );
        if (trait) {
          hero.traitIds.push(trait.id);
          this.featureChanges.push({
            fighterId: hero.id,
            fighterName: hero.name,
            kind: "Черта",
            name: trait.name,
            description: trait.description,
            stats: { ...trait.stats },
          });
          this.event("system", `${hero.name} приобрёл черту «${trait.name}».`);
        }
      }
      return;
    }
    if (
      this.random.world.chance(ACTIVE_INJURY_CHANCE) &&
      hero.injuries.length < 2
    ) {
      const injuries = [
        {
          id: "bruised-ribs",
          name: "Ушиб рёбер",
          description: "Боль мешает держать удар.",
          stats: { health: -18, defense: -2 },
        },
        {
          id: "cut-palm",
          name: "Рассечённая ладонь",
          description: "Хват временно ослаблен.",
          stats: { attack: -4 },
        },
        {
          id: "sprained-ankle",
          name: "Растяжение",
          description: "Труднее перехватывать темп.",
          stats: { speed: -5 },
        },
      ];
      const injury = this.random.world.pick(injuries);
      if (!hero.injuries.some((candidate) => candidate.id === injury.id)) {
        hero.injuries.push({
          ...injury,
          remainingDays: this.random.world.int(2, 4),
          gainedDay: this.save.worldDay,
        });
        this.featureChanges.push({
          fighterId: hero.id,
          fighterName: hero.name,
          kind: "Травма",
          name: injury.name,
          description: `${injury.description} Временный эффект до восстановления.`,
          stats: { ...injury.stats },
        });
        this.event(
          "system",
          `${hero.name} получил травму «${injury.name}». Она заживёт со временем.`,
        );
      }
    }
    if (
      hero.scarIds.length < 3 &&
      this.save.hero.highestArena >= 2 &&
      this.random.world.chance(0.1)
    ) {
      const scar = FIGHTER_SCARS.find(
        (candidate) => !hero.scarIds.includes(candidate.id),
      );
      if (scar) {
        hero.scarIds.push(scar.id);
        this.featureChanges.push({
          fighterId: hero.id,
          fighterName: hero.name,
          kind: "Шрам",
          name: scar.name,
          description: scar.description,
          stats: { ...scar.stats },
        });
        this.event(
          "system",
          `${hero.name} выжил и сохранил шрам «${scar.name}».`,
        );
      }
    }
  }

  private gainRelicRenown(enemy: EnemyProfile): void {
    if (!this.isFeatureUnlocked("equipment-legacy")) return;
    const equippedIds = new Set(Object.values(this.save.hero.equipped));
    this.save.hero.inventory
      .filter(
        (item) =>
          equippedIds.has(item.id) && rarityAtLeast(item.rarity, "legendary"),
      )
      .forEach((item) => {
        item.relicRenown =
          (item.relicRenown ?? 0) +
          (enemy.level >= this.save.hero.level + 2 ? 2 : 1);
        item.relicHistory ??= [];
        const previousTier = item.relicTier ?? 0;
        let nextTier = previousTier;
        RELIC_TIER_THRESHOLDS.forEach((threshold, tier) => {
          if ((item.relicRenown ?? 0) >= threshold)
            nextTier = tier as 0 | 1 | 2 | 3;
        });
        const notable =
          enemy.legendSinceDay !== undefined ||
          this.save.eliteLeagueMemberIds.includes(enemy.id) ||
          enemy.tournamentWins >= 8;
        item.relicFeats ??= [];
        if (notable) {
          const feat = `Победа над ${enemy.name}, ${enemy.title}`;
          if (!item.relicFeats.includes(feat))
            item.relicFeats = [...item.relicFeats, feat].slice(-40);
        }
        let previousStats: Partial<Stats> | undefined;
        if (nextTier > previousTier) {
          item.relicTier = nextTier;
          item.relicHistory.push(
            `День ${this.save.worldDay}: ступень наследия ${nextTier} после боя с ${enemy.name}.`,
          );
          item.appearanceVariant = `${item.relicPath ?? "unbound"}-${nextTier}`;
          const growth = nextTier === 1 ? 0.04 : nextTier === 2 ? 0.06 : 0.08;
          previousStats = { ...item.stats };
          item.stats = Object.fromEntries(
            Object.entries(item.stats).map(([stat, value]) => [
              stat,
              Math.max(
                Number(value) + 1,
                Math.round(Number(value) * (1 + growth)),
              ),
            ]),
          );
        }
        if (item.worldRelicId) {
          const recordIndex =
            this.save.worldRelics?.findIndex(
              (candidate) => candidate.id === item.worldRelicId,
            ) ?? -1;
          if (recordIndex >= 0) {
            const record = synchronizeWorldRelic(
              this.save.worldRelics![recordIndex],
              item,
              notable
                ? `День ${this.save.worldDay}: реликвия участвовала в победе над ${enemy.name}.`
                : undefined,
              this.save.worldDay,
            );
            this.save.worldRelics![recordIndex] = record;
            Object.assign(item, record.item, {
              stats: { ...record.item.stats },
              relicHistory: [...(record.item.relicHistory ?? [])],
              relicFeats: [...(record.item.relicFeats ?? [])],
              relicProperties: (record.item.relicProperties ?? []).map(
                (property) => ({ ...property }),
              ),
            });
          }
        }
        if (!previousStats) return;
        const statGrowth = Object.fromEntries(
          Object.entries(item.stats).map(([stat, value]) => [
            stat,
            Number(value) - Number(previousStats[stat as keyof Stats] ?? 0),
          ]),
        );
        this.featureChanges.push({
          fighterId: this.save.hero.id,
          fighterName: this.save.hero.name,
          kind: "Наследие",
          name: `${item.relicName ?? item.name}: ступень ${nextTier}`,
          description:
            "Снаряжение запомнило победу и навсегда усилило собственные характеристики.",
          stats: statGrowth,
        });
        this.event(
          "loot",
          `${item.relicName ?? item.name} достиг ступени наследия ${nextTier}.`,
        );
      });
  }

  private recordEquipmentDeeds(
    fighter: HeroProfile | EnemyProfile,
    kind: EquipmentDeedKind,
    witness: string,
  ): void {
    if (fighter.id === "hero" && !this.isFeatureUnlocked("equipment-legacy"))
      return;
    const inventory =
      fighter.id === "hero"
        ? (fighter as HeroProfile).inventory
        : (fighter as EnemyProfile).equipment;
    const equipped = new Set(Object.values(fighter.equipped));
    inventory
      .filter((item) => equipped.has(item.id))
      .forEach((item) => {
        const deed = recordEquipmentDeed(
          item,
          kind,
          witness,
          this.save.worldDay,
        );
        if (deed.item === item) return;
        Object.assign(item, deed.item);
        const recordIndex = (this.save.worldRelics ?? []).findIndex(
          (record) => record.id === item.worldRelicId,
        );
        if (recordIndex >= 0) {
          const record = synchronizeWorldRelic(
            this.save.worldRelics![recordIndex],
            item,
            undefined,
            this.save.worldDay,
          );
          this.save.worldRelics![recordIndex] = record;
          Object.assign(item, record.item, {
            stats: { ...record.item.stats },
            relicHistory: [...(record.item.relicHistory ?? [])],
            relicFeats: [...(record.item.relicFeats ?? [])],
            relicProperties: (record.item.relicProperties ?? []).map(
              (property) => ({ ...property }),
            ),
          });
        }
        if (!deed.changed || !deed.property || fighter.id !== "hero") return;
        this.featureChanges.push({
          fighterId: fighter.id,
          fighterName: fighter.name,
          kind: "Наследие",
          name: `${item.relicName ?? item.name}: ${deed.property.name}`,
          description: deed.property.description,
          stats: deed.growth,
        });
        this.event(
          "loot",
          `${item.relicName ?? item.name} приобрёл свойство «${deed.property.name}».`,
        );
      });
  }

  private recordSurvivalDeed(
    fighter: HeroProfile | EnemyProfile,
    opponentName: string,
    turns: BattleReport["turns"],
  ): void {
    const health = turns.map((turn) =>
      turn.actorId === fighter.id ? turn.actorHealth : turn.targetHealth,
    );
    const livingHealth = health.filter((value) => value > 0);
    if (livingHealth.length === 0) return;
    const maximum = combatantSnapshot(fighter).maxHealth;
    if (Math.min(...livingHealth) <= maximum * 0.1) {
      this.recordEquipmentDeeds(fighter, "survival", opponentName);
    }
  }

  private healDailyInjuries(): void {
    const update = (profile: HeroProfile | EnemyProfile) => {
      profile.injuries.forEach((injury) => {
        injury.remainingDays = Math.max(0, injury.remainingDays - 1);
      });
      const healed = profile.injuries.filter(
        (injury) => injury.remainingDays === 0,
      );
      profile.injuries = profile.injuries.filter(
        (injury) => injury.remainingDays > 0,
      );
      if (profile.id === "hero")
        healed.forEach((injury) =>
          this.event(
            "system",
            `${profile.name}: травма «${injury.name}» зажила.`,
          ),
        );
    };
    update(this.save.hero);
    this.save.enemies.filter((enemy) => enemy.alive).forEach(update);
  }

  private applyOfficialTournamentRecovery(): void {
    const days = Math.max(
      0,
      Math.floor(
        factionModifier(this.save.hero.factionReputation, "injuryRecoveryDays"),
      ),
    );
    if (days === 0) return;
    this.save.hero.injuries.forEach((injury) => {
      injury.remainingDays = Math.max(0, injury.remainingDays - days);
    });
  }

  private refreshContracts(force: boolean): void {
    return this.contracts.refreshContracts(force);
  }

  private advanceContract(objective: ContractObjective): void {
    return this.contracts.advanceContract(objective);
  }

  private cleanupVisualTestCatalog(): void {
    this.save.migrations ??= [];
    const visualItems = this.save.hero.inventory.filter(
      (item) => item.isVisualTestItem,
    );

    if (visualItems.length > 0) {
      const visualItemIds = new Set(visualItems.map((item) => item.id));
      const pollutedTemplateIds = new Set(
        visualItems.map((item) => item.templateId),
      );
      this.save.hero.inventory = this.save.hero.inventory.filter(
        (item) => !visualItemIds.has(item.id),
      );

      (Object.keys(this.save.hero.equipped) as EquipmentSlot[]).forEach(
        (slot) => {
          const equippedId = this.save.hero.equipped[slot];
          if (!equippedId || !visualItemIds.has(equippedId)) return;
          delete this.save.hero.equipped[slot];
          const replacement = this.save.hero.inventory.find(
            (item) =>
              item.slot === slot &&
              (item.allowedClasses === "all" ||
                item.allowedClasses.includes(this.save.hero.classId)),
          );
          if (replacement) this.save.hero.equipped[slot] = replacement.id;
        },
      );

      const legitimatelyOwnedTemplates = new Set(
        this.save.hero.inventory.map((item) => item.templateId),
      );
      this.save.discoveredItems = this.save.discoveredItems.filter(
        (templateId) =>
          !pollutedTemplateIds.has(templateId) ||
          legitimatelyOwnedTemplates.has(templateId),
      );
    }

    if (!this.save.migrations.includes(VISUAL_TEST_CATALOG_CLEANUP_MIGRATION)) {
      this.save.migrations.push(VISUAL_TEST_CATALOG_CLEANUP_MIGRATION);
    }
  }

  private gainHeroExperience(
    amount: number,
    levelCap = Number.POSITIVE_INFINITY,
  ): number {
    const hero = this.save.hero;
    if (hero.level >= levelCap) {
      hero.experience = Math.min(
        hero.experience + amount,
        Math.max(0, hero.experienceToNextLevel - 1),
      );
      return 0;
    }
    hero.experience += amount;
    let levels = 0;
    while (
      hero.experience >= hero.experienceToNextLevel &&
      hero.level < levelCap
    ) {
      hero.experience -= hero.experienceToNextLevel;
      hero.level += 1;
      levels += 1;
      hero.experienceToNextLevel = heroExperienceRequirement(hero.level);
    }
    if (hero.level >= levelCap)
      hero.experience = Math.min(
        hero.experience,
        Math.max(0, hero.experienceToNextLevel - 1),
      );
    return levels;
  }

  private initializeCrossEraPopulation(
    previousEnemies: readonly EnemyProfile[],
    previousLife: GameSave["npcLife"],
    previousMentors: readonly MentorRecord[],
    previousCycle: number,
    notableNames: ReadonlySet<string>,
  ): void {
    return this.population.initializeCrossEraPopulation(
      previousEnemies,
      previousLife,
      previousMentors,
      previousCycle,
      notableNames,
    );
  }

  private createEnemy(
    arenaIndex: number,
    newcomer = false,
    levelOverride?: number,
  ): EnemyProfile {
    return this.population.createEnemy(arenaIndex, newcomer, levelOverride);
  }

  private createDungeonEnemy(
    levels: [number, number],
    dungeonName: string,
  ): EnemyProfile {
    const level = this.random.world.int(levels[0], levels[1]);
    const arenaIndex = ARENAS.reduce(
      (selected, arena, index) =>
        arena.enemyLevel[0] <= level ? index : selected,
      0,
    );
    const enemy = this.createEnemy(arenaIndex, false, level);
    enemy.id = this.randomId("dungeon");
    enemy.name = `Хранитель: ${this.random.world.pick(ENEMY_NAMES)}`;
    enemy.title = `страж локации «${dungeonName}»`;
    enemy.rating += 100;
    return enemy;
  }

  private matchDuelEnemy(
    tier: DuelDefinition,
    arenaIndex: number,
  ): EnemyProfile {
    const [minOffset, maxOffset] = tier.enemyLevelOffset;
    const minLevel = Math.max(1, this.save.hero.level + minOffset);
    const maxLevel = Math.max(minLevel, this.save.hero.level + maxOffset);
    const localFighters = this.save.enemies.filter(
      (enemy) => enemy.alive && enemy.arenaIndex === arenaIndex,
    );
    const eligible = localFighters.filter(
      (enemy) => enemy.level >= minLevel && enemy.level <= maxLevel,
    );
    const pool = eligible.length > 0 ? eligible : localFighters;
    if (pool.length === 0) {
      const enemy = this.createEnemy(arenaIndex, true);
      this.save.enemies.push(enemy);
      return enemy;
    }
    const heroPower = evaluateCombatantPower(combatantSnapshot(this.save.hero));
    const ranked = pool
      .map((enemy) => ({
        enemy,
        distance: Math.abs(
          evaluateCombatantPower(combatantSnapshot(enemy)) - heroPower,
        ),
      }))
      .sort((a, b) => a.distance - b.distance);
    const closest = ranked
      .filter(
        (candidate) =>
          candidate.distance <= ranked[0].distance + Math.log(1.15),
      )
      .slice(0, 5);
    return closest[this.random.world.int(0, closest.length - 1)].enemy;
  }

  private createBossEnemy(boss: BossDefinition): EnemyProfile {
    const enemy = this.createEnemy(
      Math.min(boss.requiredArena, ARENAS.length - 1),
    );
    enemy.id = `boss-${boss.id}`;
    enemy.name = boss.name;
    enemy.classId = boss.classId;
    enemy.level = boss.level;
    enemy.title = "уникальный дуэльный противник";
    enemy.origin = boss.place;
    enemy.equipment = (
      ["weapon", "offhand", "head", "chest", "hands", "feet"] as EquipmentSlot[]
    ).map((slot) =>
      createItem(boss.level + 4, {
        classId: boss.classId,
        slot,
        rarity: boss.id === "nameless-duke" ? "mythic" : "legendary",
        randomSource: this.random.loot,
      }),
    );
    enemy.equipped = {};
    enemy.equipment.forEach((item) => {
      enemy.equipped[item.slot] = item.id;
    });
    return enemy;
  }

  private futureBossEnemy(record: FutureBossRecord): EnemyProfile {
    const source = this.enemyById(record.fighterId);
    const enemy = source
      ? (JSON.parse(JSON.stringify(source)) as EnemyProfile)
      : this.createEnemy(
          Math.min(this.save.hero.highestArena, ARENAS.length - 1),
          true,
        );
    const previousLevel = Math.max(1, enemy.level);
    const growth = 1 + Math.max(0, record.powerLevel - previousLevel) * 0.035;
    const sourceBySlot = new Map(
      enemy.equipment
        .filter((item) => Object.values(enemy.equipped).includes(item.id))
        .map((item) => [item.slot, item]),
    );
    enemy.id = record.fighterId;
    enemy.name = record.name;
    enemy.title =
      record.archetype === "nemesis"
        ? "противник, вернувшийся за последним боем"
        : record.archetype === "relic-bearer"
          ? "носитель прославленной мировой реликвии"
          : "наследник школы старого мастера";
    enemy.origin = "Летопись живого мира";
    enemy.classId = record.classId;
    enemy.level = record.powerLevel;
    enemy.alive = true;
    enemy.injuries = [];
    enemy.equipment = (
      ["weapon", "offhand", "head", "chest", "hands", "feet"] as EquipmentSlot[]
    ).map((slot) => {
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
        stats: Object.fromEntries(
          Object.entries(existing.stats).map(([stat, value]) => [
            stat,
            Math.max(1, Math.round(Number(value) * growth)),
          ]),
        ),
        allowedClasses:
          existing.allowedClasses === "all"
            ? ("all" as const)
            : [...existing.allowedClasses],
        affix: existing.affix ? { ...existing.affix } : undefined,
        relicHistory: [...(existing.relicHistory ?? [])],
        relicFeats: [...(existing.relicFeats ?? [])],
        relicProperties: (existing.relicProperties ?? []).map((property) => ({
          ...property,
        })),
      };
    });
    enemy.equipped = {};
    enemy.equipment.forEach((item) => {
      enemy.equipped[item.slot] = item.id;
    });
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
      lootTemplateIds: Object.fromEntries(
        HERO_CLASSES.map((classId) => [
          classId,
          ITEM_TEMPLATES.find(
            (template) =>
              !template.exclusiveToElite &&
              !template.exclusiveToBoss &&
              !template.exclusiveToFaction &&
              (template.allowedClasses === "all" ||
                template.allowedClasses.includes(classId)),
          )!.id,
        ]),
      ) as Record<HeroClass, string>,
      accent: "#6f5548",
    };
  }

  private duelAvailability(duel: DuelDefinition): ActivityAvailability {
    const hero = this.save.hero;
    if (hero.level < duel.minLevel)
      return { unlocked: false, reason: `Требуется ${duel.minLevel} уровень.` };
    if (hero.duelWins < duel.requiredDuelWins)
      return {
        unlocked: false,
        reason: `Нужно побед в дуэлях: ${hero.duelWins}/${duel.requiredDuelWins}.`,
      };
    if (hero.highestArena < duel.requiredArena)
      return {
        unlocked: false,
        reason: `Нужно открыть арену «${ARENAS[duel.requiredArena].name}».`,
      };
    return {
      unlocked: true,
      reason: `Подбор: уровень героя ${duel.enemyLevelOffset[0] >= 0 ? "+" : ""}${duel.enemyLevelOffset[0]}…+${duel.enemyLevelOffset[1]}.`,
    };
  }

  private bossAvailability(boss: BossDefinition): ActivityAvailability {
    const hero = this.save.hero;
    const requirementMultiplier =
      this.save.legacy.activeBoonId === "hunters-notes" ? 0.8 : 1;
    const requiredLevel = Math.ceil(boss.requiredLevel * requirementMultiplier);
    const requiredDuelWins = Math.ceil(
      boss.requiredDuelWins * requirementMultiplier,
    );
    if (this.save.defeatedBosses.includes(boss.id))
      return { unlocked: false, reason: "Побеждён. Повторный бой невозможен." };
    if (hero.level < requiredLevel)
      return { unlocked: false, reason: `Требуется ${requiredLevel} уровень.` };
    if (hero.duelWins < requiredDuelWins)
      return {
        unlocked: false,
        reason: `Нужно побед в дуэлях: ${hero.duelWins}/${requiredDuelWins}.`,
      };
    if (hero.highestArena < boss.requiredArena)
      return {
        unlocked: false,
        reason: `Нужно открыть арену «${ARENAS[boss.requiredArena].name}».`,
      };
    if (
      boss.requiredDungeon &&
      !this.save.dungeonClears[boss.requiredDungeon]
    ) {
      return {
        unlocked: false,
        reason: `Нужно пройти данж «${DUNGEONS.find((dungeon) => dungeon.id === boss.requiredDungeon)?.name}».`,
      };
    }
    if (
      boss.requiredBoss &&
      !this.save.defeatedBosses.includes(boss.requiredBoss)
    ) {
      return {
        unlocked: false,
        reason: `Сначала победите: ${DUEL_BOSSES.find((candidate) => candidate.id === boss.requiredBoss)?.name}.`,
      };
    }
    return {
      unlocked: true,
      reason: `Одноразовая награда: уникальный предмет. Уровень босса ${boss.level}.`,
    };
  }

  private enemyPower(enemy: EnemyProfile): number {
    return (
      enemy.level * 35 +
      equipmentScore(
        enemy.equipment.filter((item) =>
          Object.values(enemy.equipped).includes(item.id),
        ),
      )
    );
  }

  private heroPower(): number {
    return (
      this.save.hero.level * 35 +
      equipmentScore(
        this.save.hero.inventory.filter((item) =>
          Object.values(this.save.hero.equipped).includes(item.id),
        ),
      )
    );
  }

  private fighterTournamentSeed(fighter: HeroProfile | EnemyProfile): number {
    return (
      (this.save.eliteRatings[fighter.id] ?? fighter.rating) * 10_000 +
      (fighter.id === "hero"
        ? this.heroPower()
        : this.enemyPower(fighter as EnemyProfile))
    );
  }

  private recordNpcDuelWithHero(enemy: EnemyProfile, heroWon: boolean): void {
    return this.npcSimulation.recordNpcDuelWithHero(enemy, heroWon);
  }

  private updateEnemyAfterPlayerBattle(
    enemy: EnemyProfile,
    heroWon: boolean,
    died: boolean,
    arenaMatch = true,
  ): void {
    return this.npcSimulation.updateEnemyAfterPlayerBattle(
      enemy,
      heroWon,
      died,
      arenaMatch,
    );
  }

  private simulateWorldFights(
    count: number,
    recordEvents: boolean,
    fixedArenaIndex?: number,
  ): void {
    return this.npcSimulation.simulateWorldFights(
      count,
      recordEvents,
      fixedArenaIndex,
    );
  }

  private recordNpcRivalry(winner: EnemyProfile, loser: EnemyProfile): void {
    return this.npcSimulation.recordNpcRivalry(winner, loser);
  }

  private addFactionInfluence(
    enemy: EnemyProfile,
    arenaIndex: number,
    amount: number,
  ): void {
    return this.npcSimulation.addFactionInfluence(enemy, arenaIndex, amount);
  }

  private addHeroFactionInfluence(arenaIndex: number, amount: number): void {
    return this.npcSimulation.addHeroFactionInfluence(arenaIndex, amount);
  }

  private resolveFactionControl(): void {
    return this.npcSimulation.resolveFactionControl();
  }

  private simulateNpcAgencyDay(): void {
    return this.npcSimulation.simulateNpcAgencyDay();
  }

  private resolvePlannedNpcFight(
    first: EnemyProfile,
    second: EnemyProfile,
    targeted: boolean,
  ): {
    winner: EnemyProfile;
    loser: EnemyProfile;
    fullCombat: boolean;
  } {
    return this.npcSimulation.resolvePlannedNpcFight(first, second, targeted);
  }

  private resolveNpcMatch(
    first: EnemyProfile,
    second: EnemyProfile,
    forceFull = false,
    ruleIds?: string[],
  ) {
    return this.npcSimulation.resolveNpcMatch(
      first,
      second,
      forceFull,
      ruleIds,
    );
  }

  private maybeAwakenWorldRelic(enemy: EnemyProfile, force: boolean): void {
    return this.npcSimulation.maybeAwakenWorldRelic(enemy, force);
  }

  private releaseWorldRelics(enemy: EnemyProfile, history: string): void {
    return this.npcSimulation.releaseWorldRelics(enemy, history);
  }

  private circulateWorldRelics(): void {
    return this.npcSimulation.circulateWorldRelics();
  }

  private syncLegendCareers(): void {
    return this.npcSimulation.syncLegendCareers();
  }

  private simulateDailyWorld(skipTournamentArenaId?: string): void {
    return this.npcSimulation.simulateDailyWorld(skipTournamentArenaId);
  }

  private simulateBackgroundTournament(arenaIndex: number): void {
    return this.npcSimulation.simulateBackgroundTournament(arenaIndex);
  }

  private simulateEliteDay(): void {
    return this.npcSimulation.simulateEliteDay();
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
    return this.seasons.syncWorldSeason();
  }

  private syncFutureBosses(): void {
    return this.npcSimulation.syncFutureBosses();
  }

  private syncFactionHunter(): void {
    return this.npcSimulation.syncFactionHunter();
  }

  private syncFeatureUnlocks(): WorldFeatureUnlock[] {
    const newlyUnlocked: WorldFeatureUnlock[] = [];
    WORLD_FEATURE_IDS.forEach((id) => {
      if (
        this.save.unlockedFeatureIds.includes(id) ||
        !worldFeatureAvailability(this.save, id).unlocked
      )
        return;
      this.save.unlockedFeatureIds.push(id);
      const unlock = createWorldFeatureUnlock(this.save, id);
      if (
        !this.save.pendingFeatureUnlocks.some((pending) => pending.id === id)
      ) {
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
    if (this.save.pendingBattle)
      throw new Error("Сначала завершите или отмените уже начатый бой.");
    if (this.save.activeExpedition)
      throw new Error("Сначала завершите текущий поход или отступите.");
    if (!this.save.pendingEliteChallengeId) return;
    if (!this.save.hero.autoResolveLegendChallenges) {
      throw new Error(
        "Сначала защитите место легенды или включите автоматический расчёт защиты в разделе эндгейма.",
      );
    }
    this.automaticLegendDefense = this.resolveLegendDefense(false);
  }

  private clearExpiredTournamentRegistrations(): void {
    Object.entries(this.save.tournamentRegistrations).forEach(
      ([arenaId, day]) => {
        if (day < this.save.worldDay) {
          const arena = ARENAS.find((candidate) => candidate.id === arenaId);
          const name =
            arena?.name ??
            (arenaId === "crown-league" ? "Лига короны" : arenaId);
          this.event(
            "tournament",
            `${this.save.hero.name} пропустил запись на «${name}» в день ${day}.`,
          );
          delete this.save.tournamentRegistrations[arenaId];
        }
      },
    );
  }

  private npcExperienceReward(baseExperience: number): number {
    return this.npcSimulation.npcExperienceReward(baseExperience);
  }

  private progressEnemy(enemy: EnemyProfile, recordEvent = true): void {
    return this.npcSimulation.progressEnemy(enemy, recordEvent);
  }

  private ensurePopulations(
    fillImmediately = false,
    allowRoutineRecruitment = true,
  ): void {
    return this.population.ensurePopulations(
      fillImmediately,
      allowRoutineRecruitment,
    );
  }

  private refreshShopIfNeeded(): void {
    return this.shop.refreshShopIfNeeded();
  }

  private rotateShop(): void {
    return this.shop.rotateShop();
  }

  private latestEventId(): string | undefined {
    return this.save.events[0]?.id;
  }

  private eventsSince(cursor?: string): WorldEvent[] {
    if (!cursor) return [...this.save.events];
    const cursorIndex = this.save.events.findIndex(
      (event) => event.id === cursor,
    );
    return cursorIndex < 0
      ? [...this.save.events]
      : this.save.events.slice(0, cursorIndex);
  }

  private randomId(prefix: string): string {
    const first = this.random.world.int(0, 0x7fffffff).toString(36);
    const second = this.random.world.int(0, 0x7fffffff).toString(36);
    return `${prefix}-${first}-${second}`;
  }

  private event(
    type: WorldEvent["type"],
    message: string,
    payload?: StructuredWorldEventPayload,
  ): void {
    this.save.events.unshift({
      id: this.randomId("event"),
      day: this.save.worldDay,
      type,
      message,
      payload,
    });
    this.save.events = this.save.events.slice(0, 500);
  }
}

export function rarityAtLeast(rarity: Rarity, minimum: Rarity): boolean {
  return RARITY_ORDER.indexOf(rarity) >= RARITY_ORDER.indexOf(minimum);
}

export function skillById(id: string): SkillDefinition | undefined {
  return SKILLS.find((skill) => skill.id === id);
}
