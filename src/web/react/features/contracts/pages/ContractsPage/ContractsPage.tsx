import {
  FACTIONS,
  FACTION_REPUTATION_TIERS,
} from "../../../../../../catalogs/WorldExpansionCatalog";
import { useGame } from "../../../../app/state/GameContext";
import { PageHeading, Hint, css } from "../../../../shared/ui/common";
import { FactionCards } from "../../components/FactionCards/FactionCards";
import { ControlBoard } from "../../components/ControlBoard/ControlBoard";

export function ContractsPage() {
  const { game, act, notify } = useGame();
  const active = game.save.activeContract;
  const accept = (id: string, approach: "honor" | "profit") => {
    const contract = act((current) => current.acceptContract(id, approach));
    if (contract)
      notify({
        eyebrow: approach === "honor" ? "КЛЯТВА ЧЕСТИ" : "УСЛОВИЯ СДЕЛКИ",
        title: contract.title,
        description:
          approach === "honor"
            ? "Репутация фракции важнее быстрой прибыли."
            : "Награда монетами важнее признания фракции.",
        symbol: "§",
        tone: "neutral",
        sound: "reputation",
      });
  };
  return (
    <>
      <PageHeading eyebrow="ПОРУЧЕНИЯ И РЕПУТАЦИЯ" title="Фракции и контракты">
        <p>
          Выполняйте дополнительные цели во время обычных занятий и открывайте
          привилегии фракций.
        </p>
      </PageHeading>
      <section className="active-contract paper-panel" id="active-contract">
        {active ? (
          <>
            <div>
              <p className="eyebrow">ДЕЙСТВУЮЩИЙ КОНТРАКТ</p>
              <h2>{active.title}</h2>
              <p>{active.description}</p>
              <div className="contract-progress">
                <i
                  style={{
                    width: `${(active.progress / active.target) * 100}%`,
                  }}
                />
              </div>
              <strong>
                {active.progress} / {active.target} ·{" "}
                {
                  FACTIONS.find((faction) => faction.id === active.factionId)
                    ?.name
                }{" "}
                · до дня {active.expiresDay}
              </strong>
            </div>
            <button
              className="plain-button"
              onClick={() => {
                if (
                  window.confirm("Отказ снизит репутацию фракции. Продолжить?")
                )
                  act((current) => current.abandonContract());
              }}
            >
              Отказаться от контракта
            </button>
          </>
        ) : (
          <div>
            <p className="eyebrow">СВОБОДНЫЙ КОНТРАКТНЫЙ СЛОТ</p>
            <h2>Выберите поручение</h2>
            <p>
              Задача выполняется вместе с привычными активностями — отдельный
              режим запускать не потребуется.
            </p>
          </div>
        )}
      </section>
      <section className="reputation-guide paper-panel" id="reputation-guide">
        <div className="reputation-guide-copy">
          <p className="eyebrow">ЗАЧЕМ НУЖНА РЕПУТАЦИЯ</p>
          <h2>Доверие улучшает новые поручения</h2>
          <p>
            У каждой фракции свой счёт доверия. Статус повышает монеты и опыт в
            новых контрактах и открывает постоянные привилегии. Отказ от
            принятого поручения отнимает 2 репутации.
          </p>
        </div>
        <div className="reputation-tier-list">
          {FACTION_REPUTATION_TIERS.map((tier) => (
            <article
              key={tier.threshold}
              className={tier.threshold === 0 ? "base" : ""}
            >
              <small>
                {tier.threshold === 0
                  ? "С НАЧАЛА"
                  : `ОТ ${tier.threshold} РЕПУТАЦИИ`}
              </small>
              <strong>{tier.name}</strong>
              <span>
                {tier.contractRewardBonus > 0
                  ? `+${Math.round(tier.contractRewardBonus * 100)}% к монетам и опыту`
                  : "Базовые награды"}
              </span>
            </article>
          ))}
        </div>
      </section>
      <FactionCards />
      <header className="section-heading">
        <p className="eyebrow">ДОСТУПНЫЕ ПОРУЧЕНИЯ</p>
        <h2>Доска контрактов</h2>
      </header>
      <div className="contract-grid" id="contract-grid">
        {game.save.contractOffers.map((offer) => {
          const faction = FACTIONS.find(
            (entry) => entry.id === offer.factionId,
          )!;
          return (
            <article
              className="contract-card paper-panel"
              key={offer.id}
              style={css({ "--faction-accent": faction.accent })}
            >
              <small>
                {faction.name.toUpperCase()} · ДО ДНЯ {offer.expiresDay}
              </small>
              <h3>{offer.title}</h3>
              <p>{offer.description}</p>
              <div className="contract-rewards">
                Награда: {offer.rewardGold} ¤ · {offer.rewardExperience} опыта ·{" "}
                {offer.rewardReputation} репутации
              </div>
              <div className="contract-actions">
                <Hint
                  title="Репутация прежде монет"
                  description={`Репутация +50%: ${offer.rewardGold} ¤ · ${offer.rewardExperience} опыта · ${Math.round(offer.rewardReputation * 1.5)} репутации.`}
                >
                  <button
                    className="button"
                    disabled={Boolean(active)}
                    onClick={() => accept(offer.id, "honor")}
                  >
                    Принять ради чести
                  </button>
                </Hint>
                <Hint
                  title="Монеты прежде признания"
                  description={`Монеты +35%: ${Math.round(offer.rewardGold * 1.35)} ¤ · ${offer.rewardExperience} опыта · ${offer.rewardReputation} репутации.`}
                >
                  <button
                    className="button"
                    disabled={Boolean(active)}
                    onClick={() => accept(offer.id, "profit")}
                  >
                    Принять ради выгоды
                  </button>
                </Hint>
              </div>
            </article>
          );
        })}
      </div>
      <ControlBoard />
    </>
  );
}
