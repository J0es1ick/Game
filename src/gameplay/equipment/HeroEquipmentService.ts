import {
  ARENAS,
  CLASS_DEFINITIONS,
  ITEM_TEMPLATES,
  RARITY_ORDER,
} from "../../catalogs/WorldCatalog";
import {
  CLASS_RELIC_EPITHETS,
  RELIC_PATHS,
} from "../../catalogs/WorldExpansionCatalog";
import {
  calculateItemPrice,
  createStarterItems,
} from "../../factories/ItemFactory";
import { unlockedSkills } from "../combat/AdvancedBattle";
import {
  CLASS_CHANGE_GOLD_COST,
  CLASS_CHANGE_MARK_COST,
  TEMPERING_MARK_COSTS,
} from "../core/WorldGameConfig";
import { WorldRandomStreams } from "../core/WorldRandom";
import {
  ActivityAvailability,
  EnemyProfile,
  EquipmentItem,
  EquipmentSlot,
  GameSave,
  HeroClass,
  Rarity,
  SkillDefinition,
  Stats,
  WorldEvent,
  WorldFeatureId,
  WorldRelicRecord,
} from "../core/WorldTypes";
import { relicDustYield } from "../equipment/EquipmentLegacy";
import {
  equipmentItemsForLoadout,
  findBestEquipmentLoadout,
} from "../equipment/EquipmentLoadout";
import {
  BestEquipmentEvaluation,
  evaluateBestEquipment,
  LootTarget,
  reforgeCost,
  reforgeProperty,
  ReforgeRequest,
  ReforgeResult,
} from "../equipment/LootProgression";
import { considerNpcLoot } from "../equipment/NpcEquipment";
import {
  buyTemperingMarks,
  temperingMarkPrice,
} from "../equipment/ShopSupplies";
import {
  isWorldRelicEligible,
  releaseWorldRelic,
  synchronizeWorldRelic,
  transferWorldRelic,
} from "../equipment/WorldRelics";
import { factionModifier } from "../world/FactionSystem";
import { createWorldRelicRecord } from "../world/LivingWorld";
import { StructuredWorldEventPayload } from "../world/WorldEvents";
import { MAX_ACTIVE_SKILLS } from "../world/WorldRules";

interface EquipmentHooks {
  event(
    type: WorldEvent["type"],
    message: string,
    payload?: StructuredWorldEventPayload,
  ): void;
  randomId(prefix: string): string;
  requireFeature(id: WorldFeatureId): void;
  assertNoPendingBattle(): void;
  recordEnemyHistory(enemy: EnemyProfile, message: string): void;
}

let eliteRegaliaTemplateIds: ReadonlySet<string> | undefined;

export class HeroEquipmentService {
  constructor(
    private readonly save: GameSave,
    private readonly random: Pick<WorldRandomStreams, "loot">,
    private readonly hooks: EquipmentHooks,
  ) {}

  public setLootTarget(target?: LootTarget): void {
    if (!target) {
      this.save.lootTarget = undefined;
      this.save.lootPity = undefined;
      return;
    }
    if (!target.slot && !target.setId)
      throw new Error("Выберите слот или комплект для целевой охоты.");
    const compatible = ITEM_TEMPLATES.some(
      (template) =>
        (!target.slot || template.slot === target.slot) &&
        (!target.setId || template.setId === target.setId) &&
        (template.allowedClasses === "all" ||
          template.allowedClasses.includes(this.save.hero.classId)) &&
        !template.exclusiveToBoss &&
        !template.exclusiveToElite &&
        !template.exclusiveToFaction,
    );
    if (!compatible)
      throw new Error("Для текущего класса нет предметов выбранной цели.");
    this.save.lootTarget = { ...target };
    const key = `${target.slot ?? "any"}:${target.setId ?? "any"}`;
    if (this.save.lootPity?.targetKey !== key)
      this.save.lootPity = { targetKey: key, misses: 0 };
  }

