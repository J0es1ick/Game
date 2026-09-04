export type GameMode = "basic" | "world";

export function ModeChoice({
  hasSave,
  onChoose,
}: {
  hasSave: boolean;
  onChoose: (mode: GameMode) => void;
}) {
  return (
    <main className="mode-screen" id="mode-screen">
      <div className="mode-paper">
        <p className="eyebrow">ПЫЛЬ И КОРОНА</p>
        <h1>Выберите режим</h1>
        <p>
          Два самостоятельных формата: короткий турнир по упрощённым правилам
          или долгая кампания с тактикой, навыками и экипировкой.
        </p>
        <div className="mode-choice">
          <button className="mode-card" onClick={() => onChoose("basic")}>
            <span>Короткая партия</span>
            <strong>Базовый турнир</strong>
            <p>
              Соберите участников, разыграйте турнирную сетку и наблюдайте за
              каждым ходом. Без сохранения и мета-прогрессии.
            </p>
            <b>Запустить турнир →</b>
          </button>
          <button
            className="mode-card featured"
            onClick={() => onChoose("world")}
          >
            <span>Постоянная кампания</span>
            <strong>Живой мир</strong>
            <p>
              Создайте героя, собирайте экипировку, записывайтесь на турниры и
              следите за развитием соперников. Бои учитывают навыки, состояния и
              тактику.
            </p>
            <b>{hasSave ? "Продолжить летопись →" : "Создать героя →"}</b>
          </button>
        </div>
      </div>
    </main>
  );
}
