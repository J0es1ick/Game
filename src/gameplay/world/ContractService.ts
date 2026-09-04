import { ARENAS, DUNGEONS } from "../../catalogs/WorldCatalog";
import {
  FACTIONS,
  factionReputationTier,
} from "../../catalogs/WorldExpansionCatalog";
import { CONTRACT_LIFETIME } from "../core/WorldGameConfig";
import {
  ContractObjective,
  ContractOffer,
  GameSave,
  WorldEvent,
  WorldFeatureId,
} from "../core/WorldTypes";
import {
  recordFactionCampaignEvent,
  type FactionCampaignEventKind,
} from "./FactionCampaign";
import {
  applyFactionReputationChange,
  changeFactionInfluence,
} from "./FactionEconomy";
import { createFactionControlState } from "./LivingWorld";
import { StructuredWorldEventPayload } from "./WorldEvents";
import { factionCampaigns } from "./WorldQueries";
interface ContractHooks {
  event(
    type: WorldEvent["type"],
    message: string,
    payload?: StructuredWorldEventPayload,
  ): void;
  requireFeature(id: WorldFeatureId): void;
  isFeatureUnlocked(id: WorldFeatureId): boolean;
  trainingLevelCap(): number;
  gainHeroExperience(amount: number): void;
  reward(
    experience: number,
    gold: number,
    factionId: string,
  ): { experience: number; gold: number };
}
export class ContractService {
  constructor(
    private readonly save: GameSave,
    private readonly hooks: ContractHooks,
  ) {}
  public acceptContract(
    contractId: string,
    approach: "honor" | "profit",
  ): ContractOffer {
    this.hooks.requireFeature("contracts");
    if (this.save.activeContract)
      throw new Error("Сначала завершите или отмените действующий контракт.");
    const offer = this.save.contractOffers.find(
      (candidate) => candidate.id === contractId,
    );
    if (!offer) throw new Error("Предложение больше недоступно.");
    if (
      offer.objective === "training" &&
      this.save.hero.level >= this.hooks.trainingLevelCap()
    ) {
      this.refreshContracts(true);
      throw new Error(
        "Предел тренировок достигнут. Фракция заменила недоступное поручение.",
      );
    }
    this.save.activeContract = { ...offer, approach };
    this.save.contractOffers = this.save.contractOffers.filter(
      (candidate) => candidate.id !== contractId,
    );
    this.hooks.event(
      "system",
      `${this.save.hero.name} принял контракт «${offer.title}» (${approach === "honor" ? "честь" : "выгода"}).`,
    );
    return this.save.activeContract;
  }

  public abandonContract(): void {
    this.hooks.requireFeature("contracts");
    const contract = this.save.activeContract;
    if (!contract) return;
    this.save.hero.factionReputation = applyFactionReputationChange(
      this.save.hero.factionReputation,
      contract.factionId,
      -2,
    ).reputation;
    this.hooks.event(
      "system",
      `${this.save.hero.name} отказался от контракта «${contract.title}».`,
    );
    this.save.activeContract = undefined;
  }

  public refreshContracts(force: boolean): void {
    if (!this.hooks.isFeatureUnlocked("contracts")) {
      this.save.contractOffers = [];
      this.save.activeContract = undefined;
      return;
    }
    let active = this.save.activeContract;
    const trainingAvailable =
      this.save.hero.level < this.hooks.trainingLevelCap();
    if (active?.objective === "training" && !trainingAvailable) {
      this.hooks.event(
        "system",
        `Контракт «${active.title}» отозван без штрафа: герой достиг предела тренировок текущей арены.`,
      );
      this.save.activeContract = undefined;
      active = undefined;
    }
    if (active && active.expiresDay < this.save.worldDay) {
      this.hooks.event("system", `Срок контракта «${active.title}» истёк.`);
      this.save.activeContract = undefined;
    }
    const stillValid = this.save.contractOffers.filter(
      (offer) =>
        offer.expiresDay >= this.save.worldDay &&
        (offer.objective !== "training" || trainingAvailable),
    );
    if (!force && stillValid.length >= FACTIONS.length) {
      this.save.contractOffers = stillValid;
      return;
    }
    const labels: Record<ContractObjective, string[]> = {
      training: ["Показательная выучка", "День дисциплины"],
      duel: ["Честный вызов", "Долг клинка"],
      dungeon: ["След пропавшего отряда", "Груз из глубин"],
      tournament: ["Знамя на трибуне", "Место для имени"],
      boss: ["Закрыть старый счёт", "Охота за печатью"],
    };
    this.save.contractOffers = FACTIONS.map((faction, index) => {
      const available = faction.objectives.filter(
        (objective) =>
          (objective !== "boss" || this.save.hero.highestArena >= 2) &&
          (objective !== "training" || trainingAvailable),
      );
      const objective =
        available[
          (this.save.worldDay + index + this.save.completedContracts) %
            available.length
        ];
      const target =
        objective === "training" ? 2 : objective === "duel" ? 3 : 1;
      const reputation = this.save.hero.factionReputation[faction.id] ?? 0;
      const rewardMultiplier =
        1 + factionReputationTier(reputation).contractRewardBonus;
      return {
        id: `contract-${faction.id}-${this.save.worldDay}-${this.save.completedContracts}`,
        factionId: faction.id,
        title: labels[objective][(this.save.worldDay + index) % 2],
        description: `${faction.name} просит выполнить задачу: ${objective === "training" ? "провести тренировочные дни" : objective === "duel" ? "победить в дуэлях" : objective === "dungeon" ? "завершить поход в данж" : objective === "tournament" ? "стать чемпионом турнира" : "победить особого противника"}.`,
        objective,
        target,
        progress: 0,
        rewardGold: Math.round(
          (450 + this.save.hero.level * 55 + index * 130) * rewardMultiplier,
        ),
        rewardExperience: Math.round(
          (70 + this.save.hero.level * 9) * rewardMultiplier,
        ),
        rewardReputation: 5 + index,
        createdDay: this.save.worldDay,
        expiresDay: this.save.worldDay + CONTRACT_LIFETIME,
      };
    });
  }

