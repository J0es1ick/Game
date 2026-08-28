import { ARENAS } from "../../../catalogs/WorldCatalog";
import {
  FACTIONS,
  FACTION_REPUTATION_TIERS,
  factionReputationTier,
} from "../../../catalogs/WorldExpansionCatalog";
import {
  FACTION_PERKS,
  unlockedFactionPerks,
} from "../../../gameplay/FactionSystem";
import { useGame } from "../state/GameContext";
import { StatRow, css } from "../components/common";

export function FactionCards() {
  const { game, act, queueLoot, notify } = useGame();
  const campaigns = new Map<
    string,
    ReturnType<typeof game.factionCampaigns>[number]
  >(game.factionCampaigns().map((entry) => [entry.factionId, entry]));
  const mentors = new Map<
    string,
    ReturnType<typeof game.factionMentors>[number]
  >(game.factionMentors().map((entry) => [entry.factionId, entry]));
  return (
    <div className="faction-grid" id="faction-grid">
      {FACTIONS.map((faction) => {
        const reputation = game.save.hero.factionReputation[faction.id] ?? 0;
        const tier = factionReputationTier(reputation),
          next = FACTION_REPUTATION_TIERS.find(
            (entry) => entry.threshold > reputation,
          );
        const perks = new Set(
          unlockedFactionPerks(faction.id, reputation).map((perk) => perk.name),
        );
        const arenas = ARENAS.filter(
          (arena) =>
            game.save.factionControl?.arenaControllers[arena.id] === faction.id,
        );
        const shop = game.save.factionControl?.shopControllerId === faction.id,
          campaign = campaigns.get(faction.id),
          mentor = mentors.get(faction.id);
        return (
          <article
            className="faction-card paper-panel"
            key={faction.id}
            style={css({ "--faction-accent": faction.accent })}
          >
            <p className="eyebrow">{tier.name.toUpperCase()}</p>
            <h3>{faction.name}</h3>
            <blockquote>«{faction.motto}»</blockquote>
            <p>{faction.description}</p>
            <p className="faction-control-summary">
              {arenas.length
                ? `Под контролем: ${arenas.map((arena) => arena.name).join(", ")}.`
                : "Сейчас не контролирует арен."}
              {shop && " Управляет поставками лавки."}
            </p>
            <StatRow
              label="Репутация"
              value={next ? `${reputation} / ${next.threshold}` : reputation}
              term="factionReputation"
            />
            <p className="faction-contract-benefit">
              {tier.contractRewardBonus > 0
                ? `Новые контракты: +${Math.round(tier.contractRewardBonus * 100)}% к монетам и опыту.`
                : `Следующий статус откроет +${Math.round((next?.contractRewardBonus ?? 0) * 100)}% к наградам новых контрактов.`}
            </p>
            <div className="faction-perk-list">
              <strong>Постоянные привилегии</strong>
              {FACTION_PERKS.filter(
                (perk) => perk.factionId === faction.id,
              ).map((perk) => (
                <div
                  className={`faction-perk ${perks.has(perk.name) ? "unlocked" : "locked"}`}
                  key={perk.name}
                >
                  <small>
                    {perks.has(perk.name)
                      ? "ДЕЙСТВУЕТ"
                      : `ОТ ${perk.threshold} РЕПУТАЦИИ`}
                  </small>
                  <b>{perk.name}</b>
                  <span>{perk.description}</span>
                </div>
              ))}
            </div>
            {campaign && (
              <section className="faction-campaign">
                <h4>
                  {campaign.current?.title ?? "Цепочка фракции завершена"}
                </h4>
                {campaign.current && (
                  <>
                    <p>{campaign.current.description}</p>
                    <p>
                      Прогресс: {campaign.progress} /{" "}
                      {campaign.current.required} · репутация от{" "}
                      {campaign.current.reputation}
                    </p>
                    <p>
                      Награда: {campaign.current.reward.gold} монет ·{" "}
                      {campaign.current.reward.seals} печатей ·{" "}
                      {campaign.current.reward.slots.length} предмета
                      фракционного комплекта
                      {campaign.current.reward.mentorAccess
                        ? " · доступ к наставнику"
                        : ""}
                    </p>
                    <button
                      className="plain-button"
                      disabled={!campaign.claimable}
                      onClick={() => {
                        const before = { ...game.save.hero.equipped };
                        const result = act((current) =>
                          current.claimFactionCampaign(faction.id),
                        );
                        if (result) queueLoot(result.items, before);
                      }}
                    >
                      {campaign.claimable
                        ? "Получить награду этапа"
                        : campaign.unlocked
                          ? "Выполните задание этапа"
                          : "Недостаточно репутации"}
                    </button>
                  </>
                )}
                {mentor && (
                  <>
                    <strong>{mentor.name}</strong>
                    <p>{mentor.description}</p>
                    <button
                      className="plain-button"
                      onClick={() => {
                        const result = act((current) =>
                          current.trainWithFactionMentor(faction.id),
                        );
                        if (result)
                          notify({
                            eyebrow: "НАСТАВНИК",
                            title: result.title,
                            description: `Получено ${result.experience} опыта.`,
                            symbol: "⚔",
                            tone: "positive",
                            sound: "training",
                            replaceKey: "mentor-training",
                          });
                      }}
                    >
                      Заниматься с наставником · +20% опыта
                    </button>
                  </>
                )}
              </section>
            )}
          </article>
        );
      })}
    </div>
  );
}