  public bestEquipmentEvaluation(): BestEquipmentEvaluation {
    const hero = this.save.hero;
    return evaluateBestEquipment(
      equipmentItemsForLoadout(hero, findBestEquipmentLoadout(hero)),
      { classId: hero.classId },
    );
  }

  public reforgeItem(
    itemId: string,
    request: Omit<ReforgeRequest, "attempt">,
  ): ReforgeResult {
    const index = this.save.hero.inventory.findIndex(
      (item) => item.id === itemId,
    );
    if (index < 0) throw new Error("Предмет не найден.");
    const attempt = this.save.reforgeAttempts[itemId] ?? 0;
    const source = this.save.hero.inventory[index];
    if (source.stats[request.sourceStat] === undefined)
      throw new Error(`У предмета нет свойства ${request.sourceStat}.`);
    if (
      request.targetStat &&
      request.targetStat !== request.sourceStat &&
      source.stats[request.targetStat] !== undefined
    ) {
      throw new Error(
        `Свойство ${request.targetStat} уже присутствует на предмете.`,
      );
    }
    const discount = Math.min(
      0.75,
      factionModifier(this.save.hero.factionReputation, "forgeDiscount"),
    );
    const baseCost = reforgeCost(source, attempt);
    const cost = {
      ...baseCost,
      gold: Math.max(0, Math.round(baseCost.gold * (1 - discount))),
    };
    if (this.save.hero.gold < cost.gold)
      throw new Error(`Для перековки нужно ${cost.gold} монет.`);
    if (this.save.hero.temperingMarks < cost.temperingMarks)
      throw new Error(`Для перековки нужно печатей: ${cost.temperingMarks}.`);
    const rolled = reforgeProperty(
      source,
      { ...request, attempt },
      this.random.loot,
    );
    this.save.hero.gold -= cost.gold;
    this.save.hero.temperingMarks -= cost.temperingMarks;
    this.save.hero.inventory[index] = rolled.item;
    this.save.reforgeAttempts[itemId] = attempt + 1;
    if (rolled.item.worldRelicId) {
      this.synchronizeOwnedWorldRelic(
        rolled.item,
        `День ${this.save.worldDay}: ${this.save.hero.name} перековал свойство реликвии.`,
      );
    }
    this.hooks.event(
      "loot",
      `${rolled.item.name}: свойство ${request.sourceStat} перековано в ${rolled.targetStat}.`,
      {
        kind: "loot",
        fighterId: "hero",
        fighterName: this.save.hero.name,
        itemId: rolled.item.id,
        itemName: rolled.item.name,
      },
    );
    return { ...rolled, cost };
  }

  public salvageItem(itemId: string): number {
    return this.salvageItems([itemId]);
  }

  public salvageItems(itemIds: readonly string[]): number {
    this.hooks.requireFeature("equipment-legacy");
    const uniqueIds = [...new Set(itemIds)];
    if (uniqueIds.length === 0)
      throw new Error("Не выбраны предметы для разбора.");
    const inventoryById = new Map(
      this.save.hero.inventory.map((item) => [item.id, item]),
    );
    const items = uniqueIds.map((itemId) => {
      const item = inventoryById.get(itemId);
      if (!item)
        throw new Error(
          uniqueIds.length === 1
            ? "Предмет не найден."
            : "Один из выбранных предметов не найден.",
        );
      return item;
    });
    const equippedIds = new Set(Object.values(this.save.hero.equipped));
    if (items.some((item) => equippedIds.has(item.id)))
      throw new Error("Надетый предмет нельзя разобрать.");
    if (items.some((item) => !this.canSellItem(item)))
      throw new Error("Регалии короны нельзя разобрать.");
    if (items.some((item) => item.worldRelicId))
      throw new Error(
        "Мировую реликвию нельзя уничтожить: её можно продать, чтобы она вернулась в оборот мира.",
      );
    const ids = new Set(uniqueIds);
    const dust = items.reduce((total, item) => total + relicDustYield(item), 0);
    this.save.hero.inventory = this.save.hero.inventory.filter(
      (candidate) => !ids.has(candidate.id),
    );
    this.save.hero.relicDust += dust;
    this.hooks.event(
      "loot",
      items.length === 1
        ? `${items[0].name} разобран: получено ${dust} ед. реликтовой пыли.`
        : `Разобрано предметов: ${items.length}. Получено ${dust} ед. реликтовой пыли.`,
    );
    return dust;
  }

