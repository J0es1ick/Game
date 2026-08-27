import { Game, TurnReport } from "../gameplay/Game";
import { PlayerClass, PlayerFactory } from "../factories/PlayerFactory";
import { Logger } from "../utils/output/Logger";
import { Player } from "../abstract/Player";
import { createSkill } from "../catalogs/SkillCatalog";
import { createRandomWeapon } from "../catalogs/WeaponCatalog";
import { gameAudio } from "./GameAudio";
import { queueWorldEffect } from "./WorldEffects";

const $ = <T extends HTMLElement>(selector: string): T => document.querySelector(selector) as T;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const classLabels: Record<PlayerClass, string> = {
  Knight: "Рыцарь", Archer: "Лучник", Wizard: "Маг", Monk: "Монах", Gunsmith: "Оружейник", Swordsman: "Мечник",
};

let game: Game | null = null;
let timer: number | null = null;
let players: Player[] = [];
const factory = new PlayerFactory();

function addLog(message: string, result = false): void {
  const line = element("p", result ? "result" : "");
  const time = element("time", "", new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
  line.append(time, element("span", "", message));
  $("#basic-log").append(line);
  $("#basic-log").scrollTop = $("#basic-log").scrollHeight;
}

class InterfaceLogger extends Logger {
  public override messageLog(message: string): void { addLog(message); }
  public override attackLog(attacker: Player, defender: Player, damage: number): void { addLog(`${attacker.name}.attack(${defender.name}) → ${damage} урона.`); }
  public override skillLog(attacker: Player, defender: Player): void { addLog(`${attacker.name}.useSkill(«${attacker.currentSkill?.name}», ${defender.name}).`); }
  public override deathLog(warrior: Player): void { addLog(`${warrior.name}.isAlive → false. Участник исключён из сетки.`, true); }
  public override skipTurnLog(attacker: Player): void { addLog(`${attacker.name}.attack() пропущен из-за эффекта контроля.`); }
}

const logger = new InterfaceLogger();

function renderRoster(): void {
  $("#basic-roster-count").textContent = String(players.length).padStart(2, "0");
  const eliminated = new Set(game?.eliminated ?? []);
  const rows = players.map((fighter) => {
    const active = Boolean(game?.battleActive && game.battleFighters.includes(fighter));
    const row = element("div", `basic-roster-row${eliminated.has(fighter) ? " eliminated" : ""}${active ? " active" : ""}`);
    row.append(element("strong", "", fighter.name), element("small", "", `${classLabels[fighter.className as PlayerClass]} · ур. ${fighter.level}`), element("code", "", fighter.mechanic.method));
    return row;
  });
  if (rows.length === 0) rows.push(element("div", "basic-roster-row", "Добавьте случайных бойцов или создайте участника вручную."));
  $("#basic-roster").replaceChildren(...rows);
}

function setFighter(prefix: "first" | "second", fighter?: Player): void {
  $(`#basic-${prefix}`).textContent = fighter?.name ?? "—";
  $(`#basic-${prefix}-meta`).textContent = fighter ? `${classLabels[fighter.className as PlayerClass]} · ${fighter.weapon.name} · ${fighter.mechanic.method}` : "метод ещё не вызван";
  $(`#basic-${prefix}-stats`).textContent = fighter ? `HP ${Math.ceil(fighter.health)} / ${fighter.initialHealth} · STR ${fighter.strength}` : "HP 0 · STR 0";
  $(`#basic-${prefix}-health`).style.width = fighter ? `${Math.max(0, fighter.health / fighter.initialHealth * 100)}%` : "0%";
}

function renderTrace(report: TurnReport): void {
  $("#basic-trace").replaceChildren(...report.insights.map((insight) => {
    const item = element("li", insight.principle.toLowerCase().replace(" ", "-"));
    item.append(element("b", "", insight.principle), element("code", "", insight.method), element("span", "", insight.description));
    return item;
  }));
}

function renderBattle(report?: TurnReport): void {
  renderRoster();
  const running = game?.state === "battle";
  const finished = game?.state === "finished";
  const fighters = game?.battleFighters ?? [];
  setFighter("first", fighters[0]); setFighter("second", fighters[1]);
  $("#basic-round").textContent = finished ? "B · ТУРНИР ЗАВЕРШЁН" : running ? `B · РАУНД ${game!.round}` : "B · СОСТОЯНИЕ ТУРНИРА";
  $("#basic-match").textContent = finished ? "ФИНАЛ" : running ? `ХОД ${String(game!.turn).padStart(3, "0")}` : "ХОД 000";
  $("#basic-status").textContent = finished ? `Чемпион: ${game?.champion?.name ?? "—"}` : running ? game?.currentArena?.name ?? "Арена" : "Турнир не запущен";
  $("#basic-arena-description").textContent = finished ? `${game?.champion?.name ?? "Участник"} выиграл последний бой.` : game?.currentArena?.description ?? "Добавьте участников и запустите сетку.";
  $("#basic-global-status").textContent = finished ? `Победитель: ${game?.champion?.name ?? "—"}` : running ? `Раунд ${game!.round} · бой ${game!.match}` : `Участников: ${players.length}`;
  ($("#basic-create") as HTMLButtonElement).disabled = players.length < 2 || Boolean(running);
  ($("#basic-step") as HTMLButtonElement).disabled = !running;
  ($("#basic-auto") as HTMLButtonElement).disabled = !running;
  ($("#basic-add-random") as HTMLButtonElement).disabled = Boolean(running);
  ($("#basic-add-manual") as HTMLButtonElement).disabled = Boolean(running);
  ($("#basic-arena") as HTMLSelectElement).disabled = Boolean(running);
  if (report) renderTrace(report);
  if (finished) stopAuto();
}

function step(): void {
  if (!game?.battleActive) return;
  const report = game.doStep();
  if (!report) return;
  gameAudio.basicTurn(report.damage, report.skipped, report.attacker.className);
  if (report.battleFinished && report.winner) {
    queueWorldEffect({
      eyebrow: report.tournamentFinished ? "ТУРНИР ЗАВЕРШЁН" : "БОЙ ЗАВЕРШЁН",
      variant: "victory",
      title: report.winner.name,
      description: report.tournamentFinished ? "Последний соперник побеждён. Определён чемпион турнирной сетки." : `${report.defeated?.name ?? "Соперник"} покидает турнирную сетку.`,
      symbol: report.tournamentFinished ? "♛" : "⚔",
      tone: "positive",
      duration: report.tournamentFinished ? 2400 : 1600,
    });
    if (report.tournamentFinished) gameAudio.battleResult(true);
  }
  if (report.tournamentFinished) addLog(`Турнир завершён. Чемпион — ${game.champion?.name}.`, true);
  renderBattle(report);
}

function stopAuto(): void {
  if (timer !== null) window.clearTimeout(timer);
  timer = null;
  $("#basic-auto").textContent = "Автовыполнение";
}

function toggleAuto(): void {
  if (timer !== null) { stopAuto(); return; }
  if (!game?.battleActive) return;
  $("#basic-auto").textContent = "Приостановить";
  const play = () => {
    if (!game?.battleActive) { stopAuto(); renderBattle(); return; }
    step();
    if (game?.battleActive) timer = window.setTimeout(play, Number(($("#basic-delay") as HTMLInputElement).value));
  };
  timer = window.setTimeout(play, Number(($("#basic-delay") as HTMLInputElement).value));
}

function renderFactoryTrace(created: Player[]): void {
  $("#basic-factory-title").textContent = `PlayerFactory.create() × ${created.length}`;
  $("#basic-factory-description").textContent = created.map((fighter) => `${fighter.name}: new ${fighter.constructor.name}()`).join(" · ");
}

function addRandomPlayers(): void {
  if (game?.state === "battle") return;
  const created = factory.createMany(Number(($("#basic-player-count") as HTMLSelectElement).value));
  players.push(...created); renderFactoryTrace(created);
  addLog(`PlayerFactory.createMany(${created.length}) → добавлено участников: ${created.length}.`); renderBattle();
}

function addManualPlayer(): void {
  if (game?.state === "battle") return;
  const health = Number(($("#basic-health") as HTMLInputElement).value);
  const strength = Number(($("#basic-strength") as HTMLInputElement).value);
  const message = $("#basic-form-message");
  if (!Number.isInteger(health) || health < 125 || health > 150) { message.textContent = "HP должен быть целым числом от 125 до 150."; return; }
  if (!Number.isInteger(strength) || strength < 10 || strength > 15) { message.textContent = "Сила должна быть целым числом от 10 до 15."; return; }
  const selected = Array.from(document.querySelectorAll<HTMLInputElement>("#basic-skills input:checked"));
  if (selected.length > 2) { message.textContent = "Можно выбрать не более двух навыков."; return; }
  const skills = selected.map(({ value }) => createSkill(value)).filter((skill): skill is NonNullable<typeof skill> => skill !== null);
  const hero = factory.create({ className: ($("#basic-class") as HTMLSelectElement).value as PlayerClass, name: ($("#basic-name") as HTMLInputElement).value, health, strength, weapon: createRandomWeapon(($("#basic-weapon") as HTMLSelectElement).value), skills: skills.length ? skills : undefined });
  players.push(hero); message.textContent = `${hero.name}: создан экземпляр ${hero.constructor.name}.`;
  renderFactoryTrace([hero]); addLog(`PlayerFactory.create() → new ${hero.constructor.name}(${hero.name}).`, true); renderBattle();
}

function createTournament(): void {
  if (players.length < 2) return;
  stopAuto();
  game = new Game(players, undefined, logger, { arenaName: ($("#basic-arena") as HTMLSelectElement).value });
  game.startTournament();
  gameAudio.battleStart(false);
  $("#basic-trace").replaceChildren(element("li", "", "Турнир создан. Выполните ход, чтобы увидеть вызванные методы."));
  renderBattle();
}

function resetTournament(): void {
  stopAuto(); game?.resetTournament(); game = null;
  addLog("Game.resetTournament(): состояние турнира очищено.");
  $("#basic-trace").replaceChildren(element("li", "", "Состояние турнира сброшено. HP и эффекты участников восстановлены."));
  renderBattle();
}

function clearLog(): void { $("#basic-log").replaceChildren(); addLog("Журнал очищен."); }

function renderManual(): void {
  $("#basic-class-manual").replaceChildren(...(["Knight", "Archer", "Wizard", "Monk", "Gunsmith", "Swordsman"] as PlayerClass[]).map((classId) => {
    const sample = factory.create({ className: classId, name: classId, health: 140, strength: 12 });
    const article = element("article");
    article.append(element("small", "", classId.toUpperCase()), element("h3", "", sample.mechanic.title), element("code", "", sample.mechanic.method), element("p", "", sample.mechanic.description));
    return article;
  }));
}

function initialize(): void {
  renderManual();
  const delay = $("#basic-delay") as HTMLInputElement;
  const updateDelay = () => { ($("#basic-delay-output") as HTMLOutputElement).value = `${(Number(delay.value) / 1000).toFixed(2)} с`; };
  delay.addEventListener("input", updateDelay); updateDelay(); renderBattle();
  if ($("#basic-log").children.length === 0) addLog("Добавляйте участников вручную или через PlayerFactory.createMany().");
}

export const basicTournamentUi = {
  initialize, stop: stopAuto, step, toggleAuto, addRandomPlayers, addManualPlayer, createTournament, resetTournament, clearLog,
};
