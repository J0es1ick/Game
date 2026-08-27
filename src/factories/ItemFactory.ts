import { CLASS_DEFINITIONS, ITEM_TEMPLATES, RARITY_ORDER, SKILLS } from "../catalogs/WorldCatalog";
import { EquipmentItem, EquipmentSlot, HeroClass, ItemAffix, Rarity, Stats } from "../gameplay/WorldTypes";
import { FighterPowerCalculator } from "../gameplay/FighterPowerCalculator";
import { nativeRandom, RandomSource } from "../gameplay/RandomSource";

const rarityMultipliers: Record<Rarity, number> = {
  common: 1, rare: 1.35, epic: 1.8, legendary: 2.35, mythic: 3.1,
};

const rarityPrefixes: Record<Rarity, string> = {
  common: "", rare: "Добротный", epic: "Искусный", legendary: "Легендарный", mythic: "Мифический",
};

export function calculateItemPrice(level: number, rarity: Rarity): number {
  const rarityPrice: Record<Rarity, number> = { common: 1, rare: 2.4, epic: 6, legendary: 15, mythic: 36 };
  const scaledLevel = Math.max(1, level);
  return Math.round((95 + scaledLevel * 38 + scaledLevel ** 2 * 2.6) * rarityPrice[rarity]);
}

const affixes: Array<Omit<ItemAffix, "value"> & { base: number }> = [
  { name: "Живучесть", description: "Дополнительное максимальное здоровье", stat: "health", base: 14 },
  { name: "Пробой", description: "Дополнительная сила атаки", stat: "attack", base: 4 },
  { name: "Закалка", description: "Дополнительная защита", stat: "defense", base: 4 },
  { name: "Проворство", description: "Дополнительная скорость", stat: "speed", base: 3 },
  { name: "Точность", description: "Дополнительный шанс критического удара", stat: "crit", base: 4 },
];

function rollRarity(minimum: Rarity = "common", random: RandomSource = nativeRandom): Rarity {
  const roll = random.next();
  const rolled: Rarity = roll < 0.015 ? "mythic" : roll < 0.075 ? "legendary" : roll < 0.24 ? "epic" : roll < 0.55 ? "rare" : "common";
  return RARITY_ORDER[Math.max(RARITY_ORDER.indexOf(rolled), RARITY_ORDER.indexOf(minimum))];
}

function isAllowed(classes: HeroClass[] | "all", classId?: HeroClass): boolean {
  return !classId || classes === "all" || classes.includes(classId);
}

export interface ItemCreationOptions {
  classId?: HeroClass;
  minimumRarity?: Rarity;
  slot?: EquipmentSlot;
  templateId?: string;
  rarity?: Rarity;
  randomSource?: RandomSource;
}

function randomItemId(random: RandomSource): string {
  return `item-${random.int(0, 0x7fffffff).toString(36)}${random.int(0, 0x7fffffff).toString(36)}`.slice(0, 22);
}

export function createItem(level: number, options: ItemCreationOptions = {}): EquipmentItem {
  const random = options.randomSource ?? nativeRandom;
  const candidates = ITEM_TEMPLATES.filter((template) =>
    isAllowed(template.allowedClasses, options.classId)
    && (!template.exclusiveToBoss || options.templateId === template.id)
    && (!template.exclusiveToElite || options.templateId === template.id)
    && (!template.exclusiveToFaction || options.templateId === template.id)
    && (!options.slot || template.slot === options.slot)
    && (!options.templateId || template.id === options.templateId));
  const template = random.pick(candidates.length > 0 ? candidates : ITEM_TEMPLATES);
  const rarity = options.rarity ?? rollRarity(options.minimumRarity, random);
  const multiplier = rarityMultipliers[rarity];
  const scaledLevel = Math.max(1, level);
  const baseValue = template.primaryStat === "health"
    ? 9 + scaledLevel * 3
    : template.primaryStat === "crit"
      ? 2 + Math.floor(scaledLevel / 5)
      : 2 + Math.floor(scaledLevel * 0.75);
  const stats: Partial<Stats> = {
    [template.primaryStat]: Math.max(1, Math.round(baseValue * multiplier)),
  };
  if (rarity !== "common") {
    const secondary = random.pick((Object.keys(CLASS_DEFINITIONS.Knight.startingStats) as Array<keyof Stats>).filter((stat) => stat !== template.primaryStat));
    stats[secondary] = Math.max(1, Math.round((secondary === "health" ? scaledLevel * 1.5 + 5 : scaledLevel * 0.22 + 1) * multiplier));
  }

  let affix: ItemAffix | undefined;
  let grantedSkillId: string | undefined;
  if (rarity === "legendary" || rarity === "mythic") {
    const source = random.pick(affixes);
    affix = { ...source, value: Math.round(source.base * (rarity === "mythic" ? 1.8 : 1) + scaledLevel * 0.4) };
    const skills = SKILLS.filter((skill) => skill.equipmentOnly && (skill.classes === "all" || !options.classId || skill.classes.includes(options.classId)));
    grantedSkillId = random.pick(skills).id;
  }

  const prefix = rarityPrefixes[rarity];
  const name = prefix ? `${prefix} «${template.name}»` : template.name;
  const price = calculateItemPrice(scaledLevel, rarity);
  return {
    id: randomItemId(random), templateId: template.id, name, slot: template.slot, rarity, level: scaledLevel,
    stats, allowedClasses: template.allowedClasses, price, affix, grantedSkillId, setId: template.setId,
  };
}

export function createStarterItems(classId: HeroClass, randomSource: RandomSource = nativeRandom): EquipmentItem[] {
  const definition = CLASS_DEFINITIONS[classId];
  const compatible = ITEM_TEMPLATES.filter((item) => !item.exclusiveToBoss && !item.exclusiveToElite && !item.exclusiveToFaction && isAllowed(item.allowedClasses, classId));
  const weaponTemplate = compatible.find((item) => item.slot === "weapon")!;
  const items: EquipmentItem[] = [createItem(1, { classId, templateId: weaponTemplate.id, rarity: "common", randomSource })];
  items[0].name = definition.startingWeapon;
  if (definition.startingOffhand) {
    const offhand = compatible.find((item) => item.slot === "offhand");
    if (offhand) {
      const item = createItem(1, { classId, templateId: offhand.id, rarity: "common", randomSource });
      item.name = definition.startingOffhand;
      items.push(item);
    }
  }
  const chest = compatible.find((item) => item.slot === "chest") ?? ITEM_TEMPLATES.find((item) => item.id === "wanderer-coat")!;
  items.push(createItem(1, { classId, templateId: chest.id, rarity: "common", randomSource }));
  return items;
}

export function equipmentScore(items: EquipmentItem[]): number {
  return FighterPowerCalculator.equipment(items);
}

export function itemPower(item: EquipmentItem): number {
  return FighterPowerCalculator.item(item);
}
