import {
  Component,
  Suspense,
  lazy,
  memo,
  useEffect,
  type ReactNode,
} from "react";
import { GameStore } from "./state/GameStore";
import { useAppSelector, useGame, useGameStore } from "./state/GameContext";
import {
  WORLD_PAGE_IDS,
  isWorldPageAvailable,
  type WorldPageId,
} from "../WorldPageCatalog";
import { pageFromHash } from "../UiRuntime";
import { DialogVisibility } from "./components/common";
import { Header } from "./components/Header";
import {
  CreationScreen,
  ModeScreen,
  SaveRecovery,
} from "./components/ModeScreens";
import { GlossaryProvider } from "./components/GlossaryProvider";
import {
  NotificationDeck,
  TournamentReminder,
} from "./components/Notifications";
import { NarrativeDialog, SeasonDialog } from "./dialogs/WorldDialogs";

const MapPage = lazy(() =>
  import("./pages/MapPage").then((module) => ({ default: module.MapPage })),
);
const HeroPage = lazy(() =>
  import("./equipment/HeroPage").then((module) => ({
    default: module.HeroPage,
  })),
);
const InventoryPage = lazy(() =>
  import("./equipment/InventoryPage").then((module) => ({
    default: module.InventoryPage,
  })),
);
const ForgePage = lazy(() =>
  import("./equipment/ForgePage").then((module) => ({
    default: module.ForgePage,
  })),
);
const LegacyPage = lazy(() =>
  import("./equipment/LegacyPage").then((module) => ({
    default: module.LegacyPage,
  })),
);
const SkillsPage = lazy(() =>
  import("./equipment/SkillsPage").then((module) => ({
    default: module.SkillsPage,
  })),
);
const CollectionsPage = lazy(() =>
  import("./equipment/CollectionsPage").then((module) => ({
    default: module.CollectionsPage,
  })),
);
const ShopPage = lazy(() =>
  import("./equipment/ShopPage").then((module) => ({
    default: module.ShopPage,
  })),
);
const ContractsPage = lazy(() =>
  import("./pages/ContractsPage").then((module) => ({
    default: module.ContractsPage,
  })),
);
const ChroniclePage = lazy(() =>
  import("./pages/ChroniclePage").then((module) => ({
    default: module.ChroniclePage,
  })),
);
const RankingsPage = lazy(() =>
  import("./pages/RankingsPage").then((module) => ({
    default: module.RankingsPage,
  })),
);
const BattleDialog = lazy(() =>
  import("./battle/BattleDialog").then((module) => ({
    default: module.BattleDialog,
  })),
);
const DungeonDialog = lazy(() =>
  import("./battle/DungeonDialog").then((module) => ({
    default: module.DungeonDialog,
  })),
);
const LootNotifications = lazy(() =>
  import("./battle/LootNotifications").then((module) => ({
    default: module.LootNotifications,
  })),
);
const EquipmentPickerDialog = lazy(() =>
  import("./equipment/EquipmentDialogs").then((module) => ({
    default: module.EquipmentPickerDialog,
  })),
);
const EquipmentComparisonDialog = lazy(() =>
  import("./equipment/EquipmentDialogs").then((module) => ({
    default: module.EquipmentComparisonDialog,
  })),
);
const NewChronicleDialog = lazy(() =>
  import("./dialogs/NewChronicleDialog").then((module) => ({
    default: module.NewChronicleDialog,
  })),
);
const TutorialDialog = lazy(() =>
  import("./dialogs/TutorialDialog").then((module) => ({
    default: module.TutorialDialog,
  })),
);
const BasicTournament = lazy(() =>
  import("./basic/BasicTournament").then((module) => ({
    default: module.BasicTournament,
  })),
);

function Loading({ full = false }: { full?: boolean }) {
  return (
    <div
      className={full ? "react-loading-screen" : "react-loading-page"}
      role="status"
    >
      <span className="loading-mark" aria-hidden="true">
        ✦
      </span>
      <p>Открываем летопись…</p>
    </div>
  );
}

const PageRoute = memo(function PageRoute({ page }: { page: WorldPageId }) {
  const equipment =
    page === "hero" ? (
      <HeroPage />
    ) : page === "arsenal" ? (
      <InventoryPage />
    ) : page === "forge" ? (
      <ForgePage />
    ) : page === "legacy" ? (
      <LegacyPage />
    ) : page === "skills" ? (
      <SkillsPage />
    ) : page === "collections" ? (
      <CollectionsPage />
    ) : page === "shop" ? (
      <ShopPage />
    ) : null;
  return (
    <>
      {equipment ?? (
        <section className="page active" id={`page-${page}`}>
          {page === "map" ? (
            <MapPage />
          ) : page === "contracts" ? (
            <ContractsPage />
          ) : page === "chronicle" ? (
            <ChroniclePage />
          ) : (
            <RankingsPage elite={page === "elite"} />
          )}
        </section>
      )}
      <NavigationScroll page={page} />
    </>
  );
});

