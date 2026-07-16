import { Player } from "../abstract/Player";
import { PlayerFabric } from "../fabrics/playersFabrics";
import { SkillFabric } from "../fabrics/skillFabric/SkillFabric";
import { WeaponFabric } from "../fabrics/weaponsFabric/WeaponFabric";
import { Game } from "../gameplay/Game";
import { Logger } from "../utils/output/Logger";

const $ = <T extends HTMLElement>(selector: string) => document.querySelector(selector) as T;
const playerFabric = new PlayerFabric();
const weaponFabric = new WeaponFabric();
const skillFabric = new SkillFabric();

const playerList = $("#player-list");
const playerCount = $("#player-count");
const creationStatus = $("#creation-status");
const classSelect = $("#class-select") as HTMLSelectElement;
const healthInput = $("#health-input") as HTMLInputElement;
const strengthInput = $("#strength-input") as HTMLInputElement;
const weaponSelect = $("#weapon-select") as HTMLSelectElement;
const randomCount = $("#random-count") as HTMLSelectElement;
const startButton = $("#start-tournament-btn") as HTMLButtonElement;
const autoButton = $("#auto-battle") as HTMLButtonElement;
const nextTurnButton = $("#next-turn") as HTMLButtonElement;
const delayInput = $("#delay-input") as HTMLInputElement;
const delayOutput = $("#delay-output") as HTMLOutputElement;
const status = $("#tournament-status");
const roundInfo = $("#round-info");
const turnInfo = $("#turn-info");
const arenaTitle = $("#arena-title");
const arenaDisplay = $("#arena-display");
const logContainer = $("#log-container");
const fighterElements = [$("#fighter1"), $("#fighter2")];

let players: Player[] = [];
let game: Game | null = null;
let roundPlayers: Player[] = [];
let roundWinners: Player[] = [];
let matchCursor = 0;
let round = 1;
let tournamentRunning = false;
let autoTimer: number | null = null;
const eliminated = new Set<Player>();

const classLabels: Record<string, string> = { Knight: "Рыцарь", Archer: "Лучник", Wizard: "Маг" };

function log(message: string, kind = "message") {
  const empty = logContainer.querySelector(".empty-log");
  if (empty) empty.remove();
  const entry = document.createElement("div");
  entry.className = `log-entry ${kind}`;
  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const text = document.createElement("span");
  text.textContent = message;
  entry.append(time, text);
  logContainer.append(entry);
  logContainer.scrollTop = logContainer.scrollHeight;
}

class ArenaLogger extends Logger {
  override messageLog(message: string) { log(message); }
  override attackLog(attacker: Player, defender: Player, damage: number) {
    log(`${attacker.name} наносит ${damage} урона герою ${defender.name}.`, "attack");
  }
  override skillLog(attacker: Player, defender: Player) {
    log(`${attacker.name} использует «${attacker.currentSkill?.name ?? "способность"}» против ${defender.name}.`, "skill");
  }
  override skipTurnLog(attacker: Player) { log(`${attacker.name} пропускает ход: на нём действует контроль.`, "skill"); }
  override deathLog(warrior: Player) { log(`${warrior.name} выбывает из поединка.`, "death"); }
}
const uiLogger = new ArenaLogger();

function setEmptyLog() {
  if (!logContainer.children.length) logContainer.innerHTML = '<p class="empty-log">События боя появятся здесь.</p>';
}

function renderPlayers() {
  playerCount.textContent = String(players.length);
  playerList.replaceChildren();
  if (!players.length) {
    playerList.innerHTML = '<p class="empty-log">Добавьте случайных бойцов или создайте героя.</p>';
    return;
  }
  players.forEach((player) => {
    const card = document.createElement("article");
    card.className = "player-card";
    if (eliminated.has(player)) card.classList.add("eliminated");
    if (game?.battleFighters.includes(player) && game.battleActive) card.classList.add("active");
    const state = eliminated.has(player) ? "выбыл" : `ур. ${player.level}`;
    card.innerHTML = `<div class="player-name">${player.name}</div><div class="player-meta"><span class="class-dot">${classLabels[player.className ?? ""] ?? player.className}</span><strong>${state}</strong></div>`;
    playerList.append(card);
  });
}

