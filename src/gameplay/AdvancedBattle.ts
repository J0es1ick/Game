import { CLASS_DEFINITIONS, EQUIPMENT_SETS, SKILLS, addStats } from "../catalogs/WorldCatalog";
import { equipmentScore } from "../factories/ItemFactory";
import { PlayerFactory } from "../factories/PlayerFactory";
import { Player } from "../abstract/Player";
import { createWeapon } from "../catalogs/WeaponCatalog";
import {
  DEFAULT_TACTICAL_PROFILES,
  ENEMY_ADAPTATIONS,
  FIGHTER_SCARS,
  FIGHTER_TRAITS,
  TOURNAMENT_RULES,
} from "../catalogs/WorldExpansionCatalog";
import {
  BattleTurn,
  CombatantSnapshot,
  EnemyProfile,
  EquipmentItem,
  EquipmentSet,
  HeroClass,
  HeroProfile,
  SkillDefinition,
  Stats,
  TacticalProfile,
} from "./WorldTypes";

interface RuntimeFighter extends CombatantSnapshot {
  model: Player;
  cooldowns: Record<string, number>;
  buff: number;
  weakened: number;
  attackCounter: number;
  combo: number;
  setCounts: Record<string, number>;
  tactics: TacticalProfile;
  disableHealing: boolean;
}

export interface CombatResolution {
  hero: CombatantSnapshot;
  enemy: CombatantSnapshot;
  winnerId: string;
  turns: BattleTurn[];
}

function equippedItems(inventory: EquipmentItem[], equipped: EquipmentSet): EquipmentItem[] {
  const ids = new Set(Object.values(equipped));
  return inventory.filter((item) => ids.has(item.id));
}

export const MAX_ACTIVE_SKILLS = 4;

function itemStats(items: EquipmentItem[], levelCap?: number): Partial<Stats> {
  return items.reduce<Partial<Stats>>((sum, item) => {
    const scale = levelCap && item.level > levelCap ? Math.max(0.35, levelCap / item.level) : 1;
    for (const [key, value] of Object.entries(item.stats) as Array<[keyof Stats, number]>) {
      sum[key] = (sum[key] ?? 0) + Math.max(1, Math.round(value * scale));
    }
    if (item.affix) sum[item.affix.stat] = (sum[item.affix.stat] ?? 0) + Math.max(1, Math.round(item.affix.value * scale));
    return sum;
  }, {});
}

function setCounts(items: EquipmentItem[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    if (item.setId) counts[item.setId] = (counts[item.setId] ?? 0) + 1;
    return counts;
  }, {});
}

function applySetStats(stats: Stats, counts: Record<string, number>): Stats {
  const result = { ...stats };
  EQUIPMENT_SETS.forEach((set) => {
    const count = counts[set.id] ?? 0;
    set.bonuses.filter((bonus) => count >= bonus.pieces && bonus.stats).forEach((bonus) => {
      for (const [stat, value] of Object.entries(bonus.stats!) as Array<[keyof Stats, number]>) {
        result[stat] += value;
      }
    });
  });
  if ((counts.wanderer ?? 0) >= 2) result.health += 8;
  if ((counts.wanderer ?? 0) >= 4) { result.attack += 3; result.defense += 3; }
  if ((counts.wanderer ?? 0) >= 6) result.crit += 5;
  if ((counts.bastion ?? 0) >= 2) result.defense += 6;
  if ((counts.wind ?? 0) >= 2) result.speed += 4;
  if ((counts.wind ?? 0) >= 4) result.crit += 8;
  if ((counts.astral ?? 0) >= 2) result.attack += 5;
  if ((counts.crane ?? 0) >= 2) result.speed += 5;
  if ((counts.powder ?? 0) >= 2) result.attack += 5;
  if ((counts.dusk ?? 0) >= 2) result.crit += 6;
  return result;
}

function skillsFor(classId: HeroClass, level: number, items: EquipmentItem[]): SkillDefinition[] {
  const ids = new Set(items.map((item) => item.grantedSkillId).filter(Boolean));
  return SKILLS.filter((skill) =>
    (!skill.equipmentOnly && (skill.classes === "all" || skill.classes.includes(classId)) && skill.unlockLevel <= level)
    || ids.has(skill.id));
}

function activeSkills(profile: HeroProfile | EnemyProfile, available: SkillDefinition[]): SkillDefinition[] {
  const recommended = [...available].sort((a, b) => b.priority - a.priority).slice(0, MAX_ACTIVE_SKILLS);
  if (!("selectedSkillIds" in profile) || profile.autoSelectSkills !== false) return recommended;
  const byId = new Map(available.map((skill) => [skill.id, skill]));
  const selected = profile.selectedSkillIds.map((id) => byId.get(id)).filter((skill): skill is SkillDefinition => Boolean(skill));
  return (selected.length > 0 ? selected : recommended).slice(0, MAX_ACTIVE_SKILLS);
}

