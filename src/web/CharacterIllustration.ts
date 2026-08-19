import type {
  EquipmentSlot,
  HeroAppearance,
  HeroClass,
  Rarity,
} from "../gameplay/WorldTypes";

export interface DollEquipmentState {
  name: string;
  rarityColor: string;
  templateId: string;
  rarity: Rarity;
  setId?: string;
  visualClassId?: HeroClass;
}

type DollSlots = Partial<Record<EquipmentSlot, DollEquipmentState>>;
type ChestCut = "coat" | "plate" | "tunic" | "robe" | "haori" | "brigandine";
type HeadCut =
  | "hood"
  | "helmet"
  | "mask"
  | "hat"
  | "circlet"
  | "goggles"
  | "headband";
type ShoulderCut = "soft" | "guard" | "pauldron" | "layered" | "asymmetric";
type CollarCut = "classic" | "high" | "ceremonial";
type Motif =
  | "road"
  | "cross"
  | "sun"
  | "wing"
  | "thorn"
  | "star"
  | "clock"
  | "bell"
  | "lotus"
  | "gear"
  | "moon"
  | "knot";

interface VisualProfile {
  palette: number;
  chest: ChestCut;
  head: HeadCut;
  shoulders: ShoulderCut;
  motif: Motif;
  variant: number;
  outerwear?: "longcoat" | "cape";
  collar?: CollarCut;
}

const classPalettes: Record<
  HeroClass,
  { primary: string; secondary: string; dark: string }
> = {
  Knight: { primary: "#65717a", secondary: "#a8a69c", dark: "#30383c" },
  Archer: { primary: "#64704f", secondary: "#8b7357", dark: "#37402f" },
  Wizard: { primary: "#53617a", secondary: "#8b7b99", dark: "#252c3d" },
  Monk: { primary: "#9a6a3d", secondary: "#c0a069", dark: "#4b382b" },
  Gunsmith: { primary: "#755449", secondary: "#9b7b5d", dark: "#302d2b" },
  Swordsman: { primary: "#4c5b68", secondary: "#7d6c73", dark: "#292e32" },
};

const itemPalettes = [
  {
    primary: "#5b5043",
    secondary: "#93826a",
    dark: "#292722",
    accent: "#c9a868",
  },
  {
    primary: "#59646a",
    secondary: "#99a2a0",
    dark: "#293036",
    accent: "#d2a36b",
  },
  {
    primary: "#5a5550",
    secondary: "#8d7563",
    dark: "#2b2a28",
    accent: "#d28a5d",
  },
  {
    primary: "#687786",
    secondary: "#b3b6b0",
    dark: "#29343e",
    accent: "#d1b167",
  },
  {
    primary: "#a8782f",
    secondary: "#d0b46d",
    dark: "#4a351f",
    accent: "#e8d39c",
  },
  {
    primary: "#655268",
    secondary: "#968096",
    dark: "#302631",
    accent: "#d09a87",
  },
  {
    primary: "#486044",
    secondary: "#7b865c",
    dark: "#243226",
    accent: "#ce8c62",
  },
  {
    primary: "#3d3b5f",
    secondary: "#6f6380",
    dark: "#201f31",
    accent: "#c7c174",
  },
  {
    primary: "#3f6b6d",
    secondary: "#789398",
    dark: "#203637",
    accent: "#d49a62",
  },
  {
    primary: "#5b5c55",
    secondary: "#858976",
    dark: "#2d302c",
    accent: "#c59a52",
  },
  {
    primary: "#753f3e",
    secondary: "#a96d5b",
    dark: "#351f22",
    accent: "#d8b16b",
  },
  {
    primary: "#806a3b",
    secondary: "#5b6c72",
    dark: "#2d2b26",
    accent: "#e0bd68",
  },
  {
    primary: "#485b64",
    secondary: "#7d8c8e",
    dark: "#242b30",
    accent: "#cf7c63",
  },
  {
    primary: "#414c68",
    secondary: "#77718b",
    dark: "#222536",
    accent: "#d3c18d",
  },
  {
    primary: "#744b3e",
    secondary: "#a48568",
    dark: "#342824",
    accent: "#d4ba7c",
  },
  {
    primary: "#526577",
    secondary: "#8997a0",
    dark: "#26323a",
    accent: "#d0aa68",
  },
  {
    primary: "#64755c",
    secondary: "#91a89a",
    dark: "#2f4034",
    accent: "#9ec3cc",
  },
  {
    primary: "#4a5684",
    secondary: "#81799f",
    dark: "#242944",
    accent: "#d2ba69",
  },
  {
    primary: "#a89f86",
    secondary: "#d1c8ac",
    dark: "#34352f",
    accent: "#7f3432",
  },
  {
    primary: "#70483c",
    secondary: "#a46d50",
    dark: "#302522",
    accent: "#d4a45a",
  },
  {
    primary: "#465765",
    secondary: "#776373",
    dark: "#242b33",
    accent: "#ceae7a",
  },
  {
    primary: "#3f756d",
    secondary: "#a36b4c",
    dark: "#1f3936",
    accent: "#e0bc72",
  },
  {
    primary: "#2e638a",
    secondary: "#4c9792",
    dark: "#193447",
    accent: "#ea977c",
  },
  {
    primary: "#684f73",
    secondary: "#91b9a3",
    dark: "#31293e",
    accent: "#c8d56f",
  },
  {
    primary: "#b4772e",
    secondary: "#4d5680",
    dark: "#252b4c",
    accent: "#e7d8b2",
  },
  {
    primary: "#315681",
    secondary: "#d5c9ad",
    dark: "#192a40",
    accent: "#e38c45",
  },
  {
    primary: "#34705d",
    secondary: "#8e678c",
    dark: "#1e352f",
    accent: "#d4b96f",
  },
  {
    primary: "#68343b",
    secondary: "#a99d86",
    dark: "#211d20",
    accent: "#c39a55",
  },
  {
    primary: "#395660",
    secondary: "#74897c",
    dark: "#242b2c",
    accent: "#c59861",
  },
  {
    primary: "#2d3f5b",
    secondary: "#73434a",
    dark: "#181d27",
    accent: "#d1b76e",
  },
  {
    primary: "#b7b1a0",
    secondary: "#526976",
    dark: "#24282b",
    accent: "#a85d45",
  },
  {
    primary: "#6f675b",
    secondary: "#a79b82",
    dark: "#292724",
    accent: "#b66f4c",
  },
  {
    primary: "#315a72",
    secondary: "#8a9b94",
    dark: "#182d38",
    accent: "#d49a54",
  },
  {
    primary: "#704a52",
    secondary: "#b6aa91",
    dark: "#2d2227",
    accent: "#d2b56c",
  },
  {
    primary: "#506257",
    secondary: "#99927d",
    dark: "#26312c",
    accent: "#b98961",
  },
  {
    primary: "#4f5f68",
    secondary: "#8d806d",
    dark: "#252c31",
    accent: "#c9754f",
  },
  {
    primary: "#554566",
    secondary: "#7f8d86",
    dark: "#282331",
    accent: "#c89d5b",
  },
  {
    primary: "#35243f",
    secondary: "#d8c7a1",
    dark: "#15121a",
    accent: "#d6a93f",
  },
];

