type GlossaryEntry = { title: string; description: string };

const glossary: Record<string, GlossaryEntry> = {
  level: { title: "Уровень героя", description: "Растёт за опыт и открывает навыки, активности и возможность носить более сильное снаряжение." },
  gold: { title: "Монеты", description: "Основная валюта лавки, некоторых решений в событиях и поздней смены класса." },
  marks: { title: "Печати закалки", description: "Редкий ресурс кузницы. Тратится на постоянное повышение уровня конкретного предмета." },
  rank: { title: "Мировое место", description: "Положение в общей сотне определяется турнирными результатами. Дуэли и данжи его не повышают." },
  day: { title: "День мира", description: "Общий календарь кампании. С ним меняются турниры, лавка, контракты и жизнь соперников." },
  health: { title: "Здоровье · HP", description: "Запас выносливости в бою. При нуле боец проигрывает, а в летальном событии может погибнуть." },
  attack: { title: "Атака · ATK", description: "Базовая сила атакующих навыков до учёта защиты, правил площадки и эффектов." },
  defense: { title: "Защита · DEF", description: "Снижает входящий урон. Некоторые навыки могут частично игнорировать её." },
  speed: { title: "Скорость · SPD", description: "Влияет на порядок действий и работу быстрых навыков." },
  crit: { title: "Критический шанс · CRIT", description: "Вероятность усиленного удара. Итоговый шанс ограничивается правилами боя." },
  rarity: { title: "Редкость", description: "Определяет диапазон характеристик, число свойств и доступ к навыкам или наследию предмета." },
  set: { title: "Комплект", description: "Предметы одной истории. Несколько надетых частей одновременно открывают указанные бонусы набора." },
  enhancement: { title: "Закалка", description: "Постоянное усиление вещи в кузнице. Каждый следующий уровень требует больше редких печатей." },
  relic: { title: "Наследие", description: "Опыт легендарного или мифического предмета. Победы с вещью открывают ступени и собственный путь реликвии." },
  relicDust: { title: "Реликтовая пыль", description: "Редкий материал из разобранных ценных вещей. Нужен для выбора постоянного пути пробудившейся реликвии." },
  rating: { title: "Рейтинг", description: "Оценка официальной турнирной карьеры. Победа в матче добавляет очки, поражение отнимает 8; дуэли и данжи рейтинг не меняют." },
  tournament: { title: "Турнирная победа", description: "Победа в полноценной сетке, а не в отдельном матче. Именно турниры продвигают арену и рейтинг." },
  kill: { title: "Смертельная победа", description: "Побеждённый соперник погибает и навсегда исчезает из живого мира." },
  battleSpeed: { title: "Скорость боя", description: "Меняет только паузу между уже рассчитанными ходами и не влияет на результат сражения." },
  factionReputation: { title: "Репутация фракции", description: "Повышает статус именно у этой фракции и усиливает награды её будущих контрактов." },
  crownLeague: { title: "Лига короны", description: "Редкий отборочный турнир поздней игры. Победа даёт право занять место в элитной тридцатке." },
  legend: { title: "Легенда", description: "Один из пяти сильнейших бойцов элиты. Его место можно занять только через последовательную охоту на легенд." },
  tacticalStyle: { title: "Тактический профиль", description: "Правила приоритета навыков для автоматического боя. Профиль не меняет сами характеристики героя." },
  newChronicle: { title: "Новая летопись", description: "Продолжение после эндгейма: прежний герой уходит в архив, мир начинается заново, а коллекция и выбранное наследие сохраняются." },
  legacySeal: { title: "Печать летописи", description: "Мета-валюта за завершение эпох и победы над героями прошлого. Тратится на постоянное преимущество следующей эпохи." },
  eraLaw: { title: "Закон эпохи", description: "Неизменяемое правило нового мира. Меняет боевые условия, награды или поведение элиты, но не подменяет уровни врагов и предметов." },
  heirloom: { title: "Предмет-наследие", description: "Одна вещь прошлого, пересозданная на первом уровне. Сохраняет образ, историю и уникальный навык, но не поздние характеристики и закалку." },
};

let tooltip: HTMLElement | null = null;
let activeTarget: HTMLElement | null = null;

export function markTerm(node: HTMLElement, key: keyof typeof glossary): HTMLElement {
  node.dataset.term = key;
  node.classList.add("term-help");
  if (!node.hasAttribute("tabindex")) node.tabIndex = 0;
  node.setAttribute("aria-describedby", "term-tooltip");
  return node;
}

export function initializeGlossary(): void {
  if (typeof document === "undefined" || tooltip) return;
  tooltip = document.createElement("aside");
  tooltip.id = "term-tooltip";
  tooltip.className = "term-tooltip";
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  document.body.append(tooltip);

  const decorate = (root: ParentNode) => {
    root.querySelectorAll<HTMLElement>("[data-term]").forEach((node) => {
      node.classList.add("term-help");
      if (!node.hasAttribute("tabindex")) node.tabIndex = 0;
      node.setAttribute("aria-describedby", "term-tooltip");
    });
  };
  decorate(document);
  new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (node.matches("[data-term]")) decorate(node.parentNode ?? document);
    else decorate(node);
  }))).observe(document.body, { childList: true, subtree: true });

  const show = (target: HTMLElement) => {
    const entry = glossary[target.dataset.term ?? ""];
    if (!entry || !tooltip) return;
    activeTarget = target;
    target.classList.add("term-help");
    if (!target.hasAttribute("tabindex")) target.tabIndex = 0;
    tooltip.replaceChildren();
    const title = document.createElement("strong");
    const description = document.createElement("span");
    title.textContent = entry.title;
    description.textContent = entry.description;
    tooltip.append(title, description);
    tooltip.hidden = false;
    const rect = target.getBoundingClientRect();
    const width = Math.min(330, window.innerWidth - 24);
    tooltip.style.width = `${width}px`;
    const left = Math.min(window.innerWidth - width - 12, Math.max(12, rect.left));
    const below = rect.bottom + 10;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${below + 150 < window.innerHeight ? below : Math.max(12, rect.top - tooltip.offsetHeight - 10)}px`;
  };
  const hide = (target?: HTMLElement | null) => {
    if (target && activeTarget && target !== activeTarget) return;
    if (tooltip) tooltip.hidden = true;
    activeTarget = null;
  };
  document.addEventListener("pointerover", (event) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>("[data-term]");
    if (target) show(target);
  });
  document.addEventListener("pointerout", (event) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>("[data-term]");
    if (target && !(event.relatedTarget as Element | null)?.closest?.("[data-term]")) hide(target);
  });
  document.addEventListener("focusin", (event) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>("[data-term]");
    if (target) show(target);
  });
  document.addEventListener("focusout", (event) => hide((event.target as Element | null)?.closest<HTMLElement>("[data-term]")));
  window.addEventListener("scroll", () => hide(), { passive: true });
}