function renderFighter(element: HTMLElement, player: Player | null) {
  const name = element.querySelector(".name") as HTMLElement;
  const label = element.querySelector(".fighter-class") as HTMLElement;
  const hp = element.querySelector(".hp") as HTMLElement;
  const strength = element.querySelector(".str") as HTMLElement;
  const fill = element.querySelector(".fill") as HTMLElement;
  if (!player) {
    name.textContent = "—"; label.textContent = "Ожидает вызова"; hp.textContent = "0"; strength.textContent = "0"; fill.style.width = "0%";
    return;
  }
  name.textContent = player.name;
  label.textContent = classLabels[player.className ?? ""] ?? "Герой";
  hp.textContent = `${Math.ceil(player.health)} / ${player.initialHealth}`;
  strength.textContent = String(player.strength);
  fill.style.width = `${Math.max(0, (player.health / player.initialHealth) * 100)}%`;
}

function renderBattle(attackerIndex: number | null = null, wasHit = false) {
  const fighters = game?.battleFighters ?? [];
  renderFighter(fighterElements[0], fighters[0] ?? null);
  renderFighter(fighterElements[1], fighters[1] ?? null);
  fighterElements.forEach((element, index) => {
    element.classList.remove("attacking", "hit");
    if (attackerIndex === index) element.classList.add("attacking");
    if (wasHit && attackerIndex !== null && attackerIndex !== index) element.classList.add("hit");
  });
}

function stopAuto() {
  if (autoTimer !== null) window.clearTimeout(autoTimer);
  autoTimer = null;
  autoButton.textContent = "Автовоспроизведение";
}

function updateSpeedLabel() {
  delayOutput.value = `${(Number(delayInput.value) / 1000).toFixed(2)} с`;
}

function updateBattleHeader() {
  if (!game?.currentArena) return;
  arenaTitle.textContent = game.currentArena.name;
  arenaDisplay.textContent = game.currentArena.description;
  roundInfo.textContent = `Раунд ${round}`;
  turnInfo.textContent = `Ход ${game.turn}`;
}

function prepareNextMatch(): void {
  while (tournamentRunning) {
    if (matchCursor >= roundPlayers.length) {
      if (roundWinners.length === 1) {
        const champion = roundWinners[0];
        tournamentRunning = false;
        game = null;
        status.textContent = "Турнир завершён";
        arenaTitle.textContent = "Турнир завершён";
        arenaDisplay.textContent = `${champion.name} забирает корону арены.`;
        roundInfo.textContent = "Финал";
        renderFighter(fighterElements[0], champion);
        renderFighter(fighterElements[1], null);
        log(`🏆 ${champion.name} становится победителем турнира!`, "skill");
        renderPlayers();
        stopAuto();
        return;
      }
      roundPlayers = roundWinners;
      roundWinners = [];
      matchCursor = 0;
      round += 1;
      log(`Начинается раунд ${round}. Осталось героев: ${roundPlayers.length}.`);
      continue;
    }
    const first = roundPlayers[matchCursor];
    const second = roundPlayers[matchCursor + 1];
    if (!second) {
      roundWinners.push(first);
      matchCursor += 2;
      log(`${first.name} проходит в следующий раунд без боя.`);
      continue;
    }
    game = new Game([], undefined, uiLogger);
    game.startStepBattle([first, second]);
    status.textContent = `Раунд ${round} · Поединок ${Math.floor(matchCursor / 2) + 1}`;
    updateBattleHeader();
    renderBattle();
    renderPlayers();
    log(`${first.name} и ${second.name} выходят на арену.`, "skill");
    return;
  }
}

function finishMatch() {
  if (!game) return;
  const [first, second] = game.battleFighters;
  const winner = first.isAlive ? first : second;
  const loser = first.isAlive ? second : first;
  eliminated.add(loser);
  winner.reset();
  roundWinners.push(winner);
  matchCursor += 2;
  log(`${winner.name} проходит в следующий раунд.`, "skill");
  prepareNextMatch();
}

