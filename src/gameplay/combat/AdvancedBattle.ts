import {
  CLASS_DEFINITIONS,
  EQUIPMENT_SETS,
  SKILLS,
  addStats,
} from "../../catalogs/WorldCatalog";
import { PlayerFactory } from "../../factories/PlayerFactory";
import { Player } from "../../abstract/Player";
import { createWeapon } from "../../catalogs/WeaponCatalog";
import {
  DEFAULT_TACTICAL_PROFILES,
  FIGHTER_SCARS,
  FIGHTER_TRAITS,
  TOURNAMENT_RULES,
} from "../../catalogs/WorldExpansionCatalog";
import {
  EnemyMemoryCombatRead,
  heroLoadoutSignature,
  readEnemyStyleMemory,
} from "./EnemyMemory";
import {
  CombatantSnapshot,
  EnemyProfile,
  EquipmentItem,
  EquipmentSet,
  HeroClass,
  HeroProfile,
  SkillDefinition,
  Stats,
  TacticalProfile,
} from "../core/WorldTypes";
import { FighterPowerCalculator } from "./FighterPowerCalculator";
import {
  ENEMY_CLASS_MUTATIONS,
  EnemyMutationState,
  initialEnemyMutationState,
  resolveEnemyMutation,
  SelectedEnemyMutation,
} from "../world/EraChallenges";
import {
  BattleEffectPipeline,
  BattleStatus,
  BattleStatusId,
  ClassResourceState,
  StatusCombinationId,
  createClassResource,
} from "./CombatEffects";
import {
  analyzeBattle,
  BattleAnalytics,
  DetailedBattleTurn,
} from "./BattleAnalytics";
import { chooseTacticalSkill, TacticalDecision } from "./BattleTactics";
import {
  combatActionRate,
  combatArmorMultiplier,
  combatPressure,
  MAX_DIRECT_DAMAGE_SHARE,
  skillHealing,
} from "./CombatBalance";
import { selectActiveSkills } from "./SkillLoadout";
import {
  equipmentResonance,
  resonanceCooldownCadence,
  resonanceDamageMultiplier,
  resonanceGuardMultiplier,
} from "../equipment/EquipmentEvolution";
import {
  nativeRandom,
  RandomSnapshot,
  RandomSource,
  SeededRandom,
} from "../core/RandomSource";

export { MAX_ACTIVE_SKILLS } from "../world/WorldRules";

interface RuntimeFighter extends CombatantSnapshot {
  model: Player;
  cooldowns: Record<string, number>;
  buff: number;
  weakened: number;
  attackCounter: number;
  actionsTaken: number;
  combo: number;
  setCounts: Record<string, number>;
  tactics: TacticalProfile;
  disableHealing: boolean;
  statuses: BattleStatus[];
  resource: ClassResourceState;
  nextActionAt: number;
  usedMechanics: Set<string>;
  memoryRead?: EnemyMemoryCombatRead;
  mutation?: SelectedEnemyMutation;
  mutationState: EnemyMutationState;
}

export interface CombatResolution {
  hero: CombatantSnapshot;
  enemy: CombatantSnapshot;
  winnerId: string;
  turns: DetailedBattleTurn[];
  analysis: BattleAnalytics;
}

export interface CombatStatMultipliers {
  health?: number;
  attack?: number;
  defense?: number;
}

export interface CombatOptions {
  heroLevelCap?: number;
  enemyLevelCap?: number;
  ruleIds?: string[];
  heroStatMultipliers?: CombatStatMultipliers;
  enemyStatMultipliers?: CombatStatMultipliers;
  randomSource?: RandomSource;
}

export type BattleAction =
  { type: "basic" } | { type: "skill"; skillId: string };

export interface BattleActionOption {
  id: string;
  name: string;
  kind: "basic" | SkillDefinition["kind"];
  cooldown: number;
  available: boolean;
  recommended?: boolean;
  reason?: string;
  score?: number;
}

export interface BattleFighterState extends CombatantSnapshot {
  statuses: BattleStatus[];
  resource: ClassResourceState;
  nextActionAt: number;
}

export interface BattleRuntimeSnapshot extends CombatantSnapshot {
  cooldowns: Record<string, number>;
  buff: number;
  weakened: number;
  attackCounter: number;
  actionsTaken?: number;
  combo: number;
  tactics: TacticalProfile;
  disableHealing: boolean;
  statuses: BattleStatus[];
  resource: ClassResourceState;
  nextActionAt: number;
  usedMechanics: string[];
  memoryRead?: EnemyMemoryCombatRead;
  mutationState: EnemyMutationState;
}

export interface BattleSessionSnapshot {
  version: 1;
  heroBefore: CombatantSnapshot;
  enemyBefore: CombatantSnapshot;
  hero: BattleRuntimeSnapshot;
  enemy: BattleRuntimeSnapshot;
  turns: DetailedBattleTurn[];
  nextActorId: string;
  winnerId?: string;
  random: RandomSnapshot;
}

function equippedItems(
  inventory: EquipmentItem[],
  equipped: EquipmentSet,
): EquipmentItem[] {
  const ids = new Set(Object.values(equipped));
  return inventory.filter((item) => ids.has(item.id));
}

function itemStats(items: EquipmentItem[], levelCap?: number): Partial<Stats> {
  return items.reduce<Partial<Stats>>((sum, item) => {
    const scale =
      levelCap && item.level > levelCap
        ? Math.max(0.35, levelCap / item.level)
        : 1;
    for (const [key, value] of Object.entries(item.stats) as Array<
      [keyof Stats, number]
    >) {
      sum[key] = (sum[key] ?? 0) + Math.max(1, Math.round(value * scale));
    }
    if (item.affix)
      sum[item.affix.stat] =
        (sum[item.affix.stat] ?? 0) +
        Math.max(1, Math.round(item.affix.value * scale));
    (item.relicProperties ?? []).forEach((property) => {
      sum[property.stat] =
        (sum[property.stat] ?? 0) +
        Math.max(1, Math.round(property.value * scale));
    });
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
    set.bonuses
      .filter((bonus) => count >= bonus.pieces && bonus.stats)
      .forEach((bonus) => {
        for (const [stat, value] of Object.entries(bonus.stats!) as Array<
          [keyof Stats, number]
        >) {
          result[stat] += value;
        }
      });
  });
  return result;
}

function skillsFor(
  classId: HeroClass,
  level: number,
  items: EquipmentItem[],
): SkillDefinition[] {
  const ids = new Set(items.map((item) => item.grantedSkillId).filter(Boolean));
  return SKILLS.filter(
    (skill) =>
      (!skill.equipmentOnly &&
        (skill.classes === "all" || skill.classes.includes(classId)) &&
        skill.unlockLevel <= level) ||
      ids.has(skill.id),
  );
}

