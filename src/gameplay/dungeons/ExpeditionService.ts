import { DUNGEONS } from "../../catalogs/WorldCatalog";
import {
  EXPEDITION_CHOICES,
  FACTIONS,
} from "../../catalogs/WorldExpansionCatalog";
import { ItemCreationOptions } from "../../factories/ItemFactory";
import { CombatOptions } from "../combat/AdvancedBattle";
import { EXPEDITION_SHRINE_CHOICES } from "../core/WorldGameConfig";
import { WorldRandomStreams } from "../core/WorldRandom";
import {
  ActivityAvailability,
  ActivityDefinition,
  BattleReport,
  ContractObjective,
  DailyActivityReport,
  DungeonExpedition,
  EnemyProfile,
  EquipmentItem,
  ExpeditionChoice,
  ExpeditionShrineChoice,
  ExpeditionShrineChoiceId,
  ExpeditionStepReport,
  GameSave,
  HeroProfile,
  PendingBattle,
  PendingTournamentState,
  Rarity,
  TournamentReport,
  WorldEvent,
} from "../core/WorldTypes";
import { RewardContext } from "../progression/NewGamePlus";
import { changeFactionInfluence } from "../world/FactionEconomy";
import { factionModifier } from "../world/FactionSystem";
import { createFactionControlState } from "../world/LivingWorld";
import { StructuredWorldEventPayload } from "../world/WorldEvents";
import {
  completeDungeonExploration,
  dungeonMerchantTerms,
  DungeonRouteNode,
  generateDungeonRoute,
  normalizeDungeonDiscoveryState,
  reachableDungeonNodes,
  recordDungeonNodeVisit,
  resolveDungeonTrap,
  selectPersistentDungeonRival,
} from "./DungeonRoute";
interface ExpeditionHooks {
  availability(activity: ActivityDefinition): ActivityAvailability;
  runPendingBattleAutomatically():
    | BattleReport
    | DailyActivityReport
    | TournamentReport
    | ExpeditionStepReport
    | undefined;
  addItem(item: EquipmentItem): void;
  epochRewards(
    baseExperience: number,
    baseGold: number,
    context: RewardContext,
  ): { experience: number; gold: number };
  createRewardItem(
    level: number,
    options: Omit<ItemCreationOptions, "randomSource">,
    targetChanceBonus?: number,
  ): EquipmentItem;
  minimumRewardRarity(rarity: Rarity, context: RewardContext): Rarity;
  controlledDungeonMinimum(dungeonId: string, rarity: Rarity): Rarity;
  createPendingBattle(
    kind: PendingBattle["kind"],
    activityId: string,
    enemy: EnemyProfile,
    options: CombatOptions,
    combatContext:
      "arena" | "dungeon" | "duel" | "boss" | "crown-league" | "legend-hunt",
    tournament?: PendingTournamentState,
    pendingContext?: PendingBattle["context"],
    heroOverride?: HeroProfile,
  ): PendingBattle;
  assertNoPendingBattle(): void;
  advanceContract(objective: ContractObjective): void;
  gainHeroExperience(amount: number, levelCap?: number): number;
  createDungeonEnemy(
    levels: [number, number],
    dungeonName: string,
  ): EnemyProfile;
  completeDay(skipTournamentArenaId?: string): void;
  prepareDayActivity(): void;
  event(
    type: WorldEvent["type"],
    message: string,
    payload?: StructuredWorldEventPayload,
  ): void;
}
export class ExpeditionService {
  constructor(
    private readonly save: GameSave,
    private readonly random: WorldRandomStreams,
    private readonly hooks: ExpeditionHooks,
  ) {}
  public startExpedition(dungeonId: string): DungeonExpedition {
    if (this.save.activeExpedition) return this.save.activeExpedition;
    const dungeon = DUNGEONS.find((candidate) => candidate.id === dungeonId);
    if (!dungeon) throw new Error("Данж не найден.");
    const availability = this.hooks.availability(dungeon);
    if (!availability.unlocked) throw new Error(availability.reason);
    this.hooks.prepareDayActivity();
    const maxStages =
      dungeon.requiredArena >= 4 ? 5 : dungeon.requiredArena >= 2 ? 4 : 3;
    const discovery = this.dungeonDiscovery(dungeonId);
    const maxSupplies = maxStages + 1;
    this.save.activeExpedition = {
      dungeonId,
      stage: 0,
      maxStages,
      health: 100,
      accumulatedGold: 0,
      accumulatedExperience: 0,
      loot: [],
      path: [],
      route: generateDungeonRoute(dungeonId, maxStages, this.random.world),
      visitedNodeIds: [],
      discoveredNodeIds: [...discovery.discoveredNodeIds],
      encounteredFighterIds: [],
      supplies: maxSupplies,
      maxSupplies,
    };
    this.hooks.event(
      "dungeon",
      `${this.save.hero.name} начал поход «${dungeon.name}».`,
      {
        kind: "dungeon",
        fighterId: "hero",
        fighterName: this.save.hero.name,
        dungeonId: dungeon.id,
        dungeonName: dungeon.name,
        outcome: "started",
      },
    );
    return this.save.activeExpedition;
  }