function nextTurn() {
  if (!game?.battleActive) {
    if (!tournamentRunning) log("Сначала добавьте участников и начните новый турнир.");
    return;
  }
  const attackerIndex = game.turn % 2;
  const healthBefore = game.battleFighters[(attackerIndex + 1) % 2].health;
  const finished = game.doStep();
  const wasHit = game.battleFighters[(attackerIndex + 1) % 2].health < healthBefore;
  updateBattleHeader();
  renderBattle(attackerIndex, wasHit);
  renderPlayers();
  if (finished) finishMatch();
}

function scheduleAuto() {
  if (autoTimer !== null) return;
  autoButton.textContent = "Пауза";
  const play = () => {
    if (!tournamentRunning) { stopAuto(); return; }
    nextTurn();
    if (tournamentRunning) autoTimer = window.setTimeout(play, Number(delayInput.value));
  };
  autoTimer = window.setTimeout(play, Number(delayInput.value));
}

function startTournament() {
  if (players.length < 2) { log("Для турнира нужны хотя бы два героя."); return; }
  stopAuto();
  players.forEach((player) => player.reset());
  eliminated.clear();
  roundPlayers = [...players].sort(() => Math.random() - 0.5);
  roundWinners = [];
  matchCursor = 0;
  round = 1;
  tournamentRunning = true;
  log(`Турнир начинается: ${players.length} героев вступают в борьбу.`);
  prepareNextMatch();
}

function addRandomPlayers() {
  if (tournamentRunning) { log("Дождитесь завершения турнира или сбросьте его."); return; }
  const amount = Number(randomCount.value);
  players.push(...playerFabric.createRandomPlayers(amount));
  renderPlayers();
  status.textContent = "Состав готовится";
  log(`В состав добавлено бойцов: ${amount}.`);
}

function createPlayer() {
  if (tournamentRunning) { creationStatus.textContent = "Сбросьте турнир, чтобы изменить состав."; return; }
  const health = Number(healthInput.value);
  const strength = Number(strengthInput.value);
  if (!Number.isInteger(health) || health < 125 || health > 150) { creationStatus.textContent = "Здоровье: целое число от 125 до 150."; return; }
  if (!Number.isInteger(strength) || strength < 10 || strength > 15) { creationStatus.textContent = "Сила: целое число от 10 до 15."; return; }
  const selected = Array.from(document.querySelectorAll<HTMLInputElement>("#skills-checkboxes input:checked"));
  if (selected.length > 2) { creationStatus.textContent = "Можно выбрать не более двух навыков."; return; }
  const skills = selected.map(({ value }) => skillFabric.createSkillFromTemplate(value)).filter((skill): skill is NonNullable<typeof skill> => skill !== null);
  const hero = playerFabric.createPlayer(classSelect.value, health, strength, weaponFabric.createRandomWeapon(weaponSelect.value), skills.length ? skills : null);
  if (!hero) { creationStatus.textContent = "Не удалось создать героя."; return; }
  players.push(hero);
  creationStatus.textContent = `${hero.name} готов к бою.`;
  renderPlayers();
  log(`${hero.name} присоединяется к турниру.`);
}

function resetTournament() {
  stopAuto();
  players.forEach((player) => player.reset());
  eliminated.clear();
  tournamentRunning = false;
  game = null;
  roundPlayers = [];
  roundWinners = [];
  matchCursor = 0;
  round = 1;
  status.textContent = "Ожидание участников";
  roundInfo.textContent = "Раунд —";
  turnInfo.textContent = "Ход 0";
  arenaTitle.textContent = "Выберите участников";
  arenaDisplay.textContent = "Турнир начинается, когда в составе есть хотя бы два героя.";
  renderBattle();
  renderPlayers();
  log("Турнир сброшен. Герои восстановили силы.");
}

$("#add-random-btn").addEventListener("click", addRandomPlayers);
$("#create-btn").addEventListener("click", createPlayer);
$("#reset-btn").addEventListener("click", resetTournament);
startButton.addEventListener("click", startTournament);
nextTurnButton.addEventListener("click", nextTurn);
autoButton.addEventListener("click", () => autoTimer === null ? scheduleAuto() : stopAuto());
$("#clear-log").addEventListener("click", () => { logContainer.replaceChildren(); setEmptyLog(); });
delayInput.addEventListener("input", updateSpeedLabel);

updateSpeedLabel();
setEmptyLog();
renderPlayers();
