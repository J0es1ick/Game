import { ARENAS, DUNGEONS } from "../../catalogs/WorldCatalog";
import { FACTIONS } from "../../catalogs/WorldExpansionCatalog";
import { FactionControlState, ItemTemplate, Rarity } from "../core/WorldTypes";

export type FactionId = "wardens" | "free-company" | "red-ledger";
export type FactionDisposition =
  "allied" | "trusted" | "neutral" | "wary" | "hostile";

export interface FactionShopPolicy {
  priceBase: number;
  universalTemplateChance: number;
  premiumRarityChance: number;
  minimumRaritySteps: number;
}

export interface FactionArenaReward<TItem = unknown> {
  experience: number;
  gold: number;
  raritySteps: number;
  item?: TItem;
}

export interface FactionReputationResult {
  reputation: Record<string, number>;
  changes: Record<string, number>;
}

export interface FactionControlResolution {
  state: FactionControlState;
  arenaChanges: Array<{
    arenaId: string;
    previousFactionId: string;
    nextFactionId: string;
  }>;
  dungeonChanges: Array<{
    dungeonId: string;
    previousFactionId: string;
    nextFactionId: string;
  }>;
  shopChange?: { previousFactionId: string; nextFactionId: string };
}

export type FactionTerritoryKind = "arena" | "dungeon";

const RELATION_PRESSURE: Record<
  FactionId,
  Partial<Record<FactionId, number>>
> = {
  wardens: { "free-company": 0.08, "red-ledger": 0.32 },
  "free-company": { wardens: 0.08, "red-ledger": 0.12 },
  "red-ledger": { wardens: 0.32, "free-company": 0.12 },
};

const SHOP_POLICIES: Record<FactionId, FactionShopPolicy> = {
  wardens: {
    priceBase: 0.98,
    universalTemplateChance: 0.12,
    premiumRarityChance: 0.35,
    minimumRaritySteps: 0,
  },
  "free-company": {
    priceBase: 1,
    universalTemplateChance: 0.48,
    premiumRarityChance: 0.35,
    minimumRaritySteps: 0,
  },
  "red-ledger": {
    priceBase: 1.1,
    universalTemplateChance: 0.12,
    premiumRarityChance: 0.58,
    minimumRaritySteps: 1,
  },
};

const BASE_FACTION_RELATIONS: Record<FactionId, Record<FactionId, number>> = {
  wardens: { wardens: 60, "free-company": 8, "red-ledger": -36 },
  "free-company": { wardens: 8, "free-company": 60, "red-ledger": -12 },
  "red-ledger": { wardens: -36, "free-company": -12, "red-ledger": 60 },
};

function isFactionId(value: string): value is FactionId {
  return (
    value === "wardens" || value === "free-company" || value === "red-ledger"
  );
}

function normalizedFactionId(value: string): FactionId {
  return isFactionId(value) ? value : "wardens";
}

function finiteReputation(value: number | undefined): number {
  return Math.max(-100, Math.min(100, Math.round(Number(value) || 0)));
}

function finiteRelation(value: number | undefined, fallback = 0): number {
  const numeric = Number(value);
  return Math.max(
    -100,
    Math.min(100, Math.round(Number.isFinite(numeric) ? numeric : fallback)),
  );
}

export function createFactionRelations(): Record<
  string,
  Record<string, number>
> {
  return Object.fromEntries(
    FACTIONS.map((faction) => {
      const factionId = normalizedFactionId(faction.id);
      return [
        factionId,
        Object.fromEntries(
          FACTIONS.map((other) => {
            const otherId = normalizedFactionId(other.id);
            return [otherId, BASE_FACTION_RELATIONS[factionId][otherId]];
          }),
        ),
      ];
    }),
  );
}

export function normalizeFactionRelations(
  relations: Record<string, Record<string, number>> | undefined,
): Record<string, Record<string, number>> {
  const fallback = createFactionRelations();
  return Object.fromEntries(
    FACTIONS.map((faction) => {
      const factionId = normalizedFactionId(faction.id);
      return [
        factionId,
        Object.fromEntries(
          FACTIONS.map((other) => {
            const otherId = normalizedFactionId(other.id);
            const value = relations?.[factionId]?.[otherId];
            return [
              otherId,
              finiteRelation(value, fallback[factionId][otherId]),
            ];
          }),
        ),
      ];
    }),
  );
}

