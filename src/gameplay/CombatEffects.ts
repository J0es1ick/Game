import { HeroClass } from "./WorldTypes";

export type BattleStatusId = "guarded" | "marked" | "arcane-surge" | "burning" | "bleeding" | "staggered";

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
}

export interface DamageEffects {
  damage: number;
  detail: string[];
}

export interface ClassMechanicEffects {
  healing: number;
  detail: string[];
}

const RESOURCE_BY_CLASS: Readonly<Record<HeroClass, Omit<ClassResourceState, "current">>> = {
  Knight: { id: "resolve", name: "Стойкость", maximum: 3 },
  Archer: { id: "focus", name: "Пристрелка", maximum: 3 },
  Wizard: { id: "arcana", name: "Аркана", maximum: 3 },
  Monk: { id: "chi", name: "Ци", maximum: 3 },
  Gunsmith: { id: "heat", name: "Накал", maximum: 3 },
  Swordsman: { id: "edge", name: "Острота", maximum: 3 },
};

const STATUS_TEXT: Readonly<Record<BattleStatusId, Pick<BattleStatus, "name" | "description">>> = {
  guarded: { name: "Защитная стойка", description: "Следующий входящий удар наносит на 22% меньше урона." },
  marked: { name: "Метка", description: "Следующий входящий удар наносит на 18% больше урона." },
  "arcane-surge": { name: "Астральный прилив", description: "Следующая атакующая способность наносит на 18% больше урона." },
  burning: { name: "Горение", description: "В начале хода теряется 2.5% максимального здоровья." },
  bleeding: { name: "Кровотечение", description: "В начале хода теряется 1.8% максимального здоровья." },
  staggered: { name: "Ошеломление", description: "Следующая атака наносит на 18% меньше урона." },
};

export function createClassResource(classId: HeroClass): ClassResourceState {
  return { ...RESOURCE_BY_CLASS[classId], current: 0 };
}

export class BattleEffectPipeline {
  public addStatus(target: EffectFighter, id: BattleStatusId, duration: number, sourceId?: string): void {
    const existing = target.statuses.find((status) => status.id === id);
    if (existing) {
      existing.duration = Math.max(existing.duration, duration);
      existing.stacks = Math.min(3, existing.stacks + 1);
      existing.sourceId = sourceId ?? existing.sourceId;
      return;
    }
    target.statuses.push({ id, ...STATUS_TEXT[id], duration, stacks: 1, sourceId });
  }

  public beginTurn(fighter: EffectFighter): TurnStartEffects {
    const detail: string[] = [];
    let damage = 0;
    fighter.statuses.forEach((status) => {
      if (status.id === "burning") {
        const value = Math.max(1, Math.round(fighter.maxHealth * 0.025 * status.stacks));
        damage += value;
        detail.push(`горение: ${value} урона`);
      }
      if (status.id === "bleeding") {
        const value = Math.max(1, Math.round(fighter.maxHealth * 0.018 * status.stacks));
        damage += value;
        detail.push(`кровотечение: ${value} урона`);
      }
      status.duration -= 1;
    });
    fighter.statuses = fighter.statuses.filter((status) => status.duration > 0);
    fighter.health = Math.max(0, fighter.health - damage);
    return { damage, detail };
  }

  public modifyDamage(actor: EffectFighter, target: EffectFighter, damage: number, isSkill: boolean): DamageEffects {
    const detail: string[] = [];
    let result = damage;
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
    }
    if (consume(target, "guarded")) {
      result *= 0.78;
      detail.push("защитная стойка поглотила часть урона");
    }
    if (consume(target, "marked")) {
      result *= 1.18;
      detail.push("удар пришёлся по метке");
    }
    return { damage: Math.max(0, Math.round(result)), detail };
  }

  public afterAction(actor: EffectFighter, target: EffectFighter, damage: number, usedSkill: boolean): ClassMechanicEffects {
    const detail: string[] = [];
    let healing = 0;
    const gain = (fighter: EffectFighter, amount = 1): boolean => {
      fighter.resource.current = Math.min(fighter.resource.maximum, fighter.resource.current + amount);
      if (fighter.resource.current < fighter.resource.maximum) return false;
      fighter.resource.current = 0;
      return true;
    };

    if (damage > 0 && target.classId === "Knight" && gain(target)) {
      this.addStatus(target, "guarded", 3, target.id);
      detail.push("стойкость рыцаря подготовила защитную стойку");
    }
    if (damage > 0 && actor.classId === "Archer" && gain(actor)) {
      this.addStatus(target, "marked", 3, actor.id);
      detail.push("лучник пристрелялся и отметил цель");
    }
    if (usedSkill && actor.classId === "Wizard" && gain(actor)) {
      this.addStatus(actor, "arcane-surge", 4, actor.id);
      detail.push("маг накопил астральный прилив");
    }
    if (damage > 0 && actor.classId === "Monk" && gain(actor)) {
      healing = Math.min(actor.maxHealth - actor.health, Math.max(1, Math.round(actor.maxHealth * 0.04)));
      actor.health += healing;
      detail.push(`ци восстановила ${healing} HP`);
    }
    if (damage > 0 && actor.classId === "Gunsmith" && gain(actor)) {
      this.addStatus(target, "burning", 3, actor.id);
      detail.push("накал поджёг цель");
    }
    if (damage > 0 && actor.classId === "Swordsman" && gain(actor)) {
      this.addStatus(target, "bleeding", 4, actor.id);
      detail.push("острота клинков вызвала кровотечение");
    }
    return { healing, detail };
  }
}
