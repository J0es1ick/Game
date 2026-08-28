import { useCallback, useEffect, useRef, useState } from "react";
import { TOURNAMENT_RULES } from "../../../catalogs/WorldExpansionCatalog";
import type { BattleAction } from "../../../gameplay/AdvancedBattle";
import type {
  ExpeditionStepReport,
  TournamentReport,
} from "../../../gameplay/WorldTypes";
import { gameAudio } from "../../GameAudio";
import { useGame } from "../state/GameContext";
import {
  LazyDetails,
  Modal,
  PagedList,
  useDialogActive,
} from "../components/common";
import {
  BattlePlayback,
  battleTurnDetail,
  battleTurnLogLine,
} from "./BattlePlayback";
import {
  BattleAnalysis,
  BattleSkillList,
  CombatantCard,
  FeatureChanges,
  TournamentBracket,
} from "./BattleParts";
import { ExpeditionRewards } from "./ExpeditionRewards";
import "./battle-react.css";

export function BattleDialog() {
  const active = useDialogActive();
  const {
    game,
    act,
    checkpoint,
    notify,
    openDialog,
    closeDialog,
    queueLoot,
    navigate,
    store,
  } = useGame();
  const [playback] = useState(() => new BattlePlayback(game));
  const [tick, setTick] = useState(0);
  const [speed, setSpeed] = useState(450);
  const [manual, setManual] = useState(game.save.hero.combatMode === "manual");
  const [skipping, setSkipping] = useState(false);
  const [showRewards, setShowRewards] = useState(false);
  const alive = useRef(true);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const announced = useRef(new Set<string>());
  const report = playback.report;
  const snapshot = playback.snapshot;
  const completion = playback.completion;
  const result = completion?.result;
  const tournament =
    result && "matches" in result ? (result as TournamentReport) : undefined;
  const expedition =
    result && "completed" in result
      ? (result as ExpeditionStepReport)
      : undefined;
  const turn = playback.turn;
  const heroTurn = snapshot.nextActorId === "hero";
  const actions =
    !completion && heroTurn ? playback.session.availableActions() : [];

  useEffect(() => {
    alive.current = true;
    document.body.classList.add("battle-open");
    return () => {
      alive.current = false;
      controller.current?.abort();
      document.body.classList.remove("battle-open");
    };
  }, []);

  useEffect(() => {
    gameAudio.battleStart(
      report.activity.kind === "dungeon" || report.activity.kind === "boss",
    );
  }, [playback.id]);

  const finalize = useCallback(() => {
    if (playback.completion) return;
    const finalized = act(() => playback.finalize());
    if (!finalized) return;
    if (!announced.current.has(playback.id)) {
      announced.current.add(playback.id);
      const completedTournament =
        finalized.result && "matches" in finalized.result
          ? finalized.result
          : undefined;
      const title = completedTournament
        ? completedTournament.heroWon
          ? "Вы — чемпион турнира"
          : `Турнир завершён · место ${completedTournament.heroPlacement}`
        : finalized.battle.heroWon
          ? "Победа"
          : "Поражение";
      gameAudio.battleResult(finalized.battle.heroWon);
      notify({
        eyebrow: finalized.battle.activity.name,
        variant: finalized.battle.heroWon ? "victory" : "defeat",
        title,
        description: `${finalized.battle.enemyBefore.name} ${finalized.battle.heroWon ? "побеждён" : "оказался сильнее"}.`,
        symbol: finalized.battle.heroWon ? "♛" : "×",
        tone: finalized.battle.heroWon ? "positive" : "negative",
        duration: 2200,
      });
      playback.featureChanges.forEach((change) => {
        if (change.kind === "Адаптация") store.queueTutorial("adaptation");
        notify({
          eyebrow: `${change.fighterName} · ${change.kind}`,
          title: change.name,
          description: change.description,
          stats: Object.entries(change.stats)
            .filter(([, value]) => Boolean(value))
            .map(
              ([stat, value]) =>
                `${Number(value) > 0 ? "+" : ""}${value} ${({ health: "HP", attack: "ATK", defense: "DEF", speed: "SPD", crit: "CRIT" } as Record<string, string>)[stat] ?? stat}`,
            ),
          symbol:
            change.kind === "Травма" ? "✕" : change.kind === "Шрам" ? "⌁" : "✦",
          tone:
            change.kind === "Травма" || change.kind === "Адаптация"
              ? "negative"
              : "positive",
          duration: 2500,
        });
      });
    }
    setTick((value) => value + 1);
  }, [act, notify, playback, store]);

  const step = useCallback(
    (action?: BattleAction) => {
      if (busy.current || playback.finished || playback.completion) return;
      try {
        const next = playback.step(action);
        if (!next) return;
        gameAudio.battleTurn(
          next,
          next.actorId === "hero"
            ? playback.report.heroBefore.classId
            : playback.report.enemyBefore.classId,
        );
        if (playback.finished) finalize();
        else checkpoint();
        setTick((value) => value + 1);
      } catch (error) {
        store.fail(error);
      }
    },
    [playback, finalize, checkpoint, store],
  );

  useEffect(() => {
    if (!active || completion || skipping) return;
    if (playback.finished) {
      finalize();
      return;
    }
    if (manual && heroTurn) return;
    const timer = window.setTimeout(() => step(), speed);
    return () => window.clearTimeout(timer);
  }, [
    active,
    tick,
    completion,
    skipping,
    manual,
    heroTurn,
    speed,
    playback,
    finalize,
    step,
  ]);

  const skip = async () => {
    if (busy.current || playback.completion) return;
    busy.current = true;
    setSkipping(true);
    const abort = new AbortController();
    controller.current = abort;
    try {
      let turns = 0;
      while (!playback.finished && turns < 4000 && !abort.signal.aborted) {
        for (
          let batch = 0;
          batch < 24 && !playback.finished && turns < 4000;
          batch += 1
        ) {
          playback.step();
          turns += 1;
        }
        if (playback.finished) break;
        setTick((value) => value + 1);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
      if (abort.signal.aborted) return;
      if (!playback.finished)
        throw new Error("Бой не завершился в допустимое число ходов.");
      finalize();
    } catch (error) {
      store.fail(error);
    } finally {
      busy.current = false;
      if (alive.current) {
        setSkipping(false);
        setTick((value) => value + 1);
      }
    }
  };

  const finish = () => {
    if (!completion) return;
    if (playback.awaitingNextRound) {
      playback.nextRound();
      setTick((value) => value + 1);
      return;
    }
    if (expedition && (expedition.completed || expedition.retreated)) {
      setShowRewards(true);
      return;
    }
    const loot = playback.takeLoot();
    closeDialog();
    if (game.save.activeExpedition) openDialog({ kind: "dungeon" });
    else navigate("map");
    if (loot) queueLoot(loot.items, loot.equipmentBefore);
  };

  if (showRewards && expedition)
    return (
      <ExpeditionRewards
        result={expedition}
        items={playback.acquiredLoot().items}
        onClose={() => {
          const loot = playback.takeLoot();
          closeDialog();
          navigate("map");
          if (loot) queueLoot(loot.items, loot.equipmentBefore);
        }}
      />
    );

  const rewards = tournament?.rewards ?? report.rewards;
  const rules = TOURNAMENT_RULES.filter((rule) =>
    report.ruleIds?.includes(rule.id),
  );
  const nameForId = (id?: string) =>
    !id
      ? "—"
      : id === "hero"
        ? game.save.hero.name
        : (game.save.enemies.find((enemy) => enemy.id === id)?.name ??
          (id === snapshot.enemy.id
            ? snapshot.enemy.name
            : "Участник турнира"));
  const title = tournament
    ? tournament.heroWon
      ? "Вы — чемпион турнира"
      : `Турнир завершён · место ${tournament.heroPlacement}`
    : report.heroWon
      ? "Победа"
      : "Поражение";
  return (
    <Modal
      id="battle-overlay"
      className="react-battle-dialog"
      dismissible={false}
      title={report.activity.name}
      eyebrow={report.activity.place.toUpperCase()}
      onClose={finish}
      footer={
        completion ? (
          <button
            className="button primary"
            id="close-battle"
            type="button"
            onClick={finish}
          >
            {playback.awaitingNextRound
              ? "Следующий бой"
              : expedition?.completed || expedition?.retreated
                ? "Посмотреть итоги похода"
                : game.save.activeExpedition
                  ? "Продолжить поход"
                  : "Вернуться на карту"}
          </button>
        ) : undefined
      }
    >
      <TournamentBracket
        pending={!tournament ? playback.tournament : undefined}
        completed={tournament}
        nameForId={nameForId}
      />
      <div className="battle-stage">
        <CombatantCard side="hero" fighter={snapshot.hero} turn={turn} />
        <div
          className="battle-action"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span>ХОД {turn?.turn ?? 0}</span>
          <b>
            {completion
              ? title
              : manual && heroTurn
                ? "Ваш ход — выберите доступный приём"
                : turn
                  ? `${turn.actorName}: ${turn.action}`
                  : "Бойцы выходят на площадку"}
          </b>
          <p>
            {skipping
              ? "Рассчитываем оставшиеся ходы…"
              : turn
                ? battleTurnDetail(turn)
                : ""}
          </p>
        </div>
        <CombatantCard side="enemy" fighter={snapshot.enemy} turn={turn} />
      </div>
      <div className="battle-skills" id="battle-skills">
        <BattleSkillList
          side="hero"
          fighter={snapshot.hero}
          actions={actions}
          turn={turn}
          active={manual && heroTurn && !completion && !skipping}
          onUse={
            manual
              ? (id) =>
                  step(
                    id === "basic"
                      ? { type: "basic" }
                      : { type: "skill", skillId: id },
                  )
              : undefined
          }
        />
        <BattleSkillList
          side="enemy"
          fighter={snapshot.enemy}
          actions={[]}
          turn={turn}
          active={false}
        />
      </div>
      <LazyDetails
        className="react-battle-log-details"
        summary={`Журнал боя · ${snapshot.turns.length} действий`}
      >
        {() => (
          <PagedList
            items={[...snapshot.turns].reverse()}
            className="battle-log"
            pageSize={100}
            getKey={(entry) => `${entry.turn}-${entry.actorId}`}
            render={(entry) => (
              <p className={entry.critical ? "critical" : ""}>
                {battleTurnLogLine(entry)}
              </p>
            )}
          />
        )}
      </LazyDetails>
      {rules.length > 0 && (
        <div className="battle-rules">
          {rules.map((rule) => (
            <span key={rule.id}>
              <b>{rule.name}</b> {rule.description}
            </span>
          ))}
        </div>
      )}
      {!completion && (
        <div className="battle-controls">
          <label data-term="battleSpeed">
            Скорость боя
            <select
              id="battle-speed"
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
            >
              <option value={900}>Медленно</option>
              <option value={450}>Обычно</option>
              <option value={160}>Быстро</option>
            </select>
          </label>
          <button
            className="plain-button"
            type="button"
            aria-pressed={manual}
            disabled={skipping}
            onClick={() => setManual((value) => !value)}
          >
            {manual ? "Включить автобой" : "Управлять вручную"}
          </button>
          <button
            className="plain-button"
            id="skip-battle"
            type="button"
            disabled={skipping}
            onClick={() => void skip()}
          >
            {skipping ? "Расчёт…" : "Пропустить бой"}
          </button>
        </div>
      )}
      {completion && (
        <section className="battle-result" id="battle-result">
          <div>
            <h3>{title}</h3>
            {playback.awaitingNextRound ? (
              <p>
                Раунд пройден. Следующий соперник уже определён турнирной
                сеткой.
              </p>
            ) : (
              <p>
                Опыт: +{rewards.experience} · Монеты: +{rewards.gold}
                {rewards.temperingMarks
                  ? ` · Печати закалки: +${rewards.temperingMarks}`
                  : ""}
                {rewards.levelsGained
                  ? ` · Получено уровней: ${rewards.levelsGained}`
                  : ""}
              </p>
            )}
            {rewards.item && <p>Добыча: {rewards.item.name}</p>}
            {rewards.unlockedSkills.length > 0 && (
              <p>
                Открыты навыки:{" "}
                {rewards.unlockedSkills.map((skill) => skill.name).join(", ")}
              </p>
            )}
            {report.enemyDied && (
              <p>Противник погиб и больше не появится в живом мире.</p>
            )}
            {tournament && <p>Чемпион: {tournament.championName}</p>}
            <BattleAnalysis report={report} />
            <FeatureChanges changes={playback.featureChanges} />
          </div>
        </section>
      )}
    </Modal>
  );
}
