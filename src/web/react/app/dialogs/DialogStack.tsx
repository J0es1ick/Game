import { Suspense, lazy } from "react";
import {
  NarrativeDialog,
  SeasonDialog,
} from "../../features/world/WorldDialogs/WorldDialogs";
import { DialogVisibility } from "../../shared/ui/common";
import { useAppSelector } from "../state/GameContext";

const BattleDialog = lazy(() =>
  import("../../features/battle/dialogs/BattleDialog/BattleDialog").then(
    (module) => ({
      default: module.BattleDialog,
    }),
  ),
);
const DungeonDialog = lazy(() =>
  import("../../features/battle/dialogs/DungeonDialog/DungeonDialog").then(
    (module) => ({
      default: module.DungeonDialog,
    }),
  ),
);
const EquipmentPickerDialog = lazy(() =>
  import("../../features/equipment/components/EquipmentDialogs/EquipmentDialogs").then(
    (module) => ({
      default: module.EquipmentPickerDialog,
    }),
  ),
);
const EquipmentComparisonDialog = lazy(() =>
  import("../../features/equipment/components/EquipmentDialogs/EquipmentDialogs").then(
    (module) => ({
      default: module.EquipmentComparisonDialog,
    }),
  ),
);
const NewChronicleDialog = lazy(() =>
  import("../../features/progression/NewChronicleDialog/NewChronicleDialog").then(
    (module) => ({ default: module.NewChronicleDialog }),
  ),
);
const TutorialDialog = lazy(() =>
  import("../../features/onboarding/TutorialDialog/TutorialDialog").then(
    (module) => ({ default: module.TutorialDialog }),
  ),
);

export function DialogStack() {
  const dialogs = useAppSelector((state) => state.dialogs);
  return (
    <>
      {dialogs.map((dialog, index) => (
        <DialogVisibility.Provider
          value={index === dialogs.length - 1}
          key={dialog.kind}
        >
          <Suspense fallback={null}>
            {dialog.kind === "battle" ? (
              <BattleDialog />
            ) : dialog.kind === "dungeon" ? (
              <DungeonDialog />
            ) : dialog.kind === "equipment" ? (
              <EquipmentPickerDialog slot={dialog.slot} />
            ) : dialog.kind === "comparison" ? (
              <EquipmentComparisonDialog
                itemId={dialog.itemId}
                shopIndex={dialog.shopIndex}
              />
            ) : dialog.kind === "new-chronicle" ? (
              <NewChronicleDialog />
            ) : dialog.kind === "tutorial" ? (
              <TutorialDialog id={dialog.id} firstVisit={dialog.firstVisit} />
            ) : dialog.kind === "season" ? (
              <SeasonDialog notice={dialog.notice} />
            ) : (
              <NarrativeDialog />
            )}
          </Suspense>
        </DialogVisibility.Provider>
      ))}
    </>
  );
}
