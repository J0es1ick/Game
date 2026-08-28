import { useMemo } from "react";
import { CLASS_DEFINITIONS } from "../../../catalogs/WorldCatalog";
import { useGame } from "../state/GameContext";
import { useBeginBattle } from "../state/useBeginBattle";
import { PagedList, css } from "../components/common";
import { factionFor } from "./shared";

export function CareersPanel() {
  const { game, revision } = useGame();
  const mentors = useMemo(() => game.livingMentors(), [game, revision]);
  const dynasties = useMemo(() => game.npcDynasties(), [game, revision]);
  return (
    <section className="living-world-section world-careers paper-panel">
      <p className="eyebrow">КАРЬЕРЫ И НАСЛЕДИЕ</p>
      <h2>Школы и династии</h2>
      <div className="world-career-columns">
        <section className="living-world-subsection">
          <h3>Наставники · {mentors.length}</h3>
          <PagedList
            items={mentors}
            getKey={(mentor) => mentor.id}
            className="living-world-list mentor-list"
            empty="Никто из известных бойцов пока не завершил карьеру наставником."
            render={(mentor) => (
              <article
                style={css({
                  "--faction-accent":
                    factionFor(mentor.factionId)?.accent ?? "#776e5f",
                })}
              >
                <div>
                  <strong>{mentor.name}</strong>
                  <small>
                    {CLASS_DEFINITIONS[mentor.classId].name} ·{" "}
                    {mentor.role === "shop-owner"
                      ? "владелец лавки"
                      : mentor.role === "faction-founder"
                        ? "основатель школы-фракции"
                        : "наставник"}{" "}
                    · учеников: {mentor.studentIds.length}
                  </small>
                </div>
                <span>{mentor.legacy}</span>
              </article>
            )}
          />
        </section>
        <section className="living-world-subsection">
          <h3>Школы и династии · {dynasties.length}</h3>
          <PagedList
            items={dynasties}
            getKey={(dynasty) => dynasty.id}
            className="world-dynasty-list"
            empty="Первая династия появится, когда ветеран соберёт учеников."
            render={(dynasty) => (
              <article
                style={css({
                  "--faction-accent":
                    factionFor(dynasty.factionId)?.accent ?? "#776e5f",
                })}
              >
                <strong>{dynasty.name}</strong>
                <span>Основатель: {dynasty.founderName}</span>
                <small>
                  {factionFor(dynasty.factionId)?.name ?? "Независимые"} ·
                  бойцов: {dynasty.memberIds.length} · престиж{" "}
                  {dynasty.prestige}
                </small>
              </article>
            )}
          />
        </section>
      </div>
    </section>
  );
}

export function FutureBossesPanel() {
  const { game, revision } = useGame();
  const begin = useBeginBattle();
  const bosses = useMemo(
    () =>
      [...(game.save.npcLife?.futureBosses ?? [])].sort(
        (a, b) =>
          Number(b.status === "available") - Number(a.status === "available") ||
          b.powerLevel - a.powerLevel,
      ),
    [game, revision],
  );
  const hunter = game.factionHunter(),
    availability = game.factionHunterAvailability();
  const labels: Record<string, string> = {
    nemesis: "Немезида",
    "fallen-legend": "Павшая легенда",
    "relic-bearer": "Носитель реликвии",
    "dynasty-heir": "Наследник династии",
  };
  return (
    <section className="living-world-section future-bosses paper-panel">
      <p className="eyebrow">ИСТОРИИ, КОТОРЫЕ ЕЩЁ НЕ ЗАКОНЧЕНЫ</p>
      <h2>Будущие боссы</h2>
      {hunter && (
        <article
          className="faction-hunter"
          style={css({
            "--faction-accent":
              factionFor(hunter.factionId)?.accent ?? "#914c43",
          })}
        >
          <small>ОХОТНИК ВРАЖДЕБНОЙ ФРАКЦИИ</small>
          <strong>{hunter.name}</strong>
          <span>
            {factionFor(hunter.factionId)?.name ?? "Неизвестная фракция"} ·
            уровень {hunter.level}
          </span>
          <p>{availability.reason}</p>
          <button
            className="plain-button future-boss-action"
            disabled={!availability.unlocked}
            onClick={() =>
              begin((current) => current.beginFactionHunterFight())
            }
          >
            Принять бой
          </button>
        </article>
      )}
      <PagedList
        className="future-boss-list"
        items={bosses}
        getKey={(boss) => boss.id}
        empty="Некоторые соперники вернутся в новой роли после нескольких сезонов, громкой вражды или утраты легендарного статуса."
        render={(boss) => {
          const available = game.futureBossAvailability(boss.id);
          return (
            <article className={boss.status}>
              <small>
                {boss.status === "available"
                  ? "МОЖЕТ ПОЯВИТЬСЯ"
                  : boss.status === "defeated"
                    ? "ИСТОРИЯ ЗАВЕРШЕНА"
                    : `НЕ РАНЬШЕ ДНЯ ${boss.earliestAppearanceDay}`}
              </small>
              <strong>{boss.name}</strong>
              <span>
                {labels[boss.archetype] ?? "Особый противник"} · сила{" "}
                {boss.powerLevel}
              </span>
              <p>{boss.reason}</p>
              <button
                className="plain-button future-boss-action"
                title={available.reason}
                disabled={!available.unlocked}
                onClick={() =>
                  begin((current) => current.beginFutureBossFight(boss.id))
                }
              >
                {available.unlocked
                  ? "Встретиться с противником"
                  : boss.status === "defeated"
                    ? "Побеждён"
                    : "След ещё не проявился"}
              </button>
            </article>
          );
        }}
      />
    </section>
  );
}