  public expeditionRoute() {
    return this.save.activeExpedition?.route;
  }

  public dungeonDiscovery(dungeonId: string) {
    const source = this.save.dungeonDiscoveries?.[dungeonId];
    const normalized = normalizeDungeonDiscoveryState(dungeonId, source);
    const discovery = {
      ...normalized,
      alternateBossDefeated: source?.alternateBossDefeated ?? false,
    };
    this.save.dungeonDiscoveries ??= {};
    this.save.dungeonDiscoveries[dungeonId] = discovery;
    return discovery;
  }

  public reachableExpeditionNodes(): DungeonRouteNode[] {
    const expedition = this.save.activeExpedition;
    if (
      !expedition?.route ||
      expedition.pendingShrineNodeId ||
      expedition.pendingMerchantNodeId
    )
      return [];
    return reachableDungeonNodes(
      expedition.route,
      expedition.visitedNodeIds ?? [],
      this.dungeonDiscovery(expedition.dungeonId),
    );
  }

  public expeditionShrineChoices(): ExpeditionShrineChoice[] {
    if (!this.save.activeExpedition?.pendingShrineNodeId) return [];
    return EXPEDITION_SHRINE_CHOICES.map((choice) => ({ ...choice }));
  }

  public resolveExpeditionShrine(
    choiceId: ExpeditionShrineChoiceId,
  ): ExpeditionStepReport {
    const expedition = this.save.activeExpedition;
    if (!expedition?.pendingShrineNodeId)
      throw new Error("Святилище не ожидает решения.");
    const choice = EXPEDITION_SHRINE_CHOICES.find(
      (candidate) => candidate.id === choiceId,
    );
    if (!choice) throw new Error("Такой клятвы у святилища нет.");
    if (choice.id === "blood-oath") {
      expedition.health = Math.max(1, expedition.health - 14);
      expedition.attackMultiplier =
        Math.max(1, expedition.attackMultiplier ?? 1) + 0.18;
    } else {
      expedition.accumulatedGold = Math.floor(expedition.accumulatedGold * 0.8);
      expedition.defenseMultiplier =
        Math.max(1, expedition.defenseMultiplier ?? 1) + 0.16;
      expedition.lootChanceBonus =
        Math.max(0, expedition.lootChanceBonus ?? 0) + 0.12;
    }
    expedition.path.push(`shrine:${choice.id}`);
    expedition.pendingShrineNodeId = undefined;
    this.hooks.event(
      "dungeon",
      `${this.save.hero.name} принял клятву «${choice.name}».`,
      {
        kind: "dungeon",
        fighterId: "hero",
        fighterName: this.save.hero.name,
        dungeonId: expedition.dungeonId,
        outcome: "progressed",
      },
    );
    return {
      expedition,
      completed: false,
      retreated: false,
      message: `${choice.name}: ${choice.benefit}. Цена: ${choice.cost}.`,
    };
  }

