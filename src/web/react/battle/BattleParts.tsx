import { useEffect, useState } from "react";
import type {
  BattleActionOption,
  BattleRuntimeSnapshot,
} from "../../../gameplay/AdvancedBattle";
import { CLASS_DEFINITIONS } from "../../../catalogs/WorldCatalog";
import { skillById } from "../../../gameplay/WorldGame";
import type {
  BattleReport,
  BattleTurn,
  FighterFeatureChange,
  PendingTournamentState,
  TournamentReport,
} from "../../../gameplay/WorldTypes";

export function CombatantCard({
  side,
  fighter,
  turn,
}: {
  side: "hero" | "enemy";
  fighter: BattleRuntimeSnapshot;
  turn?: BattleTurn;
}) {
  const [motion, setMotion] = useState("");
  useEffect(() => {
    if (!turn) return;
    setMotion(
      turn.actorId === fighter.id
        ? "acting"
        : turn.targetId === fighter.id && turn.damage > 0
          ? "hit"
          : "",
    );
    const timer = window.setTimeout(() => setMotion(""), 160);
    return () => window.clearTimeout(timer);
  }, [fighter.id, turn]);
  const health = Math.max(0, Math.ceil(fighter.health));
  return (
    <article
      className={`combatant ${side}-combatant ${motion}`}
      id={`battle-${side}`}
    >
      <span className="combatant-role">
        {side === "hero" ? "ВАШ ГЕРОЙ" : "ПРОТИВНИК"}
      </span>
      <h3 title={fighter.name}>{fighter.name}</h3>
      <p>
        {CLASS_DEFINITIONS[fighter.classId].name} · уровень {fighter.level}
        {fighter.originalLevel ? ` (снижен с ${fighter.originalLevel})` : ""}
      </p>
      <div
        className="battle-health"
        role="progressbar"
        aria-label={`Здоровье: ${fighter.name}`}
        aria-valuemin={0}
        aria-valuemax={fighter.maxHealth}
        aria-valuenow={health}
      >
        <i
          style={{
            width: `${Math.min(100, (health / fighter.maxHealth) * 100)}%`,
          }}
        />
      </div>
      <strong>
        {health} / {fighter.maxHealth} HP
      </strong>
      <div className="battle-runtime">
        <span title="Классовый ресурс накапливается в бою и срабатывает при заполнении шкалы.">
          {fighter.resource.name}: {fighter.resource.current}/
          {fighter.resource.maximum}
        </span>
        <span
          title={
            fighter.statuses
              .map((status) => `${status.name}: ${status.description}`)
              .join("\n") || "Временных состояний нет."
          }
        >
          {fighter.statuses.length
            ? fighter.statuses
                .map(
                  (status) =>
                    `${status.name}${status.stacks > 1 ? ` ×${status.stacks}` : ""} · ${status.duration} х.`,
                )
                .join(" · ")
            : "Состояния: нет"}
        </span>
      </div>
      {fighter.equipmentResonance && (
        <p
          className="battle-equipment-resonance"
          title={fighter.equipmentResonance.description}
        >
          {fighter.equipmentResonance.setName} · резонанс{" "}
          {fighter.equipmentResonance.stage}
        </p>
      )}
    </article>
  );
}