export function factionRelation(
  relations: Record<string, Record<string, number>> | undefined,
  firstFactionId: string,
  secondFactionId: string,
): number {
  const first = normalizedFactionId(firstFactionId);
  const second = normalizedFactionId(secondFactionId);
  return normalizeFactionRelations(relations)[first][second];
}

function recordControlRivalry(
  relations: Record<string, Record<string, number>>,
  winnerFactionId: string,
  loserFactionId: string,
): void {
  const winner = normalizedFactionId(winnerFactionId);
  const loser = normalizedFactionId(loserFactionId);
  if (winner === loser) return;
  const severity = 3;
  relations[winner][loser] = finiteRelation(
    relations[winner][loser] - severity,
  );
  relations[loser][winner] = finiteRelation(
    relations[loser][winner] - severity,
  );
}

export function factionDisposition(reputation: number): FactionDisposition {
  const value = finiteReputation(reputation);
  if (value >= 45) return "allied";
  if (value >= 20) return "trusted";
  if (value <= -30) return "hostile";
  if (value <= -10) return "wary";
  return "neutral";
}

export function factionHostility(
  reputation: Record<string, number>,
  factionId: string,
  relations?: Record<string, Record<string, number>>,
): number {
  const id = normalizedFactionId(factionId);
  const direct = Math.max(0, -finiteReputation(reputation[id]));
  const rivalStanding = (
    Object.entries(RELATION_PRESSURE[id]) as Array<[FactionId, number]>
  ).reduce(
    (total, [rivalId, defaultPressure]) =>
      total +
      Math.max(0, finiteReputation(reputation[rivalId])) *
        (relations
          ? Math.max(0, -factionRelation(relations, id, rivalId)) / 100
          : defaultPressure),
    0,
  );
  return Math.max(0, Math.min(100, Math.round(direct + rivalStanding)));
}

export function applyFactionReputationChange(
  reputation: Record<string, number>,
  factionId: string,
  delta: number,
): FactionReputationResult {
  const id = normalizedFactionId(factionId);
  const safeDelta = Math.round(Number(delta) || 0);
  const next = Object.fromEntries(
    FACTIONS.map((faction) => [
      faction.id,
      finiteReputation(reputation[faction.id]),
    ]),
  );
  const changes: Record<string, number> = Object.fromEntries(
    FACTIONS.map((faction) => [faction.id, 0]),
  );
  const previous = next[id];
  next[id] = finiteReputation(previous + safeDelta);
  changes[id] = next[id] - previous;
  if (safeDelta > 0) {
    (
      Object.entries(RELATION_PRESSURE[id]) as Array<[FactionId, number]>
    ).forEach(([rivalId, pressure]) => {
      const rivalryLoss = Math.max(0, Math.round(safeDelta * pressure));
      const rivalPrevious = next[rivalId];
      next[rivalId] = finiteReputation(rivalPrevious - rivalryLoss);
      changes[rivalId] = next[rivalId] - rivalPrevious;
    });
  }
  return { reputation: next, changes };
}

export function factionShopPolicy(factionId: string): FactionShopPolicy {
  return { ...SHOP_POLICIES[normalizedFactionId(factionId)] };
}

export function factionShopPriceMultiplier(
  factionId: string,
  reputation: number,
  worldRelic = false,
): number {
  const policy = SHOP_POLICIES[normalizedFactionId(factionId)];
  const reputationDiscount = Math.max(
    -0.08,
    Math.min(0.18, finiteReputation(reputation) * 0.003),
  );
  const controllerPrice = Math.max(0.72, policy.priceBase - reputationDiscount);
  return (
    Math.round(controllerPrice * (worldRelic ? 1.45 : 1) * 10_000) / 10_000
  );
}

export function factionShopPrice(
  basePrice: number,
  factionId: string,
  reputation: number,
  worldRelic = false,
): number {
  return Math.max(
    1,
    Math.round(
      Math.max(1, Number(basePrice) || 1) *
        factionShopPriceMultiplier(factionId, reputation, worldRelic),
    ),
  );
}