  public expeditionMerchantOptions(): Array<{
    id: "healing" | "supplies" | "leave";
    name: string;
    description: string;
    price: number;
  }> {
    const expedition = this.save.activeExpedition;
    if (!expedition?.pendingMerchantNodeId || !expedition.route) return [];
    const node = expedition.route.nodes.find(
      (candidate) => candidate.id === expedition.pendingMerchantNodeId,
    );
    if (!node) return [];
    const terms = dungeonMerchantTerms(node, this.save.hero.level);
    return [
      {
        id: "healing",
        name: "Перевязать раны",
        description: `Восстановить ${terms.staminaRestored}% запаса сил.`,
        price: terms.healingPrice,
      },
      {
        id: "supplies",
        name: "Купить припасы",
        description: "Восстановить две единицы провизии.",
        price: Math.max(1, Math.round(terms.healingPrice * 0.72)),
      },
      {
        id: "leave",
        name: "Продолжить путь",
        description: "Не тратить найденные монеты.",
        price: 0,
      },
    ];
  }

  public resolveExpeditionMerchant(
    choiceId: "healing" | "supplies" | "leave",
  ): ExpeditionStepReport {
    const expedition = this.save.activeExpedition;
    if (!expedition?.pendingMerchantNodeId || !expedition.route)
      throw new Error("Торговец сейчас не ожидает решения.");
    const option = this.expeditionMerchantOptions().find(
      (candidate) => candidate.id === choiceId,
    );
    if (!option) throw new Error("Такого предложения у торговца нет.");
    const node = expedition.route.nodes.find(
      (candidate) => candidate.id === expedition.pendingMerchantNodeId,
    );
    if (!node) throw new Error("Торговец из маршрута больше не найден.");
    if (expedition.accumulatedGold < option.price)
      throw new Error(`Нужно найденных монет: ${option.price}.`);
    expedition.accumulatedGold -= option.price;
    if (choiceId === "healing") {
      const terms = dungeonMerchantTerms(node, this.save.hero.level);
      expedition.health = Math.min(
        100,
        expedition.health + terms.staminaRestored,
      );
    } else if (choiceId === "supplies") {
      expedition.supplies = Math.min(
        expedition.maxSupplies ?? expedition.maxStages + 1,
        (expedition.supplies ?? 0) + 2,
      );
    }
    expedition.path.push(`merchant:${choiceId}`);
    expedition.pendingMerchantNodeId = undefined;
    this.hooks.event(
      "dungeon",
      choiceId === "leave"
        ? `${this.save.hero.name} отказался от сделки с подземным торговцем.`
        : `${this.save.hero.name} приобрёл у подземного торговца: ${option.name.toLocaleLowerCase("ru-RU")}.`,
      {
        kind: "dungeon",
        fighterId: "hero",
        fighterName: this.save.hero.name,
        dungeonId: expedition.dungeonId,
        outcome: "progressed",
      },
    );
    return {
      expedition,
      completed: false,
      retreated: false,
      message:
        choiceId === "leave"
          ? "Торговец остался позади."
          : `${option.name}: потрачено ${option.price} найденных монет.`,
    };
  }

  public advanceExpeditionNode(nodeId: string): ExpeditionStepReport {
    const started = this.beginExpeditionNode(nodeId);
    if (!("version" in started)) return started;
    const result = this.hooks.runPendingBattleAutomatically();
    if (!result || !("completed" in result))
      throw new Error(
        "Автоматический расчёт этапа похода не вернул результат.",
      );
    return result as ExpeditionStepReport;
  }

