import { HeroClass, SkillKind } from "../core/WorldTypes";

export type BattleStatusId =
  "guarded" | "marked" | "arcane-surge" | "burning" | "bleeding" | "staggered";

export interface BattleStatus {
  id: BattleStatusId;
  name: string;
  description: string;
  duration: number;
  stacks: number;
  sourceId?: string;
}

export interface ClassResourceState {
  id: "resolve" | "focus" | "arcana" | "chi" | "heat" | "edge";
  name: string;
  current: number;
  maximum: number;
  description?: string;
}

export interface ClassResourceDefinition extends Omit<
  ClassResourceState,
  "current"
> {
  description: string;
}

export interface EffectFighter {
  id: string;
  classId: HeroClass;
  health: number;
  maxHealth: number;
  statuses: BattleStatus[];
  resource: ClassResourceState;
}

export interface TurnStartEffects {
  damage: number;
  detail: string[];
  statusComboIds: StatusCombinationId[];
}

export interface DamageEffects {
  damage: number;
  detail: string[];
  statusComboIds: StatusCombinationId[];
}

export interface ClassMechanicEffects {
  healing: number;
  detail: string[];
  resourceEvents: ClassResourceEvent[];
}

export type StatusCombinationId =
  "smoldering-wound" | "arcane-ignition" | "exposed-wound";

export interface StatusCombinationDefinition {
  id: StatusCombinationId;
  name: string;
  description: string;
}

export const STATUS_COMBINATION_DEFINITIONS: Readonly<
  Record<StatusCombinationId, StatusCombinationDefinition>
> = {
  "smoldering-wound": {
    id: "smoldering-wound",
    name: "Тлеющая рана",
    description:
      "Одновременные горение и кровотечение наносят дополнительный периодический урон.",
  },
  "arcane-ignition": {
    id: "arcane-ignition",
    name: "Арканное воспламенение",
    description:
      "Астральный прилив сильнее раскрывается против уже горящей цели.",
  },
  "exposed-wound": {
    id: "exposed-wound",
    name: "Открытая рана",
    description:
      "Удар по отмеченной кровоточащей цели получает дополнительное усиление.",
  },
};

export interface ClassActionContext {
  critical?: boolean;
  skillKind?: SkillKind;
  skillId?: string;
  combo?: number;
  healing?: number;
  healingMultiplier?: number;
}

export interface ClassResourceEvent {
  fighterId: string;
  resourceId: ClassResourceState["id"];
  gained: number;
  spent: number;
  trigger?: string;
}

export const CLASS_RESOURCE_DEFINITIONS: Readonly<
  Record<HeroClass, ClassResourceDefinition>
> = {
  Knight: {
    id: "resolve",
    name: "Стойкость",
    maximum: 3,
    description:
      "Накапливается от полученных ударов и превращается в защитную стойку.",
  },
  Archer: {
    id: "focus",
    name: "Пристрелка",
    maximum: 3,
    description:
      "Растёт от попаданий, критов и контроля, после чего отмечает цель.",
  },
  Wizard: {
    id: "arcana",
    name: "Аркана",
    maximum: 3,
    description:
      "Накапливается применением навыков и готовит усиленный магический приём.",
  },
  Monk: {
    id: "chi",
    name: "Ци",
    maximum: 3,
    description:
      "Следует за ударами, контролем и лечением, восстанавливая здоровье и очищая состояние.",
  },
  Gunsmith: {
    id: "heat",
    name: "Накал",
    maximum: 3,
    description:
      "Растёт от выстрелов и особенно критов, а затем поджигает цель.",
  },
  Swordsman: {
    id: "edge",
    name: "Острота",
    maximum: 3,
    description:
      "Усиливается сериями и критами, завершая цикл глубоким кровотечением.",
  },
};

const STATUS_TEXT: Readonly<
  Record<BattleStatusId, Pick<BattleStatus, "name" | "description">>
