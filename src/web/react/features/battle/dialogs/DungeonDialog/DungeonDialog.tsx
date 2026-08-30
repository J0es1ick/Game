import { useState } from "react";
import { DUNGEONS } from "../../../../../../catalogs/WorldCatalog";
import {
  visibleDungeonNodes,
  type DungeonRouteNode,
} from "../../../../../../gameplay/dungeons/DungeonRoute";
import { normalizeExpeditionStamina } from "../../../../../../gameplay/dungeons/ExpeditionStamina";
import type { WorldGame } from "../../../../../../gameplay/core/WorldGame";
import type {
  EquipmentItem,
  EquipmentSet,
  ExpeditionStepReport,
  PendingBattle,
} from "../../../../../../gameplay/core/WorldTypes";
import { Modal, StatRow } from "../../../../shared/ui/common";
import { useGame } from "../../../../app/state/GameContext";
import { ExpeditionRewards } from "../../components/ExpeditionRewards/ExpeditionRewards";
import "../../styles/components.css";

const nodeLabels: Record<DungeonRouteNode["kind"], string> = {
  battle: "Бой",
  elite: "Элита",
  cache: "Тайник",
  camp: "Лагерь",
  shrine: "Святилище",
  trap: "Ловушка",
  merchant: "Торговец",
  rival: "Соперник с арены",
  boss: "Хранитель",
  "alternate-boss": "Тайный владыка",
};

function outcomeLabel(node: DungeonRouteNode): string {
  if (node.kind === "camp") return "Восстановление и передышка";
  if (node.kind === "merchant") return "Торговля и лечение";
  if (node.kind === "trap") return "Риск потерять силы и найти тайный след";
  if (node.kind === "shrine") return "Клятва с наградой и ценой";
  return node.rewardMultiplier > 0
    ? `Награда ×${node.rewardMultiplier}`
    : "Развилка маршрута";
}

function RouteMap({ onAdvance }: { onAdvance: (id: string) => void }) {
  const { game } = useGame();
  const expedition = game.save.activeExpedition!;
  const route = game.expeditionRoute();
  if (!route) return null;
  const nodes = visibleDungeonNodes(
    route,
    game.dungeonDiscovery(expedition.dungeonId),
  );
  const depths = [...new Set(nodes.map((node) => node.depth))].sort(
    (a, b) => a - b,
  );
  const visited = new Set(expedition.visitedNodeIds ?? []);
  const reachable = new Set(
    game.reachableExpeditionNodes().map((node) => node.id),
  );
  return (
    <div
      className="expedition-route-map"
      aria-label="Маршрут экспедиции"
      tabIndex={0}
    >
      {depths.map((depth) => (
        <section className="expedition-route-column" key={depth}>
          <small>
            {depth === depths[depths.length - 1]
              ? "ФИНАЛ"
              : `ГЛУБИНА ${depth + 1}`}
          </small>
          {nodes
            .filter((node) => node.depth === depth)
            .sort((a, b) => a.lane - b.lane)
            .map((node) => {
              const state = visited.has(node.id)
                ? "visited"
                : reachable.has(node.id)
                  ? "reachable"
                  : "locked";
              return (
                <article
                  key={node.id}
                  className={`expedition-route-node ${node.kind} ${state}${expedition.currentNodeId === node.id ? " current" : ""}`}
                >
                  <small>
                    {nodeLabels[node.kind]} ·{" "}
                    {node.danger ? `опасность ${node.danger}/5` : "без боя"}
                  </small>
                  <strong>{node.title}</strong>
                  <p>{node.description}</p>
                  <span>{outcomeLabel(node)}</span>
                  {reachable.has(node.id) ? (
                    <button
                      className="button"
                      type="button"
                      title={`${node.description} ${outcomeLabel(node)}`}
                      onClick={() => onAdvance(node.id)}
                    >
                      Идти сюда
                    </button>
                  ) : (
                    <b className="expedition-node-state">
                      {visited.has(node.id) ? "Пройдено" : "Путь ещё не открыт"}
                    </b>
                  )}
                </article>
              );
            })}
        </section>
      ))}
    </div>
  );
}