export function BattleSkillList({
  side,
  fighter,
  actions,
  active,
  turn,
  onUse,
}: {
  side: "hero" | "enemy";
  fighter: BattleRuntimeSnapshot;
  actions: BattleActionOption[];
  active: boolean;
  turn?: BattleTurn;
  onUse?: (id: string) => void;
}) {
  const options = new Map(actions.map((action) => [action.id, action]));
  return (
    <div data-fighter={side}>
      <strong>{side === "hero" ? "Навыки героя" : "Навыки противника"}</strong>
      <div>
        {["basic", ...fighter.skills].map((id) => {
          const skill = skillById(id);
          const option = options.get(id);
          const remaining = option?.cooldown ?? fighter.cooldowns[id] ?? 0;
          const label = id === "basic" ? "Обычная атака" : (skill?.name ?? id);
          const used =
            turn?.actorId === fighter.id && (turn.skillId ?? "basic") === id;
          const available = active && (option?.available ?? remaining === 0);
          const title = [
            skill?.description ?? "Обычная атака без перезарядки.",
            skill ? `Перезарядка: ${skill.cooldown} х.` : "",
            option?.reason ?? "",
          ]
            .filter(Boolean)
            .join(" ");
          return onUse ? (
            <button
              key={id}
              type="button"
              data-skill-id={id}
              className={`battle-skill ${skill?.kind ?? "basic"}${used ? " used" : ""}${available ? " ready" : ""}`}
              disabled={!available}
              title={title}
              onClick={() => onUse(id)}
            >
              {label}
              {remaining > 0 ? ` · ${remaining} х.` : ""}
            </button>
          ) : (
            <span
              key={id}
              data-skill-id={id}
              className={`battle-skill ${skill?.kind ?? "basic"}${used ? " used" : ""}`}
              title={title}
            >
              {label}
              {remaining > 0 ? ` · ${remaining} х.` : ""}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function TournamentBracket({
  pending,
  completed,
  nameForId,
}: {
  pending?: PendingTournamentState;
  completed?: TournamentReport;
  nameForId: (id: string | undefined) => string;
}) {
  if (!pending && !completed) return null;
  const participants =
    completed?.participantCount ?? pending!.participantIds.length;
  const resolvedMatches = pending?.matches.map((match) => ({
      ...match,
      firstName: nameForId(match.firstId),
      secondName: match.bye ? "Свободный проход" : nameForId(match.secondId),
      winnerName: nameForId(match.winnerId),
      pending: false,
      live: false,
    })) ?? [];
  const matches = completed?.matches ?? (pending
    ? [
        ...resolvedMatches.filter((match) => match.round < pending.round),
        ...pending.pairs.map(([firstId, secondId], index) => {
          const resolved = resolvedMatches.find((match) => match.round === pending.round && match.match === index + 1);
          return resolved ?? {
            round: pending.round,
            match: index + 1,
            firstName: nameForId(firstId),
            secondName: secondId ? nameForId(secondId) : "Свободный проход",
            winnerName: "",
            heroInvolved: firstId === "hero" || secondId === "hero",
            bye: !secondId,
            pending: true,
            live: index === pending.pairIndex,
          };
        }),
      ]
    : []);
  const completedCount = completed?.matches.length ?? resolvedMatches.filter((match) => !match.bye).length;
  return (
    <section
      className="tournament-panel"
      id="tournament-panel"
      aria-label="Турнирная сетка"
    >
      <header>
        <span>
          {participants} УЧАСТНИКОВ · {completedCount} ЗАВЕРШЕНО
        </span>
        <strong>
          {completed
            ? `МЕСТО ГЕРОЯ: ${completed.heroPlacement}`
            : `РАУНД ${pending!.round} · БОЙ ГЕРОЯ ${pending!.heroBattles.length + 1}`}
        </strong>
      </header>
      <div
        className="bracket-strip"
        tabIndex={0}
        aria-label="Результаты матчей"
      >
        {matches.map((match) => (
          <article
            key={`${match.round}-${match.match}`}
            className={`${match.heroInvolved ? "hero-match" : ""}${"live" in match && match.live ? " live-match" : ""}${"pending" in match && match.pending ? " pending-match" : ""}`}
          >
            <small>
              РАУНД {match.round} · БОЙ {match.match}
            </small>
            <span>
              {match.firstName} × {match.secondName}
            </span>
            <strong>
              {"live" in match && match.live
                ? "Идёт сейчас"
                : "pending" in match && match.pending
                  ? match.bye ? `→ ${match.firstName}` : "Схватка этого раунда"
                  : `→ ${match.winnerName}`}
            </strong>
          </article>
        ))}
      </div>
    </section>
  );
}

export function BattleAnalysis({ report }: { report: BattleReport }) {
  const analysis = report.analysis;
  if (!analysis) return null;
  return (
    <details className="battle-analysis">
      <summary>
        Разбор боя · {analysis.duration} х. · {analysis.actionCount} действий
      </summary>
      {analysis.decidingEffect && (
        <p className="battle-analysis-summary">
          Решающий фактор: {analysis.decidingEffect}
        </p>
      )}
      <div className="battle-analysis-fighters">
        {analysis.fighters.map((fighter) => (
          <article key={fighter.fighterId}>
            <strong>{fighter.fighterName}</strong>
            <span>
              {fighter.totalDamage} урона · {fighter.totalHealing} лечения ·
              критов: {fighter.criticalHits}
            </span>
            <p>
              Чаще всего:{" "}
              {skillById(fighter.mostUsedSkillId ?? "")?.name ??
                "обычная атака"}
              {fighter.decisiveSkillId
                ? ` · решающий приём: ${skillById(fighter.decisiveSkillId)?.name ?? fighter.decisiveSkillId}`
                : ""}
              .
            </p>
            {(fighter.statusComboIds.length > 0 ||
              fighter.resourceTriggers.length > 0) && (
              <small>
                {[
                  fighter.statusComboIds.length
                    ? `Комбинации: ${fighter.statusComboIds.join(", ")}`
                    : "",
                  fighter.resourceTriggers.length
                    ? `Ресурс: ${fighter.resourceTriggers.join(", ")}`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </small>
            )}
          </article>
        ))}
      </div>
      {analysis.highlights.length > 0 && (
        <ul className="battle-analysis-highlights">
          {analysis.highlights.map((highlight, index) => (
            <li key={index}>{highlight}</li>
          ))}
        </ul>
      )}
      {analysis.adaptationReason && (
        <p className="battle-analysis-adaptation">
          {analysis.adaptationReason}
        </p>
      )}
    </details>
  );
}

const statLabels: Record<string, string> = {
  health: "HP",
  attack: "ATK",
  defense: "DEF",
  speed: "SPD",
  crit: "CRIT",
};

export function FeatureChanges({
  changes,
}: {
  changes: FighterFeatureChange[];
}) {
  if (!changes.length) return null;
  return (
    <section className="battle-feature-changes">
      <h4>
        {changes.length === 1 ? "Бой оставил след" : "Бой изменил участников"}
      </h4>
      <div>
        {changes.map((change, index) => (
          <article
            key={`${change.fighterName}-${change.name}-${index}`}
            className={`battle-feature-change${change.kind === "Травма" || change.kind === "Адаптация" ? " negative" : ""}${change.kind === "Адаптация" ? " adaptation" : ""}`}
          >
            <small>
              {change.fighterName} · {change.kind}
            </small>
            <strong>{change.name}</strong>
            <p>{change.description}</p>
            <div className="battle-feature-stats">
              {Object.entries(change.stats)
                .filter(([, value]) => Boolean(value))
                .map(([stat, value]) => (
                  <span
                    key={stat}
                    className={Number(value) > 0 ? "positive" : "negative"}
                  >
                    {Number(value) > 0 ? "+" : ""}
                    {value} {statLabels[stat]}
                  </span>
                ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