export function factionArenaReward<TItem = unknown>(
  factionId: string,
  reward: { experience: number; gold: number; item?: TItem },
): FactionArenaReward<TItem> {
  const id = normalizedFactionId(factionId);
  return {
    experience: Math.max(
      0,
      Math.round(reward.experience * (id === "wardens" ? 1.1 : 1)),
    ),
    gold: Math.max(
      0,
      Math.round(reward.gold * (id === "free-company" ? 1.12 : 1)),
    ),
    raritySteps: id === "red-ledger" ? 1 : 0,
    item: reward.item,
  };
}

export function factionDungeonReward<TItem = unknown>(
  factionId: string,
  reward: { experience: number; gold: number; item?: TItem },
): FactionArenaReward<TItem> {
  const id = normalizedFactionId(factionId);
  return {
    experience: Math.max(
      0,
      Math.round(reward.experience * (id === "wardens" ? 1.08 : 1)),
    ),
    gold: Math.max(
      0,
      Math.round(reward.gold * (id === "free-company" ? 1.15 : 1)),
    ),
    raritySteps: id === "red-ledger" ? 1 : 0,
    item: reward.item,
  };
}

export function isPublicShopTemplate(template: ItemTemplate): boolean {
  return (
    !template.exclusiveToBoss &&
    !template.exclusiveToElite &&
    !template.exclusiveToFaction
  );
}

export function improveFactionMinimumRarity(
  rarity: Rarity,
  factionId: string,
): Rarity {
  if (rarity === "relic") return rarity;
  const order: Rarity[] = ["common", "rare", "epic", "legendary", "mythic"];
  const index = order.indexOf(rarity);
  return order[
    Math.min(
      order.length - 1,
      Math.max(
        0,
        index +
          SHOP_POLICIES[normalizedFactionId(factionId)].minimumRaritySteps,
      ),
    )
  ];
}

function cloneFactionControlState(
  source: FactionControlState,
): FactionControlState {
  return {
    arenaControllers: { ...source.arenaControllers },
    arenaInfluence: Object.fromEntries(
      Object.entries(source.arenaInfluence).map(([arenaId, influence]) => [
        arenaId,
        { ...influence },
      ]),
    ),
    shopControllerId: source.shopControllerId,
    lastShiftDay: source.lastShiftDay,
    dungeonControllers: source.dungeonControllers
      ? { ...source.dungeonControllers }
      : undefined,
    dungeonInfluence: source.dungeonInfluence
      ? Object.fromEntries(
          Object.entries(source.dungeonInfluence).map(
            ([dungeonId, influence]) => [dungeonId, { ...influence }],
          ),
        )
      : undefined,
    relations: normalizeFactionRelations(source.relations),
    shopOwnerMentorId: source.shopOwnerMentorId,
    shopPriceRevision: Math.max(
      0,
      Math.round(Number(source.shopPriceRevision) || 0),
    ),
  };
}

export function changeFactionInfluence(
  source: FactionControlState,
  territoryKind: FactionTerritoryKind,
  territoryId: string,
  factionId: string,
  delta: number,
): FactionControlState {
  const state = cloneFactionControlState(source);
  const id = normalizedFactionId(factionId);
  const amount = Math.round(Number(delta) || 0);
  if (territoryKind === "arena") {
    if (!ARENAS.some((arena) => arena.id === territoryId)) return state;
    state.arenaInfluence[territoryId] ??= Object.fromEntries(
      FACTIONS.map((faction) => [faction.id, 0]),
    );
    state.arenaInfluence[territoryId][id] = Math.max(
      0,
      (state.arenaInfluence[territoryId][id] ?? 0) + amount,
    );
    return state;
  }
  if (!DUNGEONS.some((dungeon) => dungeon.id === territoryId)) return state;
  state.dungeonInfluence ??= {};
  state.dungeonInfluence[territoryId] ??= Object.fromEntries(
    FACTIONS.map((faction) => [faction.id, 0]),
  );
  state.dungeonInfluence[territoryId][id] = Math.max(
    0,
    (state.dungeonInfluence[territoryId][id] ?? 0) + amount,
  );
  return state;
}

