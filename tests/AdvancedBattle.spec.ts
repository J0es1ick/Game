import { combatantSnapshot, resolveCombat } from "../src/gameplay/combat/AdvancedBattle";
import type {
  EnemyProfile,
  EquipmentItem,
  EquipmentSlot,
  HeroClass,
  HeroProfile,
  Stats,
} from "../src/gameplay/core/WorldTypes";

const balancedTactics = {
  id: "balanced",
  name: "Ровный бой",
  style: "balanced" as const,
  healThreshold: 0.55,
  finisherThreshold: 0.42,
  preserveStrongSkills: false,
  prioritizeControl: false,
};

function bareFighters(classId: HeroClass = "Knight"): { hero: HeroProfile; enemy: EnemyProfile } {
  const hero = {
    id: "hero",
    name: "Испытатель",
    classId,
    level: 1,
    inventory: [],
    equipped: {},
    traitIds: [],
    scarIds: [],
    injuries: [],
    autoSelectSkills: true,
    selectedSkillIds: [],
    tacticalProfiles: [balancedTactics],
    activeTacticalProfileId: balancedTactics.id,
  } as unknown as HeroProfile;
  const enemy = {
    id: "enemy-test",
    name: "Манекен",
    classId: "Knight",
    level: 1,
    equipment: [],
    equipped: {},
    traitIds: [],
    scarIds: [],
    injuries: [],
    adaptationIds: [],
    tacticalStyle: "balanced",
  } as unknown as EnemyProfile;

  return { hero, enemy };
}

const equipmentSlots: EquipmentSlot[] = ["weapon", "offhand", "head", "chest", "hands", "feet"];

function equipStatlessSet(hero: HeroProfile, setId: string, pieces: number): void {
  hero.inventory = equipmentSlots.slice(0, pieces).map((slot, index): EquipmentItem => ({
    id: `${setId}-${slot}-test`,
    templateId: `${setId}-${slot}`,
    name: `${setId} ${index}`,
    slot,
    rarity: "common",
    level: 1,
    stats: {},
    allowedClasses: "all",
    price: 0,
    setId,
  }));
  hero.equipped = Object.fromEntries(hero.inventory.map((item) => [item.slot, item.id]));
}

describe("runtime-множители расширенного боя", () => {
  test("масштабирует только HP, атаку и защиту каждой стороны", () => {
    const { hero, enemy } = bareFighters();
    const baseline = resolveCombat(hero, enemy);
    const heroBefore = JSON.stringify(hero);
    const enemyBefore = JSON.stringify(enemy);

    const scaled = resolveCombat(hero, enemy, {
      heroStatMultipliers: { health: 1.25, attack: 1.4, defense: 1.5 },
      enemyStatMultipliers: { health: 1.4, attack: 1.2, defense: 1.3 },
    });

    expect(scaled.hero.maxHealth).toBe(Math.round(baseline.hero.maxHealth * 1.25));
    expect(scaled.hero.attack).toBe(Math.round(baseline.hero.attack * 1.4));
    expect(scaled.hero.defense).toBe(Math.round(baseline.hero.defense * 1.5));
    expect(scaled.enemy.maxHealth).toBe(Math.round(baseline.enemy.maxHealth * 1.4));
    expect(scaled.enemy.attack).toBe(Math.round(baseline.enemy.attack * 1.2));
    expect(scaled.enemy.defense).toBe(Math.round(baseline.enemy.defense * 1.3));

    expect(scaled.hero).toMatchObject({
      level: baseline.hero.level,
      speed: baseline.hero.speed,
      crit: baseline.hero.crit,
      equipmentScore: baseline.hero.equipmentScore,
    });
    expect(scaled.enemy).toMatchObject({
      level: baseline.enemy.level,
      speed: baseline.enemy.speed,
      crit: baseline.enemy.crit,
      equipmentScore: baseline.enemy.equipmentScore,
    });
    expect(JSON.stringify(hero)).toBe(heroBefore);
    expect(JSON.stringify(enemy)).toBe(enemyBefore);
  });

  test("ограничивает некорректные множители безопасным диапазоном", () => {
    const { hero, enemy } = bareFighters();
    const baseline = resolveCombat(hero, enemy);

    const scaled = resolveCombat(hero, enemy, {
      heroStatMultipliers: { health: 0, attack: 99, defense: Number.NaN },
      enemyStatMultipliers: { health: -2, attack: Number.POSITIVE_INFINITY, defense: 0.05 },
    });

    expect(scaled.hero.maxHealth).toBe(Math.max(1, Math.round(baseline.hero.maxHealth * 0.1)));
    expect(scaled.hero.attack).toBe(Math.round(baseline.hero.attack * 3));
    expect(scaled.hero.defense).toBe(baseline.hero.defense);
    expect(scaled.enemy.maxHealth).toBe(Math.max(1, Math.round(baseline.enemy.maxHealth * 0.1)));
    expect(scaled.enemy.attack).toBe(baseline.enemy.attack);
    expect(scaled.enemy.defense).toBe(Math.max(0, Math.round(baseline.enemy.defense * 0.1)));
  });
});

describe("числовые бонусы комплектов из каталога", () => {
  test.each([
    ["wanderer", "Knight", 2, { health: 8 }],
    ["wanderer", "Knight", 4, { health: 8, attack: 3, defense: 3 }],
    ["wanderer", "Knight", 6, { health: 8, attack: 3, defense: 3, crit: 5 }],
    ["bastion", "Knight", 2, { defense: 6 }],
    ["wind", "Archer", 2, { speed: 4 }],
    ["wind", "Archer", 4, { speed: 4, crit: 8 }],
    ["astral", "Wizard", 2, { attack: 5 }],
    ["crane", "Monk", 2, { speed: 5 }],
    ["powder", "Gunsmith", 2, { attack: 5 }],
    ["dusk", "Swordsman", 2, { crit: 6 }],
  ] as Array<[string, HeroClass, number, Partial<Stats>]>) (
    "%s (%s): применяет бонус порога %i один раз",
    (setId, classId, pieces, expected) => {
      const { hero: baseHero } = bareFighters(classId);
      const baseline = combatantSnapshot(baseHero);
      const { hero } = bareFighters(classId);
      equipStatlessSet(hero, setId, pieces);
      const equipped = combatantSnapshot(hero);

      (Object.keys(expected) as Array<keyof Stats>).forEach((stat) => {
        expect(equipped[stat]).toBe(baseline[stat] + expected[stat]!);
      });
    },
  );
});