function featureStats(profile: HeroProfile | EnemyProfile): Partial<Stats> {
  const ids = [
    ...(profile.traitIds ?? []),
    ...(profile.scarIds ?? []),
    ...("adaptationIds" in profile ? profile.adaptationIds ?? [] : []),
  ];
  const definitions = [...FIGHTER_TRAITS, ...FIGHTER_SCARS, ...ENEMY_ADAPTATIONS];
  const result: Partial<Stats> = {};
  ids.forEach((id) => {
    const feature = definitions.find((candidate) => candidate.id === id);
    if (!feature) return;
    Object.entries(feature.stats).forEach(([stat, value]) => {
      const key = stat as keyof Stats;
      result[key] = (result[key] ?? 0) + Number(value);
    });
  });
  (profile.injuries ?? []).filter((injury) => injury.remainingDays > 0).forEach((injury) => {
    Object.entries(injury.stats).forEach(([stat, value]) => {
      const key = stat as keyof Stats;
      result[key] = (result[key] ?? 0) + Number(value);
    });
  });
  return result;
}

function tacticsFor(profile: HeroProfile | EnemyProfile): TacticalProfile {
  if ("tacticalProfiles" in profile) {
    return profile.tacticalProfiles.find((candidate) => candidate.id === profile.activeTacticalProfileId)
      ?? profile.tacticalProfiles[0]
      ?? DEFAULT_TACTICAL_PROFILES[0];
  }
  return DEFAULT_TACTICAL_PROFILES.find((candidate) => candidate.style === profile.tacticalStyle)
    ?? DEFAULT_TACTICAL_PROFILES[0];
}

interface RuntimeOptions {
  levelCap?: number;
  ruleIds?: string[];
  side?: "hero" | "enemy";
}

function toRuntime(profile: HeroProfile | EnemyProfile, options: RuntimeOptions = {}): RuntimeFighter {
  const { levelCap, ruleIds = [], side = "enemy" } = options;
  const items = equippedItems("inventory" in profile ? profile.inventory : profile.equipment, profile.equipped);
  const definition = CLASS_DEFINITIONS[profile.classId];
  const effectiveLevel = levelCap ? Math.min(profile.level, levelCap) : profile.level;
  const completedLevels = effectiveLevel - 1;
  const levelBonus: Partial<Stats> = {
    health: completedLevels * 19 + completedLevels ** 2 * 0.45,
    attack: completedLevels * 1.45,
    defense: completedLevels * 1.15,
    speed: Math.floor((effectiveLevel - 1) / 4),
    crit: Math.floor((effectiveLevel - 1) / 6),
  };
  const counts = setCounts(items);
  let stats = applySetStats(addStats(addStats(addStats(definition.startingStats, levelBonus), itemStats(items, levelCap)), featureStats(profile)), counts);
  const rules = TOURNAMENT_RULES.filter((rule) => ruleIds.includes(rule.id));
  rules.forEach((rule) => { stats = addStats(stats, side === "hero" ? rule.heroStats ?? {} : rule.enemyStats ?? {}); });
  stats.health = Math.max(1, Math.round(stats.health));
  stats.attack = Math.max(1, Math.round(stats.attack));
  stats.defense = Math.max(0, Math.round(stats.defense));
  stats.speed = Math.max(1, Math.round(stats.speed));
  stats.crit = Math.max(0, Math.min(60, Math.round(stats.crit)));
  const disableHealing = rules.some((rule) => rule.disableHealing);
  const skills = activeSkills(profile, skillsFor(profile.classId, effectiveLevel, items)).filter((skill) => !disableHealing || skill.kind !== "heal");
  const model = new PlayerFactory().create({
    className: profile.classId,
    health: Math.round(stats.health),
    strength: Math.round(stats.attack),
    name: profile.name,
    weapon: createWeapon(items.find((item) => item.slot === "weapon")?.name ?? definition.startingWeapon, 0),
    skills: [],
  });
  return {
    id: profile.id, name: profile.name, classId: profile.classId, level: effectiveLevel,
    originalLevel: effectiveLevel === profile.level ? undefined : profile.level,
    maxHealth: Math.round(stats.health), health: Math.round(stats.health), attack: Math.round(stats.attack),
    defense: Math.round(stats.defense), speed: Math.round(stats.speed), crit: Math.round(stats.crit),
    equipmentScore: equipmentScore(items), skills: skills.map((skill) => skill.id),
    model, cooldowns: {}, buff: 0, weakened: 0, attackCounter: 0, combo: 0, setCounts: counts,
    tactics: tacticsFor(profile), disableHealing,
  };
}