  public awakenRelic(
    itemId: string,
    pathId: "might" | "guard" | "tempo",
  ): EquipmentItem {
    this.hooks.requireFeature("equipment-legacy");
    const item = this.save.hero.inventory.find(
      (candidate) => candidate.id === itemId,
    );
    if (!item) throw new Error("Предмет не найден.");
    if (!rarityAtLeast(item.rarity, "legendary"))
      throw new Error(
        "Историю могут обрести только легендарные, мифические и мировые реликвии.",
      );
    if ((item.relicTier ?? 0) < 1)
      throw new Error("Сначала предмет должен заслужить имя в боях.");
    if (item.relicPath) throw new Error("Путь этой реликвии уже выбран.");
    const path = RELIC_PATHS.find((candidate) => candidate.id === pathId);
    if (!path) throw new Error("Путь развития не найден.");
    const cost = 8;
    if (this.save.hero.relicDust < cost)
      throw new Error(`Нужно реликтовой пыли: ${cost}.`);
    this.save.hero.relicDust -= cost;
    item.relicPath = path.id;
    Object.entries(path.stats).forEach(([stat, value]) => {
      const key = stat as keyof Stats;
      item.stats[key] = (item.stats[key] ?? 0) + Number(value);
    });
    const epithet = this.random.loot.pick(
      CLASS_RELIC_EPITHETS[this.save.hero.classId],
    );
    item.relicName = `${item.name} · ${epithet}`;
    item.relicHistory ??= [];
    item.relicHistory.push(
      `День ${this.save.worldDay}: выбран «${path.name}».`,
    );
    item.appearanceVariant = `${path.id}-${item.relicTier ?? 1}`;
    if (!item.worldRelicId && isWorldRelicEligible(item)) {
      const record = createWorldRelicRecord(
        this.hooks.randomId("world-relic"),
        item,
        "hero",
        this.save.hero.name,
        this.save.worldDay,
      );
      Object.assign(item, record.item, {
        stats: { ...record.item.stats },
        relicHistory: [...(record.item.relicHistory ?? [])],
        relicFeats: [...(record.item.relicFeats ?? [])],
        relicProperties: (record.item.relicProperties ?? []).map(
          (property) => ({ ...property }),
        ),
      });
      this.save.worldRelics ??= [];
      this.save.worldRelics.push(record);
    } else if (item.worldRelicId) {
      this.synchronizeOwnedWorldRelic(item);
    }
    this.hooks.event("loot", `${item.name} обрёл имя «${item.relicName}».`);
    return item;
  }

  public relicRecipients(itemId: string): EnemyProfile[] {
    const item = this.save.hero.inventory.find(
      (candidate) => candidate.id === itemId,
    );
    if (
      !item?.worldRelicId ||
      Object.values(this.save.hero.equipped).includes(item.id)
    )
      return [];
    return this.save.enemies
      .filter((enemy) => {
        if (!enemy.alive || enemy.level < Math.max(1, item.level - 5))
          return false;
        if (
          item.allowedClasses !== "all" &&
          !item.allowedClasses.includes(enemy.classId)
        )
          return false;
        const current = enemy.equipment.find(
          (candidate) => candidate.id === enemy.equipped[item.slot],
        );
        if (current?.worldRelicId) return false;
        return !ITEM_TEMPLATES.find(
          (template) => template.id === current?.templateId,
        )?.exclusiveToElite;
      })
      .sort((first, second) => {
        const firstMeetings = this.save.hero.rivalries[first.id]?.meetings ?? 0;
        const secondMeetings =
          this.save.hero.rivalries[second.id]?.meetings ?? 0;
        return secondMeetings - firstMeetings || second.rating - first.rating;
      });
  }

