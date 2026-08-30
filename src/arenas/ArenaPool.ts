import { getRandomArrayElement } from "../utils/randomization/index";
import { AncientRuins } from "./AncientRuins";
import { IArena } from "./IArena";
import { TrainingGround } from "./TrainingGround";
import { VolcanicCrater } from "./VolcanicCrater";

export class ArenaPool {
  private readonly arenas: IArena[] = [
    new TrainingGround(),
    new VolcanicCrater(),
    new AncientRuins(),
  ];

  public all(): IArena[] {
    return [...this.arenas];
  }

  public pick(name?: string): IArena {
    const normalized = name?.trim().toLowerCase();
    const selected = normalized
      ? this.arenas.find((arena) => arena.name.toLowerCase() === normalized)
      : undefined;
    return (
      selected ?? getRandomArrayElement(this.arenas) ?? new TrainingGround()
    );
  }
}