const profiles: Record<string, VisualProfile> = {
  wanderer: {
    palette: 0,
    chest: "coat",
    head: "hood",
    shoulders: "soft",
    motif: "road",
    variant: 0,
    outerwear: "longcoat",
    collar: "high",
  },
  pilgrim: {
    palette: 1,
    chest: "brigandine",
    head: "helmet",
    shoulders: "guard",
    motif: "cross",
    variant: 1,
  },
  "ash-hunter": {
    palette: 2,
    chest: "tunic",
    head: "hood",
    shoulders: "asymmetric",
    motif: "wing",
    variant: 2,
    outerwear: "longcoat",
  },
  argent: {
    palette: 3,
    chest: "plate",
    head: "helmet",
    shoulders: "layered",
    motif: "cross",
    variant: 3,
    collar: "ceremonial",
  },
  "sun-guard": {
    palette: 4,
    chest: "plate",
    head: "helmet",
    shoulders: "pauldron",
    motif: "sun",
    variant: 4,
    collar: "ceremonial",
  },
  moth: {
    palette: 5,
    chest: "coat",
    head: "mask",
    shoulders: "asymmetric",
    motif: "wing",
    variant: 5,
    outerwear: "cape",
  },
  thorn: {
    palette: 6,
    chest: "tunic",
    head: "hood",
    shoulders: "guard",
    motif: "thorn",
    variant: 6,
  },
  comet: {
    palette: 7,
    chest: "robe",
    head: "circlet",
    shoulders: "layered",
    motif: "star",
    variant: 7,
  },
  oracle: {
    palette: 8,
    chest: "robe",
    head: "goggles",
    shoulders: "guard",
    motif: "clock",
    variant: 8,
  },
  "stone-bell": {
    palette: 9,
    chest: "brigandine",
    head: "headband",
    shoulders: "soft",
    motif: "bell",
    variant: 9,
  },
  lotus: {
    palette: 10,
    chest: "haori",
    head: "headband",
    shoulders: "soft",
    motif: "lotus",
    variant: 10,
  },
  "brass-storm": {
    palette: 11,
    chest: "coat",
    head: "goggles",
    shoulders: "guard",
    motif: "gear",
    variant: 11,
    outerwear: "longcoat",
    collar: "ceremonial",
  },
  "silent-machine": {
    palette: 12,
    chest: "brigandine",
    head: "mask",
    shoulders: "asymmetric",
    motif: "gear",
    variant: 12,
    outerwear: "longcoat",
    collar: "high",
  },
  "moon-scar": {
    palette: 13,
    chest: "coat",
    head: "mask",
    shoulders: "guard",
    motif: "moon",
    variant: 13,
    outerwear: "longcoat",
    collar: "ceremonial",
  },
  ronin: {
    palette: 14,
    chest: "haori",
    head: "hat",
    shoulders: "soft",
    motif: "knot",
    variant: 14,
  },
  bastion: {
    palette: 15,
    chest: "plate",
    head: "helmet",
    shoulders: "pauldron",
    motif: "cross",
    variant: 15,
  },
  wind: {
    palette: 16,
    chest: "tunic",
    head: "mask",
    shoulders: "asymmetric",
    motif: "wing",
    variant: 16,
  },
  astral: {
    palette: 17,
    chest: "robe",
    head: "circlet",
    shoulders: "layered",
    motif: "star",
    variant: 17,
  },
  crane: {
    palette: 18,
    chest: "haori",
    head: "headband",
    shoulders: "soft",
    motif: "wing",
    variant: 18,
  },
  powder: {
    palette: 19,
    chest: "coat",
    head: "goggles",
    shoulders: "guard",
    motif: "gear",
    variant: 19,
    outerwear: "longcoat",
  },
  dusk: {
    palette: 20,
    chest: "brigandine",
    head: "mask",
    shoulders: "asymmetric",
    motif: "moon",
    variant: 20,
  },
  verdigris: {
    palette: 21,
    chest: "plate",
    head: "helmet",
    shoulders: "layered",
    motif: "knot",
    variant: 22,
  },
  kingfisher: {
    palette: 22,
    chest: "tunic",
    head: "hood",
    shoulders: "asymmetric",
    motif: "wing",
    variant: 23,
  },
  prism: {
    palette: 23,
    chest: "robe",
    head: "circlet",
    shoulders: "asymmetric",
    motif: "star",
    variant: 27,
  },
  saffron: {
    palette: 24,
    chest: "haori",
    head: "headband",
    shoulders: "soft",
    motif: "sun",
    variant: 30,
  },
  cobalt: {
    palette: 25,
    chest: "coat",
    head: "goggles",
    shoulders: "guard",
    motif: "gear",
    variant: 32,
    outerwear: "longcoat",
    collar: "high",
  },
  "jade-viper": {
    palette: 26,
    chest: "haori",
    head: "mask",
    shoulders: "asymmetric",
    motif: "thorn",
    variant: 34,
  },
  "blood-regent": {
    palette: 27,
    chest: "plate",
    head: "helmet",
    shoulders: "layered",
    motif: "cross",
    variant: 35,
    outerwear: "longcoat",
    collar: "ceremonial",
  },
  "north-ranger": {
    palette: 28,
    chest: "tunic",
    head: "hood",
    shoulders: "asymmetric",
    motif: "wing",
    variant: 36,
    outerwear: "longcoat",
    collar: "high",
  },
  "ink-marshal": {
    palette: 29,
    chest: "coat",
    head: "goggles",
    shoulders: "guard",
    motif: "gear",
    variant: 37,
    outerwear: "longcoat",
    collar: "ceremonial",
  },
  "white-squall": {
    palette: 30,
    chest: "coat",
    head: "mask",
    shoulders: "asymmetric",
    motif: "moon",
    variant: 38,
    outerwear: "longcoat",
    collar: "high",
  },
  "free-company": {
    palette: 31,
    chest: "coat",
    head: "hood",
    shoulders: "soft",
    motif: "road",
    variant: 41,
    outerwear: "longcoat",
    collar: "classic",
  },
  "storm-courier": {
    palette: 32,
    chest: "tunic",
    head: "hood",
    shoulders: "asymmetric",
    motif: "wing",
    variant: 42,
    outerwear: "cape",
  },
  "duelist-oath": {
    palette: 33,
    chest: "brigandine",
    head: "mask",
    shoulders: "layered",
    motif: "cross",
    variant: 43,
    collar: "ceremonial",
  },
  "quiet-scholar": {
    palette: 34,
    chest: "robe",
    head: "hood",
    shoulders: "soft",
    motif: "knot",
    variant: 44,
    collar: "high",
  },
  "border-watch": {
    palette: 35,
    chest: "brigandine",
    head: "helmet",
    shoulders: "guard",
    motif: "road",
    variant: 45,
    collar: "classic",
  },
  "ashen-circuit": {
    palette: 36,
    chest: "coat",
    head: "mask",
    shoulders: "asymmetric",
    motif: "gear",
    variant: 46,
    outerwear: "longcoat",
    collar: "high",
  },
  "crown-sovereign": {
    palette: 37,
    chest: "plate",
    head: "helmet",
    shoulders: "pauldron",
    motif: "sun",
    variant: 47,
    outerwear: "longcoat",
    collar: "ceremonial",
  },
};

const rarityTier: Record<Rarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
  mythic: 4,
};

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function profileFor(state: DollEquipmentState): VisualProfile {
  if (state.templateId === "boss-widow-mantle")
    return {
      palette: 20,
      chest: "plate",
      head: "hood",
      shoulders: "layered",
      motif: "moon",
      variant: 31,
      outerwear: "cape",
    };
  const known = profiles[state.setId ?? ""];
  if (known) return known;
  const hash = stableHash(state.templateId);
  const chests: ChestCut[] = [
    "coat",
    "plate",
    "tunic",
    "robe",
    "haori",
    "brigandine",
  ];
  const heads: HeadCut[] = [
    "hood",
    "helmet",
    "mask",
    "hat",
    "circlet",
    "goggles",
    "headband",
  ];
  const shoulders: ShoulderCut[] = [
    "soft",
    "guard",
    "pauldron",
    "layered",
    "asymmetric",
  ];
  const motifs: Motif[] = [
    "road",
    "cross",
    "sun",
    "wing",
    "thorn",
    "star",
    "clock",
    "bell",
    "lotus",
    "gear",
    "moon",
    "knot",
  ];
  return {
    palette: hash % itemPalettes.length,
    chest: chests[hash % chests.length],
    head: heads[(hash >>> 3) % heads.length],
    shoulders: shoulders[(hash >>> 5) % shoulders.length],
    motif: motifs[(hash >>> 7) % motifs.length],
    variant: hash % 37,
  };
}

function itemStyle(state?: DollEquipmentState): string {
  if (!state) return "";
  const palette = itemPalettes[profileFor(state).palette];
  return [
    `--item-primary:${palette.primary}`,
    `--item-secondary:${palette.secondary}`,
    `--item-dark:${palette.dark}`,
    `--item-accent:${palette.accent}`,
    `--rarity-color:${state.rarityColor}`,
  ].join(";");
}

const definitions = `
  <defs>
    <linearGradient id="skin" x1=".12" y1=".05" x2=".86" y2=".92"><stop stop-color="#d6a078"/><stop offset=".56" stop-color="#bd7e58"/><stop offset="1" stop-color="#8f573f"/></linearGradient>
    <linearGradient id="skin-light" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#e2b38e"/><stop offset="1" stop-color="#bd7b55"/></linearGradient>
    <linearGradient id="under" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#66645e"/><stop offset="1" stop-color="#363735"/></linearGradient>
    <linearGradient id="underlayer-main" x1=".15" y1="0" x2=".85" y2="1"><stop stop-color="#686861"/><stop offset=".52" stop-color="#4f504d"/><stop offset="1" stop-color="#343634"/></linearGradient>
    <linearGradient id="underlayer-light" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#8b8980"/><stop offset="1" stop-color="#555650"/></linearGradient>
    <linearGradient id="hair" x1=".08" y1="0" x2=".88" y2="1"><stop stop-color="#594737"/><stop offset=".55" stop-color="#3a2e26"/><stop offset="1" stop-color="#201b18"/></linearGradient>
  </defs>`;

