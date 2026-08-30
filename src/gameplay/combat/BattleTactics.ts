import type { BattleStatus, ClassResourceState } from "./CombatEffects";
import { skillHealing } from "./CombatBalance";
import type {
  HeroClass,
  SkillDefinition,
  TacticalProfile,
} from "../core/WorldTypes";

export interface TacticalFighterView {
  classId: HeroClass;
  health: number;
  maxHealth: number;
  level?: number;
  healingMultiplier?: number;
  defense?: number;
  buff: number;
  weakened: number;
  statuses: BattleStatus[];
  resource: ClassResourceState;
  tactics: TacticalProfile;
  attackCounter?: number;
  actionsTaken?: number;
  memoryRead?: {
    strength: number;
    recognizedOpening?: boolean;
    expectedHealing?: boolean;
    expectedDefense?: boolean;
    expectedCombo?: string;
  };
}

export interface TacticalDecision {
  skill?: SkillDefinition;
  score: number;
  reason: string;
  considered: Array<{ skillId: string; score: number; eligible: boolean }>;
}

interface SkillEvaluation {
  skill: SkillDefinition;
  score: number;
  eligible: boolean;
  reasons: string[];
}

function ratio(value: number, maximum: number): number {
  return maximum <= 0 ? 0 : Math.max(0, Math.min(1, value / maximum));
}

function hasStatus(
  fighter: TacticalFighterView,
  id: BattleStatus["id"],
): boolean {
  return fighter.statuses.some((status) => status.id === id);
}

function pushReason(target: string[], reason: string): void {
  if (!target.includes(reason)) target.push(reason);
}