  public advanceContract(objective: ContractObjective): void {
    if (!this.hooks.isFeatureUnlocked("contracts")) return;
    if (
      objective === "tournament" ||
      objective === "dungeon" ||
      objective === "boss"
    )
      this.advanceFactionCampaign(objective);
    const contract = this.save.activeContract;
    if (!contract || contract.objective !== objective) return;
    contract.progress = Math.min(contract.target, contract.progress + 1);
    if (contract.progress < contract.target) {
      this.hooks.event(
        "system",
        `Контракт «${contract.title}»: ${contract.progress}/${contract.target}.`,
      );
      return;
    }
    const profitMultiplier = contract.approach === "profit" ? 1.35 : 1;
    const reputationMultiplier = contract.approach === "honor" ? 1.5 : 1;
    const baseGold = Math.round(contract.rewardGold * profitMultiplier);
    const { gold, experience } = this.hooks.reward(
      contract.rewardExperience,
      baseGold,
      contract.factionId,
    );
    const reputation = Math.round(
      contract.rewardReputation * reputationMultiplier,
    );
    this.save.hero.gold += gold;
    this.hooks.gainHeroExperience(experience);
    this.save.hero.factionReputation = applyFactionReputationChange(
      this.save.hero.factionReputation,
      contract.factionId,
      reputation,
    ).reputation;
    const control = (this.save.factionControl ??= createFactionControlState(
      this.save.worldDay,
    ));
    if (contract.objective === "dungeon") {
      const supportedDungeon =
        [...DUNGEONS]
          .reverse()
          .find(
            (dungeon) => dungeon.requiredArena <= this.save.hero.highestArena,
          ) ?? DUNGEONS[0];
      this.save.factionControl = changeFactionInfluence(
        control,
        "dungeon",
        supportedDungeon.id,
        contract.factionId,
        reputation,
      );
    } else {
      const supportedArena = ARENAS[this.save.hero.highestArena];
      this.save.factionControl = changeFactionInfluence(
        control,
        "arena",
        supportedArena.id,
        contract.factionId,
        reputation,
      );
    }
    this.save.completedContracts += 1;
    this.advanceFactionCampaign("contract", contract.factionId);
    this.hooks.event(
      "system",
      `Контракт «${contract.title}» выполнен: +${gold} ¤, репутация +${reputation}.`,
    );
    this.save.activeContract = undefined;
    this.refreshContracts(true);
  }

  public advanceFactionCampaign(
    kind: FactionCampaignEventKind,
    factionId?: string,
  ): void {
    const before = new Set(
      factionCampaigns(this.save)
        .filter((entry) => entry.claimable)
        .map((entry) => entry.factionId),
    );
    this.save.factionCampaigns = recordFactionCampaignEvent(
      this.save.factionCampaigns ?? {},
      this.save.hero.factionReputation,
      { kind, factionId },
    );
    factionCampaigns(this.save)
      .filter((entry) => entry.claimable && !before.has(entry.factionId))
      .forEach((entry) => {
        this.hooks.event(
          "system",
          `Поручение «${entry.current!.title}» выполнено. Во фракциях можно забрать уникальную награду.`,
        );
      });
  }
}
