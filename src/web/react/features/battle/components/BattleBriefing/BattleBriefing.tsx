import type { BattleSessionSnapshot } from "../../../../../../gameplay/combat/AdvancedBattle";
import type { PendingBattleKind } from "../../../../../../gameplay/core/WorldTypes";

const stats = [
  ["attack", "Атака"],
  ["defense", "Защита"],
  ["speed", "Скорость"],
  ["crit", "Критический шанс"],
] as const;

export function BattleBriefing({
  snapshot,
  kind,
}: {
  snapshot: BattleSessionSnapshot;
  kind: PendingBattleKind;
}) {
  const tournament = kind === "arena-tournament" || kind === "crown-league";
  return (
    <section className="battle-briefing" aria-label="Перед боем">
      <div>
        <p className="eyebrow">ПЕРЕД БОЕМ</p>
        <h3>Оцените соперника</h3>
        <p>
          Характеристики уже учитывают экипировку, травмы и ограничения этого
          боя. Приёмы и классовые эффекты могут изменить исход.
        </p>
        <p className="battle-stakes">
          {tournament
            ? "Поражение завершит участие в сетке. Один турнир занимает один день мира."
            : kind === "expedition"
              ? "Полученные ранения повлияют на следующие узлы. Поражение завершит поход с частью собранных наград."
              : kind === "legend-defense"
                ? "На кону место в элите: поражение отдаст его претенденту."
                : kind === "legend-hunt"
                  ? "Победа поднимет героя в элите. Поражение оставит текущую позицию."
                  : "Бой продвинет день мира. Поражение может оставить травму; экипировка героя сохранится."}
        </p>
      </div>
      <table className="battle-comparison">
        <caption>Характеристики участников</caption>
        <thead>
          <tr>
            <th scope="col">Показатель</th>
            <th scope="col">Герой</th>
            <th scope="col">Соперник</th>
          </tr>
        </thead>
        <tbody>
          {stats.map(([key, label]) => (
            <tr key={key}>
              <th scope="row">{label}</th>
              <td>
                {snapshot.hero[key]}
                {key === "crit" ? "%" : ""}
              </td>
              <td>
                {snapshot.enemy[key]}
                {key === "crit" ? "%" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