> = {
  guarded: {
    name: "Защитная стойка",
    description: "Следующий входящий удар наносит на 22% меньше урона.",
  },
  marked: {
    name: "Метка",
    description: "Следующий входящий удар наносит на 18% больше урона.",
  },
  "arcane-surge": {
    name: "Астральный прилив",
    description: "Следующая атакующая способность наносит на 18% больше урона.",
  },
  burning: {
    name: "Горение",
    description: "В начале хода теряется 2.5% максимального здоровья.",
  },
  bleeding: {
    name: "Кровотечение",
    description: "В начале хода теряется 1.8% максимального здоровья.",
  },
  staggered: {
    name: "Ошеломление",
    description: "Следующая атака наносит на 18% меньше урона.",
  },
};

export function createClassResource(classId: HeroClass): ClassResourceState {
  return { ...CLASS_RESOURCE_DEFINITIONS[classId], current: 0 };
}

export class BattleEffectPipeline {
  public addStatus(
    target: EffectFighter,
    id: BattleStatusId,
    duration: number,
    sourceId?: string,
  ): void {
    const existing = target.statuses.find((status) => status.id === id);
    if (existing) {
      existing.duration = Math.max(existing.duration, duration);
      existing.stacks = Math.min(3, existing.stacks + 1);
      existing.sourceId = sourceId ?? existing.sourceId;
      return;
    }
    target.statuses.push({
      id,
      ...STATUS_TEXT[id],
      duration,
      stacks: 1,
      sourceId,
    });
  }

  public beginTurn(fighter: EffectFighter): TurnStartEffects {
    const detail: string[] = [];
    const statusComboIds: StatusCombinationId[] = [];
    let damage = 0;
    const burning = fighter.statuses.find((status) => status.id === "burning");
    const bleeding = fighter.statuses.find(
      (status) => status.id === "bleeding",
    );
    fighter.statuses.forEach((status) => {
      if (status.id === "burning") {
        const value = Math.max(
          1,
          Math.round(fighter.maxHealth * 0.025 * status.stacks),
        );
        damage += value;
        detail.push(`горение: ${value} урона`);
      }
      if (status.id === "bleeding") {
        const value = Math.max(
          1,
          Math.round(fighter.maxHealth * 0.018 * status.stacks),
        );
        damage += value;
        detail.push(`кровотечение: ${value} урона`);
      }
      status.duration -= 1;
    });
    if (burning && bleeding) {
      const value = Math.max(
        1,
        Math.round(
          fighter.maxHealth * 0.012 * Math.min(burning.stacks, bleeding.stacks),
        ),
      );
      damage += value;
      detail.push(`тлеющая рана: ${value} дополнительного урона`);
      statusComboIds.push("smoldering-wound");
    }
    fighter.statuses = fighter.statuses.filter((status) => status.duration > 0);
    fighter.health = Math.max(0, fighter.health - damage);
    return { damage, detail, statusComboIds };
  }

  public modifyDamage(
    actor: EffectFighter,
    target: EffectFighter,
    damage: number,
    isSkill: boolean,
  ): DamageEffects {
    const detail: string[] = [];
    const statusComboIds: StatusCombinationId[] = [];
    let result = damage;
    const targetBurning = target.statuses.some(
      (status) => status.id === "burning",
    );
    const targetBleeding = target.statuses.some(
      (status) => status.id === "bleeding",
    );
    const consume = (owner: EffectFighter, id: BattleStatusId): boolean => {
      const index = owner.statuses.findIndex((status) => status.id === id);
      if (index < 0) return false;
      owner.statuses.splice(index, 1);
      return true;
    };
    if (consume(actor, "staggered")) {
      result *= 0.82;
      detail.push("ошеломление ослабило удар");
    }
    if (isSkill && consume(actor, "arcane-surge")) {
      result *= 1.18;
      detail.push("арканный прилив усилил навык");
      if (targetBurning) {
        result *= 1.12;
        detail.push("арканное воспламенение раскрыло горение");
        statusComboIds.push("arcane-ignition");
      }
    }
    if (consume(target, "guarded")) {
      result *= 0.78;
      detail.push("защитная стойка поглотила часть урона");
    }
    if (consume(target, "marked")) {
      result *= 1.18;
      detail.push("удар пришёлся по метке");
      if (targetBleeding) {
        result *= 1.12;
        detail.push("метка открыла кровоточащую рану");
        statusComboIds.push("exposed-wound");
      }
    }
    return { damage: Math.max(0, Math.round(result)), detail, statusComboIds };
  }