const baseCharacter = `
  <ellipse class="doll-shadow" cx="210" cy="585" rx="79" ry="11"/>
  <g class="doll-base">
    <g class="hair-option hair-2"><path class="base-hair hair-back" d="M177 55 C174 24 189 7 211 7 C235 7 247 25 243 57 L247 132 Q230 150 210 137 Q190 150 173 132 Z"/></g>

    <path class="body-leg" d="M166 337 C153 367 151 404 157 438 C164 462 160 494 157 526 C162 542 181 547 190 532 C191 500 192 470 195 442 C201 406 201 371 192 344 C185 335 174 333 166 337 Z"/>
    <path class="body-leg body-right" d="M254 337 C267 367 269 404 263 438 C256 462 260 494 263 526 C258 542 239 547 230 532 C229 500 228 470 225 442 C219 406 219 371 228 344 C235 335 246 333 254 337 Z"/>
    <path class="body-leg-highlight" d="M169 349 C162 378 162 411 168 436 C174 454 170 492 169 518 Q176 531 184 520 C183 488 186 460 190 438 C195 403 194 372 187 350 Q178 341 169 349 Z"/>
    <path class="body-leg-highlight body-leg-highlight-right" d="M251 349 C258 378 258 411 252 436 C246 454 250 492 251 518 Q244 531 236 520 C237 488 234 460 230 438 C225 403 226 372 233 350 Q242 341 251 349 Z"/>
    <path class="body-calf-highlight" d="M160 447 Q176 458 190 445 L187 500 Q176 515 164 500 Z"/>
    <path class="body-calf-highlight body-calf-highlight-right" d="M260 447 Q244 458 230 445 L233 500 Q244 515 256 500 Z"/>
    <path class="body-boot" d="M158 520 Q174 514 187 533 L191 562 Q174 570 145 567 Q148 538 158 520 Z"/>
    <path class="body-boot body-right" d="M262 520 Q246 514 233 533 L229 562 Q246 570 275 567 Q272 538 262 520 Z"/>
    <path class="body-pelvis" d="M163 317 Q210 299 257 317 L251 371 Q210 388 169 371 Z"/>
    <path class="body-pelvis-shadow" d="M169 343 Q210 361 251 343 L250 372 Q210 388 170 372 Z"/>

    <path class="body-neck" d="M195 90 L193 133 Q210 145 227 133 L225 90 Z"/>
    <path class="body-neck-shadow" d="M211 94 L225 90 L227 133 Q219 140 211 141 Z"/>
    <path class="body-arm" d="M139 150 C121 145 106 158 101 180 C97 200 103 221 108 239 C111 259 105 286 103 314 C102 336 107 352 118 359 C128 363 136 354 135 342 C133 327 130 315 132 298 L144 216 C152 185 150 159 139 150 Z"/>
    <path class="body-arm body-arm-right" d="M281 150 C299 145 314 158 319 180 C323 200 317 221 312 239 C309 259 315 286 317 314 C318 336 313 352 302 359 C292 363 284 354 285 342 C287 327 290 315 288 298 L276 216 C268 185 270 159 281 150 Z"/>
    <path class="body-arm-light" d="M132 156 C117 164 111 183 114 206 C119 222 124 239 121 267 L113 319 C112 334 117 343 124 345 C130 339 128 327 126 314 L134 228 C143 197 145 169 132 156 Z"/>
    <path class="body-arm-light body-arm-light-right" d="M288 156 C303 164 309 183 306 206 C301 222 296 239 299 267 L307 319 C308 334 303 343 296 345 C290 339 292 327 294 314 L286 228 C277 197 275 169 288 156 Z"/>
    <path class="body-hand" d="M105 339 C101 346 101 357 106 366 C111 375 121 379 128 374 C134 369 134 359 131 350 C128 341 121 336 113 336 Q108 336 105 339 Z"/>
    <path class="body-hand body-hand-right" d="M315 339 C319 346 319 357 314 366 C309 375 299 379 292 374 C286 369 286 359 289 350 C292 341 299 336 307 336 Q312 336 315 339 Z"/>
    <path class="body-finger-line" d="M106 352 Q118 348 130 353 M314 352 Q302 348 290 353"/>

    <path class="base-under-torso" d="M154 150 Q179 136 192 124 Q210 145 228 124 Q241 136 266 150 C274 155 278 166 279 178 L263 244 L247 318 Q210 336 173 318 L157 244 L141 178 C142 166 146 155 154 150 Z"/>
    <path class="base-under-torso-light" d="M157 157 Q179 144 193 134 L205 151 L201 307 Q187 324 178 311 L164 241 L150 180 Q150 164 157 157 Z"/>
    <path class="body-trapezius-shadow" d="M155 155 Q181 136 192 124 Q210 145 228 124 Q239 136 265 155 Q236 146 210 164 Q184 146 155 155 Z"/>
    <path class="body-pectoral-shadow" d="M151 169 Q179 144 207 160 L205 214 Q177 229 149 207 Z M269 169 Q241 144 213 160 L215 214 Q243 229 271 207 Z"/>
    <path class="body-lat-shadow" d="M150 211 Q169 226 178 255 L179 300 Q160 276 150 211 Z M270 211 Q251 226 242 255 L241 300 Q260 276 270 211 Z"/>
    <path class="body-ab-shadow" d="M190 218 Q210 208 230 218 L234 305 Q210 324 186 305 Z"/>

    <path class="body-face" d="M181 48 C183 24 194 12 210 11 C226 12 237 24 239 48 L235 86 C230 106 220 118 210 121 C200 118 190 106 185 86 Z"/>
    <path class="body-ear" d="M182 55 C176 53 174 61 177 69 C179 75 182 75 185 71 Z M238 55 C244 53 246 61 243 69 C241 75 238 75 235 71 Z"/>
    <path class="body-lip-line" d="M199 94 L221 94"/>

    <g class="hair-option hair-0"><path class="base-hair" d="M181 51 C178 28 187 9 209 7 C229 5 241 21 240 47 Q224 29 202 31 Q190 35 181 51 Z"/><path class="base-hair-light" d="M189 28 Q209 11 232 25 Q208 18 190 36 Z"/></g>
    <g class="hair-option hair-1"><path class="base-hair" d="M181 49 C180 22 196 5 219 7 C235 9 243 22 240 47 Q224 27 199 31 L184 52 Z"/><path class="base-hair-light" d="M192 24 Q219 5 236 25 Q213 17 191 34 Z"/></g>
    <g class="hair-option hair-2"><path class="base-hair" d="M181 49 C179 23 192 7 212 7 C234 7 243 25 240 52 Q224 29 201 31 Q189 35 181 49 Z"/></g>
  </g>`;

function motif(profile: VisualProfile, x = 210, y = 263, scale = 1): string {
  const common = `class="set-emblem" transform="translate(${x} ${y}) scale(${scale})"`;
  const shapes: Record<Motif, string> = {
    road: `<path ${common} d="M-14 16 L0 -18 L14 16 M-7 3 L7 3"/>`,
    cross: `<path ${common} d="M-4 -18 H4 V-5 H17 V4 H4 V18 H-4 V4 H-17 V-5 H-4 Z"/>`,
    sun: `<g ${common}><circle cx="0" cy="0" r="8"/><path d="M0-20V-12 M0 12V20 M-20 0H-12 M12 0H20 M-14-14L-9-9 M14-14L9-9 M-14 14L-9 9 M14 14L9 9"/></g>`,
    wing: `<path ${common} d="M0 13 C-22 4-24-9-18-20 C-10-8-5-3 0 0 C5-3 10-8 18-20 C24-9 22 4 0 13 Z"/>`,
    thorn: `<path ${common} d="M0 19 C-10 5 12-1 0-19 M-4 10L-15 4 M5 1L16-7 M-4-9L-13-15"/>`,
    star: `<path ${common} d="M0-20L5-6L20 0L5 6L0 20L-5 6L-20 0L-5-6Z"/>`,
    clock: `<g ${common}><circle cx="0" cy="0" r="18"/><path d="M0-12V1L10 8 M0-23V-17 M23 0H17 M0 23V17 M-23 0H-17"/></g>`,
    bell: `<path ${common} d="M-15 10 Q-10 3-10-7 Q-9-20 0-20 Q9-20 10-7 Q10 3 15 10 Z M-20 12H20 M-5 17Q0 23 5 17"/>`,
    lotus: `<path ${common} d="M0 17 C-17 8-20-5-14-16 C-5-9-1-3 0 6 C1-3 5-9 14-16 C20-5 17 8 0 17 Z M-20 3Q0 26 20 3"/>`,
    gear: `<g ${common}><circle cx="0" cy="0" r="16"/><circle cx="0" cy="0" r="6"/><path d="M0-24V-16 M0 16V24 M-24 0H-16 M16 0H24 M-17-17L-11-11 M17-17L11-11 M-17 17L-11 11 M17 17L11 11"/></g>`,
    moon: `<path ${common} d="M12-20 C-8-16-12 10 6 19 C-20 17-25-15 0-23 C5-24 9-23 12-20 Z"/>`,
    knot: `<path ${common} d="M-17-8 C-7-22 7-22 17-8 C6-5 3 3 0 18 C-3 3-6-5-17-8 Z"/>`,
  };
  return shapes[profile.motif];
}