export function combatantSnapshot(profile: HeroProfile | EnemyProfile, levelCap?: number): CombatantSnapshot {
  const runtime = toRuntime(profile, { levelCap, side: profile.id === "hero" ? "hero" : "enemy" });
  return {
    id: runtime.id, name: runtime.name, classId: runtime.classId, level: runtime.level, originalLevel: runtime.originalLevel,
    maxHealth: runtime.maxHealth, health: runtime.health, attack: runtime.attack,
    defense: runtime.defense, speed: runtime.speed, crit: runtime.crit,
    equipmentScore: runtime.equipmentScore, skills: [...runtime.skills], traitIds: [...(profile.traitIds ?? [])],
    injuryNames: (profile.injuries ?? []).filter((injury) => injury.remainingDays > 0).map((injury) => injury.name),
    tacticalStyle: runtime.tactics.style,
  };
}

function pickSkill(actor: RuntimeFighter, target: RuntimeFighter): SkillDefinition | undefined {
  const ready = SKILLS.filter((skill) => actor.skills.includes(skill.id) && (actor.cooldowns[skill.id] ?? 0) <= 0);
  const useful = ready.filter((skill) => skill.kind !== "heal" || actor.health / actor.maxHealth < actor.tactics.healThreshold)
    .filter((skill) => skill.id !== "execution" || target.health / target.maxHealth < actor.tactics.finisherThreshold);
  const score = (skill: SkillDefinition): number => {
    let value = skill.priority;
    if (actor.tactics.style === "aggressive" && skill.kind === "attack") value += 40;
    if (actor.tactics.style === "defensive" && (skill.kind === "heal" || skill.kind === "buff")) value += 45;
    if (actor.tactics.prioritizeControl && skill.kind === "control") value += 55;
    if (actor.tactics.preserveStrongSkills && target.health / target.maxHealth > 0.7 && skill.power > 1.4) value -= 35;
    return value;
  };
  return useful.sort((a, b) => score(b) - score(a) || actor.skills.indexOf(a.id) - actor.skills.indexOf(b.id))[0];
}

function cooldownTick(fighter: RuntimeFighter): void {
  Object.keys(fighter.cooldowns).forEach((id) => { fighter.cooldowns[id] = Math.max(0, fighter.cooldowns[id] - 1); });
}

function attackDamage(actor: RuntimeFighter, target: RuntimeFighter, multiplier = 1): { damage: number; critical: boolean; detail: string } {
  actor.attackCounter += 1;
  let detail = "обычная атака";
  const actorContext = {
    attackCounter: actor.attackCounter,
    combo: actor.combo,
    healthRatio: actor.health / actor.maxHealth,
    setCounts: actor.setCounts,
  };
  const classAttack = actor.model.modifyCombatAttack(actor.attack * multiplier, actorContext);
  actor.combo = classAttack.combo ?? actor.combo;
  if (classAttack.detail) detail = classAttack.detail;
  const criticalChance = Math.min(60, actor.crit + actor.model.criticalChanceBonus(actorContext));
  const critical = Math.random() * 100 < criticalChance;
  const variance = 0.9 + Math.random() * 0.2;
  const weakened = 1 - actor.weakened;
  actor.weakened = 0;
  const raw = classAttack.damage * (1 + actor.buff) * weakened * variance * (critical ? 1.45 : 1);
  actor.buff = 0;
  const armorMultiplier = 120 / (120 + Math.max(0, target.defense) * 1.35);
  let damage = Math.max(1, Math.round(raw * armorMultiplier));
  const defended = target.model.modifyCombatDefense(damage, {
    attackCounter: target.attackCounter,
    combo: target.combo,
    healthRatio: target.health / target.maxHealth,
    setCounts: target.setCounts,
  });
  damage = defended.damage;
  target.combo = defended.combo ?? target.combo;
  if (defended.detail) detail += `; ${defended.detail}`;
  if (classAttack.secondaryDamageRatio && damage > 0) {
    const second = Math.max(1, Math.round(damage * classAttack.secondaryDamageRatio));
    damage += second;
    detail += `; второй удар: ${second}`;
  }
  return { damage, critical, detail };
}

