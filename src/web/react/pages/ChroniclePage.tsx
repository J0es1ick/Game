import { useLayoutEffect, useState } from "react";
import { useAppSelector, useGame } from "../state/GameContext";
import { PageHeading } from "../components/common";
import { WorldSeasonPanel, TerritoriesPanel } from "../chronicle/WorldOverview";
import { FighterActivityPanel } from "../chronicle/FighterActivity";
import { CareersPanel, FutureBossesPanel } from "../chronicle/CareersAndBosses";
import { RelicsAndVeterans, EpochArchive } from "../chronicle/RelicHistory";

export function ChroniclePage() {
  const navigation = useAppSelector((state) => state.navigation);
  const [archive, setArchive] = useState(
    navigation?.anchor === "epoch-history-view",
  );
  const { game } = useGame();
  useLayoutEffect(() => {
    if (navigation?.page === "chronicle" && navigation.anchor) {
      setArchive(navigation.anchor === "epoch-history-view");
    }
  }, [navigation]);
  return (
    <>
      <PageHeading eyebrow="ПАМЯТЬ ЖИВОГО МИРА" title="Летопись мира">
        <p>
          Сезоны, фракции, судьбы соперников и предметы, которые переживают
          своих владельцев.
        </p>
      </PageHeading>
      <div
        className="chronicle-tabs"
        role="tablist"
        aria-label="Разделы летописи"
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key))
            return;
          event.preventDefault();
          const next =
            event.key === "Home"
              ? false
              : event.key === "End"
                ? true
                : !archive;
          setArchive(next);
          event.currentTarget
            .querySelectorAll<HTMLButtonElement>("button")
            [next ? 1 : 0]?.focus();
        }}
      >
        <button
          className={`plain-button${archive ? "" : " active"}`}
          role="tab"
          aria-selected={!archive}
          aria-controls="current-chronicle-view"
          tabIndex={archive ? -1 : 0}
          onClick={() => setArchive(false)}
        >
          Текущий мир
        </button>
        <button
          className={`plain-button${archive ? " active" : ""}`}
          role="tab"
          aria-selected={archive}
          aria-controls="epoch-history-view"
          tabIndex={archive ? 0 : -1}
          onClick={() => setArchive(true)}
        >
          Архив эпох · {game.save.legacy.archives.length}
        </button>
      </div>
      {archive ? (
        <EpochArchive />
      ) : (
        <div id="current-chronicle-view">
          <div className="living-world-board" id="living-world-board">
            <WorldSeasonPanel />
            <TerritoriesPanel />
            <FighterActivityPanel />
            <CareersPanel />
            <FutureBossesPanel />
            <RelicsAndVeterans />
          </div>
        </div>
      )}
    </>
  );
}