  public giftRelic(itemId: string, fighterId: string): WorldRelicRecord {
    this.hooks.requireFeature("equipment-legacy");
    this.hooks.assertNoPendingBattle();
    const item = this.save.hero.inventory.find(
      (candidate) => candidate.id === itemId,
    );
    if (!item?.worldRelicId)
      throw new Error("Передать можно только пробуждённую мировую реликвию.");
    if (Object.values(this.save.hero.equipped).includes(item.id))
      throw new Error("Сначала снимите реликвию с героя.");
    const recipient = this.relicRecipients(itemId).find(
      (enemy) => enemy.id === fighterId,
    );
    if (!recipient)
      throw new Error(
        "Этот боец не может принять реликвию: проверьте его класс, уровень и занятый слот.",
      );
    const recordIndex =
      this.save.worldRelics?.findIndex(
        (record) => record.id === item.worldRelicId,
      ) ?? -1;
    if (recordIndex < 0)
      throw new Error("Реликвия ещё не внесена в летопись мира.");
    const transfer = transferWorldRelic(
      this.save.worldRelics![recordIndex],
      item,
      recipient.id,
      recipient.name,
      `День ${this.save.worldDay}: ${this.save.hero.name} передал реликвию ${recipient.name}.`,
    );
    if (!considerNpcLoot(recipient, transfer.item))
      throw new Error(
        "Боец сохранил своё нынешнее снаряжение и не принял реликвию.",
      );
    this.save.hero.inventory = this.save.hero.inventory.filter(
      (candidate) => candidate.id !== item.id,
    );
    this.save.worldRelics![recordIndex] = transfer.record;
    recipient.relationships ??= {};
    recipient.relationships.hero = {
      fighterId: "hero",
      kind: "ally",
      intensity: 65,
      lastChangedDay: this.save.worldDay,
    };
    this.hooks.recordEnemyHistory(
      recipient,
      `Получил от ${this.save.hero.name} реликвию «${transfer.item.relicName ?? item.name}».`,
    );
    this.hooks.event(
      "loot",
      `${this.save.hero.name} передал реликвию «${transfer.item.relicName ?? item.name}» бойцу ${recipient.name}. Она останется в мире и сможет сменить владельца.`,
    );
    return transfer.record;
  }

  public equip(itemId: string): void {
    const item = this.save.hero.inventory.find(
      (candidate) => candidate.id === itemId,
    );
    if (!item) throw new Error("Предмет не найден.");
    if (
      item.allowedClasses !== "all" &&
      !item.allowedClasses.includes(this.save.hero.classId)
    )
      throw new Error("Этот класс не может использовать предмет.");
    this.save.hero.equipped[item.slot] = item.id;
  }

  public equipBest(mode: "power" | "set" = "power"): EquipmentItem[] {
    const hero = this.save.hero;
    hero.equipped = findBestEquipmentLoadout(hero, mode);
    return equipmentItemsForLoadout(hero, hero.equipped);
  }

  public setAutoEquipBest(enabled: boolean): void {
    this.save.hero.autoEquipBest = enabled;
    if (enabled) this.equipBest();
  }

  public setAutoSelectSkills(enabled: boolean): void {
    this.save.hero.autoSelectSkills = enabled;
  }

  public setSelectedSkills(skillIds: string[]): SkillDefinition[] {
    const hero = this.save.hero;
    const equippedIds = new Set(Object.values(hero.equipped));
    const available = unlockedSkills(
      hero.classId,
      hero.level,
      hero.inventory.filter((item) => equippedIds.has(item.id)),
      hero.legacySkillId ? [hero.legacySkillId] : [],
    );
    const availableById = new Map(available.map((skill) => [skill.id, skill]));
    const selected = skillIds
      .filter(
        (id, index, values) =>
          values.indexOf(id) === index && availableById.has(id),
      )
      .slice(0, MAX_ACTIVE_SKILLS);
    hero.selectedSkillIds = selected;
    return selected.map((id) => availableById.get(id)!);
  }

