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
import { GameSave, HeroClass } from "./WorldTypes";
import { MAX_ACTIVE_SKILLS } from "./WorldRules";

export const PROGRESSION_CURVE_MIGRATION = "rebalance-progression-curves-v1";

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
  save.enemies.forEach((enemy) => {
    enemy.tournamentWins ??= Math.min(enemy.wins, Math.max(0, enemy.arenaIndex * 2));
    enemy.kills ??= 0;
    enemy.equipment.forEach((item) => { item.enhancement ??= 0; });
    enemy.traitIds ??= [defaultTraitId(enemy.classId, enemy.level)];
    enemy.scarIds ??= [];
    enemy.injuries ??= [];
    enemy.adaptationIds ??= [];
    const classIndex = HERO_CLASSES.indexOf(enemy.classId);
    enemy.tacticalStyle ??= DEFAULT_TACTICAL_PROFILES[
      (classIndex + enemy.arenaIndex) % DEFAULT_TACTICAL_PROFILES.length
    ].style;
  });
  save.shopOffers.forEach((offer) => {
    offer.item.price = calculateItemPrice(offer.item.level, offer.item.rarity);
  });
  return save;
}