  public beginExpeditionNode(
    nodeId: string,
  ): PendingBattle | ExpeditionStepReport {
    this.hooks.assertNoPendingBattle();
    const expedition = this.save.activeExpedition;
    if (!expedition?.route)
      throw new Error("Для текущего похода маршрут ещё не построен.");
    if (expedition.pendingShrineNodeId)
      throw new Error("Сначала завершите выбор у святилища.");
    if (expedition.pendingMerchantNodeId)
      throw new Error("Сначала завершите разговор с подземным торговцем.");
    const node = this.reachableExpeditionNodes().find(
      (candidate) => candidate.id === nodeId,
    );
    if (!node)
      throw new Error("Этот узел не связан с текущим положением экспедиции.");
    if (
      node.kind === "cache" ||
      node.kind === "camp" ||
      node.kind === "shrine" ||
      node.kind === "trap" ||
      node.kind === "merchant"
    ) {
      this.consumeExpeditionSupply(expedition);
      const discovery = recordDungeonNodeVisit(
        expedition.route,
        this.dungeonDiscovery(expedition.dungeonId),
        node.id,
      );
      this.save.dungeonDiscoveries![expedition.dungeonId] = {
        ...discovery,
        alternateBossDefeated:
          this.save.dungeonDiscoveries?.[expedition.dungeonId]
            ?.alternateBossDefeated ?? false,
      };
      expedition.discoveredNodeIds = [...discovery.discoveredNodeIds];
      expedition.visitedNodeIds = [
        ...(expedition.visitedNodeIds ?? []),
        node.id,
      ];
      expedition.currentNodeId = node.id;
      expedition.stage = expedition.visitedNodeIds.length;
      expedition.path.push(`node:${node.kind}:${node.id}`);
      if (node.kind === "cache") return this.resolveExpeditionCache(node);
      if (node.kind === "camp") return this.resolveExpeditionCamp(node);
      if (node.kind === "trap") return this.resolveExpeditionTrap(node);
      if (node.kind === "merchant") {
        expedition.pendingMerchantNodeId = node.id;
        return {
          expedition,
          completed: false,
          retreated: false,
          requiresChoice: true,
          message:
            "Подземный торговец предлагает восстановить силы или пополнить припасы.",
        };
      }
      expedition.pendingShrineNodeId = node.id;
      return {
        expedition,
        completed: false,
        retreated: false,
        requiresChoice: true,
        message: "Святилище требует клятвы. Выберите силу и примите её цену.",
      };
    }
    const dungeon = DUNGEONS.find(
      (candidate) => candidate.id === expedition.dungeonId,
    )!;
    const elite = node.kind === "elite" || node.kind === "rival";
    const boss = node.kind === "boss" || node.kind === "alternate-boss";
    const alternateBoss = node.kind === "alternate-boss";
    const levelBonus = node.depth + (boss ? 5 : elite ? 3 : 0);
    const persistentRival =
      node.kind === "rival"
        ? selectPersistentDungeonRival(
            node,
            this.save.enemies.filter(
              (enemy) =>
                enemy.alive && enemy.arenaIndex >= dungeon.requiredArena,
            ),
            expedition.encounteredFighterIds,
          )
        : undefined;
    const enemy =
      persistentRival ??
      this.hooks.createDungeonEnemy(
        [
          Math.min(
            dungeon.enemyLevel[1] + (boss ? 3 : 1),
            dungeon.enemyLevel[0] + levelBonus,
          ),
          Math.min(
            dungeon.enemyLevel[1] + (boss ? 4 : 2),
            dungeon.enemyLevel[0] + levelBonus + 2,
          ),
        ],
        dungeon.name,
      );
    if (persistentRival) {
      expedition.encounteredFighterIds = [
        ...new Set([
          ...(expedition.encounteredFighterIds ?? []),
          persistentRival.id,
        ]),
      ];
      if (node.event?.type === "rival")
        node.event.opponentId = persistentRival.id;
    } else if (elite) {
      enemy.name = `Элитный страж: ${enemy.name.replace(/^Хранитель:\s*/, "")}`;
      enemy.title = `именной хранитель «${dungeon.name}»`;
    } else if (boss) {
      enemy.name = `${alternateBoss ? "Тайный владыка" : "Владыка глубин"}: ${enemy.name.replace(/^Хранитель:\s*/, "")}`;
      enemy.title = `${alternateBoss ? "скрытый хозяин" : "финальный хранитель"} «${dungeon.name}»`;
    }
    const wear = Math.max(0, Math.round((100 - expedition.health) * 1.8));
    const temporaryHero: HeroProfile = {
      ...this.save.hero,
      injuries: [
        ...this.save.hero.injuries,
        ...(wear > 0
          ? [
              {
                id: "expedition-wear",
                name: "Усталость похода",
                description: "Накопленная усталость снижает запас сил.",
                remainingDays: 1,
                stats: { health: -wear },
                gainedDay: this.save.worldDay,
              },
            ]
          : []),
      ],
    };
    const enemyMultiplier = alternateBoss
      ? 1.52
      : boss
        ? 1.28
        : elite
          ? 1.14
          : 1;
    return this.hooks.createPendingBattle(
      "expedition",
      dungeon.id,
      enemy,
      {
        heroStatMultipliers: {
          attack: expedition.attackMultiplier ?? 1,
          defense: expedition.defenseMultiplier ?? 1,
        },
        enemyStatMultipliers: {
          health: enemyMultiplier,
          attack: alternateBoss ? 1.26 : boss ? 1.16 : elite ? 1.08 : 1,
          defense: enemyMultiplier,
        },
      },
      boss ? "boss" : "dungeon",
      undefined,
      {
        expeditionMode: "route-node",
        nodeId: node.id,
        nodeKind: node.kind,
        persistentEnemyId: persistentRival?.id,
      },
      temporaryHero,
    );
  }

