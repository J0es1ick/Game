import { ENDGAME_ACTIVITIES } from "../../../../../../catalogs/WorldCatalog";
import { CrownSeasonOverview } from "../CrownSeasonOverview/CrownSeasonOverview";
import {
  EndgameActivityCard,
  LegendDefenseCard,
} from "../EliteChallenges/EliteChallenges";
import { useGame } from "../../../../app/state/GameContext";
import { useBeginBattle } from "../../../../app/state/useBeginBattle";

function LegacyChampionActions() {
  const { game, navigate } = useGame();
  const begin = useBeginBattle();
  const archiveCount = game.save.legacy.archives.length;
  if (!archiveCount) return null;
  const legacy = game.legacyChampionAvailability();

  return (
    <section className="endgame-legacy-actions paper-panel">
      <div>
        <p className="eyebrow">ГЕРОИ ПРОШЛЫХ ЭПОХ</p>
        <h3>След прежних летописей</h3>
        <p>
          Архив хранит завершённые судьбы, а достойного чемпиона прошлого можно
          снова встретить в бою.
        </p>
      </div>
      <div>
        <button
          type="button"
          className="button"
          onClick={() => navigate("history", "epoch-history-view")}
        >
          Архив эпох · {archiveCount}
        </button>
        <button
          type="button"
          className="button primary"
          disabled={!legacy.unlocked}
          title={legacy.reason}
          onClick={() => begin((current) => current.beginLegacyChampion())}
        >
          {legacy.unlocked ? "Вызвать героя прошлого" : "Вызов пока закрыт"}
        </button>
      </div>
    </section>
  );
}

export function EndgameSection() {
  return (
    <>
      <div className="activity-route endgame-route" id="endgame-route">
        <CrownSeasonOverview />
        {ENDGAME_ACTIVITIES.map((activity) => (
          <EndgameActivityCard key={activity.id} activity={activity} />
        ))}
        <LegendDefenseCard />
      </div>
      <LegacyChampionActions />
    </>
  );
}