function shoulderMarkup(profile: VisualProfile, tier: number): string {
  if (profile.shoulders === "soft")
    return `<path class="cloth-shoulder" d="M160 149 C139 142 113 148 98 170 L105 204 C127 190 146 186 163 198 Z M260 149 C281 142 307 148 322 170 L315 204 C293 190 274 186 257 198 Z"/>`;
  if (profile.shoulders === "guard")
    return `<path class="armor-surface" d="M162 146 C137 137 108 144 94 171 L105 212 C128 194 147 187 164 201 Z M258 146 C283 137 312 144 326 171 L315 212 C292 194 273 187 256 201 Z"/><path class="shoulder-rim" d="M101 174 Q130 149 160 158 M319 174 Q290 149 260 158"/>`;
  if (profile.shoulders === "pauldron")
    return `<path class="item-dark" d="M164 143 C134 131 102 139 86 170 L96 220 C120 197 145 188 166 204 Z M256 143 C286 131 318 139 334 170 L324 220 C300 197 275 188 254 204 Z"/><path class="item-light" d="M160 152 C135 144 107 150 96 172 Q129 155 162 170 Z M260 152 C285 144 313 150 324 172 Q291 155 258 170 Z"/><path class="shoulder-rim" d="M96 184 Q129 158 162 171 M324 184 Q291 158 258 171"/>`;
  if (profile.shoulders === "layered")
    return `<g class="layered-shoulders"><path class="item-dark" d="M162 144 C133 134 103 142 88 170 L98 202 C121 183 144 177 164 190 Z M258 144 C287 134 317 142 332 170 L322 202 C299 183 276 177 256 190 Z"/><path class="item-main" d="M162 162 C138 154 111 161 98 185 L106 216 C127 198 146 191 165 205 Z M258 162 C282 154 309 161 322 185 L314 216 C293 198 274 191 255 205 Z"/><path class="shoulder-rim" d="M99 177 Q131 153 162 167 M321 177 Q289 153 258 167"/></g>`;
  return `<path class="item-dark" d="M164 143 C132 131 101 140 85 170 L96 220 C120 198 145 189 166 204 Z"/><path class="cloth-shoulder" d="M256 148 C282 139 312 146 330 169 L319 215 C299 196 276 189 256 202 Z"/>${tier >= 2 ? `<path class="item-light" d="M160 153 C134 146 105 153 95 179 Q128 159 162 174 Z"/>` : ""}`;
}

function fittedSleeves(className: string): string {
  return `<path class="${className} fitted-sleeve" d="M139 150 C121 145 106 158 101 180 C97 200 103 221 108 239 C111 259 105 286 103 314 C102 336 107 352 118 359 C128 363 136 354 135 342 C133 327 130 315 132 298 L144 216 C152 185 150 159 139 150 Z"/><path class="${className} fitted-sleeve fitted-sleeve-right" d="M281 150 C299 145 314 158 319 180 C323 200 317 221 312 239 C309 259 315 286 317 314 C318 336 313 352 302 359 C292 363 284 354 285 342 C287 327 290 315 288 298 L276 216 C268 185 270 159 281 150 Z"/>`;
}

function sleeveMarkup(profile: VisualProfile, tier: number): string {
  if (profile.chest === "coat")
    return `${fittedSleeves("coat-sleeve")}<path class="item-secondary sleeve-panel" d="M105 263 Q119 257 133 263 L131 320 Q118 331 104 325 Z M315 263 Q301 257 287 263 L289 320 Q302 331 316 325 Z"/>`;
  if (profile.chest === "robe")
    return `${fittedSleeves("robe-sleeve")}<path class="item-dark sleeve-cuff" d="M105 292 Q119 300 133 293 L131 326 Q118 338 104 329 Z M315 292 Q301 300 287 293 L289 326 Q302 338 316 329 Z"/>`;
  if (profile.chest === "haori")
    return `${fittedSleeves("haori-sleeve")}<path class="item-secondary sleeve-fold" d="M106 249 Q120 257 134 251 M314 249 Q300 257 286 251"/>`;
  if (profile.chest === "tunic")
    return `${fittedSleeves("tunic-sleeve")}<path class="item-secondary sleeve-panel" d="M103 207 Q120 218 138 209 L134 239 Q119 248 106 240 Z M317 207 Q300 218 282 209 L286 239 Q301 248 314 240 Z"/>${tier >= 2 ? `<path class="item-dark arm-brace" d="M106 235 Q120 228 134 235 L131 303 Q118 313 105 306 Z M314 235 Q300 228 286 235 L289 303 Q302 313 315 306 Z"/>` : ""}`;
  if (profile.chest === "plate")
    return `${fittedSleeves("mail-sleeve")}<path class="armor-surface arm-plate" d="M104 207 Q120 198 136 205 L133 267 Q119 278 106 270 Z M316 207 Q300 198 284 205 L287 267 Q301 278 314 270 Z"/>${tier >= 1 ? `<path class="item-light arm-ridge" d="M109 213 Q120 206 131 211 L130 256 Q119 265 109 258 Z M311 213 Q300 206 289 211 L290 256 Q301 265 311 258 Z"/>` : ""}`;
  return `${fittedSleeves("brigandine-sleeve")}<path class="item-dark sleeve-plate" d="M104 218 Q120 209 136 216 L133 275 Q119 286 106 278 Z M316 218 Q300 209 284 216 L287 275 Q301 286 314 278 Z"/>`;
}

function longCoatBack(tier: number): string {
  const lining =
    tier >= 2
      ? `<path class="longcoat-back-lining" d="M128 468 Q143 490 167 493 Q210 505 253 493 Q277 490 292 468 L283 455 Q254 480 210 491 Q166 480 137 455 Z"/>`
      : "";
  return `<path class="longcoat-back" d="M151 151 Q181 132 210 141 Q239 132 269 151 C274 205 271 249 260 286 L244 330 C268 342 279 405 292 468 Q277 490 253 493 Q210 505 167 493 Q143 490 128 468 C141 405 152 342 176 330 L160 286 C149 249 146 205 151 151 Z"/>${lining}`;
}

function longCoatTails(tier: number): string {
  const lining =
    tier >= 1
      ? `<path class="longcoat-lining" d="M197 330 L207 332 L200 468 Q194 475 185 479 L192 352 Z M223 330 L213 332 L220 468 Q226 475 235 479 L228 352 Z"/>`
      : "";
  const hem =
    tier >= 2
      ? `<path class="rarity-stroke longcoat-hem" d="M149 472 Q179 489 200 468 M271 472 Q241 489 220 468"/>`
      : "";
  return `<path class="longcoat-front longcoat-front-left" d="M176 328 H207 L200 468 Q179 490 148 472 C146 410 152 342 176 328 Z"/><path class="longcoat-front longcoat-front-right" d="M244 328 H213 L220 468 Q241 490 272 472 C274 410 268 342 244 328 Z"/><path class="longcoat-side-shadow" d="M176 328 H190 L171 456 Q160 474 148 472 C146 410 152 342 176 328 Z M244 328 H230 L249 456 Q260 474 272 472 C274 410 268 342 244 328 Z"/>${lining}${hem}`;
}

function longCoatWaist(): string {
  return `<path class="longcoat-waist" d="M173 312 H247 Q250 312 250 315 V333 Q250 336 247 336 H173 Q170 336 170 333 V315 Q170 312 173 312 Z"/>`;
}

function longCoatUpper(profile: VisualProfile, tier: number): string {
  const fastening =
    profile.variant % 3 === 0
      ? `<g class="longcoat-buttons"><circle cx="184" cy="260" r="3"/><circle cx="181" cy="281" r="3"/><circle cx="236" cy="260" r="3"/><circle cx="239" cy="281" r="3"/></g>`
      : profile.variant % 3 === 1
        ? `<path class="item-accent longcoat-fastening" d="M176 264 Q210 286 244 264"/>`
        : `<path class="item-line longcoat-fastening" d="M177 252 L198 282 M243 252 L222 282"/>`;
  const trim =
    tier >= 3
      ? `<path class="item-accent longcoat-piping" d="M158 148 L190 226 L176 306 Q183 319 207 332 M262 148 L230 226 L244 306 Q237 319 213 332"/>`
      : "";
  return `<path class="longcoat-lapel" d="M158 146 L188 137 L210 181 L190 226 L181 275 L176 306 L199 318 L207 326 Q187 321 171 302 L165 244 Z M262 146 L232 137 L210 181 L230 226 L239 275 L244 306 L221 318 L213 326 Q233 321 249 302 L255 244 Z"/><path class="item-line longcoat-seam" d="M190 226 L176 306 L199 318 M230 226 L244 306 L221 318"/>${fastening}${trim}`;
}

function chestBack(profile: VisualProfile, tier: number): string {
  if (profile.outerwear === "longcoat") return longCoatBack(tier);
  if (profile.outerwear === "cape")
    return `<path class="cape-back" d="M151 152 Q210 132 269 152 C278 216 278 298 273 350 L294 457 Q258 491 220 462 L210 344 L200 462 Q162 491 126 457 L147 350 C142 298 142 216 151 152 Z"/>${tier >= 2 ? `<path class="coat-lining" d="M136 440 Q168 468 199 443 L200 468 Q163 498 126 459 Z M284 440 Q252 468 221 443 L220 468 Q257 498 294 459 Z"/>` : ""}`;
  if (profile.chest === "coat")
    return `<path class="coat-back" d="M153 153 C185 134 235 134 267 153 C279 197 284 259 281 330 L302 473 C282 501 251 507 220 477 L210 355 L200 477 C169 507 138 501 118 473 L139 330 C136 259 141 197 153 153 Z"/>${tier >= 2 ? `<path class="coat-lining" d="M128 454 Q160 489 198 451 L200 483 Q164 516 118 478 Z M292 454 Q260 489 222 451 L220 483 Q256 516 302 478 Z"/>` : ""}`;
  if (profile.chest === "robe")
    return `<path class="coat-back" d="M151 150 Q210 130 269 150 C280 220 282 307 279 362 L298 487 Q255 519 210 489 Q165 519 122 487 L141 362 C138 307 140 220 151 150 Z"/>`;
  if (profile.chest === "haori")
    return `<path class="coat-back" d="M150 152 Q210 132 270 152 C278 215 278 291 274 347 L288 444 Q255 474 220 452 L210 351 L200 452 Q165 474 132 444 L146 347 C142 291 142 215 150 152 Z"/>`;
  return "";
}

