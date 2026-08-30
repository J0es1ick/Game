import type {
  BattleAnalytics as BattleAnalyticsContract,
  BattleTurn,
  CombatantSnapshot,
  FighterBattleAnalytics as FighterBattleAnalyticsContract,
} from "../core/WorldTypes";

export interface BattleResourceEvent {
  fighterId: string;
  resourceId: string;
  gained: number;
  spent: number;
  trigger?: string;
}

export interface DetailedBattleTurn extends BattleTurn {
  decisionReason?: string;
  decisionScore?: number;
  statusComboIds?: string[];
  resourceEvents?: BattleResourceEvent[];
}

export interface FighterBattleAnalytics extends FighterBattleAnalyticsContract {
  actions: number;
  damageDealt: number;
  damageTaken: number;
  healing: number;
  skillUses: Record<string, number>;
  openingActions: string[];
  decisionReasons: string[];
  statusCombos: Record<string, number>;
  resourceTriggerCounts: Record<string, number>;
  longestSkillChain: number;
}

export interface BattleAnalytics extends BattleAnalyticsContract {
  totalActions: number;
  winnerId: string;
  byFighterId: Record<string, FighterBattleAnalytics>;
}

function fighterAnalytics(snapshot: CombatantSnapshot): FighterBattleAnalytics {
  return {
    fighterId: snapshot.id,
    fighterName: snapshot.name,
    totalDamage: 0,
    totalHealing: 0,
    criticalHits: 0,
    statusComboIds: [],
    resourceTriggers: [],
    actions: 0,
    damageDealt: 0,
    damageTaken: 0,
    healing: 0,
    skillUses: {},
    openingActions: [],
    decisionReasons: [],
    statusCombos: {},
    resourceTriggerCounts: {},
    longestSkillChain: 0,
  };
}

function increment(
  target: Record<string, number>,
  id: string,
  amount = 1,
): void {
  target[id] = (target[id] ?? 0) + amount;
}

export function analyzeBattle(
  turns: readonly DetailedBattleTurn[],
  hero: CombatantSnapshot,
  enemy: CombatantSnapshot,
  winnerId: string,
): BattleAnalytics {
  const byFighterId: Record<string, FighterBattleAnalytics> = {
    [hero.id]: fighterAnalytics(hero),
    [enemy.id]: fighterAnalytics(enemy),
  };
  const skillChains: Record<string, number> = { [hero.id]: 0, [enemy.id]: 0 };
  let totalActions = 0;
  turns.forEach((turn) => {
    const actor = byFighterId[turn.actorId];
    const target = byFighterId[turn.targetId];
    if (!actor) return;
    const isAction = turn.actorId !== turn.targetId;
    if (isAction) {
      actor.actions += 1;
      totalActions += 1;
    }
    actor.healing += turn.healing;
    actor.totalHealing += turn.healing;
    if (isAction) {
      actor.damageDealt += turn.damage;
      actor.totalDamage += turn.damage;
      if (target) target.damageTaken += turn.damage;
    } else {
      actor.damageTaken += turn.damage;
    }
    if (isAction && turn.critical) actor.criticalHits += 1;
    if (isAction && turn.skillId) {
      increment(actor.skillUses, turn.skillId);
      skillChains[turn.actorId] += 1;
      actor.longestSkillChain = Math.max(
        actor.longestSkillChain,
        skillChains[turn.actorId],
      );
    } else if (isAction) {
      skillChains[turn.actorId] = 0;
    }
    if (isAction && actor.openingActions.length < 3)
      actor.openingActions.push(turn.skillId ?? "basic");
    if (
      isAction &&
      turn.decisionReason &&
      !actor.decisionReasons.includes(turn.decisionReason)
    )
      actor.decisionReasons.push(turn.decisionReason);
    turn.statusComboIds?.forEach((id) => {
      increment(actor.statusCombos, id);
      if (!actor.statusComboIds.includes(id)) actor.statusComboIds.push(id);
    });
    turn.resourceEvents
      ?.filter((event) => event.trigger)
      .forEach((event) => {
        const owner = byFighterId[event.fighterId];
        if (!owner) return;
        increment(owner.resourceTriggerCounts, event.trigger!);
        if (!owner.resourceTriggers.includes(event.trigger!))
          owner.resourceTriggers.push(event.trigger!);
      });
  });

  const fighters = Object.values(byFighterId);
  fighters.forEach((fighter) => {
    fighter.mostUsedSkillId = Object.entries(fighter.skillUses).sort(
      (first, second) =>
        second[1] - first[1] || first[0].localeCompare(second[0]),
    )[0]?.[0];
  });
  const decisiveTurn = [...turns]
    .reverse()
    .find((turn) => turn.actorId === winnerId && turn.damage > 0);
  if (decisiveTurn?.skillId)
    byFighterId[winnerId].decisiveSkillId = decisiveTurn.skillId;
  const damageLeader = [...fighters].sort(
    (first, second) => second.damageDealt - first.damageDealt,
  )[0];
  const healingLeader = [...fighters].sort(
    (first, second) => second.healing - first.healing,
  )[0];
  const comboLeader = [...fighters].sort((first, second) => {
    const left = Object.values(first.statusCombos).reduce(
      (sum, value) => sum + value,
      0,
    );
    const right = Object.values(second.statusCombos).reduce(
      (sum, value) => sum + value,
      0,
    );
    return right - left;
  })[0];
  const highlights = [
    `${damageLeader.fighterName}: ${damageLeader.damageDealt} урона`,
  ];
  if (healingLeader.healing > 0)
    highlights.push(
      `${healingLeader.fighterName}: восстановлено ${healingLeader.healing} HP`,
    );
  const comboCount = Object.values(comboLeader.statusCombos).reduce(
    (sum, value) => sum + value,
    0,
  );
  if (comboCount > 0)
    highlights.push(
      `${comboLeader.fighterName}: комбинаций состояний — ${comboCount}`,
    );
  const lastTurn = turns[turns.length - 1];

  return {
    duration: turns.length,
    actionCount: totalActions,
    totalActions,
    winnerId,
    fighters,
    byFighterId,
    decidingEffect: lastTurn?.detail || undefined,
    adaptationReason: turns.find((turn) =>
      /память|ожида|знаком|изученн/i.test(turn.decisionReason ?? ""),
    )?.decisionReason,
    highlights,
  };
}
