import { CLASS_DEFINITIONS, EQUIPMENT_SETS, SKILLS, addStats } from "../catalogs/WorldCatalog";
import { equipmentScore } from "../factories/ItemFactory";
import { PlayerFactory } from "../factories/PlayerFactory";
import { Player } from "../abstract/Player";
import { createWeapon } from "../catalogs/WeaponCatalog";
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
} from "./WorldTypes";

interface RuntimeFighter extends CombatantSnapshot {
  model: Player;
  cooldowns: Record<string, number>;
  buff: number;
  weakened: number;
  attackCounter: number;
  combo: number;
  setCounts: Record<string, number>;
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

function itemStats(items: EquipmentItem[]): Partial<Stats> {
  return items.reduce<Partial<Stats>>((sum, item) => {
    for (const [key, value] of Object.entries(item.stats) as Array<[keyof Stats, number]>) {
      sum[key] = (sum[key] ?? 0) + value;
    }
    if (item.affix) sum[item.affix.stat] = (sum[item.affix.stat] ?? 0) + item.affix.value;
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
    ((skill.classes === "all" || skill.classes.includes(classId)) && skill.unlockLevel <= level)
    || ids.has(skill.id));
}

function toRuntime(profile: HeroProfile | EnemyProfile): RuntimeFighter {
  const items = equippedItems("inventory" in profile ? profile.inventory : profile.equipment, profile.equipped);
  const definition = CLASS_DEFINITIONS[profile.classId];
  const levelBonus: Partial<Stats> = {
    health: (profile.level - 1) * 11,
    attack: (profile.level - 1) * 2.1,
    defense: (profile.level - 1) * 1.35,
    speed: Math.floor((profile.level - 1) / 4),
    crit: Math.floor((profile.level - 1) / 6),
  };
  const counts = setCounts(items);
  const stats = applySetStats(addStats(addStats(definition.startingStats, levelBonus), itemStats(items)), counts);
  const skills = skillsFor(profile.classId, profile.level, items);
  const model = new PlayerFactory().create({
    className: profile.classId,
    health: Math.round(stats.health),
    strength: Math.round(stats.attack),
    name: profile.name,
    weapon: createWeapon(items.find((item) => item.slot === "weapon")?.name ?? definition.startingWeapon, 0),
    skills: [],
  });
  return {
    id: profile.id, name: profile.name, classId: profile.classId, level: profile.level,
    maxHealth: Math.round(stats.health), health: Math.round(stats.health), attack: Math.round(stats.attack),
    defense: Math.round(stats.defense), speed: Math.round(stats.speed), crit: Math.round(stats.crit),
    equipmentScore: equipmentScore(items), skills: skills.map((skill) => skill.id),
    model, cooldowns: {}, buff: 0, weakened: 0, attackCounter: 0, combo: 0, setCounts: counts,
  };
}

export function combatantSnapshot(profile: HeroProfile | EnemyProfile): CombatantSnapshot {
  const runtime = toRuntime(profile);
  return {
    id: runtime.id, name: runtime.name, classId: runtime.classId, level: runtime.level,
    maxHealth: runtime.maxHealth, health: runtime.health, attack: runtime.attack,
    defense: runtime.defense, speed: runtime.speed, crit: runtime.crit,
    equipmentScore: runtime.equipmentScore, skills: [...runtime.skills],
  };
}

function pickSkill(actor: RuntimeFighter, target: RuntimeFighter): SkillDefinition | undefined {
  const ready = SKILLS.filter((skill) => actor.skills.includes(skill.id) && (actor.cooldowns[skill.id] ?? 0) <= 0);
  const useful = ready.filter((skill) => skill.kind !== "heal" || actor.health / actor.maxHealth < 0.56)
    .filter((skill) => skill.id !== "execution" || target.health / target.maxHealth < 0.42);
  return useful.sort((a, b) => b.priority - a.priority)[0];
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
  const criticalChance = actor.crit + actor.model.criticalChanceBonus(actorContext);
  const critical = Math.random() * 100 < criticalChance;
  const variance = 0.9 + Math.random() * 0.2;
  const weakened = 1 - actor.weakened;
  actor.weakened = 0;
  const raw = classAttack.damage * (1 + actor.buff) * weakened * variance * (critical ? 1.55 : 1);
  actor.buff = 0;
  const defense = target.defense * 0.58;
  let damage = Math.max(1, Math.round(raw - defense));
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
      healing = Math.min(actor.maxHealth - actor.health, Math.round(skill.power + actor.level * 1.2));
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

export function resolveCombat(heroProfile: HeroProfile, enemyProfile: EnemyProfile): CombatResolution {
  const hero = toRuntime(heroProfile);
  const enemy = toRuntime(enemyProfile);
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
  return SKILLS.filter((skill) => (skill.classes === "all" || skill.classes.includes(classId)) && skill.unlockLevel > level)
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