function chestIdentity(profile: VisualProfile): string {
  switch (profile.variant % 7) {
    case 0:
      return `<path class="item-line harness" d="M170 190 L242 337 M250 188 L181 337"/>`;
    case 1:
      return `<path class="item-line harness" d="M170 205 Q210 225 250 205 M174 238 Q210 258 246 238"/><circle class="item-accent" cx="210" cy="225" r="6"/>`;
    case 2:
      return `<path class="item-line lacing" d="M198 194 L222 207 L198 220 L222 233 L198 246 L222 259"/>`;
    case 3:
      return `<path class="item-secondary scale-panel" d="M169 219 Q210 196 251 219 L246 306 Q210 331 174 306 Z"/><path class="item-line" d="M179 236 Q210 217 241 236 M176 258 Q210 238 244 258 M174 281 Q210 261 246 281"/>`;
    case 4:
      return `<path class="item-dark utility-strap" d="M163 205 L177 192 L253 316 L239 329 Z"/><path class="item-accent buckle" d="M195 241 L215 233 L226 252 L205 260 Z"/>`;
    case 5:
      return `<path class="item-secondary chest-bib" d="M177 178 Q210 159 243 178 L238 282 Q210 306 182 282 Z"/><path class="item-line" d="M188 197 H232 M186 222 H234 M184 247 H236"/>`;
    default:
      return `<path class="item-line piping" d="M170 184 Q210 210 250 184 M181 318 Q210 340 239 318"/><circle class="item-accent" cx="210" cy="210" r="5"/>`;
  }
}

function collarMarkup(profile: VisualProfile, tier: number): string {
  const collarCut: CollarCut =
    profile.collar ??
    (profile.chest === "plate"
      ? "ceremonial"
      : profile.chest === "robe"
        ? "high"
        : "classic");
  const raisedSurface =
    profile.chest === "plate" ? "armor-surface" : "item-dark";
  let collar = "";
  if (collarCut === "high") {
    collar = `<path class="${raisedSurface} collar-high" d="M168 154 L174 116 Q180 103 192 98 L208 139 L190 176 Z M252 154 L246 116 Q240 103 228 98 L212 139 L230 176 Z"/>${tier >= 2 ? `<path class="item-main collar-inset" d="M176 151 L180 120 Q185 111 192 108 L202 139 L190 164 Z M244 151 L240 120 Q235 111 228 108 L218 139 L230 164 Z"/>` : ""}`;
  } else if (collarCut === "ceremonial") {
    collar = `<path class="${raisedSurface} collar-ceremonial" d="M162 158 L167 118 Q176 101 190 94 L208 139 L186 179 Z M258 158 L253 118 Q244 101 230 94 L212 139 L234 179 Z"/><path class="item-main collar-inset" d="M171 153 L176 121 Q182 110 191 104 L202 140 L188 168 Z M249 153 L244 121 Q238 110 229 104 L218 140 L232 168 Z"/>`;
  } else if (profile.outerwear === "longcoat") {
    collar = `<path class="item-dark collar-panel" d="M177 151 L184 127 L197 118 L210 143 L194 166 Z M243 151 L236 127 L223 118 L210 143 L226 166 Z"/>`;
  } else if (profile.outerwear === "cape") {
    collar = `<path class="item-dark collar-wrap" d="M171 151 Q183 127 198 116 L214 143 L193 170 Z M249 151 Q237 127 222 116 L206 143 L227 170 Z"/>`;
  } else if (profile.chest === "coat") {
    collar = `<path class="item-dark collar-panel" d="M180 150 L187 128 L199 120 L210 143 L195 163 Z M240 150 L233 128 L221 120 L210 143 L225 163 Z"/>`;
  } else if (profile.chest === "plate") {
    collar = `<path class="item-dark collar-gorget" fill-rule="evenodd" d="M178 148 L188 124 Q210 111 232 124 L242 148 L230 166 L210 176 L190 166 Z M195 133 Q210 126 225 133 L221 148 L210 154 L199 148 Z"/>`;
  } else if (profile.chest === "tunic") {
    collar = `<path class="item-main collar-soft" d="M181 148 Q184 128 198 122 L210 143 L195 159 Z M239 148 Q236 128 222 122 L210 143 L225 159 Z"/>`;
  } else if (profile.chest === "robe") {
    collar = `<path class="item-dark collar-wrap" d="M174 151 Q184 129 199 118 L214 143 L194 169 Z M246 151 Q236 129 221 118 L207 143 L226 169 Z"/>`;
  } else if (profile.chest === "haori") {
    collar = `<path class="item-dark collar-wrap" d="M177 151 L193 121 L212 143 L197 171 Z M243 151 L227 121 L208 143 L223 171 Z"/>`;
  } else {
    collar = `<path class="item-dark collar-gorget" d="M181 147 L188 125 Q210 115 232 125 L239 147 L228 162 L214 168 L210 157 L206 168 L192 162 Z"/>`;
  }
  const detail =
    tier >= 3
      ? `<circle class="item-accent collar-clasp" cx="210" cy="153" r="3"/>`
      : "";
  return `<g class="armor-collar">${collar}${detail}</g>`;
}

function chestFront(
  profile: VisualProfile,
  tier: number,
  showCollar = true,
): string {
  const sleeves = sleeveMarkup(profile, tier);
  const shoulders = shoulderMarkup(profile, tier);
  let body = "";
  if (profile.chest === "coat") {
    body =
      profile.outerwear === "longcoat"
        ? `<path class="coat-front" d="M159 143 Q183 130 210 144 Q237 130 261 143 L260 192 L254 246 L244 300 L236 330 H184 L176 300 L166 246 L160 192 Z"/><path class="item-secondary coat-shirt" d="M188 139 Q210 132 232 139 L228 237 L210 260 L192 237 Z"/>`
        : `<path class="coat-front" d="M159 143 Q183 130 210 144 Q237 130 261 143 C269 173 270 211 266 250 L255 310 Q246 332 238 342 H182 Q174 332 165 310 L154 250 C150 211 151 173 159 143 Z"/><path class="item-secondary coat-shirt" d="M188 139 Q210 132 232 139 L228 237 L210 260 L192 237 Z"/><path class="item-dark coat-lapel" d="M158 148 L188 137 L210 181 L190 226 L161 202 Z M262 148 L232 137 L210 181 L230 226 L259 202 Z"/><path class="coat-front coat-skirt" d="M174 314 L207 333 L202 455 L158 480 L168 348 Z M246 314 L213 333 L218 455 L262 480 L252 348 Z"/><path class="item-secondary coat-panel" d="M178 335 L201 345 L196 447 L166 465 Z M242 335 L219 345 L224 447 L254 465 Z"/><path class="item-line coat-seam" d="M190 229 L180 335 L172 452 M230 229 L240 335 L248 452"/>`;
  } else if (profile.chest === "plate") {
    body = `<path class="armor-surface cuirass-shell" d="M159 145 Q183 132 210 145 Q237 132 261 145 L269 203 L259 267 L243 319 H177 L161 267 L151 203 Z"/><path class="item-light armor-plane" d="M163 153 Q184 140 207 150 L204 269 L181 307 L166 261 L158 207 Z"/><path class="item-main armor-plane" d="M257 153 Q236 140 213 150 L216 269 L239 307 L254 261 L262 207 Z"/><path class="item-secondary armor-lamella" d="M176 279 Q210 292 244 279 L241 302 Q210 316 179 302 Z M178 304 Q210 318 242 304 L239 326 Q210 339 181 326 Z"/><path class="item-dark fauld" d="M177 326 H243 L251 365 L231 377 L210 360 L189 377 L169 365 Z"/>`;
  } else if (profile.chest === "tunic") {
    body = `<path class="coat-front" d="M159 144 Q183 132 210 144 Q237 132 261 144 L268 249 L252 321 L239 337 H181 L168 321 L152 249 Z"/><path class="item-dark leather-vest" d="M169 147 L198 137 L210 184 L222 137 L251 147 L246 299 Q210 324 174 299 Z"/><path class="item-secondary skirt-panel" d="M179 316 L207 333 L201 430 L165 451 L174 342 Z M241 316 L213 333 L219 430 L255 451 L246 342 Z"/><path class="item-line" d="M207 335 L202 420 M213 335 L218 420"/>`;
  } else if (profile.chest === "robe") {
    body = `<path class="coat-front" d="M158 143 Q184 130 210 144 Q236 130 262 143 L270 273 L260 337 L258 466 L219 486 L210 454 L201 486 L162 466 L160 337 L150 273 Z"/><path class="item-dark robe-cross" d="M158 149 L201 135 L226 210 L184 315 L154 280 Z M262 149 L226 136 L207 185 L238 272 L266 239 Z"/><path class="item-secondary robe-panel" d="M183 313 L236 272 L252 455 L220 475 L210 442 L200 475 L168 455 Z"/><path class="item-line" d="M177 343 Q210 360 243 343"/>`;
  } else if (profile.chest === "haori") {
    body = `<path class="coat-front" d="M158 143 Q184 131 210 144 Q236 131 262 143 L272 280 L258 324 L251 431 L218 450 L210 420 L202 450 L169 431 L162 324 L148 280 Z"/><path class="item-light haori-left" d="M158 149 L201 136 L222 181 L184 316 L153 278 Z"/><path class="item-main haori-right" d="M262 149 L219 136 L199 181 L236 316 L267 278 Z"/><path class="item-dark sash" d="M164 302 Q210 318 256 302 L254 335 Q210 350 166 335 Z"/><path class="item-secondary" d="M173 334 L205 344 L201 425 L176 438 Z M247 334 L215 344 L219 425 L244 438 Z"/>`;
  } else {
    body = `<path class="armor-surface" d="M158 144 Q183 131 210 144 Q237 131 262 144 L270 264 L253 326 L244 400 L214 420 L210 391 L206 420 L176 400 L167 326 L150 264 Z"/><path class="item-dark brigandine-side" d="M158 149 L180 137 L190 321 L181 393 L158 379 L149 248 Z M262 149 L240 137 L230 321 L239 393 L262 379 L271 248 Z"/><path class="item-main brigandine-core" d="M180 137 Q210 128 240 137 L230 321 L210 345 L190 321 Z"/><path class="item-secondary brigandine-skirt" d="M181 320 L207 340 L203 402 L178 415 L174 342 Z M239 320 L213 340 L217 402 L242 415 L246 342 Z"/>`;
  }
  const outerwearTails =
    profile.outerwear === "longcoat" ? longCoatTails(tier) : "";
  const outerwearUpper =
    profile.outerwear === "longcoat" ? longCoatUpper(profile, tier) : "";
  const outerwearWaist =
    profile.outerwear === "longcoat" ? longCoatWaist() : "";
  const collar = showCollar ? collarMarkup(profile, tier) : "";
  const trim =
    tier >= 1 && profile.outerwear !== "longcoat"
      ? `<path class="rarity-stroke chest-trim" d="M169 317 Q210 334 251 317 M176 342 L168 413 M244 342 L252 413"/>`
      : "";
  const reinforcement =
    tier >= 2
      ? profile.chest === "plate" || profile.chest === "brigandine"
        ? `<path class="item-light chest-reinforcement" d="M181 195 Q210 177 239 195 L235 258 Q210 277 185 258 Z"/>`
        : `<path class="item-secondary chest-reinforcement" d="M184 193 Q210 177 236 193 L232 266 Q210 284 188 266 Z"/>`
      : "";
  const emblem =
    tier >= 2 ? motif(profile, 210, 232, tier >= 4 ? 0.92 : 0.68) : "";
  const legendary =
    tier >= 3
      ? `<path class="item-accent ceremonial-chain" d="M169 185 Q210 216 251 185"/><circle class="item-accent" cx="210" cy="215" r="4.5"/>`
      : "";
  const mythic =
    tier >= 4
      ? `<path class="mythic-flare" d="M173 155 L164 130 L186 147 M247 155 L256 130 L234 147"/><path class="rarity-stroke" d="M187 290 Q210 307 233 290"/>`
      : "";
  return `${sleeves}${shoulders}${outerwearTails}${body}${outerwearUpper}${collar}${reinforcement}${chestIdentity(profile)}${outerwearWaist}${trim}${emblem}${legendary}${mythic}`;
}

