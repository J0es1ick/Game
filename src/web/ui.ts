import { Player } from "../abstract/Player";
import { createSkill } from "../catalogs/SkillCatalog";
import { createRandomWeapon } from "../catalogs/WeaponCatalog";
import { PlayerClass, PlayerFactory } from "../factories/PlayerFactory";
import { Game, TurnReport } from "../gameplay/Game";
import { Logger } from "../utils/output/Logger";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector(selector) as T;

const factory = new PlayerFactory();
const playerList = $("#player-list");
const playerCount = $("#player-count");
const creationStatus = $("#creation-status");
const nameInput = $("#name-input") as HTMLInputElement;
const classSelect = $("#class-select") as HTMLSelectElement;
const healthInput = $("#health-input") as HTMLInputElement;
const strengthInput = $("#strength-input") as HTMLInputElement;
const weaponSelect = $("#weapon-select") as HTMLSelectElement;
const randomCount = $("#random-count") as HTMLSelectElement;
const startButton = $("#start-tournament-btn") as HTMLButtonElement;
const autoButton = $("#auto-battle") as HTMLButtonElement;
const nextTurnButton = $("#next-turn") as HTMLButtonElement;
const addRandomButton = $("#add-random-btn") as HTMLButtonElement;
const createButton = $("#create-btn") as HTMLButtonElement;
const delayInput = $("#delay-input") as HTMLInputElement;
const delayOutput = $("#delay-output") as HTMLOutputElement;
const status = $("#tournament-status");
const roundInfo = $("#round-info");
const turnInfo = $("#turn-info");
const arenaTitle = $("#arena-title");
const arenaDisplay = $("#arena-display");
const logContainer = $("#log-container");
const traceList = $("#trace-list");
const factoryTrace = $("#factory-trace");
const fighterElements = [$("#fighter1"), $("#fighter2")];

const classLabels: Record<string, string> = {
  Knight: "Рыцарь",
  Archer: "Лучник",
  Wizard: "Маг",
};

let players: Player[] = [];
let game: Game | null = null;
let autoTimer: number | null = null;