  public setCombatMode(mode: "auto" | "manual"): void {
    this.save.hero.combatMode = mode;
  }

  public classChangeAvailability(): ActivityAvailability {
    const hero = this.save.hero;
    if (this.save.pendingBattle)
      return {
        unlocked: false,
        reason: "Сначала завершите или отмените начатый бой.",
      };
    if (this.save.activeExpedition)
      return {
        unlocked: false,
        reason: "Сначала завершите текущий поход или отступите.",
      };
    const finalArenaIndex = ARENAS.length - 1;
    if (
      hero.highestArena < finalArenaIndex ||
      (hero.arenaWins[finalArenaIndex] ?? 0) < 1
    ) {
      return {
        unlocked: false,
        reason: `Смена класса откроется после чемпионства на арене «${ARENAS[finalArenaIndex].name}».`,
      };
    }
    if (hero.gold < CLASS_CHANGE_GOLD_COST)
      return {
        unlocked: false,
        reason: `Нужно ${CLASS_CHANGE_GOLD_COST.toLocaleString("ru-RU")} монет.`,
      };
    if (hero.temperingMarks < CLASS_CHANGE_MARK_COST)
      return {
        unlocked: false,
        reason: `Нужно печатей закалки: ${CLASS_CHANGE_MARK_COST}.`,
      };
    return {
      unlocked: true,
      reason: `Стоимость: ${CLASS_CHANGE_GOLD_COST.toLocaleString("ru-RU")} ¤ и ${CLASS_CHANGE_MARK_COST} печатей.`,
    };
  }

  public changeHeroClass(classId: HeroClass): EquipmentItem[] {
    const hero = this.save.hero;
    if (classId === hero.classId) throw new Error("Этот класс уже выбран.");
    const availability = this.classChangeAvailability();
    if (!availability.unlocked) throw new Error(availability.reason);
    hero.gold -= CLASS_CHANGE_GOLD_COST;
    hero.temperingMarks -= CLASS_CHANGE_MARK_COST;
    hero.classId = classId;
    hero.classChanges += 1;
    hero.selectedSkillIds = [];
    (Object.keys(hero.equipped) as EquipmentSlot[]).forEach((slot) => {
      const item = hero.inventory.find(
        (candidate) => candidate.id === hero.equipped[slot],
      );
      if (
        item &&
        item.allowedClasses !== "all" &&
        !item.allowedClasses.includes(classId)
      )
        delete hero.equipped[slot];
    });
    createStarterItems(classId, this.random.loot).forEach((starter) => {
      const hasCompatibleSlot = hero.inventory.some(
        (item) =>
          item.slot === starter.slot &&
          (item.allowedClasses === "all" ||
            item.allowedClasses.includes(classId)),
      );
      if (!hasCompatibleSlot) this.addItem(starter);
    });
    const equipped = this.equipBest();
    this.hooks.event(
      "system",
      `${hero.name} сменил класс и теперь следует пути «${CLASS_DEFINITIONS[classId].name}».`,
    );
    return equipped;
  }

  public unequip(slot: EquipmentSlot): void {
    delete this.save.hero.equipped[slot];
  }

  public sell(itemId: string): number {
    const item = this.save.hero.inventory.find(
      (candidate) => candidate.id === itemId,
    );
    if (!item) return 0;
    if (Object.values(this.save.hero.equipped).includes(itemId))
      throw new Error("Сначала снимите предмет.");
    if (!this.canSellItem(item))
      throw new Error(
        "Регалии живой короны нельзя продать, пока они принадлежат лидеру элиты.",
      );
    const value = Math.max(1, Math.round(item.price * 0.45));
    this.returnHeroRelicToWorld(
      item,
      `День ${this.save.worldDay}: ${this.save.hero.name} продал реликвию обратно в мир.`,
    );
    this.save.hero.inventory = this.save.hero.inventory.filter(
      (candidate) => candidate.id !== itemId,
    );
    this.save.hero.gold += value;
    return value;
  }

