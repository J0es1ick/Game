import { encodeWorldSaveStorage } from "./WorldSaveCodec";
import {
  normalizeSerializedWorldSave,
  type WorldSaveIdentity,
} from "./WorldSaveStorage";
import type { GameSave } from "../core/WorldTypes";

export interface WorldSavePreparationRequest {
  id: number;
  save: GameSave;
}

export type WorldSavePreparationResponse =
  | {
      id: number;
      serialized: string;
      pendingBattleId?: string;
      identity: WorldSaveIdentity;
    }
  | { id: number; error: string };

export function createWorldSavePreparer(): (
  request: WorldSavePreparationRequest,
) => WorldSavePreparationResponse {
  let previousInput: string | undefined;
  let previousOutput: string | undefined;
  return (request) => {
    try {
      const input = JSON.stringify(request.save);
      if (input !== previousInput || previousOutput === undefined) {
        const serialized = encodeWorldSaveStorage(
          normalizeSerializedWorldSave(input),
        );
        previousInput = input;
        previousOutput = serialized;
      }
      return {
        id: request.id,
        serialized: previousOutput,
        pendingBattleId: request.save.pendingBattle?.id,
        identity: {
          heroId: request.save.hero.id,
          worldDay: request.save.worldDay,
          cycle: request.save.legacy.cycle,
        },
      };
    } catch (error) {
      return {
        id: request.id,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
}