function evaluateSkill(
  skill: SkillDefinition,
  actor: TacticalFighterView,
  target: TacticalFighterView,
): SkillEvaluation {
  const actorHealth = ratio(actor.health, actor.maxHealth);
  const targetHealth = ratio(target.health, target.maxHealth);
  const missingHealth = 1 - actorHealth;
  const resourceReady = actor.resource.current >= actor.resource.maximum - 1;
  const reasons: string[] = [];
  let score = skill.priority;
  let eligible = true;

  if (
    (actor.actionsTaken ?? 0) === 0 &&
    actor.tactics.preferredOpeningSkillId === skill.id
  ) {
    score += 120;
    pushReason(reasons, "приём назначен открытием тактического профиля");
  }

  if (skill.kind === "heal") {
    const expectedHealing = skillHealing(
      skill,
      actor.level ?? 1,
      actor.health,
      actor.maxHealth,
      actor.healingMultiplier ?? 1,
    );
    const healingShare = expectedHealing / Math.max(1, actor.maxHealth);
    eligible =
      expectedHealing >= Math.max(1, actor.maxHealth * 0.025) &&
      (actorHealth < actor.tactics.healThreshold || actorHealth <= 0.3);
    score += missingHealth * 35 + healingShare * 240;
    if (actorHealth <= 0.35) {
      score += 35;
      pushReason(reasons, "здоровье достигло опасного уровня");
    } else {
      pushReason(reasons, "здоровье опустилось ниже порога лечения");
    }
    if (actor.classId === "Monk" && resourceReady) {
      score += 18;
      pushReason(reasons, "ци близка к завершению восстановительной серии");
    }
  }

  if (skill.id === "execution") {
    eligible = targetHealth < actor.tactics.finisherThreshold;
    if (eligible) {
      score += 100 + (1 - targetHealth) * 50;
      pushReason(reasons, "цель вошла в диапазон добивания");
    }
  }

  if (skill.kind === "attack") {
    score += skill.power * 13;
    if (targetHealth <= 0.35) {
      score += 24;
      pushReason(reasons, "усиленный удар может завершить бой");
    }
    if (targetHealth <= 0.2) score += 70;
    if (
      hasStatus(target, "marked") ||
      hasStatus(target, "bleeding") ||
      hasStatus(target, "burning")
    ) {
      score += 18;
      pushReason(reasons, "атака развивает уже наложенное состояние");
    }
    if (actor.tactics.style === "aggressive") {
      score += 40;
      pushReason(reasons, "профиль боя требует постоянного давления");
    }
  }

  if (skill.kind === "control") {
    if (target.weakened > 0 || hasStatus(target, "staggered")) {
      score -= 48;
      pushReason(reasons, "цель уже лишена темпа");
    } else {
      score += 18 + targetHealth * 12;
      pushReason(reasons, "соперник ещё не ограничен контролем");
    }
    if (actor.tactics.prioritizeControl) {
      score += 55;
      pushReason(reasons, "активен профиль срыва темпа");
    }
    if (
      actor.tactics.breakGuardFirst &&
      (hasStatus(target, "guarded") || (target.defense ?? 0) >= 20)
    ) {
      score += 42;
      pushReason(reasons, "профиль требует сначала вскрыть защиту");
    }
  }

  if (skill.kind === "buff") {
    if (actor.buff > 0.05 || targetHealth <= 0.2) {
      eligible = false;
      score -= 100;
    } else {
      score += targetHealth * 28;
      pushReason(reasons, "усиление подготовит следующий удар");
    }
    if (actor.tactics.style === "defensive") score += 38;
  }

  if (
    actor.tactics.style === "defensive" &&
    (skill.kind === "heal" || skill.kind === "buff")
  ) {
    score += 45;
    pushReason(reasons, "защитный профиль сохраняет запас прочности");
  }

  if (
    actor.tactics.preserveStrongSkills &&
    targetHealth > 0.7 &&
    skill.kind === "attack" &&
    skill.power > 1.4
  ) {
    score -= 35;
    pushReason(reasons, "сильный приём сохранён до решающей фазы");
  }
  if (
    actor.tactics.preserveStrongSkills &&
    targetHealth <= 0.5 &&
    skill.kind === "attack" &&
    skill.power > 1.4
  ) {
    score += 38;
    pushReason(reasons, "наступила решающая фаза для сильного приёма");
  }

  const ultimateThreshold =
    actor.tactics.ultimateHealthThreshold ?? actor.tactics.finisherThreshold;
  if (
    targetHealth <= ultimateThreshold &&
    skill.kind === "attack" &&
    (skill.power >= 1.7 || skill.cooldown >= 6)
  ) {
    score += 65;
    pushReason(reasons, "цель достигла порога решающего приёма");
  }

  if (resourceReady) {
    const favored =
      (actor.classId === "Knight" &&
        (skill.kind === "control" || skill.kind === "buff")) ||
      (actor.classId === "Archer" && skill.kind === "attack") ||
      actor.classId === "Wizard" ||
      (actor.classId === "Monk" &&
        (skill.kind === "attack" || skill.kind === "heal")) ||
      (actor.classId === "Gunsmith" &&
        (skill.kind === "attack" || skill.kind === "control")) ||
      (actor.classId === "Swordsman" && skill.kind === "attack");
    if (favored) {
      score += 20;
      pushReason(reasons, `ресурс «${actor.resource.name}» почти заполнен`);
    }
  }

  const memoryStrength = actor.memoryRead?.strength ?? 0;
  if (memoryStrength > 0) {
    if (
      actor.memoryRead?.recognizedOpening &&
      (actor.attackCounter ?? 0) <= 1 &&
      (skill.kind === "control" || skill.kind === "buff")
    ) {
      score += 34 * memoryStrength;
      pushReason(reasons, "память соперника узнала первые ходы");
    }
    if (
      actor.memoryRead?.expectedHealing &&
      (skill.kind === "attack" || skill.kind === "control")
    ) {
      score += 28 * memoryStrength;
      pushReason(reasons, "ожидается привычная попытка лечения");
    }
    if (
      actor.memoryRead?.expectedDefense &&
      (skill.kind === "buff" || skill.kind === "control")
    ) {
      score += 22 * memoryStrength;
      pushReason(reasons, "изученная защита требует подготовки или контроля");
    }
    if (actor.memoryRead?.expectedCombo && skill.kind === "control") {
      score += 30 * memoryStrength;
      pushReason(reasons, "контроль должен разорвать знакомую связку");
    }
  }

  if (reasons.length === 0)
    pushReason(reasons, "приём имеет наивысший доступный приоритет");
  return { skill, score: Math.round(score * 10) / 10, eligible, reasons };
}

export function chooseTacticalSkill(
  ready: SkillDefinition[],
  actor: TacticalFighterView,
  target: TacticalFighterView,
): TacticalDecision {
  const evaluations = ready.map((skill) => evaluateSkill(skill, actor, target));
  const eligible = evaluations
    .filter((entry) => entry.eligible)
    .sort(
      (first, second) =>
        second.score - first.score ||
        ready.indexOf(first.skill) - ready.indexOf(second.skill),
    );
  const chosen = eligible[0];
  if (!chosen) {
    return {
      score: 0,
      reason:
        ready.length === 0
          ? "все навыки находятся на перезарядке"
          : "ни один навык не отвечает текущим условиям тактики",
      considered: evaluations.map((entry) => ({
        skillId: entry.skill.id,
        score: entry.score,
        eligible: entry.eligible,
      })),
    };
  }
  const orderedReasons = [...chosen.reasons].sort((first, second) => {
    const priority = (value: string): number => {
      if (/память|ожида|изученн|знаком/i.test(value)) return 3;
      if (/опасн|добив|решающ|открытием/i.test(value)) return 2;
      return 1;
    };
    return priority(second) - priority(first);
  });
  return {
    skill: chosen.skill,
    score: chosen.score,
    reason: orderedReasons.slice(0, 2).join("; "),
    considered: evaluations.map((entry) => ({
      skillId: entry.skill.id,
      score: entry.score,
      eligible: entry.eligible,
    })),
  };
}