function featureStats(profile: HeroProfile | EnemyProfile): Partial<Stats> {
  const ids = [...(profile.traitIds ?? []), ...(profile.scarIds ?? [])];
  const definitions = [...FIGHTER_TRAITS, ...FIGHTER_SCARS];
  const result: Partial<Stats> = {};
  ids.forEach((id) => {
    const feature = definitions.find((candidate) => candidate.id === id);
    if (!feature) return;
    Object.entries(feature.stats).forEach(([stat, value]) => {
      const key = stat as keyof Stats;
      result[key] = (result[key] ?? 0) + Number(value);
    });
  });
  (profile.injuries ?? [])
    .filter((injury) => injury.remainingDays > 0)
    .forEach((injury) => {
      Object.entries(injury.stats).forEach(([stat, value]) => {
        const key = stat as keyof Stats;
        result[key] = (result[key] ?? 0) + Number(value);
      });
    });
  return result;
}

function tacticsFor(profile: HeroProfile | EnemyProfile): TacticalProfile {
  if ("tacticalProfiles" in profile) {
    return (
      profile.tacticalProfiles.find(
        (candidate) => candidate.id === profile.activeTacticalProfileId,
      ) ??
      profile.tacticalProfiles[0] ??
      DEFAULT_TACTICAL_PROFILES[0]
    );
  }
  return (
    DEFAULT_TACTICAL_PROFILES.find(
      (candidate) => candidate.style === profile.tacticalStyle,
    ) ?? DEFAULT_TACTICAL_PROFILES[0]
  );
}

interface RuntimeOptions {
  levelCap?: number;
  ruleIds?: string[];
  side?: "hero" | "enemy";
  statMultipliers?: CombatStatMultipliers;
  bonusStats?: Partial<Stats>;
}

function safeStatMultiplier(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 1;
  return Math.max(0.1, Math.min(3, value));
}

function toRuntime(
  profile: HeroProfile | EnemyProfile,
  options: RuntimeOptions = {},
): RuntimeFighter {
  const {
    levelCap,
    ruleIds = [],
    side = "enemy",
    statMultipliers = {},
    bonusStats = {},
  } = options;
  const items = equippedItems(
    "inventory" in profile ? profile.inventory : profile.equipment,
    profile.equipped,
  );
  const definition = CLASS_DEFINITIONS[profile.classId];
  const effectiveLevel = levelCap
    ? Math.min(profile.level, levelCap)
    : profile.level;
  const completedLevels = effectiveLevel - 1;
  const levelBonus: Partial<Stats> = {
    health: completedLevels * 16 + completedLevels ** 2 * 0.27,
    attack: completedLevels * 1.75 + completedLevels ** 2 * 0.075,
    defense: completedLevels * 0.85,
    speed: Math.floor((effectiveLevel - 1) / 4),
    crit: Math.floor((effectiveLevel - 1) / 6),
  };
  const counts = setCounts(items);
  let stats = applySetStats(
    addStats(
      addStats(
        addStats(definition.startingStats, levelBonus),
        itemStats(items, levelCap),
      ),
      featureStats(profile),
    ),
    counts,
  );
  const rules = TOURNAMENT_RULES.filter((rule) => ruleIds.includes(rule.id));
  rules.forEach((rule) => {
    stats = addStats(
      stats,
      side === "hero" ? (rule.heroStats ?? {}) : (rule.enemyStats ?? {}),
    );
  });
  stats = addStats(stats, bonusStats);
  stats.health = Math.max(
    1,
    Math.round(stats.health * safeStatMultiplier(statMultipliers.health)),
  );
  stats.attack = Math.max(
    1,
    Math.round(stats.attack * safeStatMultiplier(statMultipliers.attack)),
  );
  stats.defense = Math.max(
    0,
    Math.round(stats.defense * safeStatMultiplier(statMultipliers.defense)),
  );
  stats.speed = Math.max(1, Math.round(stats.speed));
  stats.crit = Math.max(0, Math.min(60, Math.round(stats.crit)));
  const disableHealing = rules.some((rule) => rule.disableHealing);
  const availableSkills = skillsFor(profile.classId, effectiveLevel, items);
  if ("legacySkillId" in profile && profile.legacySkillId) {
    const inheritedSkill = SKILLS.find(
      (skill) => skill.id === profile.legacySkillId,
    );
    if (
      inheritedSkill &&
      !availableSkills.some((skill) => skill.id === inheritedSkill.id)
    )
      availableSkills.push(inheritedSkill);
  }
  const skills = selectActiveSkills(
    profile,
    availableSkills.filter((skill) => !disableHealing || skill.kind !== "heal"),
    tacticsFor(profile),
  );
  const model = new PlayerFactory().create({
    className: profile.classId,
    health: Math.round(stats.health),
    strength: Math.round(stats.attack),
    name: profile.name,
    weapon: createWeapon(
      items.find((item) => item.slot === "weapon")?.name ??
        definition.startingWeapon,
      0,
    ),
    skills: [],
  });
  const mutationDefinition =
    "eraMutationId" in profile && profile.eraMutationId
      ? ENEMY_CLASS_MUTATIONS.find(
          (candidate) =>
            candidate.id === profile.eraMutationId &&
            candidate.classId === profile.classId,
        )
      : undefined;
  const mutation = mutationDefinition
    ? {
        ...mutationDefinition,
        potency: Math.max(
          1,
          Number(
            "eraMutationPotency" in profile ? profile.eraMutationPotency : 1,
          ) || 1,
        ),
      }
    : undefined;
  return {
    id: profile.id,
    name: profile.name,
    classId: profile.classId,
    level: effectiveLevel,
    originalLevel: effectiveLevel === profile.level ? undefined : profile.level,
    maxHealth: Math.round(stats.health),
    health: Math.round(stats.health),
    attack: Math.round(stats.attack),
    defense: Math.round(stats.defense),
    speed: Math.round(stats.speed),
    crit: Math.round(stats.crit),
    equipmentScore: FighterPowerCalculator.equipment(items, levelCap),
    skills: skills.map((skill) => skill.id),
    traitIds: [...(profile.traitIds ?? [])],
    injuryNames: (profile.injuries ?? [])
      .filter((injury) => injury.remainingDays > 0)
      .map((injury) => injury.name),
    tacticalStyle: tacticsFor(profile).style,
    model,
    cooldowns: {},
    buff: 0,
    weakened: 0,
    attackCounter: 0,
    actionsTaken: 0,
    combo: 0,
    setCounts: counts,
    equipmentResonance: equipmentResonance(items),
    tactics: tacticsFor(profile),
    disableHealing,
    statuses: [],
    resource: createClassResource(profile.classId),
    nextActionAt: 0,
    usedMechanics: new Set<string>(),
    mutation,
    mutationState: initialEnemyMutationState(),
  };
}