  private resolveExpeditionCache(node: DungeonRouteNode): ExpeditionStepReport {
    const expedition = this.save.activeExpedition!;
    const dungeon = DUNGEONS.find(
      (candidate) => candidate.id === expedition.dungeonId,
    )!;
    const gold = Math.max(
      1,
      Math.round(
        (dungeon.rewardGold / expedition.maxStages) * node.rewardMultiplier,
      ),
    );
    expedition.accumulatedGold += gold;
    let item: EquipmentItem | undefined;
    const lootChance = Math.min(
      0.9,
      0.42 +
        (expedition.lootChanceBonus ?? 0) +
        factionModifier(this.save.hero.factionReputation, "dungeonLootChance"),
    );
    if (this.random.loot.chance(lootChance)) {
      item = this.hooks.createRewardItem(
        Math.min(this.save.hero.level + 1, dungeon.enemyLevel[1]),
        {
          classId: this.save.hero.classId,
          minimumRarity: this.hooks.minimumRewardRarity(
            this.hooks.controlledDungeonMinimum(
              dungeon.id,
              dungeon.minimumRarity,
            ),
            "dungeon",
          ),
        },
        0.08 + (expedition.lootChanceBonus ?? 0),
      );
      expedition.loot.push(item);
    }
    this.hooks.event(
      "loot",
      `${this.save.hero.name} нашёл тайник: ${gold} монет${item ? ` и «${item.name}»` : ""}.`,
      {
        kind: "loot",
        fighterId: "hero",
        fighterName: this.save.hero.name,
        itemId: item?.id,
        itemName: item?.name,
        rarity: item?.rarity,
        source: `dungeon-cache:${dungeon.id}`,
      },
    );
    return {
      expedition,
      completed: false,
      retreated: false,
      message: `Тайник открыт без боя. Найдено ${gold} монет${item ? ` и предмет «${item.name}»` : ""}.`,
    };
  }

  private resolveExpeditionTrap(node: DungeonRouteNode): ExpeditionStepReport {
    const expedition = this.save.activeExpedition!;
    const resolution = resolveDungeonTrap(
      node,
      expedition.health,
      expedition.accumulatedGold,
    );
    expedition.health = resolution.staminaAfter;
    expedition.accumulatedGold = resolution.goldAfter;
    this.hooks.event(
      "dungeon",
      `${this.save.hero.name} попал в ловушку: -${resolution.staminaLost}% сил, -${resolution.goldLost} найденных монет.`,
      {
        kind: "dungeon",
        fighterId: "hero",
        fighterName: this.save.hero.name,
        dungeonId: expedition.dungeonId,
        outcome: "progressed",
      },
    );
    if (expedition.health <= 0) {
      return this.finishExpedition(
        true,
        "Ловушка исчерпала запас сил. Герой вынужден покинуть данж.",
      );
    }
    return {
      expedition,
      completed: false,
      retreated: false,
      message: `Ловушка отняла ${resolution.staminaLost}% сил и ${resolution.goldLost} монет, но открыла сведения о скрытом пути.`,
    };
  }

