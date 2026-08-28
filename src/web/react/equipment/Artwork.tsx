import { useMemo, type CSSProperties } from "react";
import {
  createEquipmentIcon,
  renderCharacterIllustration,
  type DollEquipmentState,
} from "../../CharacterIllustration";
import type {
  EquipmentItem,
  EquipmentSlot,
  HeroAppearance,
  HeroClass,
} from "../../../gameplay/WorldTypes";
import { rarityColors, visualClass } from "./model";

export type EquipmentVisual = Pick<
  EquipmentItem,
  | "name"
  | "templateId"
  | "rarity"
  | "setId"
  | "allowedClasses"
  | "relicTier"
  | "relicPath"
  | "appearanceVariant"
>;

function dollState(
  item: EquipmentVisual,
  classId: HeroClass,
): DollEquipmentState {
  return {
    name: item.name,
    templateId: item.templateId,
    rarity: item.rarity,
    rarityColor: rarityColors[item.rarity],
    setId: item.setId,
    visualClassId: visualClass(item, classId),
    relicTier: item.relicTier,
    relicPath: item.relicPath,
    appearanceVariant: item.appearanceVariant,
  };
}

function styles(container: HTMLElement): CSSProperties {
  return Object.fromEntries(
    Array.from(container.style).map((key) => [
      key,
      container.style.getPropertyValue(key),
    ]),
  ) as CSSProperties;
}

export function EquipmentArt({
  item,
  slot,
  classId,
  className = "equipment-art",
}: {
  item?: EquipmentVisual;
  slot: EquipmentSlot;
  classId: HeroClass;
  className?: string;
}) {
  const state = item ? dollState(item, classId) : undefined;
  const signature = JSON.stringify(state);
  const art = useMemo(() => {
    const icon = createEquipmentIcon(slot, classId, className, state);
    return { html: { __html: icon.innerHTML }, style: styles(icon) };
  }, [slot, classId, signature]);
  return (
    <span
      className={className}
      data-slot={slot}
      style={art.style}
      dangerouslySetInnerHTML={art.html}
    />
  );
}

export function CharacterArt({
  classId,
  items,
  appearance,
  className = "paper-doll",
  id,
}: {
  classId: HeroClass;
  items: readonly EquipmentItem[];
  appearance: HeroAppearance;
  className?: string;
  id?: string;
}) {
  const slots = Object.fromEntries(
    items.map((item) => [item.slot, dollState(item, classId)]),
  );
  const signature = JSON.stringify(slots);
  const art = useMemo(() => {
    const container = document.createElement("div");
    renderCharacterIllustration(container, classId, slots, appearance);
    return { html: { __html: container.innerHTML }, style: styles(container) };
  }, [classId, signature, appearance.hairStyle, appearance.faceStyle]);
  return (
    <div
      id={id}
      className={className}
      data-class={classId}
      style={art.style}
      dangerouslySetInnerHTML={art.html}
    />
  );
}