function isCombatantSnapshot(
  profile: HeroProfile | EnemyProfile | CombatantSnapshot,
): profile is CombatantSnapshot {
  return "maxHealth" in profile && "attack" in profile && "skills" in profile;
}

function runtimeFromSnapshot(snapshot: CombatantSnapshot): RuntimeFighter {
  const definition = CLASS_DEFINITIONS[snapshot.classId];
  const tactics =
    DEFAULT_TACTICAL_PROFILES.find(
      (profile) => profile.style === snapshot.tacticalStyle,
    ) ?? DEFAULT_TACTICAL_PROFILES[0];
  const model = new PlayerFactory().create({
    className: snapshot.classId,
    health: snapshot.maxHealth,
    strength: snapshot.attack,
    name: snapshot.name,
    weapon: createWeapon(definition.startingWeapon, 0),
    skills: [],
  });
  const mutationDefinition = snapshot.mutationId
    ? ENEMY_CLASS_MUTATIONS.find(
        (candidate) =>
          candidate.id === snapshot.mutationId &&
          candidate.classId === snapshot.classId,
      )
    : undefined;
  const mutation = mutationDefinition
    ? {
        ...mutationDefinition,
        potency: Math.max(1, Number(snapshot.mutationPotency) || 1),
      }
    : undefined;
  return {
    ...snapshot,
    originalLevel: snapshot.originalLevel,
    health: snapshot.health,
    skills: [...snapshot.skills],
    traitIds: [...(snapshot.traitIds ?? [])],
    injuryNames: [...(snapshot.injuryNames ?? [])],
    model,
    cooldowns: {},
    buff: 0,
    weakened: 0,
    attackCounter: 0,
    actionsTaken: 0,
    combo: 0,
    setCounts: { ...(snapshot.setCounts ?? {}) },
    equipmentResonance: snapshot.equipmentResonance
      ? { ...snapshot.equipmentResonance }
      : undefined,
    tactics,
    tacticalStyle: tactics.style,
    disableHealing: false,
    statuses: [],
    resource: createClassResource(snapshot.classId),
    nextActionAt: 0,
    usedMechanics: new Set<string>(),
    mutation,
    mutationState: initialEnemyMutationState(),
  };
}

function cloneCombatantSnapshot(
  snapshot: CombatantSnapshot,
): CombatantSnapshot {
  return {
    ...snapshot,
    skills: [...snapshot.skills],
    traitIds: snapshot.traitIds ? [...snapshot.traitIds] : undefined,
    injuryNames: snapshot.injuryNames ? [...snapshot.injuryNames] : undefined,
    setCounts: snapshot.setCounts ? { ...snapshot.setCounts } : undefined,
    equipmentResonance: snapshot.equipmentResonance
      ? { ...snapshot.equipmentResonance }
      : undefined,
  };
}

function cloneBattleTurn(turn: DetailedBattleTurn): DetailedBattleTurn {
  return {
    ...turn,
    statusComboIds: turn.statusComboIds ? [...turn.statusComboIds] : undefined,
    resourceEvents: turn.resourceEvents?.map((event) => ({ ...event })),
  };
}

function battleRuntimeSnapshot(runtime: RuntimeFighter): BattleRuntimeSnapshot {
  return {
    ...runtimeSnapshot(runtime),
    cooldowns: { ...runtime.cooldowns },
    buff: runtime.buff,
    weakened: runtime.weakened,
    attackCounter: runtime.attackCounter,
    actionsTaken: runtime.actionsTaken,
    combo: runtime.combo,
    tactics: { ...runtime.tactics },
    disableHealing: runtime.disableHealing,
    statuses: runtime.statuses.map((status) => ({ ...status })),
    resource: { ...runtime.resource },
    nextActionAt: runtime.nextActionAt,
    usedMechanics: [...runtime.usedMechanics],
    memoryRead: runtime.memoryRead
      ? {
          ...runtime.memoryRead,
          countermeasureIds: [...runtime.memoryRead.countermeasureIds],
          evidence: runtime.memoryRead.evidence
            ? [...runtime.memoryRead.evidence]
            : undefined,
        }
      : undefined,
    mutationState: { ...runtime.mutationState },
  };
}

function runtimeFromBattleSnapshot(
  snapshot: BattleRuntimeSnapshot,
): RuntimeFighter {
  const runtime = runtimeFromSnapshot(snapshot);
  runtime.cooldowns = { ...snapshot.cooldowns };
  runtime.buff = snapshot.buff;
  runtime.weakened = snapshot.weakened;
  runtime.attackCounter = snapshot.attackCounter;
  runtime.actionsTaken = Math.max(0, Number(snapshot.actionsTaken) || 0);
  runtime.combo = snapshot.combo;
  runtime.tactics = { ...snapshot.tactics };
  runtime.tacticalStyle = snapshot.tactics.style;
  runtime.disableHealing = snapshot.disableHealing;
  runtime.statuses = snapshot.statuses.map((status) => ({ ...status }));
  runtime.resource = {
    ...createClassResource(snapshot.classId),
    ...snapshot.resource,
  };
  runtime.nextActionAt = snapshot.nextActionAt;
  runtime.usedMechanics = new Set(snapshot.usedMechanics);
  runtime.memoryRead = snapshot.memoryRead
    ? {
        ...snapshot.memoryRead,
        countermeasureIds: [...snapshot.memoryRead.countermeasureIds],
        evidence: snapshot.memoryRead.evidence
          ? [...snapshot.memoryRead.evidence]
          : undefined,
      }
    : undefined;
  runtime.mutationState = { ...snapshot.mutationState };
  return runtime;
}

function isBattleSessionSnapshot(
  value: unknown,
): value is BattleSessionSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BattleSessionSnapshot>;
  return (
    candidate.version === 1 &&
    Boolean(candidate.heroBefore) &&
    Boolean(candidate.enemyBefore) &&
    Boolean(candidate.hero) &&
    Boolean(candidate.enemy) &&
    Boolean(candidate.random) &&
    Array.isArray(candidate.turns)
  );
}

export function combatantSnapshot(
  profile: HeroProfile | EnemyProfile,
  levelCap?: number,
): CombatantSnapshot {
  const runtime = toRuntime(profile, {
    levelCap,
    side: profile.id === "hero" ? "hero" : "enemy",
  });
  return runtimeSnapshot(runtime);
}

