import { getRandomArrayElement } from "../../utils/randomization";
import { AncientRuins } from "../../arenas/AncientRuins";
import type { IArena } from "../../arenas/IArena";
import { TrainingGround } from "../../arenas/TrainingGround";
import { VolcanicCrater } from "../../arenas/VolcanicCrater";

export class ArenaFabric {
  private arenas: IArena[] = [
    new TrainingGround(),
    new VolcanicCrater(),
    new AncientRuins(),
  ];

  public listArenas(): IArena[] {
    return [...this.arenas];
  }

  public createArena(arenaName?: string): IArena {
    if (arenaName) {
      const normalized = arenaName.trim().toLowerCase();
      const found = this.arenas.find((arena) => arena.name.toLowerCase() === normalized);
      if (found) {
        return found;
      }
    }

    const randomArena = getRandomArrayElement(this.arenas);
    return randomArena ?? new TrainingGround();
  }
}
