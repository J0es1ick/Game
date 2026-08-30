import type { PendingBattle } from "../../../../gameplay/core/WorldTypes";
import type { WorldGame } from "../../../../gameplay/core/WorldGame";
import { useGame } from "./GameContext";

export function useBeginBattle() {
  const { act, openDialog } = useGame();
  return (action: (game: WorldGame) => PendingBattle) => {
    const pending = act(action, { deferFeatureUnlocks: true });
    if (pending) openDialog({ kind: "battle" });
  };
}