function readySkills(actor: RuntimeFighter): SkillDefinition[] {
  return SKILLS.filter(
    (skill) =>
      actor.skills.includes(skill.id) && (actor.cooldowns[skill.id] ?? 0) <= 0,
  );
}

function skillDecision(
  ready: SkillDefinition[],
  actor: RuntimeFighter,
  target: RuntimeFighter,
): TacticalDecision {
  const pressure = combatPressure(actor.actionsTaken + 1, target.actionsTaken);
  const denial =
    actor.id === "hero" && hasMemoryCounter(target, "healing-denial")
      ? 1 - 0.35 * (target.memoryRead?.strength ?? 0)
      : 1;
  return chooseTacticalSkill(
    ready,
    { ...actor, healingMultiplier: pressure.healingMultiplier * denial },
    target,
  );
}

function cooldownTick(fighter: RuntimeFighter): void {
  Object.keys(fighter.cooldowns).forEach((id) => {
    fighter.cooldowns[id] = Math.max(0, fighter.cooldowns[id] - 1);
  });
}

function hasMemoryCounter(
  target: RuntimeFighter,
  id: EnemyMemoryCombatRead["countermeasureIds"][number],
): boolean {
  return (
    target.memoryRead?.countermeasureIds.includes(id) === true &&
    (target.memoryRead?.strength ?? 0) > 0
  );
}

function addStatusWithMutation(
  target: RuntimeFighter,
  effects: BattleEffectPipeline,
  id: BattleStatusId,
  duration: number,
  sourceId?: string,
): string | undefined {
  if (target.mutation) {
    const mutation = resolveEnemyMutation(
      target.mutation,
      target.mutationState,
      { type: "incoming-status", statusId: id },
    );
    target.mutationState = mutation.state;
    if (mutation.effect.cancelIncomingStatus) {
      target.nextActionAt = Math.max(
        0,
        target.nextActionAt - mutation.effect.initiativeDelta / 10,
      );
      return mutation.effect.detail;
    }
  }
  effects.addStatus(target, id, duration, sourceId);
  return undefined;
}

function attackDamage(
  actor: RuntimeFighter,
  target: RuntimeFighter,
  random: RandomSource,
  effects: BattleEffectPipeline,
  multiplier = 1,
  skillId?: string,
): {
  damage: number;
  critical: boolean;
  detail: string;
  statusComboIds: StatusCombinationId[];
} {
  actor.attackCounter += 1;
  let detail = "обычная атака";
  let mutationDamageMultiplier = 1;
  let mutationBonusDamageRatio = 0;
  if (actor.mutation) {
    const eventTypes: Array<"attack" | "skill-used"> = [
      "attack",
      ...(skillId ? ["skill-used" as const] : []),
    ];
    eventTypes.forEach((type) => {
      const mutation = resolveEnemyMutation(
        actor.mutation!,
        actor.mutationState,
        {
          type,
          currentHealth: actor.health,
          maxHealth: actor.maxHealth,
          targetHealthRatio: target.health / target.maxHealth,
        },
      );
      actor.mutationState = mutation.state;
      mutationDamageMultiplier *= mutation.effect.damageMultiplier;
      mutationBonusDamageRatio += mutation.effect.bonusDamageRatio;
      actor.health = Math.max(0, actor.health - mutation.effect.selfDamage);
      actor.nextActionAt = Math.max(
        0,
        actor.nextActionAt - mutation.effect.initiativeDelta / 10,
      );
      if (mutation.effect.cooldownReduction > 0) {
        Object.keys(actor.cooldowns).forEach((id) => {
          actor.cooldowns[id] = Math.max(
            0,
            actor.cooldowns[id] - mutation.effect.cooldownReduction,
          );
        });
      }
      if (mutation.effect.applyStatusId) {
        const blocked = addStatusWithMutation(
          target,
          effects,
          mutation.effect.applyStatusId as BattleStatusId,
          3,
          actor.id,
        );
        if (blocked) detail += `; ${blocked}`;
      }
      if (mutation.effect.detail) detail += `; ${mutation.effect.detail}`;
    });
  }
  const actorContext = {
    attackCounter: actor.attackCounter,
    combo: actor.combo,
    healthRatio: actor.health / actor.maxHealth,
    setCounts: actor.setCounts,
    random: () => random.next(),
  };
  const classAttack = actor.model.modifyCombatAttack(
    actor.attack * multiplier,
    actorContext,
  );
  actor.combo = classAttack.combo ?? actor.combo;
  if (classAttack.detail) detail = classAttack.detail;
  const memoryStrength =
    actor.id === "hero" ? (target.memoryRead?.strength ?? 0) : 0;
  const criticalGuard = hasMemoryCounter(target, "critical-guard")
    ? 12 * memoryStrength
    : 0;
  const criticalChance = Math.min(
    60,
    Math.max(
      0,
      actor.crit +
        actor.model.criticalChanceBonus(actorContext) -
        criticalGuard,
    ),
  );
  const critical = random.next() * 100 < criticalChance;
  const variance = 0.9 + random.next() * 0.2;
  const weakened = 1 - actor.weakened;
  actor.weakened = 0;
  const raw =
    classAttack.damage *
    mutationDamageMultiplier *
    (1 + actor.buff) *
    weakened *
    variance *
    (critical ? 1.45 : 1);
  actor.buff = 0;
  const armorMultiplier = combatArmorMultiplier(target.defense);
  let damage = Math.max(1, Math.round(raw * armorMultiplier));
  const defended = target.model.modifyCombatDefense(damage, {
    attackCounter: target.attackCounter,
    combo: target.combo,
    healthRatio: target.health / target.maxHealth,
    setCounts: target.setCounts,
    random: () => random.next(),
  });
  damage = defended.damage;
  target.combo = defended.combo ?? target.combo;
  if (defended.detail) detail += `; ${defended.detail}`;
  if (classAttack.secondaryDamageRatio && damage > 0) {
    const criticalCarriesToSecond = (actor.setCounts.powder ?? 0) >= 6;
    const secondaryBase =
      critical && !criticalCarriesToSecond
        ? Math.max(1, Math.round(damage / 1.45))
        : damage;
    const second = Math.max(
      1,
      Math.round(secondaryBase * classAttack.secondaryDamageRatio),
    );
    damage += second;
    detail += `; второй удар: ${second}${critical && criticalCarriesToSecond ? " (критический)" : ""}`;
  }
  if (
    actor.id === "hero" &&
    hasMemoryCounter(target, "guarded-opening") &&
    actor.attackCounter <= 2
  ) {
    damage = Math.max(1, Math.round(damage * (1 - 0.22 * memoryStrength)));
    detail += "; соперник ожидал ранний натиск";
  }
  if (
    actor.id === "hero" &&
    skillId === "execution" &&
    hasMemoryCounter(target, "execution-watch") &&
    target.health / target.maxHealth <= 0.42
  ) {
    damage = Math.max(1, Math.round(damage * (1 - 0.2 * memoryStrength)));
    detail += "; соперник прикрылся от добивания";
  }
  if (
    actor.id === "hero" &&
    skillId &&
    hasMemoryCounter(target, "signature-parry") &&
    target.memoryRead?.signatureSkillId === skillId &&
    random.next() < 0.28 * memoryStrength
  ) {
    damage = Math.max(1, Math.round(damage * (1 - 0.58 * memoryStrength)));
    detail += "; коронный приём частично парирован";
  }
  const modified = effects.modifyDamage(
    actor,
    target,
    damage,
    Boolean(skillId),
  );
  damage = modified.damage;
  if (modified.detail.length > 0) detail += `; ${modified.detail.join("; ")}`;
  if (mutationBonusDamageRatio > 0 && damage > 0) {
    const bonus = Math.max(1, Math.round(damage * mutationBonusDamageRatio));
    damage += bonus;
    detail += `; мутация добавила ${bonus} урона`;
  }
  if (target.mutation) {
    const mutation = resolveEnemyMutation(
      target.mutation,
      target.mutationState,
      {
        type: "received-hit",
        damage,
        currentHealth: target.health,
        maxHealth: target.maxHealth,
        critical,
      },
    );
    target.mutationState = mutation.state;
    if (
      mutation.effect.preventLethal &&
      damage >= target.health &&
      target.health > 1
    )
      damage = target.health - 1;
    if (mutation.effect.reflectedDamage > 0) {
      actor.health = Math.max(
        0,
        actor.health - mutation.effect.reflectedDamage,
      );
      detail += `; отражено ${mutation.effect.reflectedDamage} урона`;
    }
    if (mutation.effect.detail) detail += `; ${mutation.effect.detail}`;
  }
  return {
    damage,
    critical,
    detail,
    statusComboIds: [...modified.statusComboIds],
  };
}

