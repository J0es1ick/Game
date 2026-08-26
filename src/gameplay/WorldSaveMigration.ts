import { ARENAS, CLASS_DEFINITIONS, SKILLS } from "../catalogs/WorldCatalog";
import {
  DEFAULT_TACTICAL_PROFILES,
  FACTIONS,
  FIGHTER_TRAITS,
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
import {
  hasReachedWorldFeatureMilestone,
  WORLD_FEATURE_IDS,
} from "./WorldFeatureProgression";

export const PROGRESSION_CURVE_MIGRATION = "rebalance-progression-curves-v1";
export const ENEMY_STYLE_MEMORY_MIGRATION = "enemy-style-memory-v1";
export const STAGED_WORLD_FEATURES_MIGRATION = "staged-world-features-v1";

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
  save.discoveredItems ??= save.hero.inventory.map((item) => item.templateId);
  save.migrations ??= [];
  save.tournamentRegistrations ??= {};
  save.events ??= [];
  save.defeatedBosses ??= [];
  save.huntedLegendIds ??= [];
  save.eliteLeagueMemberIds ??= [];
  save.eliteRatings ??= {};
  save.eliteCrownWins ??= {};
  save.contractOffers ??= [];
  save.completedContracts ??= 0;
  save.seenContextualTutorialIds ??= [];
  save.unlockedFeatureIds ??= [];
  save.pendingFeatureUnlocks ??= [];
  save.tournamentRuleSeed ??= Math.max(1, save.hero.createdAt % 999_999);
  // Старые сохранения уже побывали в мире, даже если у них ещё не было
  // отдельного признака пройденного обучения.
  save.tutorialCompleted = true;

  const hero = save.hero;
  hero.inventory.forEach((item) => {
    item.name = item.name.replace(/^\[3D-прототип\]\s*/, "");
  });
  save.events.forEach((event) => {
    event.message = event.message.replace("демонстрационный 3D-комплект", "демонстрационный комплект");
  });
  hero.appearance ??= { hairStyle: 0, faceStyle: 0 };
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
    enemy.tournamentWins ??= Math.min(enemy.wins, Math.max(0, enemy.arenaIndex * 2));
    enemy.kills ??= 0;
    enemy.equipment.forEach((item) => { item.enhancement ??= 0; });
    enemy.traitIds ??= [defaultTraitId(enemy.classId, enemy.level)];
    enemy.scarIds ??= [];
    enemy.injuries ??= [];
    enemy.adaptationIds ??= [];
    enemy.heroMemory = normalizeEnemyStyleMemory(enemy.heroMemory, enemy.adaptationIds, save.worldDay);
    const classIndex = HERO_CLASSES.indexOf(enemy.classId);
    enemy.tacticalStyle ??= DEFAULT_TACTICAL_PROFILES[
      (classIndex + enemy.arenaIndex) % DEFAULT_TACTICAL_PROFILES.length
    ].style;
  });
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
