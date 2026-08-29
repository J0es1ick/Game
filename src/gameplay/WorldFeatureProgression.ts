import { ARENAS } from "../catalogs/WorldCatalog";
import {
  ActivityAvailability,
  GameSave,
  WorldFeatureId,
  WorldFeatureUnlock,
} from "./WorldTypes";

export const CONTRACTS_UNLOCK_ARENA_INDEX = 0;
export const EQUIPMENT_LEGACY_UNLOCK_ARENA_INDEX = Math.min(3, ARENAS.length - 1);

interface WorldFeatureDefinition {
  id: WorldFeatureId;
  title: string;
  description: string;
  tutorialId: WorldFeatureUnlock["tutorialId"];
  arenaIndex: number;
}

export const WORLD_FEATURE_DEFINITIONS: Readonly<Record<WorldFeatureId, WorldFeatureDefinition>> = {
  contracts: {
    id: "contracts",
    title: "Открыта доска контрактов",
    description: "После первого чемпионства фракции готовы доверять герою поручения с особыми наградами и репутацией.",
    tutorialId: "contracts",
    arenaIndex: CONTRACTS_UNLOCK_ARENA_INDEX,
  },
  "equipment-legacy": {
    id: "equipment-legacy",
    title: "Открыто наследие снаряжения",
    description: "Легендарные и мифические вещи теперь запоминают значимые победы, растут вместе с героем и могут стать мировыми реликвиями высшей редкости.",
    tutorialId: "equipment-legacy",
    arenaIndex: EQUIPMENT_LEGACY_UNLOCK_ARENA_INDEX,
  },
};

export const WORLD_FEATURE_IDS = Object.keys(WORLD_FEATURE_DEFINITIONS) as WorldFeatureId[];

export function hasReachedWorldFeatureMilestone(save: GameSave, id: WorldFeatureId): boolean {
  const arenaIndex = WORLD_FEATURE_DEFINITIONS[id].arenaIndex;
  return (save.hero.arenaWins[arenaIndex] ?? 0) >= 1;
}

export function worldFeatureAvailability(save: GameSave, id: WorldFeatureId): ActivityAvailability {
  if (save.unlockedFeatureIds.includes(id) || hasReachedWorldFeatureMilestone(save, id)) {
    return { unlocked: true, reason: WORLD_FEATURE_DEFINITIONS[id].description };
  }
  const arena = ARENAS[WORLD_FEATURE_DEFINITIONS[id].arenaIndex];
  return {
    unlocked: false,
    reason: id === "contracts"
      ? `Станьте чемпионом турнира «${arena.name}», чтобы фракции начали предлагать контракты.`
      : `Станьте чемпионом турнира «${arena.name}», чтобы легендарное снаряжение начало сохранять историю побед.`,
  };
}

export function createWorldFeatureUnlock(save: GameSave, id: WorldFeatureId): WorldFeatureUnlock {
  const definition = WORLD_FEATURE_DEFINITIONS[id];
  return {
    id,
    day: save.worldDay,
    title: definition.title,
    description: definition.description,
    tutorialId: definition.tutorialId,
  };
}
