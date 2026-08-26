import {
  createEquipmentIcon,
  type DollEquipmentState,
  renderCharacterIllustration,
} from "../src/web/CharacterIllustration";
import type { EquipmentSlot, HeroClass, Rarity } from "../src/gameplay/WorldTypes";

interface FakeElement {
  className: string;
  dataset: Record<string, string>;
  innerHTML: string;
  style: {
    values: Record<string, string>;
    setProperty(name: string, value: string): void;
  };
}

function fakeElement(): FakeElement {
  const values: Record<string, string> = {};
  return {
    className: "",
    dataset: {},
    innerHTML: "",
    style: {
      values,
      setProperty(name, value) {
        values[name] = value;
      },
    },
  };
}

function equipment(
  slot: EquipmentSlot,
  setId: string,
  rarity: Rarity = "common",
): DollEquipmentState {
  return {
    name: `${setId}-${slot}`,
    rarity,
    rarityColor: "#9a7650",
    setId,
    templateId: `${setId}-${slot}`,
  };
}

function render(
  slots: Partial<Record<EquipmentSlot, DollEquipmentState>>,
  classId: HeroClass = "Knight",
): string {
  const container = fakeElement();
  renderCharacterIllustration(container as unknown as HTMLElement, classId, slots);
  return container.innerHTML;
}

function fittedSleevePaths(markup: string): string[] {
  return Array.from(
    markup.matchAll(/<path class="[^"]*\bfitted-sleeve\b[^"]*" d="([^"]+)"\/>/g),
    (match) => match[1],
  );
}

