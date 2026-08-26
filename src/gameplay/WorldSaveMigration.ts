import { ARENAS, CLASS_DEFINITIONS, ITEM_TEMPLATES, SKILLS } from "../catalogs/WorldCatalog";
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

export const PROGRESSION_CURVE_MIGRATION = "rebalance-progression-curves-v1";
export const ENEMY_STYLE_MEMORY_MIGRATION = "enemy-style-memory-v1";
export const STAGED_WORLD_FEATURES_MIGRATION = "staged-world-features-v1";
export const ENEMY_ARENA_CHAMPIONSHIP_MIGRATION = "enemy-arena-championships-v1";
export const PENDING_BATTLE_MIGRATION = "pending-battle-state-v1";

const HERO_CLASSES = Object.keys(CLASS_DEFINITIONS) as HeroClass[];

function defaultFactionReputation(): Record<string, number> {
  return Object.fromEntries(FACTIONS.map((faction) => [faction.id, 0]));
}

function defaultTraitId(classId: HeroClass, offset = 0): string {
  const classIndex = HERO_CLASSES.indexOf(classId);
  return FIGHTER_TRAITS[(classIndex + offset) % FIGHTER_TRAITS.length].id;
}

/**
 * Приводит сохранение прошлых версий к текущему формату.
 * Функция намеренно изменяет переданный объект: restore исторически сохранял
 * ту же ссылку, и смена этого поведения могла бы сломать вызывающий код.
 */
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
  save.discoveredItems ??= save.hero.inventory.map((item) => item.templateId);
  save.migrations ??= [];
  if (!save.migrations.includes(PENDING_BATTLE_MIGRATION)) {
    // Older clients resolved combat synchronously and therefore cannot have a
    // trustworthy continuation point. New saves carry the marker before a
    // pending battle can ever be created.
    save.pendingBattle = undefined;
    save.migrations.push(PENDING_BATTLE_MIGRATION);
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
  save.activeExpedition &&= {
    ...save.activeExpedition,
    health: normalizeExpeditionStamina(save.activeExpedition.health),
    visitedNodeIds: [...new Set(save.activeExpedition.visitedNodeIds ?? [])]
      .filter((id) => save.activeExpedition?.route?.nodes.some((node) => node.id === id) ?? false),
    attackMultiplier: Math.max(1, Number(save.activeExpedition.attackMultiplier) || 1),
    defenseMultiplier: Math.max(1, Number(save.activeExpedition.defenseMultiplier) || 1),
    lootChanceBonus: Math.max(0, Number(save.activeExpedition.lootChanceBonus) || 0),
    daysSpent: Math.max(0, Math.floor(Number(save.activeExpedition.daysSpent) || 0)),
  };
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
  } else if (save.activeExpedition) {
    save.activeExpedition.visitedNodeIds = [];
    save.activeExpedition.currentNodeId = undefined;
    save.activeExpedition.pendingShrineNodeId = undefined;
  }
  // Only version 2 predates the first-run tutorial. Explicit values from
  // current saves, including `false`, must survive a reload.
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
  hero.factionReputation ??= defaultFactionReputation();
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

  hero.inventory.forEach((item) => {
    item.enhancement ??= 0;
    item.relicTier ??= 0;
    item.relicRenown ??= 0;
    item.relicHistory ??= [];
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
    // Saves created before staged progression already exposed these systems.
    // Preserve access when the player used them, while untouched campaigns
    // adopt the new milestones instead of being granted everything silently.
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
    enemy.arenaIndex = Math.max(0, Math.min(ARENAS.length - 1, Math.floor(enemy.arenaIndex)));
    enemy.arenaWins = Math.max(0, Math.floor(enemy.arenaWins));
    enemy.tournamentWins ??= Math.min(enemy.wins, Math.max(0, enemy.arenaIndex * 2));
    const hadArenaTournamentWins = Array.isArray(enemy.arenaTournamentWins);
    const recordedArenaWins: number[] = hadArenaTournamentWins
      ? enemy.arenaTournamentWins.map((count) => Math.max(0, Math.floor(Number(count) || 0)))
      : [];
    if (!hadArenaTournamentWins && enemy.tournamentWins > 0) {
      // Old saves only stored an aggregate. Progression proves the previous
      // arena, but not the arena a fighter has only just entered.
      const inferredArena = Math.max(0, Math.min(ARENAS.length - 1, enemy.arenaIndex - 1));
      recordedArenaWins[inferredArena] = enemy.tournamentWins;
    }
    enemy.arenaTournamentWins = ARENAS.map((_, index) => recordedArenaWins[index] ?? 0);
    enemy.kills ??= 0;
    enemy.equipment.forEach((item) => { item.enhancement ??= 0; });
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
    enemy.tacticalStyle ??= DEFAULT_TACTICAL_PROFILES[
      (classIndex + enemy.arenaIndex) % DEFAULT_TACTICAL_PROFILES.length
    ].style;
  });
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
    offer.item.price = calculateItemPrice(offer.item.level, offer.item.rarity);
  });
  return save;
}