  public canSell(itemId: string): boolean {
    const item = this.save.hero.inventory.find(
      (candidate) => candidate.id === itemId,
    );
    return item ? this.canSellItem(item) : false;
  }

  public canSellItem(
    item: Readonly<Pick<EquipmentItem, "templateId">>,
  ): boolean {
    eliteRegaliaTemplateIds ??= new Set(
      ITEM_TEMPLATES.filter((template) => template.exclusiveToElite).map(
        (template) => template.id,
      ),
    );
    return !eliteRegaliaTemplateIds.has(item.templateId);
  }

  public canBulkSellItem(
    item: Readonly<
      Pick<EquipmentItem, "templateId" | "worldRelicId" | "rarity">
    >,
  ): boolean {
    return (
      !item.worldRelicId && item.rarity !== "relic" && this.canSellItem(item)
    );
  }

  public sellUnequippedQuote(): { count: number; value: number } {
    const equippedIds = new Set(Object.values(this.save.hero.equipped));
    return this.save.hero.inventory.reduce(
      (quote, item) => {
        if (equippedIds.has(item.id) || !this.canBulkSellItem(item))
          return quote;
        quote.count += 1;
        quote.value += Math.max(1, Math.round(item.price * 0.45));
        return quote;
      },
      { count: 0, value: 0 },
    );
  }

  public sellUnequipped(): { count: number; value: number } {
    const equippedIds = new Set(Object.values(this.save.hero.equipped));
    const sellable = this.save.hero.inventory.filter(
      (item) => !equippedIds.has(item.id) && this.canBulkSellItem(item),
    );
    const ids = new Set(sellable.map((item) => item.id));
    const value = sellable.reduce(
      (total, item) => total + Math.max(1, Math.round(item.price * 0.45)),
      0,
    );
    sellable.forEach((item) =>
      this.returnHeroRelicToWorld(
        item,
        `День ${this.save.worldDay}: реликвия покинула инвентарь ${this.save.hero.name}.`,
      ),
    );
    this.save.hero.inventory = this.save.hero.inventory.filter(
      (item) => !ids.has(item.id),
    );
    this.save.hero.gold += value;
    return { count: sellable.length, value };
  }

  public temperingMarkPrice(): number {
    return temperingMarkPrice(this.save);
  }

  public buyTemperingMarks(quantity = 1): { quantity: number; cost: number } {
    return buyTemperingMarks(this.save, quantity);
  }

  public buy(index: number): EquipmentItem {
    const offer = this.save.shopOffers[index];
    if (!offer || offer.sold) throw new Error("Предмет уже продан.");
    if (this.save.hero.gold < offer.item.price)
      throw new Error("Недостаточно монет.");
    this.save.hero.gold -= offer.item.price;
    offer.sold = true;
    this.addItem(offer.item);
    if (offer.item.worldRelicId) {
      const recordIndex = (this.save.worldRelics ?? []).findIndex(
        (candidate) => candidate.id === offer.item.worldRelicId,
      );
      if (recordIndex >= 0) {
        const transfer = transferWorldRelic(
          this.save.worldRelics![recordIndex],
          offer.item,
          "hero",
          this.save.hero.name,
          `День ${this.save.worldDay}: реликвию приобрёл ${this.save.hero.name}.`,
        );
        this.save.worldRelics![recordIndex] = transfer.record;
        const inventoryIndex = this.save.hero.inventory.findIndex(
          (item) => item.id === offer.item.id,
        );
        if (inventoryIndex >= 0)
          this.save.hero.inventory[inventoryIndex] = transfer.item;
        offer.item = transfer.item;
      }
    }
    return offer.item;
  }

  public upgradeCost(itemId: string): number {
    const item = this.save.hero.inventory.find(
      (candidate) => candidate.id === itemId,
    );
    if (!item) throw new Error("Предмет не найден.");
    return this.upgradeCostFor(item);
  }