describe("2D character illustration contracts", () => {
  it("renders one SVG illustration and never falls back to a canvas or 3D viewer", () => {
    const markup = render({
      chest: equipment("chest", "wanderer"),
      hands: equipment("hands", "wanderer"),
    });

    expect(markup).toContain('<svg class="character-illustration');
    expect(markup).toContain(" has-chest");
    expect(markup).toContain(" has-hands");
    expect(markup).not.toMatch(/<(?:canvas|model-viewer)\b/i);
    expect(markup).not.toMatch(/class="[^"]*character-3d/i);
  });

  it("exposes the hands flag only when gloves are equipped", () => {
    const bare = render({ chest: equipment("chest", "wanderer") });
    const gloved = render({ hands: equipment("hands", "wanderer") });

    expect(bare).not.toContain(" has-hands");
    expect(gloved).toContain(" has-hands");
    expect(gloved).toContain('data-slot="hands"');
  });

  it("renders a mythic hood as an open hood joined to a mantle, without helmet ornaments", () => {
    const markup = render({ head: equipment("head", "wanderer", "mythic") });
    const hoodShell = markup.match(
      /<path class="item-dark hood-shell" fill-rule="evenodd" d="([^"]+)"\/>/,
    );

    expect(markup).toContain("hood-mantle");
    expect(markup).toContain("hood-mantle-panel");
    expect(hoodShell).not.toBeNull();
    expect(hoodShell?.[1].match(/\bM/g)).toHaveLength(2);
    expect(hoodShell?.[1]).toContain("210 190");
    expect(markup).not.toContain("helmet-shell");
    expect(markup).not.toContain("helmet-crest");
    expect(markup).not.toContain("hood-face-shadow");
    expect(markup).not.toContain('class="mythic-flare"');
  });

  it("keeps the same anatomical fitted sleeve outline for every chest cut", () => {
    const representativeSets = [
      "wanderer",
      "argent",
      "ash-hunter",
      "comet",
      "lotus",
      "pilgrim",
    ];
    const pathsBySet = representativeSets.map((setId) =>
      fittedSleevePaths(render({ chest: equipment("chest", setId) })),
    );

    for (const paths of pathsBySet) expect(paths).toHaveLength(2);
    for (const paths of pathsBySet.slice(1)) expect(paths).toEqual(pathsBySet[0]);
  });

  it("keeps chest collars under equipped helmets", () => {
    for (const setId of ["wanderer", "argent", "ash-hunter", "comet", "lotus", "pilgrim"]) {
      const bareHead = render({ chest: equipment("chest", setId, "epic") });
      const coveredHead = render({
        chest: equipment("chest", setId, "epic"),
        head: equipment("head", setId, "epic"),
      });

      expect(bareHead).toContain('class="armor-collar"');
      expect(coveredHead).toContain('class="armor-collar"');
      expect(coveredHead.indexOf('data-slot="chest"')).toBeLessThan(coveredHead.indexOf('data-slot="head"'));
    }
  });

  it("uses classic, raised and ceremonial collar silhouettes across sets", () => {
    expect(render({ chest: equipment("chest", "wanderer", "epic") })).toContain("collar-high");
    expect(render({ chest: equipment("chest", "ash-hunter", "epic") })).toContain("collar-panel");
    expect(render({ chest: equipment("chest", "argent", "epic") })).toContain("collar-ceremonial");
  });

  it("extends asymmetric shoulder pieces beyond the common sleeve silhouette", () => {
    const markup = render({ chest: equipment("chest", "ash-hunter", "epic") });

    expect(markup).toContain("85 170");
    expect(markup).toContain("330 169");
  });

  it("renders Gunsmith sidearms as detailed mirrored pistols", () => {
    const markup = render(
      {
        weapon: equipment("weapon", "brass-storm", "legendary"),
        offhand: equipment("offhand", "brass-storm", "legendary"),
      },
      "Gunsmith",
    );
    const classLists = Array.from(markup.matchAll(/class="([^"]+)"/g), (match) =>
      match[1].split(/\s+/),
    );

    for (const className of [
      "pistol-barrel",
      "pistol-muzzle",
      "pistol-lock",
      "pistol-hammer",
      "pistol-trigger-guard",
      "pistol-stock",
    ]) {
      expect(classLists.filter((classes) => classes.includes(className))).toHaveLength(2);
    }
    expect(markup).toContain('transform="translate(420 0) scale(-1 1)"');
  });

  it("gives every equipment set its own palette, including the new shared loot sets", () => {
    const setIds = [
      "wanderer", "pilgrim", "ash-hunter", "argent", "sun-guard", "moth", "thorn",
      "comet", "oracle", "stone-bell", "lotus", "brass-storm", "silent-machine",
      "moon-scar", "ronin", "bastion", "wind", "astral", "crane", "powder", "dusk",
      "verdigris", "kingfisher", "prism", "saffron", "cobalt", "jade-viper",
      "blood-regent", "north-ranger", "ink-marshal", "white-squall",
      "marsh-lanterns", "ivory-choir", "coal-dragoons", "black-tide",
    ];
    const primaryColors = setIds.map((setId) => {
      const markup = render({ chest: equipment("chest", setId, "rare") });
      const color = markup.match(/--item-primary:(#[0-9a-f]{6})/i)?.[1];
      expect(color).toBeDefined();
      return color;
    });

    expect(new Set(primaryColors).size).toBe(setIds.length);
  });

  it("gives the new shared sets distinct silhouettes and class-appropriate weapons", () => {
    const marsh = render({
      chest: equipment("chest", "marsh-lanterns", "epic"),
      head: equipment("head", "marsh-lanterns", "epic"),
    });
    expect(marsh).toContain("cape-back");
    expect(marsh).toContain("layered-shoulders");
    expect(marsh).toContain("hood-shell");

    const choir = render({
      chest: equipment("chest", "ivory-choir", "legendary"),
      head: equipment("head", "ivory-choir", "legendary"),
    }, "Wizard");
    expect(choir).toContain("robe-cross");
    expect(choir).toContain("mask-cowl");
    expect(choir).toContain("collar-ceremonial");

    const dragoons = render({
      chest: equipment("chest", "coal-dragoons", "epic"),
      head: equipment("head", "coal-dragoons", "epic"),
    });
    expect(dragoons).toContain("longcoat-back");
    expect(dragoons).toContain("helmet-shell");
    expect(dragoons).toContain("86 170");

    const tide = render({
      chest: equipment("chest", "black-tide", "epic"),
      head: equipment("head", "black-tide", "epic"),
    }, "Archer");
    expect(tide).toContain("cape-back");
    expect(tide).toContain("hood-shell");
    expect(tide).toContain("85 170");

    expect(render({ weapon: equipment("weapon", "marsh-lanterns", "rare") }, "Knight")).toContain("blade-ridge");
    expect(render({ weapon: equipment("weapon", "marsh-lanterns", "rare") }, "Archer")).toContain("bow-limb");
    expect(render({ weapon: equipment("weapon", "marsh-lanterns", "rare") }, "Gunsmith")).toContain("pistol-barrel");
  });

  it("draws selected coats as one long garment with front tails and a back panel", () => {
    for (const setId of [
      "wanderer", "ash-hunter", "brass-storm", "silent-machine", "moon-scar",
      "powder", "cobalt", "blood-regent", "north-ranger", "ink-marshal", "white-squall",
    ]) {
      const markup = render({ chest: equipment("chest", setId, "epic") });
      expect(markup).toContain("longcoat-back");
      expect(markup).toContain("longcoat-front-left");
      expect(markup).toContain("longcoat-front-right");
      expect(markup).toContain("longcoat-lapel");
    }

    const trueCape = render({ chest: equipment("chest", "moth", "legendary") });
    expect(trueCape).toContain("cape-back");
    expect(trueCape).not.toContain("longcoat-front-left");

    const wanderer = render({ chest: equipment("chest", "wanderer", "epic") });
    expect(wanderer).toContain("L244 330");
    expect(wanderer).toContain("L244 300 L236 330 H184 L176 300");
    expect(wanderer).toContain("longcoat-waist");
    expect(wanderer).toContain("M173 312 H247");
    expect(wanderer).toContain("M176 328 H207");
    expect(wanderer).toContain("M244 328 H213");
    expect(wanderer).toContain("C146 410 152 342 176 328 Z");
    expect(wanderer).toContain("C274 410 268 342 244 328 Z");
    expect(wanderer).toContain("L244 330 C268 342 279 405 292 468");
    expect(wanderer).not.toContain("L244 330 L275 342");
    expect(wanderer).toContain("Q210 505 167 493");
    expect(wanderer).not.toContain("L216 359 L210 350 L204 359");
  });

  it("layers gloves over the chest while keeping leg equipment underneath it", () => {
    const markup = render({
      chest: equipment("chest", "wanderer", "epic"),
      hands: equipment("hands", "wanderer", "epic"),
      feet: equipment("feet", "wanderer", "epic"),
    });
    const feet = markup.indexOf('data-slot="feet"');
    const chest = markup.indexOf('data-slot="chest"');
    const hands = markup.indexOf('data-slot="hands"');

    expect(feet).toBeGreaterThan(-1);
    expect(chest).toBeGreaterThan(feet);
    expect(hands).toBeGreaterThan(chest);
  });

  it("frames the full hood mantle in head equipment icons", () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { createElement: () => fakeElement() },
    });

    try {
      const icon = createEquipmentIcon(
        "head",
        "Knight",
        "equipment-art",
        equipment("head", "wanderer", "mythic"),
      ) as unknown as FakeElement;
      const match = icon.innerHTML.match(/viewBox="([^"]+)"/);
      expect(match).not.toBeNull();

      const [x, y, width, height] = match![1].split(/\s+/).map(Number);
      expect(x).toBeLessThanOrEqual(157);
      expect(y).toBeLessThanOrEqual(9);
      expect(x + width).toBeGreaterThanOrEqual(263);
      expect(y + height).toBeGreaterThanOrEqual(154);
      expect(icon.innerHTML).toContain("hood-mantle");
    } finally {
      if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
      else delete (globalThis as { document?: Document }).document;
    }
  });

  it("keeps the collar visible in chest equipment icons", () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: { createElement: () => fakeElement() },
    });

    try {
      const icon = createEquipmentIcon(
        "chest",
        "Knight",
        "equipment-art",
        equipment("chest", "wanderer", "epic"),
      ) as unknown as FakeElement;
      expect(icon.innerHTML).toContain('class="armor-collar"');
      expect(icon.innerHTML).toContain('viewBox="70 88 280 427"');
    } finally {
      if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
      else delete (globalThis as { document?: Document }).document;
    }
  });
});