export function resolveFactionControlCycle(
  source: FactionControlState,
  day: number,
  interval = 7,
): FactionControlResolution {
  const state = cloneFactionControlState(source);
  const arenaChanges: FactionControlResolution["arenaChanges"] = [];
  const dungeonChanges: FactionControlResolution["dungeonChanges"] = [];
  if (day - state.lastShiftDay < Math.max(1, interval))
    return { state, arenaChanges, dungeonChanges };
  ARENAS.forEach((arena) => {
    const completedWindows =
      Math.floor(day / arena.tournamentInterval) -
      Math.floor(state.lastShiftDay / arena.tournamentInterval);
    if (completedWindows <= 0) return;
    state.arenaInfluence[arena.id] ??= Object.fromEntries(
      FACTIONS.map((faction) => [faction.id, 0]),
    );
    const influence = state.arenaInfluence[arena.id];
    const previous = normalizedFactionId(state.arenaControllers[arena.id]);
    const next =
      FACTIONS.map((faction) => ({
        id: normalizedFactionId(faction.id),
        value: Math.max(0, Number(influence[faction.id]) || 0),
      })).sort((first, second) => second.value - first.value)[0]?.id ??
      previous;
    if (
      next !== previous &&
      (influence[next] ?? 0) >= (influence[previous] ?? 0) + 4
    ) {
      state.arenaControllers[arena.id] = next;
      arenaChanges.push({
        arenaId: arena.id,
        previousFactionId: previous,
        nextFactionId: next,
      });
      recordControlRivalry(state.relations!, next, previous);
    }
    FACTIONS.forEach((faction) => {
      const current = Math.max(0, Number(influence[faction.id]) || 0);
      influence[faction.id] =
        current === 0
          ? 0
          : Math.max(8, Math.round(current * Math.pow(0.82, completedWindows)));
    });
  });
  state.dungeonControllers ??= {};
  state.dungeonInfluence ??= {};
  DUNGEONS.forEach((dungeon, index) => {
    const fallbackController = normalizedFactionId(
      state.arenaControllers[
        ARENAS[Math.min(ARENAS.length - 1, dungeon.requiredArena)]?.id
      ] ?? FACTIONS[index % FACTIONS.length].id,
    );
    const previous = normalizedFactionId(
      state.dungeonControllers?.[dungeon.id] ?? fallbackController,
    );
    state.dungeonControllers![dungeon.id] = previous;
    state.dungeonInfluence![dungeon.id] ??= Object.fromEntries(
      FACTIONS.map((faction) => [
        faction.id,
        faction.id === previous ? 30 : 20,
      ]),
    );
    const influence = state.dungeonInfluence![dungeon.id];
    const next =
      FACTIONS.map((faction) => ({
        id: normalizedFactionId(faction.id),
        value: Math.max(0, Number(influence[faction.id]) || 0),
      })).sort((first, second) => second.value - first.value)[0]?.id ??
      previous;
    if (
      next !== previous &&
      (influence[next] ?? 0) >= (influence[previous] ?? 0) + 4
    ) {
      state.dungeonControllers![dungeon.id] = next;
      dungeonChanges.push({
        dungeonId: dungeon.id,
        previousFactionId: previous,
        nextFactionId: next,
      });
      recordControlRivalry(state.relations!, next, previous);
    }
    FACTIONS.forEach((faction) => {
      influence[faction.id] = Math.max(
        8,
        Math.round((Number(influence[faction.id]) || 0) * 0.82),
      );
    });
  });
  const totals = FACTIONS.map((faction) => ({
    id: normalizedFactionId(faction.id),
    value:
      ARENAS.reduce(
        (total, arena) =>
          total + (state.arenaInfluence[arena.id]?.[faction.id] ?? 0),
        0,
      ) +
      DUNGEONS.reduce(
        (total, dungeon) =>
          total +
          (state.dungeonInfluence?.[dungeon.id]?.[faction.id] ?? 0) * 0.75,
        0,
      ),
  })).sort((first, second) => second.value - first.value);
  const previousShop = normalizedFactionId(state.shopControllerId);
  const nextShop = totals[0]?.id ?? previousShop;
  state.shopControllerId = nextShop;
  if (nextShop !== previousShop) {
    state.shopPriceRevision = Math.max(0, state.shopPriceRevision ?? 0) + 1;
    state.shopOwnerMentorId = undefined;
    recordControlRivalry(state.relations!, nextShop, previousShop);
  }
  state.lastShiftDay = day;
  return {
    state,
    arenaChanges,
    dungeonChanges,
    shopChange:
      nextShop === previousShop
        ? undefined
        : { previousFactionId: previousShop, nextFactionId: nextShop },
  };
}