  public upgradeCostFor(
    item: Readonly<Pick<EquipmentItem, "enhancement">>,
  ): number {
    if (
      this.save.legacy.activeBoonId === "forge-tradition" &&
      (item.enhancement ?? 0) === 0
    )
      return 0;
    return TEMPERING_MARK_COSTS[item.enhancement ?? 0] ?? 0;
  }

  public upgradeItem(itemId: string): EquipmentItem {
    const item = this.save.hero.inventory.find(
      (candidate) => candidate.id === itemId,
    );
    if (!item) throw new Error("Предмет не найден.");
    const current = item.enhancement ?? 0;
    if (current >= 5)
      throw new Error("Предмет уже достиг максимальной закалки.");
    const cost = this.upgradeCostFor(item);
    if (this.save.hero.temperingMarks < cost)
      throw new Error(`Нужно печатей закалки: ${cost}.`);
    this.save.hero.temperingMarks -= cost;
    item.enhancement = current + 1;
    item.level += 1;
    item.stats = Object.fromEntries(
      Object.entries(item.stats).map(([stat, value]) => [
        stat,
        Math.max(Number(value) + 1, Math.ceil(Number(value) * 1.08)),
      ]),
    );
    item.price = calculateItemPrice(item.level, item.rarity);
    if (item.worldRelicId) {
      this.synchronizeOwnedWorldRelic(
        item,
        `День ${this.save.worldDay}: ${this.save.hero.name} закалил реликвию до +${item.enhancement}.`,
      );
    }
    this.hooks.event(
      "loot",
      `${item.name} улучшен в кузнице до +${item.enhancement}.`,
    );
    return item;
  }

  public addItem(item: EquipmentItem): void {
    this.save.hero.inventory.push(item);
    if (!this.save.discoveredItems.includes(item.templateId))
      this.save.discoveredItems.push(item.templateId);
    if (
      item.grantedSkillId &&
      !this.save.legacy.discoveredSkillIds.includes(item.grantedSkillId)
    ) {
      this.save.legacy.discoveredSkillIds.push(item.grantedSkillId);
    }
    const compatible =
      item.allowedClasses === "all" ||
      item.allowedClasses.includes(this.save.hero.classId);
    if (!this.save.hero.autoEquipBest || !compatible) return;
    this.equipBest();
  }

  public returnHeroRelicToWorld(item: EquipmentItem, history: string): void {
    if (!item.worldRelicId) return;
    const recordIndex = (this.save.worldRelics ?? []).findIndex(
      (candidate) => candidate.id === item.worldRelicId,
    );
    if (recordIndex < 0) return;
    this.save.worldRelics![recordIndex] = releaseWorldRelic(
      this.save.worldRelics![recordIndex],
      item,
      history,
    ).record;
  }

  public synchronizeOwnedWorldRelic(
    item: EquipmentItem,
    history?: string,
  ): WorldRelicRecord | undefined {
    if (!item.worldRelicId) return undefined;
    const recordIndex = (this.save.worldRelics ?? []).findIndex(
      (candidate) => candidate.id === item.worldRelicId,
    );
    if (recordIndex < 0) return undefined;
    const record = synchronizeWorldRelic(
      this.save.worldRelics![recordIndex],
      item,
      history,
      this.save.worldDay,
    );
    this.save.worldRelics![recordIndex] = record;
    Object.assign(item, record.item, {
      stats: { ...record.item.stats },
      relicHistory: [...(record.item.relicHistory ?? [])],
      relicFeats: [...(record.item.relicFeats ?? [])],
      relicProperties: (record.item.relicProperties ?? []).map((property) => ({
        ...property,
      })),
    });
    return record;
  }
}

function rarityAtLeast(rarity: Rarity, minimum: Rarity): boolean {
  return RARITY_ORDER.indexOf(rarity) >= RARITY_ORDER.indexOf(minimum);
}