function headFront(profile: VisualProfile, tier: number): string {
  let head = "";
  if (profile.head === "hood")
    head = `<path class="item-dark hood-mantle" d="M184 111 Q175 132 157 153 Q181 148 198 164 L210 177 L222 164 Q239 148 263 153 Q245 132 236 111 Q225 125 210 132 Q195 125 184 111 Z"/><path class="item-main hood-mantle-panel" d="M181 124 Q174 140 162 151 Q184 148 199 166 L207 174 L197 143 Z M239 124 Q246 140 258 151 Q236 148 221 166 L213 174 L223 143 Z"/><path class="item-dark hood-shell" fill-rule="evenodd" d="M210 5 L229 15 Q243 29 247 50 L251 83 Q251 111 235 132 L263 153 Q238 148 221 166 L210 178 L199 166 Q182 148 157 153 L185 132 Q169 111 169 83 L173 50 Q177 29 191 15 Z M210 29 Q224 30 232 43 Q238 58 236 78 Q234 101 220 115 L244 160 L226 172 L210 190 L194 172 L176 160 L200 115 Q186 101 184 78 Q182 58 188 43 Q196 30 210 29 Z"/><path class="hood-fold hood-fold-left" d="M181 96 Q174 67 181 42 L193 19 M179 129 Q190 139 199 153"/><path class="hood-fold hood-fold-right" d="M239 96 Q246 67 239 42 L227 19 M241 129 Q230 139 221 153"/>`;
  else if (profile.head === "helmet")
    head = `<path class="item-dark helmet-shell" d="M174 61 C176 25 190 8 210 7 C230 8 244 25 246 61 L241 119 L227 137 H193 L179 119 Z"/><path class="item-main helmet-plane" d="M183 59 Q210 35 237 59 L234 88 H186 Z"/><path class="item-light helmet-faceplate" d="M185 89 H235 L231 119 L222 130 H198 L189 119 Z"/><path class="visor-slit" d="M192 101 Q210 94 228 101"/>`;
  else if (profile.head === "mask")
    head = `<path class="item-dark mask-cowl" d="M176 64 C178 27 191 12 210 9 C229 12 242 27 244 64 L237 91 Q210 80 183 91 Z"/><path class="item-main face-mask" d="M183 82 Q210 72 237 82 L232 122 L210 136 L188 122 Z"/><path class="visor-slit" d="M191 94 L203 91 M217 91 L229 94"/>`;
  else if (profile.head === "hat")
    head = `<path class="item-dark" d="M143 57 Q210 12 277 57 Q264 75 210 78 Q156 75 143 57 Z"/><path class="item-main" d="M181 56 Q187 19 210 14 Q233 19 239 56 Q210 66 181 56 Z"/>`;
  else if (profile.head === "circlet")
    head = `<path class="item-main circlet" d="M181 58 Q210 45 239 58 L234 70 Q210 61 186 70 Z"/>${motif(profile, 210, 57, 0.32)}`;
  else if (profile.head === "goggles")
    head = `<path class="item-dark goggle-strap" d="M179 65 Q210 54 241 65 L239 76 Q210 65 181 76 Z"/><circle class="item-main goggle" cx="196" cy="70" r="10"/><circle class="item-main goggle" cx="224" cy="70" r="10"/><circle class="item-accent" cx="196" cy="70" r="5"/><circle class="item-accent" cx="224" cy="70" r="5"/>`;
  else
    head = `<path class="item-main headband" d="M180 58 Q210 45 240 58 L238 70 Q210 61 182 70 Z"/><path class="item-accent" d="M236 64 L257 78 L251 86 L234 72 Z"/>`;
  const rare =
    tier >= 1
      ? profile.head === "hood"
        ? `<path class="rarity-stroke hood-embroidery" d="M180 91 L177 53 Q181 28 210 10 Q239 28 243 53 L240 91"/>`
        : `<path class="rarity-stroke helmet-trim" d="M184 82 Q210 71 236 82"/>`
      : "";
  const epic =
    tier >= 2 && profile.head !== "circlet"
      ? profile.head === "hood"
        ? motif(profile, 210, 165, 0.18)
        : motif(profile, 210, 53, 0.3)
      : "";
  const legendary =
    tier >= 3
      ? profile.head === "hood"
        ? `<path class="item-accent hood-cord" d="M179 128 Q184 143 193 152 M241 128 Q236 143 227 152"/><circle class="item-accent hood-clasp" cx="193" cy="152" r="3.5"/><circle class="item-accent hood-clasp" cx="227" cy="152" r="3.5"/>`
        : `<path class="item-accent helmet-crest" d="M205 14 L210 -5 L215 14 L210 30 Z"/>`
      : "";
  const mythic =
    tier >= 4
      ? profile.head === "hood"
        ? `<path class="mythic-flare hood-mythic-trim" d="M173 88 Q174 116 190 132 L175 144 M247 88 Q246 116 230 132 L245 144"/>`
        : `<path class="mythic-flare" d="M184 28 L170 9 L190 20 M236 28 L250 9 L230 20"/>`
      : "";
  return head + rare + epic + legendary + mythic;
}

