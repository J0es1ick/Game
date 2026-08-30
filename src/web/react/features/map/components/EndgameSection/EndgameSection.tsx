import { ENDGAME_ACTIVITIES } from "../../../../../../catalogs/WorldCatalog";
import { CrownSeasonOverview } from "../CrownSeasonOverview/CrownSeasonOverview";
import {
  EndgameActivityCard,
  LegendDefenseCard,
} from "../EliteChallenges/EliteChallenges";
import { NewChronicleStatus } from "../NewChronicleStatus/NewChronicleStatus";
import { RankingsTable } from "../../../rankings/pages/RankingsPage/RankingsPage";

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
      <NewChronicleStatus />
      <section className="elite-board" id="elite-board">
        <header>
          <div>
            <p className="eyebrow">ЗАКРЫТАЯ ЛИГА</p>
            <h3>Тридцать бойцов элиты</h3>
          </div>
          <p>
            Первые пять носят титулы легенд. Места меняются в Лиге короны и
            последовательных личных вызовах.
          </p>
        </header>
        <RankingsTable elite />
      </section>
    </>
  );
}
