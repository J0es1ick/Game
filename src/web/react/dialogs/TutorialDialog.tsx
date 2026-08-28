import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
import type { ContextualTutorialId } from "../../../gameplay/WorldTypes";
import {
  baseTutorialSteps,
  contextualTutorialSteps,
} from "../../TutorialCatalog";
import {
  isWorldPageAvailable,
  WORLD_PAGE_IDS,
  type WorldPageId,
} from "../../WorldPageCatalog";
import { useDialogActive } from "../components/common";
import { useAppState, useGame } from "../state/GameContext";
import { useTutorialTarget } from "./TutorialTarget";
import "./tutorial-react.css";

export function TutorialDialog({
  id = "base",
  firstVisit = false,
}: {
  id?: ContextualTutorialId | "base";
  firstVisit?: boolean;
}) {
  const { game, store, act, closeDialog } = useGame();
  const app = useAppState();
  const active = useDialogActive();
  const [origin] = useState(() => ({
    page: app.page,
    scroll: window.scrollY,
    url: window.location.href,
    focus: document.activeElement as HTMLElement | null,
  }));
  const [steps] = useState(() =>
    (id === "base" ? baseTutorialSteps : contextualTutorialSteps[id]).filter(
      (step) =>
        (!step.feature || game.isFeatureUnlocked(step.feature)) &&
        WORLD_PAGE_IDS.includes(step.page as WorldPageId) &&
        isWorldPageAvailable(step.page as WorldPageId, (feature) =>
          game.isFeatureUnlocked(feature),
        ),
    ),
  );
  const [index, setIndex] = useState(0);
  const [completedAction, setCompletedAction] = useState(false);
  const finished = useRef(false);
  const initialized = useRef(false);
  const panel = useRef<HTMLElement>(null);
  const step = steps[index];
  const markAction = useCallback(() => setCompletedAction(true), []);
  const spotlight = useTutorialTarget(
    step,
    app.page,
    active,
    panel,
    markAction,
  );

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    if (id === "base" && firstVisit && !game.save.tutorialCompleted)
      act((world) => {
        world.save.tutorialCompleted = true;
      });
    if (id !== "base" && !game.hasSeenTutorial(id))
      act((world) => world.markTutorialSeen(id));
  }, [act, game, id, firstVisit]);

  useEffect(() => {
    if (!active || !step) return;
    store.setPage(step.page as WorldPageId);
    window.history.replaceState(null, "", `#/${step.page}`);
  }, [active, index, step, store]);

  useEffect(() => {
    setCompletedAction(false);
  }, [index]);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    act((world) => {
      if (id === "base") world.save.tutorialCompleted = true;
      else world.markTutorialSeen(id);
    });
    flushSync(() => {
      store.setPage(
        isWorldPageAvailable(origin.page, (feature) =>
          game.isFeatureUnlocked(feature),
        )
          ? origin.page
          : "map",
      );
      closeDialog();
    });
    window.history.replaceState(null, "", origin.url);
    window.scrollTo({ top: origin.scroll, behavior: "auto" });
    if (origin.focus?.isConnected) origin.focus.focus({ preventScroll: true });
  }, [act, closeDialog, game, id, origin, store]);

  useEffect(() => {
    if (!active) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [active, finish]);

  if (!active) return null;
  return createPortal(
    <div id="tutorial-layer" className="tutorial-layer react-tutorial-layer">
      {spotlight && (
        <div
          id="tutorial-spotlight"
          className="tutorial-spotlight"
          style={spotlight}
          aria-hidden="true"
        />
      )}
      <section
        className="tutorial-dialog react-tutorial-dialog"
        ref={panel}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tutorial-title"
        aria-describedby="tutorial-copy"
      >
        <header>
          <span className="eyebrow">
            {id === "base" ? "ЗНАКОМСТВО С ИГРОЙ" : "НОВАЯ ВОЗМОЖНОСТЬ"}
          </span>
          <span id="tutorial-progress">
            {steps.length ? index + 1 : 0} / {steps.length}
          </span>
          <button
            className="plain-button tutorial-dismiss"
            type="button"
            aria-label="Завершить обучение"
            title="Завершить обучение"
            onClick={finish}
          >
            ×
          </button>
        </header>
        <div className="react-tutorial-content" key={`${id}-${index}`}>
          <h2 id="tutorial-title">{step?.title ?? "Пока всё изучено"}</h2>
          <p id="tutorial-copy">
            {step?.copy ??
              "Новые подсказки появятся, когда откроются следующие возможности."}
          </p>
          {step && (
            <div
              className={`tutorial-action${completedAction ? " completed" : ""}`}
            >
              <span aria-hidden="true">{completedAction ? "✓" : "→"}</span>
              <div>
                <small>
                  {completedAction
                    ? "ВЫ ПОПРОБОВАЛИ ЭТО ДЕЙСТВИЕ"
                    : "МОЖНО ПОПРОБОВАТЬ СЕЙЧАС"}
                </small>
                <strong id="tutorial-action-copy">{step.action}</strong>
              </div>
            </div>
          )}
          {step && app.page !== step.page && (
            <button
              className="plain-button tutorial-return"
              type="button"
              onClick={() => {
                store.setPage(step.page as WorldPageId);
                window.history.replaceState(null, "", `#/${step.page}`);
              }}
            >
              Показать нужный раздел
            </button>
          )}
          <p className="tutorial-optional">
            Игра остаётся доступна. Вы можете выполнить действие, перейти дальше
            или прекратить обучение.
          </p>
        </div>
        <footer>
          <button
            className="plain-button"
            id="tutorial-skip"
            type="button"
            onClick={finish}
          >
            Пропустить
          </button>
          <div>
            <button
              className="button"
              id="tutorial-back"
              type="button"
              disabled={index === 0}
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
            >
              Назад
            </button>
            <button
              className="button primary"
              id="tutorial-next"
              type="button"
              onClick={() =>
                index >= steps.length - 1
                  ? finish()
                  : setIndex((value) => value + 1)
              }
            >
              {index >= steps.length - 1
                ? id === "base"
                  ? "Начать игру"
                  : "Понятно"
                : "Далее"}
            </button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}