function handsFront(profile: VisualProfile, tier: number): string {
  const plated = profile.chest === "plate" || profile.chest === "brigandine";
  const base = plated
    ? `<path class="item-dark gauntlet-cuff" d="M104 278 Q118 270 133 278 L131 337 L105 337 Z M316 278 Q302 270 287 278 L289 337 L315 337 Z"/><path class="item-main gauntlet-cuff-face" d="M108 286 Q119 279 130 285 L129 329 L107 334 Z M312 286 Q301 279 290 285 L291 329 L313 334 Z"/><path class="item-dark compact-glove" d="M102 330 Q117 322 132 331 L135 346 Q136 361 126 369 Q116 377 106 370 Q99 363 99 350 Z M318 330 Q303 322 288 331 L285 346 Q284 361 294 369 Q304 377 314 370 Q321 363 321 350 Z"/><path class="item-light gauntlet-knuckles" d="M103 341 Q117 334 132 342 L133 352 Q118 360 102 353 Z M317 341 Q303 334 288 342 L287 352 Q302 360 318 353 Z"/>`
    : `<path class="item-main gauntlet-cuff" d="M105 289 Q118 280 132 289 L130 337 L105 337 Z M315 289 Q302 280 288 289 L290 337 L315 337 Z"/><path class="item-dark" d="M105 313 L131 306 L130 327 L105 334 Z M315 313 L289 306 L290 327 L315 334 Z"/><path class="item-main compact-glove" d="M102 330 Q117 322 132 331 L135 346 Q136 361 126 369 Q116 377 106 370 Q99 363 99 350 Z M318 330 Q303 322 288 331 L285 346 Q284 361 294 369 Q304 377 314 370 Q321 363 321 350 Z"/>`;
  const epic =
    tier >= 2
      ? `<path class="item-light gauntlet-plate" d="M108 293 L124 283 L132 292 L129 322 L106 329 Z M312 293 L296 283 L288 292 L291 322 L314 329 Z"/>`
      : "";
  const legendary =
    tier >= 3
      ? motif(profile, 116, 310, 0.26) + motif(profile, 304, 310, 0.26)
      : "";
  return base + epic + legendary;
}

function feetFront(profile: VisualProfile, tier: number): string {
  const plated = profile.chest === "plate" || profile.chest === "brigandine";
  const trousers = `<path class="${plated ? "item-dark" : "item-main"} fitted-trousers" d="M163 317 Q184 309 203 325 L198 373 C201 397 200 417 195 442 C191 472 191 505 188 534 L191 562 Q173 570 145 566 L151 535 C155 505 160 469 157 440 C151 406 153 369 164 337 Z M257 317 Q236 309 217 325 L222 373 C219 397 220 417 225 442 C229 472 229 505 232 534 L229 562 Q247 570 275 566 L269 535 C265 505 260 469 263 440 C269 406 267 369 256 337 Z"/><path class="${plated ? "item-main" : "item-dark"} trouser-waist" d="M163 317 Q210 302 257 317 L251 371 Q210 387 169 371 Z"/>`;
  const protection = plated
    ? `<path class="item-main thigh-plate" d="M168 335 Q184 324 198 340 L195 421 Q178 435 161 421 L160 370 Z M252 335 Q236 324 222 340 L225 421 Q242 435 259 421 L260 370 Z"/><path class="item-light greave-plate" d="M160 430 Q177 420 192 433 L187 514 Q173 527 157 515 Z M260 430 Q243 420 228 433 L233 514 Q247 527 263 515 Z"/><path class="item-light sabaton" d="M151 526 L186 529 L191 562 Q173 569 145 566 Z M269 526 L234 529 L229 562 Q247 569 275 566 Z"/>`
    : `<path class="item-secondary trouser-panel" d="M169 337 Q184 327 196 340 L190 520 Q177 532 163 518 L160 441 Q155 382 169 337 Z M251 337 Q236 327 224 340 L230 520 Q243 532 257 518 L260 441 Q265 382 251 337 Z"/><path class="item-dark fitted-boot" d="M153 499 Q174 490 188 505 L186 540 L191 562 Q173 569 145 566 L151 535 Z M267 499 Q246 490 232 505 L234 540 L229 562 Q247 569 275 566 L269 535 Z"/>`;
  const rare =
    tier >= 1
      ? `<path class="rarity-stroke boot-straps" d="M161 390 Q179 399 196 388 M159 458 Q176 468 191 456 M259 390 Q241 399 224 388 M261 458 Q244 468 229 456"/>`
      : "";
  const epic =
    tier >= 2
      ? `<path class="item-accent" d="M176 341 H187 L185 409 H174 Z M244 341 H233 L235 409 H246 Z"/>`
      : "";
  return trousers + protection + rare + epic;
}

function sword(
  profile: VisualProfile,
  side: "left" | "right",
  tier: number,
): string {
  const mirror =
    side === "right" ? `transform="translate(420 0) scale(-1 1)"` : "";
  const curve = profile.variant % 3;
  const blade =
    curve === 0
      ? `M56 174 L76 174 L72 524 L65 558 L58 524 Z`
      : curve === 1
        ? `M56 174 L76 174 Q78 400 64 558 L54 558 Q63 392 56 174 Z`
        : `M55 174 L77 174 L72 529 L65 559 L58 529 Z`;
  return `<g class="side-weapon" ${mirror}><path class="blade" d="${blade}"/><path class="blade-ridge" d="M66 190 L65 523"/><path class="item-dark weapon-grip" d="M59 112 H73 L75 170 H57 Z"/><path class="item-accent weapon-guard" d="M37 164 H95 L96 176 H36 Z"/><path class="item-accent" d="M58 99 Q66 88 74 99 L71 116 H61 Z"/>${tier >= 2 ? motif(profile, 66, 142, 0.24) : ""}${tier >= 3 ? `<path class="rarity-stroke" d="M68 194 L67 500"/>` : ""}</g>`;
}

function shield(profile: VisualProfile, tier: number): string {
  const shape = profile.variant % 3;
  const base =
    shape === 0
      ? `<path class="item-dark" d="M333 176 Q363 158 393 177 C391 258 394 390 386 446 Q363 484 340 446 C332 389 335 258 333 176 Z"/><path class="shield-face" d="M341 185 Q363 171 385 186 C383 260 386 381 380 432 Q363 460 346 432 C340 380 343 260 341 185 Z"/>`
      : shape === 1
        ? `<path class="item-dark" d="M336 166 Q363 154 390 166 L397 244 Q391 404 363 472 Q335 404 329 244 Z"/><path class="shield-face" d="M343 177 Q363 168 383 177 L388 246 Q384 382 363 445 Q342 382 338 246 Z"/>`
        : `<ellipse class="item-dark" cx="363" cy="322" rx="48" ry="123"/><ellipse class="shield-face" cx="363" cy="322" rx="39" ry="107"/>`;
  return `${base}<path class="item-light shield-boss" d="M350 299 Q363 284 376 299 L374 339 Q363 357 352 339 Z"/>${tier >= 1 ? `<path class="rarity-stroke" d="M345 222 Q363 205 381 222 M345 414 Q363 435 381 414"/>` : ""}${tier >= 2 ? motif(profile, 363, 321, 0.55) : ""}${tier >= 4 ? `<path class="mythic-flare" d="M341 181 L334 155 L349 174 M385 181 L392 155 L377 174"/>` : ""}`;
}

function bow(profile: VisualProfile, tier: number): string {
  return `<g class="side-weapon"><path class="bow-limb" d="M72 128 C33 198 31 338 67 460 C77 494 90 523 105 548"/><path class="bow-string" d="M72 128 L105 548 L44 330 Z"/><path class="item-main" d="M42 304 L58 299 L62 338 L45 344 Z"/>${tier >= 2 ? motif(profile, 51, 322, 0.27) : ""}</g>`;
}

function staff(profile: VisualProfile, tier: number): string {
  return `<g class="side-weapon"><path class="staff-shaft" d="M67 132 C61 268 68 423 62 566"/><path class="item-dark" d="M39 132 Q65 78 91 132 Q65 116 39 132 Z"/><circle class="item-accent" cx="65" cy="111" r="13"/>${tier >= 2 ? motif(profile, 65, 111, 0.36) : ""}${tier >= 4 ? `<path class="mythic-flare" d="M38 99 L22 78 L47 91 M92 99 L108 78 L83 91"/>` : ""}</g>`;
}

function pistol(
  profile: VisualProfile,
  side: "left" | "right",
  tier: number,
): string {
  const mirror =
    side === "right" ? `transform="translate(420 0) scale(-1 1)"` : "";
  const engraving =
    tier >= 1
      ? `<path class="rarity-stroke pistol-barrel-engraving" d="M62 184 L59 293"/>`
      : "";
  const inlay =
    tier >= 3
      ? `<path class="rarity-stroke pistol-stock-inlay" d="M59 374 C65 396 66 421 56 447"/>`
      : "";
  const flare =
    tier >= 4
      ? `<path class="mythic-flare pistol-mythic-flare" d="M47 139 L38 123 L53 135 M78 138 L87 121 L72 134"/>`
      : "";

  return `<g class="side-weapon pistol" ${mirror}>
    <path class="wood pistol-stock" d="M51 314 Q65 307 80 315 L87 331 L84 355 Q75 362 68 367 C76 385 83 408 80 428 C78 446 68 461 54 471 C42 468 38 457 43 446 C52 429 57 413 55 395 C53 378 47 365 42 352 L44 328 Z"/>
    <path class="pistol-stock-shadow" d="M61 366 C70 390 75 414 71 431 C68 444 61 454 53 461 C48 458 47 452 50 445 C58 427 62 409 60 392 C59 382 57 373 54 366 Z"/>
    <path class="item-dark pistol-barrel-shadow" d="M47 140 L77 138 L81 153 L73 330 L53 332 L48 154 Z"/>
    <path class="metal pistol-barrel" d="M54 155 L74 153 L68 322 L58 323 Z"/>
    <path class="pistol-barrel-highlight" d="M58 163 L70 161 L65 312"/>
    <path class="item-accent pistol-muzzle" d="M46 139 L78 137 L81 153 L48 155 Z"/>
    <path class="item-dark pistol-breech" d="M46 316 Q64 308 81 316 L86 339 Q66 350 45 340 Z"/>
    <path class="metal pistol-lock" d="M51 325 Q65 317 78 323 L80 344 Q65 352 51 343 Z"/>
    <circle class="item-accent pistol-lock-pin" cx="64" cy="335" r="4"/>
    <path class="metal pistol-hammer" d="M76 326 Q81 307 91 306 L101 315 L94 326 L85 322 L82 342 L74 339 Z"/>
    <path class="item-light pistol-flint" d="M88 305 L99 309 L96 317 L86 313 Z"/>
    <path class="pistol-trigger-guard" d="M69 355 C90 351 97 364 91 380 C87 391 75 394 68 384"/>
    <path class="pistol-trigger" d="M76 358 Q77 371 71 378"/>
    <path class="pistol-ramrod" d="M78 164 L71 309"/>
    ${engraving}${inlay}${tier >= 2 ? motif(profile, 61, 414, 0.22) : ""}${flare}
  </g>`;
}

