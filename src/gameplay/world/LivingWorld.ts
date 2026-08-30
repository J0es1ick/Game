import { ARENAS, DUNGEONS } from "../../catalogs/WorldCatalog";
import { FACTIONS } from "../../catalogs/WorldExpansionCatalog";
import {
  EquipmentItem,
  FactionControlState,
  NpcActivity,
  NpcGoal,
  WorldRelicRecord,
} from "../core/WorldTypes";
import {
  createFactionRelations,
  normalizeFactionRelations,
} from "./FactionEconomy";
import {
  assertWorldRelicEligible,
  deduplicateWorldRelicRecords,
  initialWorldRelicName,
  synchronizeWorldRelic,
} from "../equipment/WorldRelics";

export const NPC_GOALS: Record<NpcGoal, { name: string; description: string }> =
  {
    champion: {
      name: "Путь чемпиона",
      description:
        "Ищет турниры, повышает уровень и стремится покорить следующую арену.",
    },
    wealth: {
      name: "Состояние наёмника",
      description:
        "Копит монеты, торгуется и чаще обновляет снаряжение в лавке.",
    },
    relic: {
      name: "Охота за реликвией",
      description:
        "Ищет легендарные вещи и старается оставить своё имя в их истории.",
    },
    vengeance: {
      name: "Старая расплата",
      description:
        "Запоминает поражения и готовится к повторной встрече с главным соперником.",
    },
    elite: {
      name: "Место среди легенд",
      description:
        "Ставит всё на последнюю арену, Лигу короны и место в элитной тридцатке.",
    },
  };

export const NPC_ACTIVITIES: Record<NpcActivity, string> = {
  training: "Тренировка",
  arena: "Поиск турнира",
  dungeon: "Поход в данж",
  shopping: "Посещение лавки",
  forging: "Работа с кузнецом",
  rest: "Восстановление",
};

export const FACTION_CONTROL_EFFECTS: Record<
  string,
  { arena: string; dungeon: string; shop: string }
> = {
  wardens: {
    arena: "Официальные правила: на 10% больше опыта за турнир.",
    dungeon: "Снабжённая экспедиция: на 8% больше опыта за завершённый поход.",
    shop: "Проверенный товар: цены ниже для бойцов с хорошей репутацией у Смотрителей.",
  },
  "free-company": {
    arena: "Наёмные призы: на 12% больше монет за турнир.",
    dungeon: "Проводники роты: на 15% больше монет из завершённого похода.",
    shop: "Дорожный ассортимент: чаще встречаются универсальные вещи, подходящие любому классу.",
  },
  "red-ledger": {
    arena:
      "Кровавый интерес: чемпионская добыча становится на одну ступень редкости выше.",
    dungeon:
      "Тайные заказчики: итоговая добыча становится на одну ступень редкости выше.",
    shop: "Закрытые поставки: вещи дороже, но редкий товар появляется чаще.",
  },
};

export function createFactionControlState(day = 1): FactionControlState {
  const arenaControllers: Record<string, string> = {};
  const arenaInfluence: Record<string, Record<string, number>> = {};
  ARENAS.forEach((arena, index) => {
    const controller = FACTIONS[index % FACTIONS.length].id;
    arenaControllers[arena.id] = controller;
    arenaInfluence[arena.id] = Object.fromEntries(
      FACTIONS.map((faction) => [
        faction.id,
        faction.id === controller
          ? 34
          : 22 + ((index + FACTIONS.indexOf(faction)) % 5),
      ]),
    );
  });
  const dungeonControllers: Record<string, string> = {};
  const dungeonInfluence: Record<string, Record<string, number>> = {};
  DUNGEONS.forEach((dungeon, index) => {
    const arenaController =
      arenaControllers[
        ARENAS[Math.min(ARENAS.length - 1, dungeon.requiredArena)]?.id
      ];
    const controller =
      arenaController ?? FACTIONS[(index + 1) % FACTIONS.length].id;
    dungeonControllers[dungeon.id] = controller;
    dungeonInfluence[dungeon.id] = Object.fromEntries(
      FACTIONS.map((faction) => [
        faction.id,
        faction.id === controller
          ? 31
          : 18 + ((index + FACTIONS.indexOf(faction)) % 6),
      ]),
    );
  });
  return {
    arenaControllers,
    arenaInfluence,
    dungeonControllers,
    dungeonInfluence,
    relations: createFactionRelations(),
    shopControllerId: FACTIONS[0].id,
    lastShiftDay: day,
    shopPriceRevision: 0,
  };
}