  private resolveExpeditionCamp(_node: DungeonRouteNode): ExpeditionStepReport {
    const expedition = this.save.activeExpedition!;
    const before = expedition.health;
    expedition.health = Math.min(100, expedition.health + 30);
    expedition.supplies = Math.min(
      expedition.maxSupplies ?? expedition.maxStages + 1,
      (expedition.supplies ?? 0) + 1,
    );
    expedition.daysSpent = (expedition.daysSpent ?? 0) + 1;
    let incident = "";
    if (this.random.world.chance(0.18)) {
      const loss = this.random.world.int(6, 11);
      expedition.health = Math.max(1, expedition.health - loss);
      incident = ` Ночью патруль потревожил лагерь: потеряно ${loss}% запаса сил.`;
    }
    const recovered = Math.max(0, expedition.health - before);
    this.hooks.event(
      "dungeon",
      `${this.save.hero.name} устроил лагерь в походе и восстановил ${recovered}% запаса сил.${incident}`,
      {
        kind: "dungeon",
        fighterId: "hero",
        fighterName: this.save.hero.name,
        dungeonId: expedition.dungeonId,
        outcome: "progressed",
      },
    );
    this.hooks.completeDay();
    return {
      expedition,
      completed: false,
      retreated: false,
      message: `Лагерь восстановил ${recovered}% запаса сил и занял один день.${incident}`,
    };
  }

  public consumeExpeditionSupply(expedition: DungeonExpedition): void {
    const remaining = Math.max(
      0,
      expedition.supplies ?? expedition.maxStages + 1,
    );
    if (remaining > 0) {
      expedition.supplies = remaining - 1;
      return;
    }
    expedition.supplies = 0;
    expedition.health = Math.max(1, expedition.health - 9);
    expedition.path.push("exhausted-supplies");
  }

  public expeditionChoices(): ExpeditionChoice[] {
    if (!this.save.activeExpedition) return [];
    const expedition = this.save.activeExpedition;
    return EXPEDITION_CHOICES.filter(
      (choice) =>
        choice.id !== "rest" ||
        (expedition.stage > 0 && expedition.health < 92),
    );
  }

  public advanceExpedition(
    choiceId: ExpeditionChoice["id"],
  ): ExpeditionStepReport {
    const started = this.beginExpeditionChoice(choiceId);
    if (!("version" in started)) return started;
    const result = this.hooks.runPendingBattleAutomatically();
    if (!result || !("completed" in result))
      throw new Error(
        "Автоматический расчёт этапа похода не вернул результат.",
      );
    return result as ExpeditionStepReport;
  }

  public beginExpeditionChoice(
    choiceId: ExpeditionChoice["id"],
  ): PendingBattle | ExpeditionStepReport {
    this.hooks.assertNoPendingBattle();
    const expedition = this.save.activeExpedition;
    if (!expedition) throw new Error("Активного похода нет.");
    const dungeon = DUNGEONS.find(
      (candidate) => candidate.id === expedition.dungeonId,
    )!;
    const choice = this.expeditionChoices().find(
      (candidate) => candidate.id === choiceId,
    );
    if (!choice) throw new Error("Этот путь сейчас недоступен.");

    if (choice.id === "rest") {
      expedition.path.push(choice.id);
      expedition.health = Math.min(100, expedition.health + 28);
      expedition.stage += 1;
      if (expedition.stage >= expedition.maxStages)
        return this.finishExpedition(
          false,
          `Герой закрепил добычу и нашёл выход из «${dungeon.name}».`,
        );
      return {
        expedition,
        completed: false,
        retreated: false,
        message: "Лагерь восстановил силы, но приблизил поход к развязке.",
      };
    }

    const levelBonus = expedition.stage + (choice.id === "risk" ? 3 : 0);
    const enemy = this.hooks.createDungeonEnemy(
      [
        Math.min(dungeon.enemyLevel[1] + 2, dungeon.enemyLevel[0] + levelBonus),
        Math.min(
          dungeon.enemyLevel[1] + 3,
          dungeon.enemyLevel[0] + levelBonus + 2,
        ),
      ],
      dungeon.name,
    );
    const wear = Math.max(0, Math.round((100 - expedition.health) * 1.8));
    const temporaryHero: HeroProfile = {
      ...this.save.hero,
      injuries: [
        ...this.save.hero.injuries,
        ...(wear > 0
          ? [
              {
                id: "expedition-wear",
                name: "Усталость похода",
                description: "Накопленная усталость снижает запас сил.",
                remainingDays: 1,
                stats: { health: -wear },
                gainedDay: this.save.worldDay,
              },
            ]
          : []),
      ],
    };
    return this.hooks.createPendingBattle(
      "expedition",
      dungeon.id,
      enemy,
      {},
      "dungeon",
      undefined,
      {
        expeditionMode: "choice",
        choiceId: choice.id,
      },
      temporaryHero,
    );
  }

