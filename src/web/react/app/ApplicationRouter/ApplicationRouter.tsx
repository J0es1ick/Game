import { Suspense, lazy, useEffect } from "react";
import {
  CreationScreen,
  ModeScreen,
  SaveRecovery,
} from "../../features/onboarding/ModeScreens/ModeScreens";
import { LoadingScreen } from "../LoadingScreen/LoadingScreen";
import { WorldShell } from "../WorldShell/WorldShell";
import { useAppSelector, useGameStore } from "../state/GameContext";

const BasicTournament = lazy(() =>
  import("../../features/basic/pages/BasicTournament/BasicTournament").then(
    (module) => ({
      default: module.BasicTournament,
    }),
  ),
);

export function ApplicationRouter({
  initialMode,
}: {
  initialMode?: "basic" | "world";
}) {
  const store = useGameStore();
  const mode = useAppSelector((state) => state.mode);
  const error = useAppSelector((state) => state.error);

  useEffect(() => {
    const timer = window.setTimeout(() => store.initialize(initialMode), 0);
    const saveOnLeave = () => store.flush();
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") store.flush();
    };
    window.addEventListener("pagehide", saveOnLeave);
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("pagehide", saveOnLeave);
      document.removeEventListener("visibilitychange", saveWhenHidden);
    };
  }, [store, initialMode]);

  if (mode === "choose") return <ModeScreen />;
  if (mode === "loading") return <LoadingScreen full />;
  if (mode === "creation") return <CreationScreen />;
  if (mode === "error")
    return <SaveRecovery error={error ?? "Неизвестная ошибка чтения."} />;
  if (mode === "basic")
    return (
      <Suspense fallback={<LoadingScreen full />}>
        <BasicTournament onExit={store.exitMode} />
      </Suspense>
    );
  return (
    <WorldShell
      key={`${store.game!.save.hero.createdAt}-${store.game!.save.legacy.cycle}`}
    />
  );
}