function monkWeapon(profile: VisualProfile, tier: number): string {
  return `<g class="side-weapon"><path class="item-dark" d="M48 166 Q65 149 82 166 L78 486 Q65 505 52 486 Z"/><path class="item-main" d="M52 184 H78 L77 454 H53 Z"/>${tier >= 2 ? motif(profile, 65, 320, 0.3) : ""}</g>`;
}

function offhandSpecial(
  profile: VisualProfile,
  classId: HeroClass,
  tier: number,
): string {
  if (classId === "Knight") return shield(profile, tier);
  if (classId === "Swordsman") return sword(profile, "right", tier);
  if (classId === "Archer")
    return `<path class="item-dark" d="M337 164 Q355 149 374 165 L386 462 Q363 486 342 462 Z"/><path class="item-main" d="M345 174 Q357 164 368 174 L377 448 Q363 465 350 449 Z"/><path class="metal" d="M347 170 L342 116 M357 168 L357 110 M368 170 L374 117"/>`;
  if (classId === "Wizard")
    return `<path class="item-dark" d="M356 164 H370 L372 486 H354 Z"/><circle class="item-dark" cx="363" cy="142" r="29"/><circle class="item-main" cx="363" cy="142" r="21"/><circle class="item-accent" cx="363" cy="142" r="9"/>${tier >= 2 ? motif(profile, 363, 142, 0.32) : ""}`;
  if (classId === "Monk")
    return `<path class="bead-stroke" d="M352 170 C387 221 386 404 351 470 C337 496 346 522 366 513"/>${tier >= 2 ? motif(profile, 357, 323, 0.3) : ""}`;
  return pistol(profile, "right", tier);
}

function weaponFront(
  profile: VisualProfile,
  classId: HeroClass,
  tier: number,
  offhand = false,
): string {
  if (offhand) return offhandSpecial(profile, classId, tier);
  if (classId === "Knight" || classId === "Swordsman")
    return sword(profile, "left", tier);
  if (classId === "Archer") return bow(profile, tier);
  if (classId === "Wizard") return staff(profile, tier);
  if (classId === "Monk") return monkWeapon(profile, tier);
  return pistol(profile, "left", tier);
}

function itemArtwork(
  slot: EquipmentSlot,
  state: DollEquipmentState,
  classId: HeroClass,
  showChestCollar = true,
): string {
  const profile = profileFor(state);
  const tier = rarityTier[state.rarity];
  if (slot === "chest") return chestFront(profile, tier, showChestCollar);
  if (slot === "head") return headFront(profile, tier);
  if (slot === "hands") return handsFront(profile, tier);
  if (slot === "feet") return feetFront(profile, tier);
  return weaponFront(profile, classId, tier, slot === "offhand");
}

function escapeTitle(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function slotGroup(
  slot: EquipmentSlot,
  state: DollEquipmentState | undefined,
  classId: HeroClass,
  showChestCollar = true,
): string {
  if (!state) return "";
  const visualClassId = state.visualClassId ?? classId;
  return `<g class="doll-slot is-equipped" data-slot="${slot}" style="${itemStyle(state)}"><title>${escapeTitle(state.name)}</title>${itemArtwork(slot, state, visualClassId, showChestCollar)}</g>`;
}

export function renderCharacterIllustration(
  container: HTMLElement,
  classId: HeroClass,
  slots: DollSlots,
  appearance: HeroAppearance = { hairStyle: 0, faceStyle: 0 },
): void {
  const palette = classPalettes[classId];
  container.dataset.class = classId;
  container.style.setProperty("--doll-primary", palette.primary);
  container.style.setProperty("--doll-secondary", palette.secondary);
  container.style.setProperty("--doll-dark", palette.dark);
  const chestProfile = slots.chest ? profileFor(slots.chest) : undefined;
  const offhandClassId = slots.offhand?.visualClassId ?? classId;
  container.innerHTML = `
    <svg class="character-illustration hair-style-${appearance.hairStyle} face-style-${appearance.faceStyle}${slots.chest ? " has-chest" : ""}${slots.hands ? " has-hands" : ""}" viewBox="0 0 420 620" role="img" aria-label="Персонаж и надетое снаряжение">
      ${definitions}
      ${slots.offhand && offhandClassId === "Archer" ? `<g class="doll-slot is-equipped" data-slot="offhand" style="${itemStyle(slots.offhand)}"><title>${escapeTitle(slots.offhand.name)}</title>${itemArtwork("offhand", slots.offhand, offhandClassId)}</g>` : ""}
      ${slots.chest && chestProfile ? `<g class="doll-slot-back is-equipped" style="${itemStyle(slots.chest)}">${chestBack(chestProfile, rarityTier[slots.chest.rarity])}</g>` : ""}
      ${baseCharacter}
      ${slotGroup("feet", slots.feet, classId)}
      ${slotGroup("chest", slots.chest, classId, !slots.head)}
      ${slotGroup("hands", slots.hands, classId)}
      ${slotGroup("head", slots.head, classId)}
      ${slotGroup("weapon", slots.weapon, classId)}
      ${offhandClassId === "Archer" ? "" : slotGroup("offhand", slots.offhand, classId)}
    </svg>`;
}

function iconViewBox(slot: EquipmentSlot, classId: HeroClass): string {
  if (slot === "chest") return "70 88 280 427";
  if (slot === "head") return "145 -5 130 190";
  if (slot === "hands") return "72 255 276 145";
  if (slot === "feet") return "125 300 170 280";
  if (slot === "weapon") return "18 70 105 515";
  if (classId === "Swordsman" || classId === "Gunsmith")
    return "297 70 105 515";
  if (classId === "Archer") return "322 90 78 410";
  return "316 125 94 400";
}

const emptyIcons: Record<EquipmentSlot, string> = {
  head: `<path class="item-dark" d="M173 69 Q210 25 247 69 L239 142 H181 Z"/>`,
  chest: `<path class="item-dark" d="M151 168 Q210 145 269 168 L274 326 Q210 370 146 326 Z"/>`,
  hands: `<path class="item-dark" d="M117 271 L159 254 L155 374 L121 360 Z M303 271 L261 254 L265 374 L299 360 Z"/>`,
  feet: `<path class="item-dark" d="M146 425 L190 420 L184 578 H119 Z M274 425 L230 420 L236 578 H301 Z"/>`,
  weapon: `<path class="blade" d="M120 348 L139 337 L89 573 L55 604 L103 357 Z"/>`,
  offhand: `<path class="item-dark" d="M281 211 H360 L371 293 Q361 407 321 454 Q281 407 270 293 Z"/>`,
};

export function createEquipmentIcon(
  slot: EquipmentSlot,
  classId: HeroClass,
  className = "equipment-art",
  state?: DollEquipmentState,
): HTMLSpanElement {
  const icon = document.createElement("span");
  icon.className = className;
  icon.dataset.slot = slot;
  const visualClassId = state?.visualClassId ?? classId;
  const palette = classPalettes[visualClassId];
  icon.style.setProperty("--doll-primary", palette.primary);
  icon.style.setProperty("--doll-secondary", palette.secondary);
  icon.style.setProperty("--doll-dark", palette.dark);
  if (state) {
    const itemPalette = itemPalettes[profileFor(state).palette];
    icon.style.setProperty("--item-primary", itemPalette.primary);
    icon.style.setProperty("--item-secondary", itemPalette.secondary);
    icon.style.setProperty("--item-dark", itemPalette.dark);
    icon.style.setProperty("--item-accent", itemPalette.accent);
    icon.style.setProperty("--rarity-color", state.rarityColor);
  }
  const artwork = state
    ? itemArtwork(slot, state, visualClassId)
    : emptyIcons[slot];
  const back =
    state && slot === "chest"
      ? chestBack(profileFor(state), rarityTier[state.rarity])
      : "";
  icon.innerHTML = `<svg class="equipment-illustration" viewBox="${iconViewBox(slot, visualClassId)}" aria-hidden="true">${back}${artwork}</svg>`;
  return icon;
}