function performTurn(
  turn: number,
  actor: RuntimeFighter,
  target: RuntimeFighter,
  random: RandomSource,
  effects: BattleEffectPipeline,
  choice?: BattleAction,
): DetailedBattleTurn {
  cooldownTick(actor);
  const startEffects = effects.beginTurn(actor);
  if (actor.health <= 0) {
    return {
      turn,
      actorId: actor.id,
      targetId: actor.id,
      actorName: actor.name,
      targetName: actor.name,
      action: "Последствия состояний",
      detail: startEffects.detail.join("; "),
      damage: startEffects.damage,
      healing: 0,
      actorHealth: actor.health,
      targetHealth: actor.health,
      critical: false,
      statusComboIds: [...startEffects.statusComboIds],
    };
  }
  let skill: SkillDefinition | undefined;
  let decisionReason = "";
  let decisionScore = 0;
  if (choice?.type === "skill") {
    skill = readySkills(actor).find(
      (candidate) => candidate.id === choice.skillId,
    );
    if (!skill)
      throw new RangeError(
        `Skill ${choice.skillId} is not available for ${actor.name}.`,
      );
    decisionReason = "приём выбран игроком вручную";
  } else if (!choice || choice.type !== "basic") {
    const decision = skillDecision(readySkills(actor), actor, target);
    skill = decision.skill;
    decisionReason = decision.reason;
    decisionScore = decision.score;
  } else {
    decisionReason = "обычная атака выбрана игроком вручную";
  }
  actor.actionsTaken += 1;
  let action = "Обычная атака";
  const turnStartDetail = startEffects.detail.join("; ");
  let detail = "";
  let damage = 0;
  let healing = 0;
  let critical = false;
  const statusComboIds = [...startEffects.statusComboIds];
  const targetAfflicted = target.statuses.some(
    (status) =>
      status.id === "burning" ||
      status.id === "bleeding" ||
      status.id === "marked",
  );

  const pressure = combatPressure(actor.actionsTaken, target.actionsTaken);
  const damagePressure = pressure.damageMultiplier;
  const healingPressure = pressure.healingMultiplier;

  if (skill) {
    action = skill.name;
    actor.cooldowns[skill.id] = Math.max(
      1,
      skill.cooldown - ((actor.setCounts.astral ?? 0) >= 6 ? 1 : 0),
    );
    if (skill.kind === "heal") {
      let healingMultiplier = healingPressure;
      if (actor.id === "hero" && hasMemoryCounter(target, "healing-denial")) {
        healingMultiplier *= 1 - 0.35 * (target.memoryRead?.strength ?? 0);
        detail = "соперник частично сорвал восстановление; ";
      }
      healing = skillHealing(
        skill,
        actor.level,
        actor.health,
        actor.maxHealth,
        healingMultiplier,
      );
      actor.health += healing;
      detail += `восстановлено ${healing} HP`;
    } else if (skill.kind === "buff") {
      actor.buff = Math.max(actor.buff, skill.power);
      detail = `следующая атака усилена на ${Math.round(skill.power * 100)}%`;
    } else if (skill.kind === "control") {
      const result = attackDamage(
        actor,
        target,
        random,
        effects,
        skill.power,
        skill.id,
      );
      damage = result.damage;
      critical = result.critical;
      statusComboIds.push(...result.statusComboIds);
      const controlResistance =
        actor.id === "hero" && hasMemoryCounter(target, "control-discipline")
          ? 0.65 * (target.memoryRead?.strength ?? 0)
          : 0;
      target.weakened = Math.max(
        target.weakened,
        0.25 * (1 - controlResistance),
      );
      const blockedStatus = addStatusWithMutation(
        target,
        effects,
        "staggered",
        2,
        actor.id,
      );
      detail = `${result.detail}; следующий удар цели ослаблен${controlResistance > 0 ? " слабее из-за выученной дисциплины" : ""}`;
      if (blockedStatus) detail += `; ${blockedStatus}`;
    } else {
      const multiplier =
        skill.id === "execution" && target.health / target.maxHealth < 0.42
          ? skill.power * 1.25
          : skill.power;
      const result = attackDamage(
        actor,
        target,
        random,
        effects,
        multiplier,
        skill.id,
      );
      damage = result.damage;
      critical = result.critical;
      detail = result.detail;
      statusComboIds.push(...result.statusComboIds);
    }
    {
      const baseEcho = actor.model.recoveryAfterSkill(
        actor.maxHealth,
        actor.health,
      );
      const baseRecovery =
        (actor.setCounts.astral ?? 0) >= 4
          ? Math.min(actor.maxHealth - actor.health, baseEcho * 2)
          : baseEcho;
      const echo = Math.min(
        actor.maxHealth - actor.health,
        Math.max(0, Math.round(baseRecovery * healingPressure)),
      );
      if (echo > 0) {
        actor.health += echo;
        healing += echo;
        detail += `; отголосок восстановил ${echo} HP`;
      }
    }
  } else {
    const result = attackDamage(actor, target, random, effects);
    damage = result.damage;
    critical = result.critical;
    detail = result.detail;
    statusComboIds.push(...result.statusComboIds);
  }

  const resonancePower = resonanceDamageMultiplier(
    actor.equipmentResonance,
    targetAfflicted,
  );
  if (damage > 0 && resonancePower > 1) {
    damage = Math.max(1, Math.round(damage * resonancePower));
    detail += `; наследие комплекта «${actor.equipmentResonance!.setName}» усилило удар по ослабленной цели`;
  }
  if (damage > 0 && damagePressure > 1) {
    damage = Math.max(1, Math.round(damage * damagePressure));
    if (damagePressure >= 1.25) detail += "; усталость боя усилила натиск";
  }
  damage = Math.min(
    damage,
    Math.max(1, Math.round(target.maxHealth * MAX_DIRECT_DAMAGE_SHARE)),
  );

  if (
    damage > 0 &&
    target.health / target.maxHealth < 0.4 &&
    target.equipmentResonance?.path === "guard" &&
    !target.usedMechanics.has("resonance-last-guard")
  ) {
    target.usedMechanics.add("resonance-last-guard");
    damage = Math.max(
      1,
      Math.round(damage * resonanceGuardMultiplier(target.equipmentResonance)),
    );
    effects.addStatus(target, "guarded", 3, target.id);
    detail += `; наследие комплекта «${target.equipmentResonance.setName}» приняло часть удара и подготовило защиту`;
  }

  if (
    damage >= target.health &&
    target.health > 1 &&
    (target.setCounts.bastion ?? 0) >= 6 &&
    !target.usedMechanics.has("bastion-last-stand")
  ) {
    target.usedMechanics.add("bastion-last-stand");
    damage = target.health - 1;
    detail += "; последний бастион оставил бойцу 1 HP";
  }
  target.health = Math.max(0, target.health - damage);
  if (critical && damage > 0 && (actor.setCounts.dusk ?? 0) >= 6) {
    const restored = Math.min(
      actor.maxHealth - actor.health,
      Math.max(1, Math.round(actor.maxHealth * 0.03 * healingPressure)),
    );
    actor.health += restored;
    healing += restored;
    detail += `; парные сумерки восстановили ${restored} HP`;
  }
  const mechanic = effects.afterAction(actor, target, damage, Boolean(skill), {
    critical,
    skillKind: skill?.kind,
    skillId: skill?.id,
    combo: actor.combo,
    healing,
    healingMultiplier: healingPressure,
  });
  healing += mechanic.healing;
  if (mechanic.detail.length > 0) detail += `; ${mechanic.detail.join("; ")}`;
  const cadence = resonanceCooldownCadence(actor.equipmentResonance);
  if (skill && cadence && actor.actionsTaken % cadence === 0) {
    const cooling = Object.keys(actor.cooldowns).filter(
      (id) => id !== skill.id && actor.cooldowns[id] > 0,
    );
    cooling.forEach((id) => {
      actor.cooldowns[id] = Math.max(0, actor.cooldowns[id] - 1);
    });
    if (cooling.length > 0)
      detail += `; наследие комплекта «${actor.equipmentResonance!.setName}» ускорило возвращение ${cooling.length} навыков`;
  }
  if (healing > 0 && healingPressure <= 0.75)
    detail += "; усталость ослабила восстановление";
  if (turnStartDetail)
    detail = `${turnStartDetail}${detail ? `; ${detail}` : ""}`;
  if (decisionReason)
    detail += `${detail ? "; " : ""}Решение: ${decisionReason}`;
  detail = detail.replace(/^;\s*/, "");
  return {
    turn,
    actorId: actor.id,
    targetId: target.id,
    actorName: actor.name,
    targetName: target.name,
    action,
    skillId: skill?.id,
    detail,
    damage,
    healing,
    actorHealth: actor.health,
    targetHealth: target.health,
    critical,
    decisionReason,
    decisionScore,
    resourceChange:
      mechanic.resourceEvents.reduce((sum, event) => sum + event.gained, 0) ||
      undefined,
    resourceTriggered: mechanic.resourceEvents.find((event) => event.trigger)
      ?.trigger,
    statusComboIds: [...new Set(statusComboIds)],
    resourceEvents: mechanic.resourceEvents.map((event) => ({ ...event })),
  };
}

