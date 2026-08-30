import { Suspense, lazy, useEffect } from "react";
import { GlossaryProvider } from "../GlossaryProvider/GlossaryProvider";
import { Header } from "../Header/Header";
import { LoadingScreen } from "../LoadingScreen/LoadingScreen";
import {
  NotificationDeck,
  TournamentReminder,
} from "../Notifications/Notifications";
import { DialogStack } from "../dialogs/DialogStack";
import { PageRouter } from "../routing/PageRouter";
import {
  WORLD_PAGE_IDS,
  isWorldPageAvailable,
} from "../routing/WorldPageCatalog";
import { pageFromHash } from "../routing/UiRuntime";
import { useAppSelector, useGame } from "../state/GameContext";

const LootNotifications = lazy(() =>
  import("../../features/battle/components/LootNotifications/LootNotifications").then(
    (module) => ({
      default: module.LootNotifications,
    }),
  ),
);

export function WorldShell() {
  const { game, revision, store } = useGame();
  const page = useAppSelector((state) => state.page);
  const dialogs = useAppSelector((state) => state.dialogs);

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
        <Suspense fallback={<LoadingScreen />}>
          <PageRouter page={page} />
        </Suspense>
      </main>
      <DialogStack />
      <Suspense fallback={null}>
        <LootNotifications />
      </Suspense>
      <TournamentReminder />
      <NotificationDeck />
      <GlossaryProvider />
    </>
  );
}