export function DungeonDialog() {
  const { game, act, notify, closeDialog, openDialog, queueLoot } = useGame();
  const [result, setResult] = useState<ExpeditionStepReport | null>(null);
  const [loot, setLoot] = useState<{
    items: EquipmentItem[];
    equipped: EquipmentSet;
  } | null>(null);
  const [message, setMessage] = useState("");
  const expedition = game.save.activeExpedition;
  const dungeon = DUNGEONS.find((entry) => entry.id === expedition?.dungeonId);

  const advance = (
    action: (world: WorldGame) => PendingBattle | ExpeditionStepReport,
  ) => {
    const inventoryBefore = new Set(
      game.save.hero.inventory.map((item) => item.id),
    );
    const equipped = { ...game.save.hero.equipped };
    const applied = act((world) => {
      const step = action(world);
      const changes = "version" in step ? [] : world.consumeFeatureChanges();
      return { step, changes };
    });
    if (!applied) return;
    const { step, changes } = applied;
    changes.forEach((change) =>
      notify({
        eyebrow: `${change.fighterName} · ${change.kind}`,
        title: change.name,
        description: change.description,
        symbol: "✦",
        tone:
          change.kind === "Травма" || change.kind === "Адаптация"
            ? "negative"
            : "positive",
      }),
    );
    if ("version" in step) {
      closeDialog();
      openDialog({ kind: "battle" });
      return;
    }
    setMessage(step.message);
    if (step.completed || step.retreated) {
      setLoot({
        items: game.save.hero.inventory.filter(
          (item) => !inventoryBefore.has(item.id),
        ),
        equipped,
      });
      setResult(step);
    }
  };

  const closeRewards = () => {
    closeDialog();
    if (loot?.items.length) queueLoot(loot.items, loot.equipped);
  };

  if (result)
    return (
      <ExpeditionRewards
        result={result}
        items={loot?.items ?? result.rewards?.items ?? []}
        onClose={closeRewards}
      />
    );
  if (!expedition)
    return (
      <Modal id="dungeon-layer" title="Поход завершён" onClose={closeDialog}>
        <p>Активной экспедиции сейчас нет.</p>
        <button className="button" onClick={closeDialog}>
          Продолжить игру
        </button>
      </Modal>
    );

  const shrineChoices = game.expeditionShrineChoices();
  const merchantOptions = game.expeditionMerchantOptions();
  const route = game.expeditionRoute();
  const stamina = Math.round(normalizeExpeditionStamina(expedition.health));
  const visitedTitles = route
    ? (expedition.visitedNodeIds ?? [])
        .map((id) => route.nodes.find((node) => node.id === id)?.title)
        .filter(Boolean)
    : expedition.path;
  return (
    <Modal
      id="dungeon-layer"
      className="react-dungeon-dialog"
      dismissible={false}
      title={dungeon?.name ?? "Путь в глубину"}
      eyebrow="ЭКСПЕДИЦИЯ ПРОДОЛЖАЕТСЯ"
      onClose={closeDialog}
    >
      <section className="expedition-board" id="expedition-board">
        <header className="expedition-heading">
          <div>
            <p className="eyebrow">СЛЕДУЮЩИЙ ШАГ</p>
            <h3>
              Этап {Math.min(expedition.stage + 1, expedition.maxStages)} из{" "}
              {expedition.maxStages}
            </h3>
            <p>Выберите маршрут. От него зависят риск и объём добычи.</p>
          </div>
          <div className="expedition-condition">
            <div
              className={`expedition-stamina${stamina <= 25 ? " critical" : stamina <= 50 ? " low" : ""}`}
              title="Запас сил уменьшается после боёв и ловушек. Лагерь и лечение восстанавливают его."
            >
              <span>Запас сил</span>
              <strong>{stamina}%</strong>
              <div
                className="expedition-stamina-meter"
                role="progressbar"
                aria-label="Оставшийся запас сил"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={stamina}
              >
                <i style={{ width: `${stamina}%` }} />
              </div>
            </div>
            <StatRow label="Монеты" value={expedition.accumulatedGold} />
            <StatRow label="Опыт" value={expedition.accumulatedExperience} />
            <StatRow label="Трофеи" value={expedition.loot.length} />
            <StatRow
              label="Пройдено этапов"
              value={`${Math.min(expedition.stage, expedition.maxStages)}/${expedition.maxStages}`}
            />
            {expedition.supplies !== undefined && (
              <StatRow
                label="Припасы"
                value={`${expedition.supplies}/${expedition.maxSupplies ?? expedition.supplies}`}
              />
            )}
          </div>
        </header>
        {message && (
          <p className="expedition-message" role="status">
            {message}
          </p>
        )}
        {shrineChoices.length > 0 && (
          <section className="expedition-shrine-choice">
            <p className="eyebrow">КЛЯТВА У СВЯТИЛИЩА</p>
            <h4>Сила всегда требует цены</h4>
            <p>Решение действует до конца похода и не может быть отменено.</p>
            <div>
              {shrineChoices.map((choice) => (
                <button
                  className="expedition-shrine-option"
                  key={choice.id}
                  type="button"
                  onClick={() =>
                    advance((world) => world.resolveExpeditionShrine(choice.id))
                  }
                  title={`${choice.benefit}. Цена: ${choice.cost}`}
                >
                  <strong>{choice.name}</strong>
                  <p>{choice.description}</p>
                  <span className="positive">{choice.benefit}</span>
                  <span className="negative">Цена: {choice.cost}</span>
                </button>
              ))}
            </div>
          </section>
        )}
        {merchantOptions.length > 0 && (
          <section className="expedition-merchant-choice">
            <p className="eyebrow">ТОРГОВЕЦ ПОД ЗЕМЛЁЙ</p>
            <h4>Распорядитесь найденными монетами</h4>
            <p>
              В кошеле похода {expedition.accumulatedGold} ¤. Потраченные здесь
              монеты не попадут в итоговую награду.
            </p>
            <div>
              {merchantOptions.map((option) => (
                <button
                  className="expedition-merchant-option"
                  key={option.id}
                  type="button"
                  disabled={expedition.accumulatedGold < option.price}
                  onClick={() =>
                    advance((world) =>
                      world.resolveExpeditionMerchant(option.id),
                    )
                  }
                >
                  <strong>{option.name}</strong>
                  <p>{option.description}</p>
                  <span>
                    {option.price
                      ? `${option.price} найденных монет`
                      : "Бесплатно"}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
        {route ? (
          <RouteMap
            onAdvance={(id) =>
              advance((world) => world.beginExpeditionNode(id))
            }
          />
        ) : (
          <div className="expedition-choices">
            {game.expeditionChoices().map((choice) => (
              <article
                key={choice.id}
                className={`expedition-choice ${choice.id}`}
              >
                <small>РИСК: {choice.danger.toUpperCase()}</small>
                <h4>{choice.name}</h4>
                <p>{choice.description}</p>
                <span>Награда: {choice.reward}</span>
                <button
                  className="button"
                  title={`${choice.description} Награда: ${choice.reward}. Риск: ${choice.danger}.`}
                  onClick={() =>
                    advance((world) => world.beginExpeditionChoice(choice.id))
                  }
                >
                  Выбрать путь
                </button>
              </article>
            ))}
          </div>
        )}
        <p className="expedition-path">
          {visitedTitles.length
            ? `Пройденный путь: ${visitedTitles.join(" → ")}`
            : "Поход только начался."}
        </p>
        <button
          className="plain-button expedition-retreat"
          type="button"
          onClick={() => {
            if (
              window.confirm(
                "Завершить поход сейчас? Герой сохранит 55% награды и половину найденных предметов.",
              )
            )
              advance((world) => world.retreatExpedition());
          }}
        >
          Отступить и сохранить часть найденного
        </button>
      </section>
    </Modal>
  );
}
