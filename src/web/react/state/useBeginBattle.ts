import type { PendingBattle } from "../../../gameplay/WorldTypes";
import type { WorldGame } from "../../../gameplay/WorldGame";
import { useGame } from "./GameContext";

export function useBeginBattle() {
  const { act, openDialog } = useGame();
  return (action: (game: WorldGame) => PendingBattle) => {
    const pending = act(action, { deferFeatureUnlocks: true });
    if (pending) openDialog({ kind: "battle" });
  };
}