function runtimeSnapshot(runtime: RuntimeFighter): CombatantSnapshot {
  return {
    id: runtime.id,
    name: runtime.name,
    classId: runtime.classId,
    level: runtime.level,
    originalLevel: runtime.originalLevel,
    maxHealth: runtime.maxHealth,
    health: runtime.health,
    attack: runtime.attack,
    defense: runtime.defense,
    speed: runtime.speed,
    crit: runtime.crit,
    equipmentScore: runtime.equipmentScore,
    skills: [...runtime.skills],
    traitIds: runtime.traitIds ? [...runtime.traitIds] : undefined,
    injuryNames: runtime.injuryNames ? [...runtime.injuryNames] : undefined,
    tacticalStyle: runtime.tacticalStyle,
    setCounts: { ...runtime.setCounts },
    equipmentResonance: runtime.equipmentResonance
      ? { ...runtime.equipmentResonance }
      : undefined,
    mutationId: runtime.mutation?.id,
    mutationPotency: runtime.mutation?.potency,
  };
}

export class BattleSession {
  private readonly hero: RuntimeFighter;
  private readonly enemy: RuntimeFighter;
  private readonly heroBefore: CombatantSnapshot;
  private readonly enemyBefore: CombatantSnapshot;
  private readonly random: RandomSource;
  private readonly effects = new BattleEffectPipeline();
  private readonly turnLog: DetailedBattleTurn[] = [];
  private nextActor: RuntimeFighter;
  private winner?: RuntimeFighter;
  private readonly maximumActions = 120;

