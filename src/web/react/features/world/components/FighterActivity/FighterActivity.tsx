import { useMemo, useState } from "react";
import { EQUIPMENT_SETS } from "../../../../../../catalogs/WorldCatalog";
import { useGame } from "../../../../app/state/GameContext";
import { Modal, PagedList, css } from "../../../../shared/ui/common";
import { factionFor } from "../../utils/chronicle";

export function FighterActivityPanel() {
  const { game, revision } = useGame();
  const [selectedId, setSelectedId] = useState<string>();
  const data = useMemo(
    () => ({
      fighters: game.save.enemies
        .filter((enemy) => enemy.alive && enemy.lastActivity)
        .sort(
          (a, b) =>
            (b.lastActivity?.day ?? 0) - (a.lastActivity?.day ?? 0) ||
            b.rating - a.rating,
        ),
      names: new Map([
        ["hero", game.save.hero.name],
        ...game.save.enemies.map(
          (enemy) => [enemy.id, enemy.name] as [string, string],
        ),
      ]),
      mentors: new Map(
        game.livingMentors().map((mentor) => [mentor.id, mentor]),
      ),
      dynasties: new Map(
        game.npcDynasties().map((dynasty) => [dynasty.id, dynasty]),
      ),
      sets: new Map(EQUIPMENT_SETS.map((set) => [set.id, set])),
    }),
    [game, revision],
  );
  const selected = data.fighters.find((fighter) => fighter.id === selectedId);
  return (
    <section className="living-world-section world-activities paper-panel">
      <p className="eyebrow">САМОСТОЯТЕЛЬНЫЕ РЕШЕНИЯ</p>
      <h2>Чем заняты бойцы</h2>
      <PagedList
        items={data.fighters}
        getKey={(fighter) => fighter.id}
        columns={2}
        className="living-world-list"
        empty="Первый самостоятельный день мира ещё не завершён."
        render={(fighter) => {
          const faction = factionFor(fighter.factionId),
            goal = game.npcGoal(fighter.goal),
            profile = game.npcLifeProfile(fighter.id),
            mentor = fighter.mentorId
              ? data.mentors.get(fighter.mentorId)
              : undefined;
          return (
            <article
              style={css({ "--faction-accent": faction?.accent ?? "#776e5f" })}
            >
              <div>
                <strong>
                  {fighter.name}
                  {profile?.nickname && ` · «${profile.nickname}»`}
                </strong>
                <small>
                  {faction?.name ?? "Независимый"} · {goal.name} · капитал{" "}
                  {fighter.gold ?? 0} ¤{mentor && ` · наставник ${mentor.name}`}
                </small>
              </div>
              <div className="living-world-story">
                <span>
                  {fighter.lastActivity?.description ?? "Продолжает путь."}
                </span>
                <button
                  type="button"
                  className="living-world-dossier-button"
                  onClick={() => setSelectedId(fighter.id)}
                >
                  Открыть досье
                </button>
              </div>
            </article>
          );
        }}
      />
      {selected &&
        (() => {
          const faction = factionFor(selected.factionId),
            goal = game.npcGoal(selected.goal),
            profile = game.npcLifeProfile(selected.id),
            mentor = selected.mentorId
              ? data.mentors.get(selected.mentorId)
              : undefined,
            dynasty = profile?.dynastyId
              ? data.dynasties.get(profile.dynastyId)
              : undefined,
            desiredSet = profile?.desiredSetId
              ? data.sets.get(profile.desiredSetId)
              : undefined,
            revenge = data.names.get(profile?.revengeTargetId ?? "");
          return (
            <Modal
              id="fighter-dossier-dialog"
              className="fighter-dossier-dialog"
              eyebrow="ДОСЬЕ СОПЕРНИКА"
              title={selected.name}
              onClose={() => setSelectedId(undefined)}
            >
              <div className="fighter-dossier-summary">
                <div>
                  <span>Текущая цель</span>
                  <strong>{goal.name}</strong>
                  <p>{goal.description}</p>
                </div>
                <div>
                  <span>Положение</span>
                  <strong>{faction?.name ?? "Независимый"}</strong>
                  <p>
                    Капитал {selected.gold ?? 0} ¤
                    {mentor ? ` · наставник ${mentor.name}` : ""}
                  </p>
                </div>
              </div>
              <section className="fighter-dossier-section">
                <h3>Планы и связи</h3>
                <div className="fighter-dossier-facts">
                  {desiredSet && <p>Ищет комплект «{desiredSet.name}».</p>}
                  {revenge && <p>Готовится взять реванш у {revenge}.</p>}
                  {dynasty && (
                    <p>
                      Продолжает школу «{dynasty.name}», престиж{" "}
                      {dynasty.prestige}.
                    </p>
                  )}
                  {Object.values(selected.relationships ?? {})
                    .sort((a, b) => b.intensity - a.intensity)
                    .slice(0, 3)
                    .map((relationship) => (
                      <p key={relationship.fighterId}>
                        {relationship.kind === "rival"
                          ? "Соперник"
                          : relationship.kind === "ally"
                            ? "Союзник"
                            : "Наставник"}
                        :{" "}
                        {data.names.get(relationship.fighterId) ??
                          "Боец прошлого"}
                      </p>
                    ))}
                  {!desiredSet &&
                    !revenge &&
                    !dynasty &&
                    !Object.keys(selected.relationships ?? {}).length && (
                      <p>Особых связей и долгосрочных планов пока нет.</p>
                    )}
                </div>
              </section>
              <section className="fighter-dossier-section">
                <h3>Последние события</h3>
                <div className="fighter-dossier-history">
                  {selected.history.length ? (
                    selected.history
                      .slice(-6)
                      .reverse()
                      .map((line, index) => <p key={index}>{line}</p>)
                  ) : (
                    <p>Личная история ещё не началась.</p>
                  )}
                </div>
              </section>
            </Modal>
          );
        })()}
    </section>
  );
}