function performTurn(turn: number, actor: RuntimeFighter, target: RuntimeFighter): BattleTurn {
  cooldownTick(actor);
  const skill = pickSkill(actor, target);
  let action = "Обычная атака";
  let detail = "";
  let damage = 0;
  let healing = 0;
  let critical = false;

  if (skill) {
    action = skill.name;
    actor.cooldowns[skill.id] = skill.cooldown;
    if (skill.kind === "heal") {
      const healthShare = skill.power >= 40 ? 0.12 : 0.08;
      healing = Math.min(actor.maxHealth - actor.health, Math.round(skill.power + actor.level * 1.2 + actor.maxHealth * healthShare));
      actor.health += healing;
      detail = `восстановлено ${healing} HP`;
    } else if (skill.kind === "buff") {
      actor.buff = Math.max(actor.buff, skill.power);
      detail = `следующая атака усилена на ${Math.round(skill.power * 100)}%`;
    } else if (skill.kind === "control") {
      const result = attackDamage(actor, target, skill.power);
      damage = result.damage; critical = result.critical; target.weakened = Math.max(target.weakened, 0.25);
      detail = `${result.detail}; следующий удар цели ослаблен`;
    } else {
      const multiplier = skill.id === "execution" && target.health / target.maxHealth < 0.42 ? skill.power * 1.25 : skill.power;
      const result = attackDamage(actor, target, multiplier);
      damage = result.damage; critical = result.critical; detail = result.detail;
    }
    {
      const baseEcho = actor.model.recoveryAfterSkill(actor.maxHealth, actor.health);
      const echo = (actor.setCounts.astral ?? 0) >= 4
        ? Math.min(actor.maxHealth - actor.health, baseEcho * 2)
        : baseEcho;
      if (echo > 0) {
        actor.health += echo;
        healing += echo;
        detail += `; отголосок восстановил ${echo} HP`;
      }
    }
  } else {
    const result = attackDamage(actor, target);
    damage = result.damage; critical = result.critical; detail = result.detail;
  }

  target.health = Math.max(0, target.health - damage);
  return {
    turn, actorId: actor.id, targetId: target.id, actorName: actor.name, targetName: target.name,
    action, skillId: skill?.id, detail, damage, healing, actorHealth: actor.health, targetHealth: target.health, critical,
  };
}

export function resolveCombat(heroProfile: HeroProfile, enemyProfile: EnemyProfile, options: { heroLevelCap?: number; ruleIds?: string[] } = {}): CombatResolution {
  const hero = toRuntime(heroProfile, { levelCap: options.heroLevelCap, ruleIds: options.ruleIds, side: "hero" });
  const enemy = toRuntime(enemyProfile, { ruleIds: options.ruleIds, side: "enemy" });
  const heroBefore: CombatantSnapshot = { ...hero };
  const enemyBefore: CombatantSnapshot = { ...enemy };
  const turns: BattleTurn[] = [];
  const order = hero.speed + Math.random() * 5 >= enemy.speed + Math.random() * 5 ? [hero, enemy] : [enemy, hero];

  for (let turn = 1; turn <= 80 && hero.health > 0 && enemy.health > 0; turn += 1) {
    const actor = order[(turn - 1) % 2];
    const target = actor.id === hero.id ? enemy : hero;
    if (actor.health <= 0) break;
    turns.push(performTurn(turn, actor, target));
  }
  if (hero.health > 0 && enemy.health > 0) {
    const winner = hero.health / hero.maxHealth >= enemy.health / enemy.maxHealth ? hero : enemy;
    const loser = winner.id === hero.id ? enemy : hero;
    loser.health = 0;
  }
  return { hero: heroBefore, enemy: enemyBefore, winnerId: hero.health > 0 ? hero.id : enemy.id, turns };
}

export function unlockedSkills(classId: HeroClass, level: number, inventory: EquipmentItem[] = []): SkillDefinition[] {
  return skillsFor(classId, level, inventory);
}

export function nextSkills(classId: HeroClass, level: number): SkillDefinition[] {
  return SKILLS.filter((skill) => !skill.equipmentOnly && (skill.classes === "all" || skill.classes.includes(classId)) && skill.unlockLevel > level)
    .sort((a, b) => a.unlockLevel - b.unlockLevel);
}

export function describeSetProgress(items: EquipmentItem[]): Array<{ name: string; count: number; active: string[] }> {
  const counts = setCounts(items);
  return EQUIPMENT_SETS.map((set) => ({
    name: set.name,
    count: counts[set.id] ?? 0,
    active: set.bonuses.filter((bonus) => (counts[set.id] ?? 0) >= bonus.pieces).map((bonus) => bonus.description),
  })).filter((set) => set.count > 0);
}