  public constructor(snapshot: BattleSessionSnapshot);
  public constructor(
    heroProfile: HeroProfile | CombatantSnapshot,
    enemyProfile: EnemyProfile | CombatantSnapshot,
    options?: CombatOptions,
  );
  public constructor(
    heroProfileOrSnapshot:
      HeroProfile | CombatantSnapshot | BattleSessionSnapshot,
    enemyProfile?: EnemyProfile | CombatantSnapshot,
    options: CombatOptions = {},
  ) {
    if (isBattleSessionSnapshot(heroProfileOrSnapshot)) {
      const snapshot = heroProfileOrSnapshot;
      this.random = new SeededRandom(snapshot.random.seed, snapshot.random);
      this.hero = runtimeFromBattleSnapshot(snapshot.hero);
      this.enemy = runtimeFromBattleSnapshot(snapshot.enemy);
      this.heroBefore = cloneCombatantSnapshot(snapshot.heroBefore);
      this.enemyBefore = cloneCombatantSnapshot(snapshot.enemyBefore);
      this.turnLog.push(...snapshot.turns.map(cloneBattleTurn));
      const nextActor =
        snapshot.nextActorId === this.hero.id
          ? this.hero
          : snapshot.nextActorId === this.enemy.id
            ? this.enemy
            : undefined;
      if (!nextActor)
        throw new RangeError(
          `Unknown next fighter in battle snapshot: ${snapshot.nextActorId}`,
        );
      this.nextActor = nextActor;
      if (snapshot.winnerId) {
        this.winner =
          snapshot.winnerId === this.hero.id
            ? this.hero
            : snapshot.winnerId === this.enemy.id
              ? this.enemy
              : undefined;
        if (!this.winner)
          throw new RangeError(
            `Unknown winner in battle snapshot: ${snapshot.winnerId}`,
          );
      }
      return;
    }
    const heroProfile = heroProfileOrSnapshot;
    if (!enemyProfile)
      throw new TypeError("BattleSession requires an enemy profile.");
    this.random = options.randomSource ?? nativeRandom;
    if (isCombatantSnapshot(heroProfile) && isCombatantSnapshot(enemyProfile)) {
      this.hero = runtimeFromSnapshot(heroProfile);
      this.enemy = runtimeFromSnapshot(enemyProfile);
      const rules = TOURNAMENT_RULES.filter((rule) =>
        options.ruleIds?.includes(rule.id),
      );
      const applyRules = (
        fighter: RuntimeFighter,
        opponent: RuntimeFighter,
        side: "hero" | "enemy",
      ) => {
        rules.forEach((rule) => {
          const bonus = side === "hero" ? rule.heroStats : rule.enemyStats;
          const health =
            (bonus?.health ?? 0) +
            (fighter.level < opponent.level
              ? (rule.lowerLevelHealthBonus ?? 0)
              : 0);
          fighter.maxHealth = Math.max(1, fighter.maxHealth + health);
          fighter.health = Math.max(
            1,
            Math.min(fighter.maxHealth, fighter.health + health),
          );
          fighter.attack = Math.max(1, fighter.attack + (bonus?.attack ?? 0));
          fighter.defense = Math.max(
            0,
            fighter.defense + (bonus?.defense ?? 0),
          );
          fighter.speed = Math.max(1, fighter.speed + (bonus?.speed ?? 0));
          fighter.crit = Math.max(
            0,
            Math.min(60, fighter.crit + (bonus?.crit ?? 0)),
          );
          if (rule.disableHealing) fighter.disableHealing = true;
        });
        if (fighter.disableHealing)
          fighter.skills = fighter.skills.filter(
            (id) => SKILLS.find((skill) => skill.id === id)?.kind !== "heal",
          );
      };
      applyRules(this.hero, this.enemy, "hero");
      applyRules(this.enemy, this.hero, "enemy");
    } else if (
      !isCombatantSnapshot(heroProfile) &&
      !isCombatantSnapshot(enemyProfile)
    ) {
      const activeRules = TOURNAMENT_RULES.filter((rule) =>
        options.ruleIds?.includes(rule.id),
      );
      const challengerHealth = activeRules.reduce(
        (sum, rule) => sum + (rule.lowerLevelHealthBonus ?? 0),
        0,
      );
      const heroLevel = options.heroLevelCap
        ? Math.min(heroProfile.level, options.heroLevelCap)
        : heroProfile.level;
      const enemyLevel = options.enemyLevelCap
        ? Math.min(enemyProfile.level, options.enemyLevelCap)
        : enemyProfile.level;
      const heroBonus =
        heroLevel < enemyLevel ? { health: challengerHealth } : {};
      const enemyBonus =
        enemyLevel < heroLevel ? { health: challengerHealth } : {};
      this.hero = toRuntime(heroProfile, {
        levelCap: options.heroLevelCap,
        ruleIds: options.ruleIds,
        side: "hero",
        statMultipliers: options.heroStatMultipliers,
        bonusStats: heroBonus,
      });
      this.enemy = toRuntime(enemyProfile, {
        levelCap: options.enemyLevelCap,
        ruleIds: options.ruleIds,
        side: "enemy",
        statMultipliers: options.enemyStatMultipliers,
        bonusStats: enemyBonus,
      });
    } else {
      throw new TypeError(
        "BattleSession requires either two profiles or two combat snapshots.",
      );
    }
    if (!isCombatantSnapshot(enemyProfile) && enemyProfile.heroMemory) {
      this.enemy.memoryRead = readEnemyStyleMemory(
        enemyProfile.heroMemory,
        heroLoadoutSignature(heroProfile as HeroProfile, this.hero.skills),
      );
    }
    this.heroBefore = runtimeSnapshot(this.hero);
    this.enemyBefore = runtimeSnapshot(this.enemy);
    this.hero.nextActionAt =
      this.actionInterval(this.hero) * (0.85 + this.random.next() * 0.3);
    this.enemy.nextActionAt =
      this.actionInterval(this.enemy) * (0.85 + this.random.next() * 0.3);
    this.nextActor = this.selectNextActor();
  }

  public get currentActorId(): string | undefined {
    return this.isFinished ? undefined : this.nextActor.id;
  }

  public get isFinished(): boolean {
    return Boolean(this.winner);
  }

  public get turns(): readonly DetailedBattleTurn[] {
    return this.turnLog;
  }

  public snapshot(): BattleSessionSnapshot {
    const random = this.random as RandomSource & {
      snapshot?: () => RandomSnapshot;
    };
    if (typeof random.snapshot !== "function") {
      throw new Error(
        "BattleSession can only be persisted when its random source supports snapshots.",
      );
    }
    return {
      version: 1,
      heroBefore: cloneCombatantSnapshot(this.heroBefore),
      enemyBefore: cloneCombatantSnapshot(this.enemyBefore),
      hero: battleRuntimeSnapshot(this.hero),
      enemy: battleRuntimeSnapshot(this.enemy),
      turns: this.turnLog.map(cloneBattleTurn),
      nextActorId: this.nextActor.id,
      winnerId: this.winner?.id,
      random: random.snapshot(),
    };
  }

