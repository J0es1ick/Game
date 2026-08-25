import { EraLawId, LegacyBoonId } from "../gameplay/WorldTypes";

export interface LegacyBoonDefinition {
  id: LegacyBoonId;
  name: string;
  description: string;
  effect: string;
  sealCost: number;
}

export interface EraLawDefinition {
  id: EraLawId;
  name: string;
  description: string;
  effect: string;
  accent: string;
}

export const LEGACY_BOONS: LegacyBoonDefinition[] = [
  {
    id: "masters-school",
    name: "Школа мастера",
    description: "Наследник начинает путь с одним классовым приёмом из будущих уровней.",
    effect: "Один сильный классовый навык доступен с первого уровня.",
    sealCost: 3,
  },
  {
    id: "court-name",
    name: "Имя при дворе",
    description: "Фракции знают фамилию прежнего чемпиона и охотнее доверяют наследнику.",
    effect: "+8 стартовой репутации у каждой фракции сверх исторического влияния.",
    sealCost: 2,
  },
  {
    id: "hunters-notes",
    name: "Записки охотника",
    description: "Архивы прошлой эпохи раскрывают слабые места особых противников.",
    effect: "Требования уровня и дуэльных побед для боссов снижены на 20%.",
    sealCost: 2,
  },
  {
    id: "old-map",
    name: "Старая карта",
    description: "На полях карты отмечен безопасный вход в первое подземелье.",
    effect: "Первый данж открыт с начала эпохи независимо от дня и уровня.",
    sealCost: 2,
  },
  {
    id: "forge-tradition",
    name: "Кузнечная традиция",
    description: "Старая мастерская помнит приёмы предыдущего владельца Короны.",
    effect: "Первая закалка каждого предмета не требует печати.",
    sealCost: 3,
  },
];

export const ERA_LAWS: EraLawDefinition[] = [
  {
    id: "age-of-steel",
    name: "Век стали",
    description: "Кузнецы делают ставку на тяжёлые пластины, а бои становятся дольше.",
    effect: "Все бойцы получают защиту; противники используют металл немного эффективнее.",
    accent: "#66736b",
  },
  {
    id: "hungry-lands",
    name: "Голодные земли",
    description: "Монета редка, поэтому настоящие сокровища ищут под землёй.",
    effect: "На 30% меньше золота, но добыча из данжей минимум на ступень редкости выше.",
    accent: "#8b7144",
  },
  {
    id: "bloody-arenas",
    name: "Кровавые арены",
    description: "Публика требует риска, распорядители отвечают более крупными призами.",
    effect: "Смертность и награды официальных турниров повышены на 25%.",
    accent: "#8f473e",
  },
  {
    id: "mercenary-age",
    name: "Век наёмников",
    description: "Фракции и дуэльные круги платят больше за людей с громким именем.",
    effect: "+25% к контрактам и +20% к наградам обычных дуэлей.",
    accent: "#7b654b",
  },
  {
    id: "ancient-awakening",
    name: "Пробуждение древних",
    description: "Особые противники возвращаются сильнее и охраняют лучшую добычу.",
    effect: "Боссы заметно сильнее, но всегда оставляют мифический предмет и дополнительную печать.",
    accent: "#68567b",
  },
  {
    id: "crown-discord",
    name: "Раздор короны",
    description: "Элита теряет терпение: титулы оспаривают чаще, а места быстрее меняют владельцев.",
    effect: "Вдвое чаще происходят вызовы легендам и перестановки внутри элиты.",
    accent: "#9a7636",
  },
];

export const LEGACY_TITLES = [
  "Первый летописец",
  "Хранитель двух эпох",
  "Тот, кто пережил корону",
  "Владыка повторённого пути",
  "Имя вне времени",
];

export function legacyTitleForCycle(cycle: number): string {
  return LEGACY_TITLES[Math.min(LEGACY_TITLES.length - 1, Math.max(0, cycle - 2))];
}

export function eraLawLimit(targetCycle: number): number {
  return Math.max(1, Math.min(3, targetCycle - 1));
}

export function legacySealsForCompletion(completedCycle: number): number {
  return 3 + Math.min(5, completedCycle);
}
