import { ARENAS, CLASS_DEFINITIONS, DUNGEONS, ITEM_TEMPLATES, SKILLS } from "../catalogs/WorldCatalog";
import {
  DEFAULT_TACTICAL_PROFILES,
  FACTIONS,
  FIGHTER_TRAITS,
  TOURNAMENT_RULES,
} from "../catalogs/WorldExpansionCatalog";
import { calculateItemPrice } from "../factories/ItemFactory";
import { normalizeLegacyState } from "./NewGamePlus";
import {
  heroExperienceRequirement,
  normalizeExperienceProgress,
} from "./ProgressionBalance";
import {
  ContextualTutorialId,
  DungeonDiscovery,
  EquipmentItem,
  GameSave,
  HeroClass,
  WorldFeatureId,
  WorldFeatureUnlock,
} from "./WorldTypes";
import { MAX_ACTIVE_SKILLS } from "./WorldRules";
import { normalizeEnemyStyleMemory } from "./EnemyMemory";
import { compactNpcEquipment } from "./NpcEquipment";
import { normalizeWorldRandomSnapshots } from "./WorldRandom";
import { createCrownSeason } from "./CrownSeason";
import { SeededRandom } from "./RandomSource";
import { NARRATIVE_EVENTS } from "./NarrativeEvents";
import { eraChallengeFor, normalizeEraChallengeProgress } from "./EraChallenges";
import { normalizeExpeditionStamina } from "./ExpeditionStamina";
import {
  hasReachedWorldFeatureMilestone,
  WORLD_FEATURE_IDS,
} from "./WorldFeatureProgression";
import { createWorldRelicRecord, normalizeFactionControlState, normalizeWorldRelics } from "./LivingWorld";
import { normalizeNpcLifeWorldState } from "./NpcLifeSimulation";
import { normalizeWorldSeason, worldSeasonRule } from "./WorldSeason";
import { restoreWorldSeasonNames } from "./WorldSeasonNames";
import { createClassResource } from "./CombatEffects";
import { initialEnemyMutationState } from "./EraChallenges";
import { normalizeDungeonDiscoveryState } from "./DungeonRoute";
import { isWorldRelicEligible } from "./WorldRelics";
import { normalizeFactionCampaigns } from "./FactionCampaign";
import { reconcileSavedWorldRelics } from "./WorldRelicSave";

export const PROGRESSION_CURVE_MIGRATION = "rebalance-progression-curves-v1";
export const ENEMY_STYLE_MEMORY_MIGRATION = "enemy-style-memory-v1";
export const STAGED_WORLD_FEATURES_MIGRATION = "staged-world-features-v1";
export const ENEMY_ARENA_CHAMPIONSHIP_MIGRATION = "enemy-arena-championships-v1";
export const PENDING_BATTLE_MIGRATION = "pending-battle-state-v1";

const HERO_CLASSES = Object.keys(CLASS_DEFINITIONS) as HeroClass[];

function defaultTraitId(classId: HeroClass, offset = 0): string {
  const classIndex = HERO_CLASSES.indexOf(classId);
  return FIGHTER_TRAITS[(classIndex + offset) % FIGHTER_TRAITS.length].id;
}

function finiteInteger(value: unknown, fallback: number, minimum = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(minimum, Math.floor(numeric)) : fallback;
}

function normalizeItemEvolution(item: EquipmentItem): void {
  item.enhancement = finiteInteger(item.enhancement, 0);
  item.relicTier = Math.min(3, finiteInteger(item.relicTier, 0)) as 0 | 1 | 2 | 3;
  item.relicRenown = finiteInteger(item.relicRenown, 0);
  item.relicHistory = [...new Set((item.relicHistory ?? []).filter((entry) => typeof entry === "string" && entry.length > 0))];
  item.relicFeats = [...new Set((item.relicFeats ?? []).filter((entry) => typeof entry === "string" && entry.length > 0))];
  item.relicProperties = (item.relicProperties ?? []).filter((property) => property
    && typeof property.name === "string"
    && typeof property.description === "string"
    && ["health", "attack", "defense", "speed", "crit"].includes(property.stat)
    && Number.isFinite(property.value));
}