  public fighterState(id: string): BattleFighterState {
    const fighter =
      id === this.hero.id
        ? this.hero
        : id === this.enemy.id
          ? this.enemy
          : undefined;
    if (!fighter) throw new RangeError(`Unknown fighter: ${id}`);
    return {
      ...runtimeSnapshot(fighter),
      statuses: fighter.statuses.map((status) => ({ ...status })),
      resource: { ...fighter.resource },
      nextActionAt: fighter.nextActionAt,
    };
  }

  public availableActions(): BattleActionOption[] {
    if (this.isFinished) return [];
    const actor = this.nextActor;
    const target = actor.id === this.hero.id ? this.enemy : this.hero;
    const ready = SKILLS.filter(
      (skill) =>
        actor.skills.includes(skill.id) &&
        Math.max(0, (actor.cooldowns[skill.id] ?? 0) - 1) === 0,
    );
    const decision = skillDecision(ready, actor, target);
    return [
      {
        id: "basic",
        name: "Обычная атака",
        kind: "basic",
        cooldown: 0,
        available: true,
        recommended: !decision.skill,
        reason: !decision.skill ? decision.reason : undefined,
        score: !decision.skill ? decision.score : undefined,
      },
      ...SKILLS.filter((skill) => actor.skills.includes(skill.id)).map(
        (skill) => {
          const cooldown = Math.max(0, (actor.cooldowns[skill.id] ?? 0) - 1);
          return {
            id: skill.id,
            name: skill.name,
            kind: skill.kind,
            cooldown,
            available: cooldown === 0,
            recommended: decision.skill?.id === skill.id,
            reason:
              decision.skill?.id === skill.id ? decision.reason : undefined,
            score: decision.considered.find(
              (entry) => entry.skillId === skill.id,
            )?.score,
          };
        },
      ),
    ];
  }

  public step(action?: BattleAction): DetailedBattleTurn {
    if (this.isFinished) throw new Error("Battle session is already complete.");
    const actor = this.nextActor;
    const target = actor.id === this.hero.id ? this.enemy : this.hero;
    const turn = performTurn(
      this.turnLog.length + 1,
      actor,
      target,
      this.random,
      this.effects,
      action,
    );
    this.turnLog.push(turn);
    actor.nextActionAt += this.actionInterval(actor);
    if (this.hero.health <= 0 || this.enemy.health <= 0) {
      this.winner = this.hero.health > 0 ? this.hero : this.enemy;
    } else if (this.turnLog.length >= this.maximumActions) {
      this.winner =
        this.hero.health / this.hero.maxHealth >=
        this.enemy.health / this.enemy.maxHealth
          ? this.hero
          : this.enemy;
      const loser = this.winner.id === this.hero.id ? this.enemy : this.hero;
      loser.health = 0;
    } else {
      this.nextActor = this.selectNextActor();
    }
    return turn;
  }

  public runAutomatic(): CombatResolution {
    while (!this.isFinished) this.step();
    return this.resolution();
  }

  public forfeit(fighterId = this.hero.id): CombatResolution {
    if (this.isFinished) return this.resolution();
    const loser =
      fighterId === this.hero.id
        ? this.hero
        : fighterId === this.enemy.id
          ? this.enemy
          : undefined;
    if (!loser) throw new RangeError(`Unknown fighter: ${fighterId}`);
    const winner = loser.id === this.hero.id ? this.enemy : this.hero;
    loser.health = 0;
    this.winner = winner;
    this.turnLog.push({
      turn: this.turnLog.length + 1,
      actorId: loser.id,
      targetId: winner.id,
      actorName: loser.name,
      targetName: winner.name,
      action: "Сдача",
      detail: `${loser.name} прекратил бой и признал поражение.`,
      damage: 0,
      healing: 0,
      actorHealth: 0,
      targetHealth: winner.health,
      critical: false,
    });
    return this.resolution();
  }

  public resolution(): CombatResolution {
    if (!this.winner) throw new Error("Battle session has not finished yet.");
    const turns = this.turnLog.map(cloneBattleTurn);
    return {
      hero: this.heroBefore,
      enemy: this.enemyBefore,
      winnerId: this.winner.id,
      turns,
      analysis: analyzeBattle(
        turns,
        this.heroBefore,
        this.enemyBefore,
        this.winner.id,
      ),
    };
  }

  private actionInterval(fighter: RuntimeFighter): number {
    return 100 / combatActionRate(fighter.speed);
  }

  private selectNextActor(): RuntimeFighter {
    if (Math.abs(this.hero.nextActionAt - this.enemy.nextActionAt) < 0.0001) {
      return this.random.chance(0.5) ? this.hero : this.enemy;
    }
    return this.hero.nextActionAt < this.enemy.nextActionAt
      ? this.hero
      : this.enemy;
  }
}

export function resolveCombat(
  heroProfile: HeroProfile,
  enemyProfile: EnemyProfile,
  options: CombatOptions = {},
): CombatResolution {
  return new BattleSession(heroProfile, enemyProfile, options).runAutomatic();
}

export function unlockedSkills(
  classId: HeroClass,
  level: number,
  inventory: EquipmentItem[] = [],
  extraSkillIds: string[] = [],
): SkillDefinition[] {
  const available = skillsFor(classId, level, inventory);
  extraSkillIds.forEach((id) => {
    const skill = SKILLS.find((candidate) => candidate.id === id);
    if (skill && !available.some((candidate) => candidate.id === id))
      available.push(skill);
  });
  return available;
}

export function nextSkills(
  classId: HeroClass,
  level: number,
): SkillDefinition[] {
  return SKILLS.filter(
    (skill) =>
      !skill.equipmentOnly &&
      (skill.classes === "all" || skill.classes.includes(classId)) &&
      skill.unlockLevel > level,
  ).sort((a, b) => a.unlockLevel - b.unlockLevel);
}

export function describeSetProgress(
  items: EquipmentItem[],
): Array<{ name: string; count: number; active: string[] }> {
  const counts = setCounts(items);
  const resonance = equipmentResonance(items);
  return EQUIPMENT_SETS.map((set) => ({
    name: set.name,
    count: counts[set.id] ?? 0,
    active: [
      ...set.bonuses
        .filter((bonus) => (counts[set.id] ?? 0) >= bonus.pieces)
        .map((bonus) => bonus.description),
      ...(resonance?.setId === set.id
        ? [`Наследие комплекта ${resonance.stage}: ${resonance.description}`]
        : []),
    ],
  })).filter((set) => set.count > 0);
}
