import { FACTIONS } from "../../../../../catalogs/WorldExpansionCatalog";
import type { NarrativeEffect } from "../../../../../gameplay/world/NarrativeEvents";
import type { SeasonNotice } from "../utils/SeasonNotices";
import { useGame } from "../../../app/state/GameContext";
import { Modal } from "../../../shared/ui/common";

export function narrativeEffectLines(effect: NarrativeEffect): string[] {
  const sign = (value: number) => `${value > 0 ? "+" : ""}${value}`;
  const lines: string[] = [];
  if (effect.gold) lines.push(`Монеты: ${sign(effect.gold)} ¤`);
  if (effect.experience) lines.push(`Опыт: ${sign(effect.experience)}`);
  if (effect.temperingMarks)
    lines.push(`Печати: ${sign(effect.temperingMarks)}`);
  if (effect.injuryRecovery)
    lines.push(`Восстановление от травм: ${effect.injuryRecovery} дн.`);
  if (effect.rivalryIntensity)
    lines.push(`Напряжение соперничества: ${sign(effect.rivalryIntensity)}`);
  Object.entries(effect.reputation ?? {}).forEach(([id, value]) =>
    lines.push(
      `${FACTIONS.find((faction) => faction.id === id)?.name ?? "Фракция"}: ${sign(value)} репутации`,
    ),
  );
  return lines.length ? lines : ["Без изменения ресурсов."];
}

export function NarrativeDialog() {
  const { game, act, closeDialog, notify } = useGame();
  const event = game.pendingNarrativeEvent();
  if (!event) return null;
  return (
    <Modal
      id="narrative-layer"
      className="react-narrative-dialog"
      eyebrow="СОБЫТИЕ МИРА"
      title={event.title}
      onClose={closeDialog}
      dismissible={false}
    >
      <p className="dialog-intro">{event.description}</p>
      <div className="narrative-choices">
        {event.choices.map((choice) => {
          const canAfford =
            game.save.hero.gold + (choice.effect.gold ?? 0) >= 0;
          return (
            <button
              type="button"
              className="narrative-choice"
              key={choice.id}
              disabled={!canAfford}
              onClick={() => {
                const result = act((current) =>
                  current.resolveNarrativeChoice(choice.id),
                );
                if (!result) return;
                closeDialog();
                notify({
                  eyebrow: "РЕШЕНИЕ ПРИНЯТО",
                  title: choice.label,
                  description: choice.description,
                  stats: narrativeEffectLines(choice.effect),
                  tone: "neutral",
                  sound: "choice",
                });
              }}
            >
              <strong>{choice.label}</strong>
              <span>{choice.description}</span>
              <div className="narrative-choice-effects">
                {narrativeEffectLines(choice.effect).map((line) => (
                  <small key={line}>{line}</small>
                ))}
              </div>
              {!canAfford && <small>Не хватает монет.</small>}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

export function SeasonDialog({ notice }: { notice: SeasonNotice }) {
  const { closeDialog } = useGame();
  return (
    <Modal
      id="season-changes-layer"
      className="react-season-dialog"
      title={notice.title}
      eyebrow={`${notice.kind === "world" ? `ЭПОХА ${notice.cycle} · МИРОВОЙ СЕЗОН` : "ЛИГА КОРОНЫ"} ${notice.number} · ДНИ ${notice.startsDay}–${notice.endsDay}`}
      onClose={closeDialog}
      footer={
        <button className="button primary" onClick={closeDialog}>
          Продолжить игру
        </button>
      }
    >
      <p className="dialog-intro">{notice.description}</p>
      <p>Сравнение с условиями: {notice.previousTitle}</p>
      <div className="season-comparison-scroll">
        <table className="season-changes-table">
          <thead>
            <tr>
              <th scope="col">Условие</th>
              <th scope="col">Было</th>
              <th scope="col">Стало</th>
            </tr>
          </thead>
          <tbody>
            {notice.changes.map((change) => (
              <tr
                className={change.before !== change.after ? "is-changed" : ""}
                key={change.label}
              >
                <th scope="row">
                  <strong>{change.label}</strong>
                  {change.description && <p>{change.description}</p>}
                </th>
                <td>{change.before}</td>
                <td>{change.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="season-changes-note">{notice.note}</p>
    </Modal>
  );
}