function normalizeDungeonDiscoveries(save: GameSave): void {
  const knownDungeonIds = new Set(DUNGEONS.map((dungeon) => dungeon.id));
  save.dungeonDiscoveries = Object.fromEntries(Object.entries(save.dungeonDiscoveries ?? {})
    .filter(([dungeonId, discovery]) => knownDungeonIds.has(dungeonId) && discovery && typeof discovery === "object")
    .map(([dungeonId, discovery]) => {
      const normalized = normalizeDungeonDiscoveryState(dungeonId, discovery);
      const result: DungeonDiscovery = {
        ...normalized,
        alternateBossDefeated: discovery.alternateBossDefeated === true,
      };
      return [dungeonId, result];
    }));
}

function normalizePendingBattleRuntime(save: GameSave): void {
  const pending = save.pendingBattle;
  if (!pending?.session) return;
  const session = pending.session;
  [session.hero, session.enemy, session.heroBefore, session.enemyBefore].forEach((fighter) => {
    const resonance = fighter.equipmentResonance;
    if (!resonance) return;
    if (!resonance.setId || !resonance.setName || !["might", "guard", "tempo"].includes(resonance.path)) {
      fighter.equipmentResonance = undefined;
      return;
    }
    resonance.stage = Math.min(3, finiteInteger(resonance.stage, 1, 1)) as 1 | 2 | 3;
    resonance.pieces = Math.min(6, finiteInteger(resonance.pieces, 2, 1));
    resonance.description = typeof resonance.description === "string" ? resonance.description : resonance.setName;
  });
  [session.hero, session.enemy].forEach((fighter) => {
    fighter.cooldowns = fighter.cooldowns && typeof fighter.cooldowns === "object" ? fighter.cooldowns : {};
    fighter.buff = Math.max(0, Number(fighter.buff) || 0);
    fighter.weakened = Math.max(0, Number(fighter.weakened) || 0);
    fighter.attackCounter = finiteInteger(fighter.attackCounter, 0);
    fighter.actionsTaken = finiteInteger(fighter.actionsTaken, 0);
    fighter.combo = finiteInteger(fighter.combo, 0);
    fighter.tactics = fighter.tactics && typeof fighter.tactics === "object"
      ? fighter.tactics
      : { ...DEFAULT_TACTICAL_PROFILES[0] };
    fighter.disableHealing = fighter.disableHealing === true;
    fighter.statuses = Array.isArray(fighter.statuses) ? fighter.statuses : [];
    const baseResource = createClassResource(fighter.classId);
    const maximum = Math.max(1, finiteInteger(fighter.resource?.maximum, baseResource.maximum, 1));
    fighter.resource = fighter.resource && typeof fighter.resource === "object"
      ? {
        ...baseResource,
        ...fighter.resource,
        maximum,
        current: Math.min(maximum, finiteInteger(fighter.resource.current, 0)),
      }
      : baseResource;
    fighter.nextActionAt = Math.max(0, Number(fighter.nextActionAt) || 0);
    fighter.usedMechanics = [...new Set((fighter.usedMechanics ?? []).filter((entry) => typeof entry === "string" && entry.length > 0))];
    fighter.mutationState = fighter.mutationState && typeof fighter.mutationState === "object"
      ? {
        counter: finiteInteger(fighter.mutationState.counter, 0),
        consumed: fighter.mutationState.consumed === true,
        primed: fighter.mutationState.primed === true,
      }
      : initialEnemyMutationState();
  });
  session.turns = (session.turns ?? []).map((turn) => ({
    ...turn,
    decisionReason: typeof turn.decisionReason === "string" ? turn.decisionReason : undefined,
    decisionScore: Number.isFinite(turn.decisionScore) ? turn.decisionScore : undefined,
    statusComboIds: [...new Set((turn.statusComboIds ?? []).filter((entry) => typeof entry === "string" && entry.length > 0))],
    resourceEvents: [...(turn.resourceEvents ?? [])].filter((event) => event
      && typeof event.fighterId === "string"
      && typeof event.resourceId === "string"
      && Number.isFinite(event.gained)
      && Number.isFinite(event.spent)),
  }));
}