  public afterAction(
    actor: EffectFighter,
    target: EffectFighter,
    damage: number,
    usedSkill: boolean,
    context: ClassActionContext = {},
  ): ClassMechanicEffects {
    const detail: string[] = [];
    const resourceEvents: ClassResourceEvent[] = [];
    let healing = 0;
    const gain = (
      fighter: EffectFighter,
      amount = 1,
    ): { triggered: boolean; event: ClassResourceEvent } => {
      const previous = fighter.resource.current;
      fighter.resource.current = Math.min(
        fighter.resource.maximum,
        previous + amount,
      );
      const gained = fighter.resource.current - previous;
      const event: ClassResourceEvent = {
        fighterId: fighter.id,
        resourceId: fighter.resource.id,
        gained,
        spent: 0,
      };
      const triggered = fighter.resource.current >= fighter.resource.maximum;
      if (triggered) {
        event.spent = fighter.resource.maximum;
        fighter.resource.current = 0;
      }
      return { triggered, event };
    };

    const applyGain = (
      fighter: EffectFighter,
      amount: number,
      trigger: () => string,
    ): void => {
      const result = gain(fighter, amount);
      if (result.triggered) result.event.trigger = trigger();
      resourceEvents.push(result.event);
    };

    if (damage > 0 && target.classId === "Knight") {
      applyGain(target, context.critical ? 2 : 1, () => {
        this.addStatus(target, "guarded", 3, target.id);
        detail.push("стойкость рыцаря подготовила защитную стойку");
        return "Защитная стойка";
      });
    }
    if (damage > 0 && actor.classId === "Archer") {
      applyGain(
        actor,
        context.critical || context.skillKind === "control" ? 2 : 1,
        () => {
          this.addStatus(target, "marked", 3, actor.id);
          detail.push("лучник пристрелялся и отметил цель");
          return "Точная метка";
        },
      );
    }
    if (usedSkill && actor.classId === "Wizard") {
      applyGain(
        actor,
        context.skillKind === "buff" || context.skillKind === "control" ? 2 : 1,
        () => {
          this.addStatus(actor, "arcane-surge", 4, actor.id);
          detail.push("маг накопил астральный прилив");
          return "Астральный прилив";
        },
      );
    }
    if (
      (damage > 0 || (context.healing ?? 0) > 0) &&
      actor.classId === "Monk"
    ) {
      applyGain(
        actor,
        context.skillKind === "control" || (context.healing ?? 0) > 0 ? 2 : 1,
        () => {
          healing = Math.min(
            actor.maxHealth - actor.health,
            Math.max(
              0,
              Math.round(
                actor.maxHealth * 0.05 * (context.healingMultiplier ?? 1),
              ),
            ),
          );
          actor.health += healing;
          const cleansed = actor.statuses.find(
            (status) =>
              status.id === "burning" ||
              status.id === "bleeding" ||
              status.id === "staggered",
          );
          if (cleansed)
            actor.statuses.splice(actor.statuses.indexOf(cleansed), 1);
          detail.push(
            `ци восстановила ${healing} HP${cleansed ? ` и сняла «${cleansed.name}»` : ""}`,
          );
          return "Поток ци";
        },
      );
    }
    if (damage > 0 && actor.classId === "Gunsmith") {
      applyGain(
        actor,
        context.critical || context.skillKind === "control" ? 2 : 1,
        () => {
          this.addStatus(target, "burning", 3, actor.id);
          if (context.critical) this.addStatus(target, "burning", 3, actor.id);
          detail.push(
            `накал поджёг цель${context.critical ? " сильнее обычного" : ""}`,
          );
          return "Пороховой перегрев";
        },
      );
    }
    if (damage > 0 && actor.classId === "Swordsman") {
      applyGain(
        actor,
        context.critical || (context.combo ?? 0) >= 2 ? 2 : 1,
        () => {
          this.addStatus(target, "bleeding", 4, actor.id);
          if ((context.combo ?? 0) >= 2)
            this.addStatus(target, "bleeding", 4, actor.id);
          detail.push(
            `острота клинков вызвала кровотечение${(context.combo ?? 0) >= 2 ? " глубокой серии" : ""}`,
          );
          return "Режущая серия";
        },
      );
    }
    return { healing, detail, resourceEvents };
  }
}