export function normalizeFactionControlState(
  state: FactionControlState | undefined,
  day: number,
): FactionControlState {
  const fallback = createFactionControlState(day);
  if (!state) return fallback;
  const knownFactionIds = new Set(FACTIONS.map((faction) => faction.id));
  ARENAS.forEach((arena) => {
    const controller = state.arenaControllers?.[arena.id];
    fallback.arenaControllers[arena.id] =
      controller && knownFactionIds.has(controller)
        ? controller
        : fallback.arenaControllers[arena.id];
    const influence = state.arenaInfluence?.[arena.id] ?? {};
    fallback.arenaInfluence[arena.id] = Object.fromEntries(
      FACTIONS.map((faction) => {
        const supplied = Number(influence[faction.id]);
        return [
          faction.id,
          Number.isFinite(supplied)
            ? Math.max(0, Math.floor(supplied))
            : fallback.arenaInfluence[arena.id][faction.id],
        ];
      }),
    );
  });
  fallback.shopControllerId = knownFactionIds.has(state.shopControllerId)
    ? state.shopControllerId
    : fallback.shopControllerId;
  fallback.lastShiftDay = Math.max(
    1,
    Math.floor(Number(state.lastShiftDay) || day),
  );
  DUNGEONS.forEach((dungeon) => {
    const controller = state.dungeonControllers?.[dungeon.id];
    fallback.dungeonControllers![dungeon.id] =
      controller && knownFactionIds.has(controller)
        ? controller
        : fallback.dungeonControllers![dungeon.id];
    const influence = state.dungeonInfluence?.[dungeon.id] ?? {};
    fallback.dungeonInfluence![dungeon.id] = Object.fromEntries(
      FACTIONS.map((faction) => {
        const supplied = Number(influence[faction.id]);
        return [
          faction.id,
          Number.isFinite(supplied)
            ? Math.max(0, Math.floor(supplied))
            : fallback.dungeonInfluence![dungeon.id][faction.id],
        ];
      }),
    );
  });
  fallback.relations = normalizeFactionRelations(state.relations);
  fallback.shopOwnerMentorId =
    typeof state.shopOwnerMentorId === "string"
      ? state.shopOwnerMentorId
      : undefined;
  fallback.shopPriceRevision = Math.max(
    0,
    Math.floor(Number(state.shopPriceRevision) || 0),
  );
  return fallback;
}

export function worldRelicName(item: EquipmentItem, ownerName: string): string {
  return initialWorldRelicName(item, ownerName);
}

export function createWorldRelicRecord(
  id: string,
  item: EquipmentItem,
  ownerId: string,
  ownerName: string,
  day: number,
): WorldRelicRecord {
  assertWorldRelicEligible(item);
  item.worldRelicId = id;
  item.relicName = item.relicName ?? worldRelicName(item, ownerName);
  item.relicHistory ??= [];
  const origin = `День ${day}: ${ownerName} превратил предмет «${item.name}» в мировую реликвию.`;
  if (!item.relicHistory.includes(origin)) item.relicHistory.push(origin);
  const record: WorldRelicRecord = {
    id,
    item: {
      ...item,
      stats: { ...item.stats },
      relicHistory: [...item.relicHistory],
    },
    createdDay: day,
    status: "wielded",
    currentOwnerId: ownerId,
    currentOwnerName: ownerName,
    formerOwners: [ownerName],
    history: [origin],
  };
  return synchronizeWorldRelic(record, item, undefined, day);
}

export function normalizeWorldRelics(
  records: WorldRelicRecord[] | undefined,
): WorldRelicRecord[] {
  if (!Array.isArray(records)) return [];
  return deduplicateWorldRelicRecords(
    records.filter((record) => record && record.item && record.id),
  );
}
