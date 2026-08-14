import { ARENAS, CLASS_DEFINITIONS, DUNGEONS } from "../../catalogs/WorldCatalog";
import { WorldGame } from "../../gameplay/WorldGame";
import { HeroClass } from "../../gameplay/WorldTypes";
import { readAnswer } from "../question/readAnswer";

const classIds = Object.keys(CLASS_DEFINITIONS) as HeroClass[];

function printStatus(game: WorldGame): void {
  const hero = game.save.hero;
  const definition = CLASS_DEFINITIONS[hero.classId];
  console.log(`\nДень ${game.save.worldDay} · ${hero.name} · ${definition.name} · уровень ${hero.level}`);
  console.log(`Рейтинг ${hero.rating} · монеты ${hero.gold} · победы ${hero.wins}/${hero.wins + hero.losses}`);
}

function printBattle(title: string, game: WorldGame, won: boolean, opponent?: string): void {
  console.log(`${title}: ${won ? "победа" : "поражение"}${opponent ? ` против ${opponent}` : ""}.`);
  printStatus(game);
}

export async function createWorldGame(): Promise<void> {
  console.log("\nЖИВОЙ МИР — постоянная RPG-кампания\n");
  const enteredName = (await readAnswer("Имя главного героя: ")).trim();
  const name = enteredName.length >= 2 ? enteredName : "Странник";
  classIds.forEach((id, index) => console.log(`${index + 1}. ${CLASS_DEFINITIONS[id].name} — ${CLASS_DEFINITIONS[id].epithet}`));
  const classNumber = Number(await readAnswer("Выберите класс (1–6): "));
  const classId = classIds[classNumber - 1] ?? "Knight";
  const game = WorldGame.create(name, classId);

  let running = true;
  while (running) {
    printStatus(game);
    console.log("\n1. Тренировка   2. Рейтинговая дуэль   3. Данж");
    console.log("4. Календарь и запись   5. Начать турнир   6. Экипировка   7. События мира   0. Выход");
    const action = await readAnswer("Действие: ");

    try {
      switch (action.trim()) {
        case "1": {
          const result = game.train();
          console.log(`${result.title}: +${result.experience} опыта.`);
          break;
        }
        case "2": {
          const result = game.duel();
          printBattle(result.title, game, Boolean(result.battle?.heroWon), result.battle?.enemyBefore.name);
          break;
        }
        case "3": {
          DUNGEONS.forEach((dungeon, index) => {
            const state = game.availability(dungeon);
            console.log(`${index + 1}. ${dungeon.name} — ${state.unlocked ? "доступен" : state.reason}`);
          });
          const dungeonIndex = Number(await readAnswer("Номер данжа: ")) - 1;
          const dungeon = DUNGEONS[dungeonIndex];
          if (!dungeon) { console.log("Такого данжа нет."); break; }
          const report = game.play(dungeon.id);
          printBattle(dungeon.name, game, report.heroWon, report.enemyBefore.name);
          break;
        }
        case "4": {
          ARENAS.forEach((arena, index) => {
            const state = game.availability(arena);
            const registered = game.registeredTournamentDay(arena.id);
            console.log(`${index + 1}. ${arena.name} · ${arena.participants} бойцов · каждые ${arena.tournamentInterval} дн. · ${registered ? `запись на день ${registered}` : state.reason}`);
          });
          const arenaIndex = Number(await readAnswer("Записаться на турнир №: ")) - 1;
          const arena = ARENAS[arenaIndex];
          if (!arena) { console.log("Такого турнира нет."); break; }
          console.log(`Место закреплено на день ${game.registerTournament(arena.id)}.`);
          break;
        }
        case "5": {
          const available = ARENAS.find((arena) => game.registeredTournamentDay(arena.id) === game.save.worldDay);
          if (!available) { console.log("Сегодня нет турнира, на который записан герой."); break; }
          const report = game.playTournament(available.id);
          console.log(`${available.name}: место ${report.heroPlacement} из ${report.participantCount}. Чемпион — ${report.championName}.`);
          break;
        }
        case "6": {
          const equipped = new Set(Object.values(game.save.hero.equipped));
          game.save.hero.inventory.forEach((item) => console.log(`${equipped.has(item.id) ? "[надето]" : "[рюкзак]"} ${item.name} · ${item.slot} · ${item.rarity}`));
          break;
        }
        case "7":
          game.save.events.slice(0, 20).forEach((event) => console.log(`День ${event.day}: ${event.message}`));
          break;
        case "0": running = false; break;
        default: console.log("Неизвестное действие.");
      }
    } catch (error) {
      console.log((error as Error).message);
    }
  }
}