function log(message: string, kind = "message"): void {
  logContainer.querySelector(".empty-log")?.remove();
  const entry = document.createElement("div");
  entry.className = `log-entry ${kind}`;
  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = new Date().toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const text = document.createElement("span");
  text.textContent = message;
  entry.append(time, text);
  logContainer.append(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

class InterfaceLogger extends Logger {
  public override messageLog(message: string): void { log(message); }
  public override attackLog(attacker: Player, defender: Player, damage: number): void {
    log(`${attacker.name}.attack(${defender.name}) → ${damage} урона.`, "attack");
  }
  public override skillLog(attacker: Player, defender: Player): void {
    log(`${attacker.name}.useSkill(«${attacker.currentSkill?.name}», ${defender.name}).`, "skill");
  }
  public override skipTurnLog(attacker: Player): void {
    log(`${attacker.name}.attack() пропущен: участник находится под эффектом контроля.`, "skill");
  }
  public override deathLog(warrior: Player): void {
    log(`${warrior.name}.isAlive → false. Участник исключён из турнирной сетки.`, "death");
  }
}

const uiLogger = new InterfaceLogger();

function setEmptyLog(): void {
  if (logContainer.children.length > 0) return;
  const empty = document.createElement("p");
  empty.className = "empty-log";
  empty.textContent = "Здесь будут записаны создание участников, атаки, навыки и завершение боёв.";
  logContainer.append(empty);
}

function renderPlayers(): void {
  playerCount.textContent = String(players.length).padStart(2, "0");
  playerList.replaceChildren();

  if (players.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-log";
    empty.textContent = "Участников нет. Добавьте случайных бойцов или создайте одного вручную.";
    playerList.append(empty);
    return;
  }

  const eliminated = new Set(game?.eliminated ?? []);
  players.forEach((player) => {
    const card = document.createElement("article");
    card.className = "player-card";
    if (eliminated.has(player)) card.classList.add("eliminated");
    if (game?.battleActive && game.battleFighters.includes(player)) card.classList.add("active");

    const name = document.createElement("div");
    name.className = "player-name";
    name.textContent = player.name;

    const meta = document.createElement("div");
    meta.className = "player-meta";
    const method = document.createElement("span");
    method.className = "player-method-chip";
    method.textContent = player.mechanic.method;
    const state = document.createElement("strong");
    state.textContent = eliminated.has(player) ? "ВЫБЫЛ" : `УР. ${player.level}`;
    meta.append(method, state);
    card.append(name, meta);
    playerList.append(card);
  });
}

function renderFighter(element: HTMLElement, player: Player | null): void {
  const name = element.querySelector(".name") as HTMLElement;
  const label = element.querySelector(".fighter-class") as HTMLElement;
  const method = element.querySelector(".fighter-method") as HTMLElement;
  const hp = element.querySelector(".hp") as HTMLElement;
  const strength = element.querySelector(".str") as HTMLElement;
  const fill = element.querySelector(".fill") as HTMLElement;

  if (!player) {
    name.textContent = "—";
    label.textContent = "УЧАСТНИК НЕ ВЫБРАН";
    method.textContent = "метод ещё не вызван";
    hp.textContent = "0";
    strength.textContent = "0";
    fill.style.width = "0%";
    return;
  }

  name.textContent = player.name;
  label.textContent = `${classLabels[player.className ?? ""] ?? player.className} / ${player.constructor.name}`;
  method.textContent = player.mechanic.method;
  hp.textContent = `${Math.ceil(player.health)} / ${player.initialHealth}`;
  strength.textContent = String(player.strength);
  fill.style.width = `${Math.max(0, (player.health / player.initialHealth) * 100)}%`;
}

function renderBattle(report?: TurnReport): void {
  const fighters = game?.battleFighters ?? [];
  renderFighter(fighterElements[0], fighters[0] ?? null);
  renderFighter(fighterElements[1], fighters[1] ?? null);

  fighterElements.forEach((element) => element.classList.remove("attacking", "hit"));
  if (!report || report.battleFinished) return;
  const attackerIndex = fighters.indexOf(report.attacker);
  const defenderIndex = fighters.indexOf(report.defender);
  if (attackerIndex >= 0) fighterElements[attackerIndex].classList.add("attacking");
  if (defenderIndex >= 0 && report.damage > 0) fighterElements[defenderIndex].classList.add("hit");
}

function renderHeader(): void {
  if (!game || game.state === "idle") {
    status.textContent = "Добавьте минимум двух участников";
    arenaTitle.textContent = "Турнир не запущен";
    arenaDisplay.textContent = "Добавьте минимум двух участников.";
    roundInfo.textContent = "РАУНД --";
    turnInfo.textContent = "ХОД 000";
    return;
  }

  if (game.state === "finished") {
    status.textContent = `Победитель: ${game.champion?.name ?? "—"}`;
    arenaTitle.textContent = "Турнир завершён";
    arenaDisplay.textContent = `${game.champion?.name ?? "Участник"} выиграл последний бой и получил опыт.`;
    roundInfo.textContent = "ФИНАЛ";
    turnInfo.textContent = "ЗАВЕРШЕНО";
    return;
  }

  status.textContent = `Раунд ${game.round} · бой ${game.match}`;
  arenaTitle.textContent = game.currentArena?.name ?? "Арена";
  arenaDisplay.textContent = game.currentArena?.description ?? "";
  roundInfo.textContent = `РАУНД ${String(game.round).padStart(2, "0")}`;
  turnInfo.textContent = `ХОД ${String(game.turn).padStart(3, "0")}`;
}

function renderControls(): void {
  const running = game?.state === "battle";
  startButton.disabled = players.length < 2 || running;
  nextTurnButton.disabled = !running;
  autoButton.disabled = !running;
  addRandomButton.disabled = running;
  createButton.disabled = running;
  randomCount.disabled = running;
  classSelect.disabled = running;
  healthInput.disabled = running;
  strengthInput.disabled = running;
  weaponSelect.disabled = running;
  nameInput.disabled = running;
}

function renderTrace(report: TurnReport): void {
  traceList.replaceChildren();
  report.insights.forEach((insight) => {
    const item = document.createElement("li");
    item.className = insight.principle.toLowerCase().replace(" ", "-");
    const principle = document.createElement("b");
    principle.textContent = insight.principle;
    const method = document.createElement("code");
    method.textContent = insight.method;
    const description = document.createElement("span");
    description.textContent = insight.description;
    item.append(principle, method, description);
    traceList.append(item);
  });
}

function renderFactoryTrace(created: Player[]): void {
  const title = factoryTrace.querySelector("strong") as HTMLElement;
  const description = factoryTrace.querySelector("p") as HTMLElement;
  title.textContent = `PlayerFactory.create() × ${created.length}`;
  description.textContent = created
    .map((player) => `${player.name}: new ${player.constructor.name}()`)
    .join(" · ");
}

function renderAll(report?: TurnReport): void {
  renderPlayers();
  renderBattle(report);
  renderHeader();
  renderControls();
}

function stopAuto(): void {
  if (autoTimer !== null) window.clearTimeout(autoTimer);
  autoTimer = null;
  autoButton.textContent = "Автовыполнение";
}

function updateSpeedLabel(): void {
  delayOutput.value = `${(Number(delayInput.value) / 1000).toFixed(2)} s`;
}

function addRandomPlayers(): void {
  if (game?.state === "battle") return;
  const created = factory.createMany(Number(randomCount.value));
  players.push(...created);
  renderFactoryTrace(created);
  log(`PlayerFactory.createMany(${created.length}) → добавлено участников: ${created.length}.`);
  renderAll();
}

function createPlayer(): void {
  if (game?.state === "battle") return;
  const health = Number(healthInput.value);
  const strength = Number(strengthInput.value);
  if (!Number.isInteger(health) || health < 125 || health > 150) {
    creationStatus.textContent = "HP должен быть целым числом от 125 до 150.";
    return;
  }
  if (!Number.isInteger(strength) || strength < 10 || strength > 15) {
    creationStatus.textContent = "Сила должна быть целым числом от 10 до 15.";
    return;
  }

  const selected = Array.from(
    document.querySelectorAll<HTMLInputElement>("#skills-checkboxes input:checked"),
  );
  if (selected.length > 2) {
    creationStatus.textContent = "Можно передать не более двух навыков.";
    return;
  }

  const skills = selected
    .map(({ value }) => createSkill(value))
    .filter((skill): skill is NonNullable<typeof skill> => skill !== null);
  const hero = factory.create({
    className: classSelect.value as PlayerClass,
    name: nameInput.value,
    health,
    strength,
    weapon: createRandomWeapon(weaponSelect.value),
    skills: skills.length > 0 ? skills : undefined,
  });
  players.push(hero);
  creationStatus.textContent = `${hero.name}: создан экземпляр класса ${hero.constructor.name}.`;
  renderFactoryTrace([hero]);
  log(`PlayerFactory.create() → new ${hero.constructor.name}(${hero.name}).`, "skill");
  renderAll();
}

function startTournament(): void {
  if (players.length < 2) return;
  stopAuto();
  game = new Game(players, undefined, uiLogger);
  game.startTournament();
  traceList.replaceChildren();
  const empty = document.createElement("li");
  empty.className = "trace-empty";
  empty.textContent = "Турнир создан. Выполните ход, чтобы увидеть последовательность вызванных методов.";
  traceList.append(empty);
  renderAll();
}

function nextTurn(): void {
  if (!game?.battleActive) return;
  const report = game.doStep();
  if (!report) return;
  renderTrace(report);
  renderAll(report);
  if (report.tournamentFinished) stopAuto();
}

function scheduleAuto(): void {
  if (autoTimer !== null || !game?.battleActive) return;
  autoButton.textContent = "Приостановить";
  const play = () => {
    if (!game?.battleActive) {
      stopAuto();
      renderAll();
      return;
    }
    nextTurn();
    if (game?.battleActive) autoTimer = window.setTimeout(play, Number(delayInput.value));
  };
  autoTimer = window.setTimeout(play, Number(delayInput.value));
}

function resetTournament(): void {
  stopAuto();
  game?.resetTournament();
  game = null;
  creationStatus.textContent = "";
  traceList.replaceChildren();
  const empty = document.createElement("li");
  empty.className = "trace-empty";
  empty.textContent = "Состояние турнира сброшено. HP и эффекты участников восстановлены.";
  traceList.append(empty);
  log("Game.resetTournament(): состояние турнира очищено.");
  renderAll();
}

addRandomButton.addEventListener("click", addRandomPlayers);
createButton.addEventListener("click", createPlayer);
$("#reset-btn").addEventListener("click", resetTournament);
startButton.addEventListener("click", startTournament);
nextTurnButton.addEventListener("click", nextTurn);
autoButton.addEventListener("click", () => autoTimer === null ? scheduleAuto() : stopAuto());
$("#clear-log").addEventListener("click", () => {
  logContainer.replaceChildren();
  setEmptyLog();
});
delayInput.addEventListener("input", updateSpeedLabel);

updateSpeedLabel();
setEmptyLog();
renderAll();