  public retreatExpedition(): ExpeditionStepReport {
    if (!this.save.activeExpedition) throw new Error("Активного похода нет.");
    return this.finishExpedition(
      true,
      "Герой добровольно вернулся наверх и сохранил часть добычи.",
    );
  }

  public finishExpedition(
    retreated: boolean,
    message: string,
    battle?: BattleReport,
  ): ExpeditionStepReport {
    const expedition = this.save.activeExpedition!;
    const finishedExpedition: DungeonExpedition = {
      ...expedition,
      loot: [...expedition.loot],
      path: [...expedition.path],
    };
    const dungeon = DUNGEONS.find(
      (candidate) => candidate.id === expedition.dungeonId,
    )!;
    const dungeonController =
      this.save.factionControl?.dungeonControllers?.[dungeon.id];
    const multiplier = retreated
      ? Math.min(
          0.95,
          0.55 +
            factionModifier(
              this.save.hero.factionReputation,
              "retreatRetention",
            ),
        )
      : 1;
    const baseExperience = Math.round(
      expedition.accumulatedExperience * multiplier,
    );
    const baseGold = Math.round(expedition.accumulatedGold * multiplier);
    const { experience, gold } = this.hooks.epochRewards(
      baseExperience,
      baseGold,
      "dungeon",
    );
    const keptCount = retreated
      ? Math.ceil(expedition.loot.length / 2)
      : expedition.loot.length;
    const items = expedition.loot.slice(0, keptCount);
    items.forEach((item) => this.hooks.addItem(item));
    this.save.hero.gold += gold;
    const levelsGained = this.hooks.gainHeroExperience(experience);
    if (retreated) {
      this.save.hero.losses += 1;
      this.save.hero.dungeonLosses += 1;
    } else {
      this.save.hero.wins += 1;
      this.save.hero.dungeonWins += 1;
      this.save.dungeonClears[dungeon.id] = this.save.worldDay;
      this.hooks.advanceContract("dungeon");
      const preferred = FACTIONS.map((faction) => ({
        id: faction.id,
        reputation: this.save.hero.factionReputation[faction.id] ?? 0,
      })).sort((first, second) => second.reputation - first.reputation)[0];
      const supportedFactionId =
        preferred && preferred.reputation > 0
          ? preferred.id
          : (dungeonController ?? FACTIONS[0].id);
      this.save.factionControl = changeFactionInfluence(
        this.save.factionControl ??
          createFactionControlState(this.save.worldDay),
        "dungeon",
        dungeon.id,
        supportedFactionId,
        7 + dungeon.requiredArena * 2,
      );
    }
    if (expedition.route) {
      const source = this.dungeonDiscovery(dungeon.id);
      const next = retreated
        ? source
        : completeDungeonExploration(
            expedition.route,
            source,
            expedition.visitedNodeIds ?? [],
          );
      this.save.dungeonDiscoveries![dungeon.id] = {
        ...next,
        alternateBossDefeated:
          source.alternateBossDefeated ||
          (!retreated &&
            expedition.path.some((entry) => entry.includes("alternate-boss"))),
      };
    }
    this.save.activeExpedition = undefined;
    this.hooks.event("dungeon", message, {
      kind: "dungeon",
      fighterId: "hero",
      fighterName: this.save.hero.name,
      dungeonId: dungeon.id,
      dungeonName: dungeon.name,
      outcome: retreated ? "retreated" : "completed",
    });
    this.hooks.completeDay();
    const rewards = {
      experience,
      gold,
      item: items[0],
      items,
      levelsGained,
      unlockedSkills: [],
    };
    if (battle) battle.rewards = rewards;
    return {
      expedition: finishedExpedition,
      battle,
      completed: !retreated,
      retreated,
      message,
      rewards,
    };
  }
}