function NavigationScroll({ page }: { page: WorldPageId }) {
  const store = useGameStore();
  const navigation = useAppSelector((state) => state.navigation);
  useEffect(() => {
    if (!navigation || navigation.page !== page) return;
    const frame = requestAnimationFrame(() => {
      if (navigation.anchor) {
        const target = document.getElementById(
          navigation.anchor.replace(/^#/, ""),
        );
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else window.scrollTo({ top: 0, behavior: "instant" });
      store.completeNavigation(navigation.id);
    });
    return () => cancelAnimationFrame(frame);
  }, [page, navigation, store]);
  return null;
}

function Dialogs() {
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

function WorldShell() {
  const { game, revision, store } = useGame();
  const page = useAppSelector((state) => state.page);
  const dialogs = useAppSelector((state) => state.dialogs);
  const worldNotice = useAppSelector((state) => state.worldNotice);
  useEffect(() => {
    const fromLocation = () =>
      store.setPage(pageFromHash(location.hash, WORLD_PAGE_IDS, "map"));
    window.addEventListener("hashchange", fromLocation);
    window.addEventListener("popstate", fromLocation);
    return () => {
      window.removeEventListener("hashchange", fromLocation);
      window.removeEventListener("popstate", fromLocation);
    };
  }, [store]);
  useEffect(() => {
    if (
      !isWorldPageAvailable(page, (feature) => game.isFeatureUnlocked(feature))
    )
      store.setPage("map");
  }, [page, game, revision, store]);
  useEffect(() => {
    if (dialogs.length) return;
    const timer = window.setTimeout(() => {
      if (game.pendingNarrativeEvent()) store.openDialog({ kind: "narrative" });
      else store.presentNextTutorial();
    }, 500);
    return () => window.clearTimeout(timer);
  }, [game, revision, dialogs.length, store]);
  return (
    <>
      <Header />
      <main className="game-shell">
        <div className="react-world-notice" hidden={!worldNotice}>
          {worldNotice}
        </div>
        <Suspense fallback={<Loading />}>
          <PageRoute page={page} />
        </Suspense>
      </main>
      <Dialogs />
      <Suspense fallback={null}>
        <LootNotifications />
      </Suspense>
      <TournamentReminder />
      <NotificationDeck />
      <GlossaryProvider />
    </>
  );
}

export class AppErrorBoundary extends Component<
  { children: ReactNode; store: GameStore },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  private generation = this.props.store.getGeneration();
  private unsubscribe?: () => void;
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidMount() {
    const recover = () => {
      const generation = this.props.store.getGeneration();
      if (generation === this.generation) return;
      this.generation = generation;
      if (this.state.error) this.setState({ error: null });
    };
    const unsubscribeGame = this.props.store.subscribe(recover);
    const unsubscribeApp = this.props.store.subscribeApp(recover);
    this.unsubscribe = () => {
      unsubscribeGame();
      unsubscribeApp();
    };
  }
  componentWillUnmount() {
    this.unsubscribe?.();
  }
  render() {
    if (this.state.error)
      return (
        <SaveRecovery
          error={`Не удалось открыть интерфейс: ${this.state.error.message}. Сохранение остаётся на месте.`}
        />
      );
    return this.props.children;
  }
}

export function App() {
  const store = useGameStore();
  const mode = useAppSelector((state) => state.mode);
  const error = useAppSelector((state) => state.error);
  useEffect(() => {
    const timer = window.setTimeout(() => store.initialize(), 0);
    const saveOnLeave = () => store.flush();
    window.addEventListener("pagehide", saveOnLeave);
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") store.flush();
    };
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", saveOnLeave);
      document.removeEventListener("visibilitychange", saveWhenHidden);
    };
  }, [store]);
  if (mode === "choose") return <ModeScreen />;
  if (mode === "loading") return <Loading full />;
  if (mode === "creation") return <CreationScreen />;
  if (mode === "error")
    return <SaveRecovery error={error ?? "Неизвестная ошибка чтения."} />;
  if (mode === "basic")
    return (
      <Suspense fallback={<Loading full />}>
        <BasicTournament onExit={store.exitMode} />
      </Suspense>
    );
  return (
    <WorldShell
      key={`${store.game!.save.hero.createdAt}-${store.game!.save.legacy.cycle}`}
    />
  );
}
