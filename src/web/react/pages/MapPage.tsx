import { ARENAS, DUNGEONS } from "../../../catalogs/WorldCatalog";
import { PageHeading } from "../components/common";
import { ActivityCard } from "../map/ActivityCard";
import { DuelSection } from "../map/DuelSection";
import { HeroSummaryCard, NextGoalCard } from "../map/MapOverview";
import { MapShortcuts } from "../map/MapShortcuts";
import { RouteSection } from "../map/RouteSection";
import { Training } from "../map/Training";
import { useMapStickyOffsets } from "../map/useMapStickyOffsets";
import { EndgameSection } from "./EndgameSection";
import "../map/map-react.css";

export function MapPage() {
  const { page, shortcuts } = useMapStickyOffsets();

  return (
    <div className="react-map-page" ref={page}>
      <PageHeading eyebrow="ВЫБОР СЛЕДУЮЩЕГО ПУТИ" title="Карта окрестностей">
        <p>
          Вы выбираете место и снаряжение. Герой сражается автоматически или по
          вашим командам.
        </p>
      </PageHeading>
      <MapShortcuts navigationRef={shortcuts} />
      <div className="map-layout">
        <HeroSummaryCard />
        <div className="route-board">
          <Training />
          <DuelSection />
          <RouteSection
            id="tournaments-section"
            number="01"
            title="Календарь турниров"
            copy="Запишитесь заранее и займите место в сетке минимум из восьми бойцов."
          >
            <div className="activity-route arena-route" id="arena-route">
              {ARENAS.map((arena, index) => (
                <ActivityCard key={arena.id} activity={arena} index={index} />
              ))}
            </div>
          </RouteSection>
          <RouteSection
            id="dungeons-section"
            number="02"
            title="Данжи"
            copy="Открываются уровнем, днями мира и продвижением по аренам."
            className="dungeons-section"
          >
            <div className="activity-route dungeon-route" id="dungeon-route">
              {DUNGEONS.map((dungeon, index) => (
                <ActivityCard
                  key={dungeon.id}
                  activity={dungeon}
                  index={index}
                />
              ))}
            </div>
          </RouteSection>
          <RouteSection
            id="endgame-section"
            number="03"
            title="После последней арены"
            copy="Лига короны и охота на легенд продолжают карьеру после финального чемпионства."
            className="endgame-section"
          >
            <EndgameSection />
          </RouteSection>
        </div>
        <NextGoalCard />
      </div>
    </div>
  );
}
