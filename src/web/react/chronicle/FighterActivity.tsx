import { useMemo } from "react";
import { EQUIPMENT_SETS } from "../../../catalogs/WorldCatalog";
import { useGame } from "../state/GameContext";
import { LazyDetails, PagedList, css } from "../components/common";
import { factionFor } from "./shared";

export function FighterActivityPanel() {
  const { game, revision } = useGame();
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
  return (
    <section className="living-world-section world-activities paper-panel">
      <p className="eyebrow">САМОСТОЯТЕЛЬНЫЕ РЕШЕНИЯ</p>
      <h2>Чем заняты бойцы</h2>
      <PagedList
        items={data.fighters}
        getKey={(fighter) => fighter.id}
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
                <LazyDetails
                  className="living-world-detail"
                  summary="Цель, связи и недавняя история"
                >
                  {() => {
                    const dynasty = profile?.dynastyId
                        ? data.dynasties.get(profile.dynastyId)
                        : undefined,
                      desiredSet = profile?.desiredSetId
                        ? data.sets.get(profile.desiredSetId)
                        : undefined,
                      revenge = data.names.get(profile?.revengeTargetId ?? "");
                    return (
                      <div>
                        <p>{goal.description}</p>
                        {desiredSet && (
                          <p>Ищет комплект «{desiredSet.name}».</p>
                        )}
                        {revenge && <p>Готовится взять реванш у {revenge}.</p>}
                        {dynasty && (
                          <p>
                            Продолжает школу «{dynasty.name}», престиж{" "}
                            {dynasty.prestige}.
                          </p>
                        )}
                        {Object.values(fighter.relationships ?? {})
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
                        {fighter.history
                          .slice(-3)
                          .reverse()
                          .map((line, index) => (
                            <p
                              className="living-world-history-line"
                              key={index}
                            >
                              {line}
                            </p>
                          ))}
                      </div>
                    );
                  }}
                </LazyDetails>
              </div>
            </article>
          );
        }}
      />
    </section>
  );
}
