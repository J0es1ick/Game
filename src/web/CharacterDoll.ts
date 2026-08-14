import {
  createEquipmentIcon,
  renderCharacterIllustration,
} from "./CharacterIllustration";

export { createEquipmentIcon };
export type { DollEquipmentState } from "./CharacterIllustration";

export function renderCharacterDoll(
  ...args: Parameters<typeof renderCharacterIllustration>
): void {
  args[0].classList.remove("is-three-dimensional", "has-character-3d-error");
  renderCharacterIllustration(...args);
}
