import type { WorldPageId } from "../../../../app/routing/WorldPageCatalog";
import { PageHeading } from "../../../../shared/ui/common";
import {
  CareersPanel,
  FutureBossesPanel,
} from "../../components/CareersAndBosses/CareersAndBosses";
import { FighterActivityPanel } from "../../components/FighterActivity/FighterActivity";
import {
  EpochArchive,
  RelicsAndVeterans,
} from "../../components/RelicHistory/RelicHistory";
import {
  TerritoriesPanel,
  WorldSeasonPanel,
} from "../../components/WorldOverview/WorldOverview";

type ChronicleSection = Extract<
  WorldPageId,
  "chronicle" | "fighters" | "relics" | "history"
>;

const headings: Record<
  ChronicleSection,
  { eyebrow: string; title: string; copy: string }
> = {
  chronicle: {
    eyebrow: "ЖИВОЙ МИР",
    title: "Обзор мира",
    copy: "Текущий сезон и контроль фракций — правила, которые прямо сейчас меняют турниры, награды, данжи и лавку.",
  },
  fighters: {
    eyebrow: "СУДЬБЫ СОПЕРНИКОВ",
    title: "Бойцы и школы",
    copy: "Здесь видно, чем заняты соперники, кто стал наставником и какие школы, династии и будущие боссы влияют на карьеру героя.",
  },
  relics: {
    eyebrow: "ПАМЯТЬ МИРА",
    title: "Реликвии и ветераны",
    copy: "Мировые реликвии переходят между владельцами, а ветераны прошлых эпох продолжают собственную историю в новом мире.",
  },
  history: {
    eyebrow: "ЗАВЕРШЁННЫЕ ЭПОХИ",
    title: "Архив эпох",
    copy: "Итоги прежних героев, их титулы, соперники, законы мира и снаряжение собраны отдельно от событий текущей эпохи.",
  },
};

export function ChroniclePage({
  section = "chronicle",
}: {
  section?: ChronicleSection;
}) {
  const heading = headings[section];
  return (
    <>
      <PageHeading eyebrow={heading.eyebrow} title={heading.title}>
        <p>{heading.copy}</p>
      </PageHeading>
      <div
        className={`living-world-board chronicle-${section}`}
        id="living-world-board"
      >
        {section === "chronicle" ? (
          <>
            <WorldSeasonPanel />
            <TerritoriesPanel />
          </>
        ) : section === "fighters" ? (
          <>
            <FighterActivityPanel />
            <CareersPanel />
            <FutureBossesPanel />
          </>
        ) : section === "relics" ? (
          <RelicsAndVeterans />
        ) : (
          <EpochArchive />
        )}
      </div>
    </>
  );
}