export function normalizeWorldSave(save: GameSave): GameSave {
  const sourceVersion = save.version;
  const hadContractsBeforeMigration = Boolean(
    save.activeContract
    || save.completedContracts > 0
    || (save.contractOffers?.length ?? 0) > 0,
  );
  const hadEquipmentLegacyBeforeMigration = Boolean(
    save.hero.relicDust > 0
    || save.hero.inventory.some((item) => (item.relicRenown ?? 0) > 0 || (item.relicTier ?? 0) > 0 || item.relicPath),
  );
  save.version = 3;
  save.legacy = normalizeLegacyState(save.legacy);
  save.legacy.discoveredSkillIds = [...new Set([
    ...save.legacy.discoveredSkillIds,
    ...save.hero.inventory.map((item) => item.grantedSkillId).filter((id): id is string => Boolean(id)),
  ])];
  save.defeatedLegacyCycles ??= [];
  save.dungeonClears ??= {};
  save.shopDay ??= save.worldDay;
  save.shopOffers ??= [];
  save.factionControl = normalizeFactionControlState(save.factionControl, save.worldDay);
  save.mentors = (save.mentors ?? []).filter((mentor) => mentor && mentor.id && mentor.fighterId).map((mentor) => ({
    ...mentor,
    studentIds: [...new Set(mentor.studentIds ?? [])],
  }));
  save.worldRelics = normalizeWorldRelics(save.worldRelics);
  save.discoveredItems ??= save.hero.inventory.map((item) => item.templateId);
  save.migrations ??= [];
  if (!save.migrations.includes(PENDING_BATTLE_MIGRATION)) {
    save.pendingBattle = undefined;
    save.migrations.push(PENDING_BATTLE_MIGRATION);
  } else {
    normalizePendingBattleRuntime(save);
  }
  save.tournamentRegistrations ??= {};
  save.events ??= [];
  save.defeatedBosses ??= [];
  save.huntedLegendIds ??= [];
  save.eliteLeagueMemberIds ??= [];
  save.eliteRatings ??= {};
  save.eliteCrownWins ??= {};
  save.contractOffers ??= [];
  save.completedContracts ??= 0;
  save.seenNarrativeEventIds ??= [];
  save.reforgeAttempts ??= {};
  save.reforgeAttempts = Object.fromEntries(Object.entries(save.reforgeAttempts)
    .map(([itemId, attempt]) => [itemId, Math.max(0, Math.floor(Number(attempt) || 0))]));
  save.seenContextualTutorialIds ??= [];
  save.unlockedFeatureIds ??= [];
  save.pendingFeatureUnlocks ??= [];
  save.tournamentRuleSeed ??= Math.max(1, save.hero.createdAt % 999_999);
  save.randomSnapshots = normalizeWorldRandomSnapshots(save.randomSnapshots, save.tournamentRuleSeed);
  save.worldSeason = normalizeWorldSeason(
    save.worldSeason,
    save.worldDay,
    new SeededRandom(`${save.tournamentRuleSeed}:world-season:${save.worldSeason?.number ?? 1}`),
  );
  save.worldSeasonHistory = (save.worldSeasonHistory ?? []).filter((season) => season && typeof season === "object")
    .slice(-12).map((season, index) => {
      const startsDay = finiteInteger(season.startsDay, Math.max(1, save.worldDay - (12 - index) * 50), 1);
      const endsDay = finiteInteger(season.endsDay, startsDay + 49, startsDay);
      const ruleId = worldSeasonRule(season.ruleId).id;
      return {
      ...season,
      number: finiteInteger(season.number, index + 1, 1),
      startsDay,
      endsDay,
      ruleId,
      eliteChampion: season.eliteChampion
        && typeof season.eliteChampion.fighterId === "string" && season.eliteChampion.fighterId.length > 0
        && typeof season.eliteChampion.fighterName === "string" && season.eliteChampion.fighterName.length > 0
        ? {
          fighterId: season.eliteChampion.fighterId,
          fighterName: season.eliteChampion.fighterName,
          arenaId: "elite",
          points: finiteInteger(season.eliteChampion.points, 0),
          place: 1,
        } : undefined,
      champions: (season.champions ?? []).filter((champion) => champion
        && typeof champion.fighterId === "string"
        && typeof champion.fighterName === "string"
        && typeof champion.arenaId === "string")
        .map((champion) => ({
          ...champion,
          points: finiteInteger(champion.points, 0),
          place: finiteInteger(champion.place, 1, 1),
        })),
      promotedIds: [...new Set((season.promotedIds ?? []).filter((id) => typeof id === "string" && id.length > 0))],
      demotedIds: [...new Set((season.demotedIds ?? []).filter((id) => typeof id === "string" && id.length > 0))],
      retiredIds: [...new Set((season.retiredIds ?? []).filter((id) => typeof id === "string" && id.length > 0))],
      mentorIds: [...new Set((season.mentorIds ?? []).filter((id) => typeof id === "string" && id.length > 0))],
      newcomerIds: [...new Set((season.newcomerIds ?? []).filter((id) => typeof id === "string" && id.length > 0))],
      summary: typeof season.summary === "string" ? season.summary : `Сезон ${finiteInteger(season.number, index + 1, 1)} восстановлен из летописи.`,
    };
  });
  restoreWorldSeasonNames(save);
  normalizeDungeonDiscoveries(save);
  const knownNarrativeIds = new Set(NARRATIVE_EVENTS.map((event) => event.id));
  save.seenNarrativeEventIds = [...new Set(save.seenNarrativeEventIds)].filter((id) => knownNarrativeIds.has(id));
  if (save.pendingNarrativeEventId && !knownNarrativeIds.has(save.pendingNarrativeEventId)) save.pendingNarrativeEventId = undefined;
  save.crownSeason ??= createCrownSeason(
    Math.max(1, save.worldDay),
    1,
    TOURNAMENT_RULES.map((rule) => rule.id),
    new SeededRandom(`${save.tournamentRuleSeed}:crown-season:1`),
  );
  save.crownSeason.points ??= {};
  save.crownSeason.defenses ??= {};
  save.crownSeason.number = Math.max(1, Math.floor(Number(save.crownSeason.number) || 1));
  save.crownSeason.startsDay = Math.max(1, Math.floor(Number(save.crownSeason.startsDay) || save.worldDay));
  save.crownSeason.endsDay = Math.max(save.crownSeason.startsDay, Math.floor(Number(save.crownSeason.endsDay) || save.crownSeason.startsDay + 41));
  const knownRuleIds = new Set(TOURNAMENT_RULES.map((rule) => rule.id));
  save.crownSeason.ruleIds = [...new Set(save.crownSeason.ruleIds)].filter((id) => knownRuleIds.has(id));
  if (save.crownSeason.ruleIds.length === 0) {
    save.crownSeason.ruleIds = createCrownSeason(
      save.crownSeason.startsDay,
      save.crownSeason.number,
      [...knownRuleIds],
      new SeededRandom(`${save.tournamentRuleSeed}:crown-season:${save.crownSeason.number}`),
    ).ruleIds;
  }
  if (save.lootTarget) {
    const targetExists = ITEM_TEMPLATES.some((template) =>
      (!save.lootTarget?.slot || template.slot === save.lootTarget.slot)
      && (!save.lootTarget?.setId || template.setId === save.lootTarget.setId));
    if (!targetExists) {
      save.lootTarget = undefined;
      save.lootPity = undefined;
    }
  }
  if (save.lootPity) save.lootPity.misses = Math.max(0, Math.floor(Number(save.lootPity.misses) || 0));
  save.eraChallengeProgress = normalizeEraChallengeProgress(save.eraChallengeProgress, save.legacy.cycle);
  if (save.activeExpedition) {
    const maxSupplies = Math.max(2, finiteInteger(save.activeExpedition.maxSupplies, 5, 2));
    const suppliedValue = Number(save.activeExpedition.supplies);
    const supplies = Number.isFinite(suppliedValue)
      ? Math.min(maxSupplies, Math.max(0, Math.floor(suppliedValue)))
      : maxSupplies;
    save.activeExpedition = {
      ...save.activeExpedition,
      health: normalizeExpeditionStamina(save.activeExpedition.health),
      visitedNodeIds: [...new Set(save.activeExpedition.visitedNodeIds ?? [])]
        .filter((id) => save.activeExpedition?.route?.nodes.some((node) => node.id === id) ?? false),
      attackMultiplier: Math.max(1, Number(save.activeExpedition.attackMultiplier) || 1),
      defenseMultiplier: Math.max(1, Number(save.activeExpedition.defenseMultiplier) || 1),
      lootChanceBonus: Math.max(0, Number(save.activeExpedition.lootChanceBonus) || 0),
      daysSpent: finiteInteger(save.activeExpedition.daysSpent, 0),
      maxSupplies,
      supplies,
      discoveredNodeIds: [...new Set((save.activeExpedition.discoveredNodeIds ?? [])
        .filter((id) => typeof id === "string" && id.length > 0))],
      encounteredFighterIds: [...new Set((save.activeExpedition.encounteredFighterIds ?? [])
        .filter((id) => typeof id === "string" && id.length > 0))],
    };
  }
  if (save.activeExpedition?.route) {
    const routeIds = new Set(save.activeExpedition.route.nodes.map((node) => node.id));
    if (!routeIds.has(save.activeExpedition.route.bossNodeId)) save.activeExpedition.route = undefined;
    if (save.activeExpedition.currentNodeId && !routeIds.has(save.activeExpedition.currentNodeId)) {
      save.activeExpedition.currentNodeId = undefined;
    }
    if (save.activeExpedition.pendingShrineNodeId) {
      const shrine = save.activeExpedition.route?.nodes.find((node) => node.id === save.activeExpedition?.pendingShrineNodeId);
      if (shrine?.kind !== "shrine") save.activeExpedition.pendingShrineNodeId = undefined;
    }
    if (save.activeExpedition.pendingMerchantNodeId) {
      const merchant = save.activeExpedition.route?.nodes.find((node) => node.id === save.activeExpedition?.pendingMerchantNodeId);
      if (merchant?.kind !== "merchant") save.activeExpedition.pendingMerchantNodeId = undefined;
    }
    save.activeExpedition.discoveredNodeIds = save.activeExpedition.discoveredNodeIds?.filter((id) => routeIds.has(id));
  } else if (save.activeExpedition) {
    save.activeExpedition.visitedNodeIds = [];
    save.activeExpedition.currentNodeId = undefined;
    save.activeExpedition.pendingShrineNodeId = undefined;
    save.activeExpedition.pendingMerchantNodeId = undefined;
    save.activeExpedition.discoveredNodeIds = [];
  }
  if (save.tutorialCompleted === undefined) save.tutorialCompleted = sourceVersion === 2;

  const hero = save.hero;
  hero.inventory.forEach((item) => {
    item.name = item.name.replace(/^\[3D-прототип\]\s*/, "");
  });
  save.events.forEach((event) => {
    event.message = event.message.replace("демонстрационный 3D-комплект", "демонстрационный комплект");
  });
  hero.appearance ??= { hairStyle: 0, faceStyle: 0 };
  hero.highestArena = Math.max(0, Math.min(ARENAS.length - 1, Math.floor(hero.highestArena)));
  hero.arenaWins = ARENAS.map((_, index) => Math.max(0, Math.floor(Number(hero.arenaWins[index]) || 0)));
  const heroInventoryById = new Map(hero.inventory.map((item) => [item.id, item]));
  (Object.keys(hero.equipped) as Array<keyof typeof hero.equipped>).forEach((slot) => {
    const equippedItem = heroInventoryById.get(hero.equipped[slot]!);
    if (!equippedItem || equippedItem.slot !== slot) delete hero.equipped[slot];
  });
  hero.tournamentMatchWins ??= hero.arenaWins.reduce(
    (sum, wins, index) => sum + wins * Math.ceil(Math.log2(ARENAS[index].participants)),
    0,
  );
  hero.tournamentMatchLosses ??= 0;
  hero.duelWins ??= 0;
  hero.duelLosses ??= 0;
  hero.dungeonWins ??= 0;
  hero.dungeonLosses ??= 0;
  hero.bossWins ??= save.defeatedBosses.length;
  hero.temperingMarks ??= 0;
  hero.kills ??= 0;
  hero.rivalries ??= {};
  hero.autoEquipBest ??= false;
  hero.traitIds ??= [defaultTraitId(hero.classId)];
  hero.scarIds ??= [];
  hero.injuries ??= [];
  hero.tacticalProfiles ??= DEFAULT_TACTICAL_PROFILES.map((profile) => ({ ...profile }));
  hero.activeTacticalProfileId ??= "balanced";
  hero.relicDust ??= 0;
  hero.factionReputation = Object.fromEntries(FACTIONS.map((faction) => {
    const reputation = Number(hero.factionReputation?.[faction.id]);
    return [faction.id, Number.isFinite(reputation) ? Math.max(-100, Math.min(100, Math.round(reputation))) : 0];
  }));
  hero.crownLeaguePoints ??= 0;
  hero.crownLeagueWins ??= 0;
  hero.legendHuntWins ??= 0;
  hero.legendDefenses ??= 0;
  hero.autoResolveLegendChallenges ??= false;
  hero.classChanges ??= 0;
  hero.autoSelectSkills ??= true;
  hero.selectedSkillIds = (hero.selectedSkillIds ?? [])
    .filter((id, index, values) => values.indexOf(id) === index && SKILLS.some((skill) => skill.id === id))
    .slice(0, MAX_ACTIVE_SKILLS);
  if (hero.combatMode !== "manual") hero.combatMode = "auto";

  if (!save.migrations.includes(PROGRESSION_CURVE_MIGRATION)) {
    const requirement = heroExperienceRequirement(hero.level);
    hero.experience = normalizeExperienceProgress(hero.experience, hero.experienceToNextLevel, requirement);
    hero.experienceToNextLevel = requirement;
    save.migrations.push(PROGRESSION_CURVE_MIGRATION);
  } else {
    hero.experienceToNextLevel = heroExperienceRequirement(hero.level);
    hero.experience = Math.min(hero.experience, hero.experienceToNextLevel - 1);
  }

  hero.inventory.forEach(normalizeItemEvolution);
  hero.inventory.filter((item) => item.relicPath && !item.worldRelicId && isWorldRelicEligible(item)).forEach((item) => {
    const id = `world-relic-${item.id}`;
    const record = createWorldRelicRecord(id, item, "hero", hero.name, save.worldDay);
    if (!save.worldRelics?.some((candidate) => candidate.id === id)) save.worldRelics?.push(record);
  });
  const knownFeatures = new Set<WorldFeatureId>(WORLD_FEATURE_IDS);
  const knownTutorials = new Set<ContextualTutorialId>(["contracts", "equipment-legacy", "adaptation"]);
  save.seenContextualTutorialIds = [...new Set(save.seenContextualTutorialIds)]
    .filter((id): id is ContextualTutorialId => knownTutorials.has(id));
  save.unlockedFeatureIds = [...new Set(save.unlockedFeatureIds)]
    .filter((id): id is WorldFeatureId => knownFeatures.has(id));
  save.pendingFeatureUnlocks = save.pendingFeatureUnlocks.filter((entry): entry is WorldFeatureUnlock => (
    Boolean(entry)
    && knownFeatures.has(entry.id)
    && typeof entry.day === "number"
    && typeof entry.title === "string"
    && typeof entry.description === "string"
  ));

  if (!save.migrations.includes(STAGED_WORLD_FEATURES_MIGRATION)) {
    const preserved = new Set(save.unlockedFeatureIds);
    if (hadContractsBeforeMigration) preserved.add("contracts");
    if (hadEquipmentLegacyBeforeMigration) preserved.add("equipment-legacy");
    WORLD_FEATURE_IDS.forEach((id) => {
      if (hasReachedWorldFeatureMilestone(save, id)) preserved.add(id);
    });
    save.unlockedFeatureIds = [...preserved];
    save.pendingFeatureUnlocks = [];
    save.migrations.push(STAGED_WORLD_FEATURES_MIGRATION);
  }
  save.enemies.forEach((enemy) => {
    enemy.history = (enemy.history ?? []).slice(-50);
    enemy.duelWins = Math.min(Math.max(0, Math.floor(enemy.wins)), finiteInteger(enemy.duelWins, 0));
    enemy.duelLosses = Math.min(Math.max(0, Math.floor(enemy.losses)), finiteInteger(enemy.duelLosses, 0));
    enemy.arenaIndex = Math.max(0, Math.min(ARENAS.length - 1, Math.floor(enemy.arenaIndex)));
    enemy.arenaWins = Math.max(0, Math.floor(enemy.arenaWins));
    enemy.tournamentWins ??= Math.min(enemy.wins, Math.max(0, enemy.arenaIndex * 2));
    const hadArenaTournamentWins = Array.isArray(enemy.arenaTournamentWins);
    const recordedArenaWins: number[] = hadArenaTournamentWins
      ? enemy.arenaTournamentWins.map((count) => Math.max(0, Math.floor(Number(count) || 0)))
      : [];
    if (!hadArenaTournamentWins && enemy.tournamentWins > 0) {
      const inferredArena = Math.max(0, Math.min(ARENAS.length - 1, enemy.arenaIndex - 1));
      recordedArenaWins[inferredArena] = enemy.tournamentWins;
    }
    enemy.arenaTournamentWins = ARENAS.map((_, index) => recordedArenaWins[index] ?? 0);
    enemy.kills ??= 0;
    enemy.equipment.forEach(normalizeItemEvolution);
    compactNpcEquipment(enemy);
    enemy.traitIds ??= [defaultTraitId(enemy.classId, enemy.level)];
    enemy.scarIds ??= [];
    enemy.injuries ??= [];
    enemy.adaptationIds ??= [];
    if (save.legacy.cycle >= 2 && !enemy.eraMutationId) {
      const mutation = eraChallengeFor(save.legacy.cycle).mutations[enemy.classId];
      enemy.eraMutationId = mutation.id;
      enemy.eraMutationPotency = mutation.potency;
    }
    enemy.heroMemory = normalizeEnemyStyleMemory(enemy.heroMemory, enemy.adaptationIds, save.worldDay);
    const classIndex = HERO_CLASSES.indexOf(enemy.classId);
    enemy.factionId = FACTIONS.some((faction) => faction.id === enemy.factionId)
      ? enemy.factionId
      : FACTIONS[(classIndex + enemy.arenaIndex) % FACTIONS.length].id;
    enemy.gold = Math.max(0, Math.floor(Number(enemy.gold) || enemy.level * 55 + enemy.wins * 12));
    enemy.goal ??= (["champion", "wealth", "relic", "vengeance", "elite"] as const)[
      (classIndex + enemy.level + enemy.arenaIndex) % 5
    ];
    enemy.joinedDay = Math.max(1, Math.floor(Number(enemy.joinedDay) || Math.max(1, save.worldDay - enemy.wins - enemy.losses)));
    enemy.relationships ??= {};
    enemy.relationships = Object.fromEntries(Object.entries(enemy.relationships)
      .filter(([, relationship]) => relationship && relationship.fighterId)
      .map(([id, relationship]) => [id, {
        ...relationship,
        intensity: Math.max(1, Math.min(100, Math.floor(Number(relationship.intensity) || 1))),
        lastChangedDay: Math.max(1, Math.floor(Number(relationship.lastChangedDay) || save.worldDay)),
        encounters: finiteInteger(relationship.encounters, 0),
        outcomeBalance: Math.trunc(Number(relationship.outcomeBalance) || 0),
      }]));
    enemy.factionLoyalty = Math.max(0, Math.min(100, finiteInteger(enemy.factionLoyalty, 50)));
    enemy.factionHostility = Object.fromEntries(FACTIONS.map((faction) => {
      const hostility = Number(enemy.factionHostility?.[faction.id]);
      return [faction.id, Number.isFinite(hostility) ? Math.max(0, Math.min(100, Math.round(hostility))) : 0];
    }));
    enemy.tacticalStyle ??= DEFAULT_TACTICAL_PROFILES[
      (classIndex + enemy.arenaIndex) % DEFAULT_TACTICAL_PROFILES.length
    ].style;
  });
  save.npcLife = normalizeNpcLifeWorldState(save.npcLife, save.enemies, save.worldDay);
  save.factionCampaigns = normalizeFactionCampaigns(save.factionCampaigns);
  if (save.pendingFactionHunterId && !save.enemies.some((enemy) => enemy.id === save.pendingFactionHunterId && enemy.alive)) {
    save.pendingFactionHunterId = undefined;
  }
  if (!save.migrations.includes(ENEMY_ARENA_CHAMPIONSHIP_MIGRATION)) {
    save.migrations.push(ENEMY_ARENA_CHAMPIONSHIP_MIGRATION);
  }
  Object.values(hero.rivalries).forEach((record) => {
    const memory = save.enemies.find((enemy) => enemy.id === record.enemyId)?.heroMemory;
    if (!memory) return;
    record.memoryStage ??= memory.stage;
    record.memoryFamiliarity ??= memory.familiarity;
    record.memorySimilarity ??= memory.currentSimilarity;
    record.countermeasureIds ??= [...memory.countermeasureIds];
  });
  if (!save.migrations.includes(ENEMY_STYLE_MEMORY_MIGRATION)) save.migrations.push(ENEMY_STYLE_MEMORY_MIGRATION);
  save.shopOffers.forEach((offer) => {
    normalizeItemEvolution(offer.item);
    const factionId = save.factionControl?.shopControllerId ?? FACTIONS[0].id;
    const reputation = hero.factionReputation[factionId] ?? 0;
    const reputationDiscount = Math.max(-0.08, Math.min(0.18, reputation * 0.003));
    const controllerBase = factionId === "red-ledger" ? 1.1 : factionId === "wardens" ? 0.98 : 1;
    const relicPremium = offer.item.worldRelicId ? 1.45 : 1;
    offer.item.price = Math.max(1, Math.round(calculateItemPrice(offer.item.level, offer.item.rarity)
      * Math.max(0.72, controllerBase - reputationDiscount) * relicPremium));
  });
  save.activeExpedition?.loot.forEach(normalizeItemEvolution);
  save.worldRelics = normalizeWorldRelics(save.worldRelics).map((record) => {
    normalizeItemEvolution(record.item);
    return {
      ...record,
      formerOwners: [...new Set((record.formerOwners ?? []).filter((name) => typeof name === "string" && name.length > 0))],
      history: [...new Set((record.history ?? []).filter((entry) => typeof entry === "string" && entry.length > 0))],
      lastSyncedDay: record.lastSyncedDay === undefined ? undefined : finiteInteger(record.lastSyncedDay, save.worldDay, 1),
    };
  });
  reconcileSavedWorldRelics(save);
  return save;
}
