import { CLASS_DEFINITIONS } from "../../../catalogs/WorldCatalog";
import type { EndgameActivityDefinition } from "../../../gameplay/WorldTypes";
import { css } from "../components/common";
import { useGame } from "../state/GameContext";
import { useBeginBattle } from "../state/useBeginBattle";

function AutomaticDefenseOption() {
  const { game, act } = useGame();
  const rank = game.heroEliteRank();
  if (!rank || rank > 5) return null;

  return (
    <>
      <label className="tactic-toggle elite-auto-defense">
        <input
          type="checkbox"
          checked={game.save.hero.autoResolveLegendChallenges}
          onChange={(event) =>
            act((current) =>
              current.setAutoResolveLegendChallenges(event.target.checked),
            )
          }
        />
        Автоматически рассчитывать защиту титула
      </label>
      <small className="auto-defense-note">
        Если начать другое занятие в день вызова, бой пройдёт в фоне до смены
        дня.
      </small>
    </>
  );
}

export function EndgameActivityCard({
  activity,
}: {
  activity: EndgameActivityDefinition;
}) {
  const { game, act, notify } = useGame();
  const begin = useBeginBattle();
  const availability = game.availability(activity);
  const crown = activity.id === "crown-league";
  const registeredDay = crown ? game.registeredCrownLeagueDay() : undefined;
  const registration = crown
    ? game.crownLeagueRegistrationAvailability()
    : undefined;
  const canAct = availability.unlocked || Boolean(registration?.unlocked);
  const rank = game.heroEliteRank();
  const hero = game.save.hero;
  const label = !crown
    ? availability.unlocked
      ? "Бросить следующий вызов"
      : "Закрыто"
    : availability.unlocked
      ? "Начать турнир на 30 бойцов"
      : registeredDay && registeredDay > game.save.worldDay
        ? `Записан на день ${registeredDay}`
        : registration?.unlocked
          ? `Записаться на день ${game.nextCrownLeagueDay()}`
          : "Закрыто";
  const rules = crown
    ? game.tournamentRules(
        "crown-league",
        registeredDay ?? game.nextCrownLeagueDay(),
      )
    : [];

  const start = () => {
    if (crown && !availability.unlocked) {
      const day = act((current) => current.registerCrownLeague());
      if (day !== undefined)
        notify({
          eyebrow: "ЭЛИТНЫЙ ОТБОР",
          title: `Лига короны · день ${day}`,
          description: `Лига проходит каждые ${game.crownLeagueInterval()} дн. Место в сетке закреплено за героем.`,
          symbol: "♛",
          tone: "legendary",
          sound: "reputation",
        });
      return;
    }
    begin((current) =>
      crown ? current.beginCrownLeague() : current.beginLegendHunt(),
    );
  };

  return (
    <article
      className={`activity-card endgame${canAct || registeredDay ? "" : " locked"}${registeredDay ? " registered" : ""}`}
      style={css({ "--activity-accent": activity.accent })}
      data-activity-id={activity.id}
    >
      <div className="activity-head">
        {crown
          ? game.crownLeagueTier().name.toUpperCase()
          : "ПОСЛЕДОВАТЕЛЬНЫЙ ВЫЗОВ"}
      </div>
      <h3>{activity.name}</h3>
      <p>{activity.description}</p>
      <div className="activity-levels">
        {crown
          ? `${rank ? `место #${rank}` : "квалификация"} · ${hero.crownLeagueWins} побед в лиге`
          : `${hero.legendHuntWins} побед в охоте · ${hero.legendDefenses} защит титула`}
      </div>
      <div className="activity-state">{availability.reason}</div>
      {rules.length > 0 && (
        <div
          className="activity-rules"
          title={rules
            .map((rule) => `${rule.name}: ${rule.description}`)
            .join("\n")}
        >
          {rules.map((rule) => rule.name).join(" · ")}
        </div>
      )}
      {!crown && <AutomaticDefenseOption />}
      <button
        type="button"
        className="button activity-button"
        disabled={!canAct}
        onClick={start}
      >
        {label}
      </button>
    </article>
  );
}

export function LegendDefenseCard() {
  const { game } = useGame();
  const begin = useBeginBattle();
  const challenger = game.pendingLegendChallenge();
  if (!challenger) return null;

  return (
    <article
      className="activity-card endgame elite-defense"
      style={css({ "--activity-accent": "#9c5044" })}
    >
      <div className="activity-head">ВЫЗОВ ВАШЕМУ ТИТУЛУ</div>
      <h3>{challenger.name}</h3>
      <p>
        Боец элиты пытается занять ваше место. При поражении вы поменяетесь
        позициями.
      </p>
      <div className="activity-levels">
        {CLASS_DEFINITIONS[challenger.classId].name} · уровень{" "}
        {challenger.level}
      </div>
      <div className="activity-state">
        {game.save.hero.autoResolveLegendChallenges
          ? "При выборе другого занятия защита будет рассчитана автоматически до смены дня."
          : "Смена дня заблокирована до защиты титула или включения авторасчёта."}
      </div>
      <button
        type="button"
        className="button activity-button"
        onClick={() => begin((current) => current.beginLegendDefense(true))}
      >
        Защитить титул
      </button>
    </article>
  );
}
