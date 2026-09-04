import { ITEM_TEMPLATES } from "../../catalogs/WorldCatalog";
import { FACTIONS } from "../../catalogs/WorldExpansionCatalog";
import { calculateItemPrice, createItem } from "../../factories/ItemFactory";
import { WorldRandomStreams } from "../core/WorldRandom";
import { GameSave, Rarity, ShopOffer } from "../core/WorldTypes";
import { improveMinimumRarity } from "../progression/NewGamePlus";
import { factionShopPrice } from "../world/FactionEconomy";
import { placeWorldRelicInShop, releaseWorldRelic } from "./WorldRelics";

export class ShopService {
  constructor(
    private readonly save: GameSave,
    private readonly random: WorldRandomStreams,
  ) {}
  public refreshShopIfNeeded(): void {
    if (this.save.worldDay - this.save.shopDay >= 2) this.rotateShop();
  }

  public rotateShop(): void {
    this.save.shopOffers
      .filter((offer) => !offer.sold && offer.item.worldRelicId)
      .forEach((offer) => {
        const recordIndex = (this.save.worldRelics ?? []).findIndex(
          (candidate) => candidate.id === offer.item.worldRelicId,
        );
        if (recordIndex < 0) return;
        this.save.worldRelics![recordIndex] = releaseWorldRelic(
          this.save.worldRelics![recordIndex],
          offer.item,
          `День ${this.save.worldDay}: лавка сняла реликвию с продажи.`,
        ).record;
      });
    const controllerId =
      this.save.factionControl?.shopControllerId ?? FACTIONS[0].id;
    const baseMinimum: Rarity =
      this.save.hero.highestArena >= 4
        ? "epic"
        : this.save.hero.highestArena >= 2
          ? "rare"
          : "common";
    const minimum =
      controllerId === "red-ledger"
        ? improveMinimumRarity(baseMinimum, 1)
        : baseMinimum;
    const offers: ShopOffer[] = Array.from({ length: 8 }, () => {
      const universalTemplate =
        controllerId === "free-company" && this.random.loot.chance(0.48)
          ? this.random.loot.pick(
              ITEM_TEMPLATES.filter(
                (template) =>
                  template.allowedClasses === "all" &&
                  !template.exclusiveToElite &&
                  !template.exclusiveToBoss &&
                  !template.exclusiveToFaction,
              ),
            )
          : undefined;
      const item = createItem(
        this.save.hero.level + this.random.loot.int(0, 2),
        {
          classId: this.save.hero.classId,
          templateId: universalTemplate?.id,
          minimumRarity: this.random.loot.chance(
            controllerId === "red-ledger" ? 0.58 : 0.35,
          )
            ? minimum
            : "common",
          randomSource: this.random.loot,
        },
      );
      item.price = factionShopPrice(
        item.price,
        controllerId,
        this.save.hero.factionReputation[controllerId] ?? 0,
      );
      return { item, sold: false };
    });
    const lostRelics = (this.save.worldRelics ?? []).filter(
      (record) =>
        record.status === "lost" &&
        (record.item.allowedClasses === "all" ||
          record.item.allowedClasses.includes(this.save.hero.classId)),
    );
    if (lostRelics.length > 0 && this.random.world.chance(0.28)) {
      const record = this.random.world.pick(lostRelics);
      const placed = placeWorldRelicInShop(
        record,
        "Лавка Ионы",
        `День ${this.save.worldDay}: реликвия появилась в лавке Ионы.`,
      );
      placed.item.price = factionShopPrice(
        Math.max(
          placed.item.price,
          calculateItemPrice(placed.item.level, placed.item.rarity),
        ),
        controllerId,
        this.save.hero.factionReputation[controllerId] ?? 0,
        true,
      );
      offers[this.random.world.int(0, offers.length - 1)] = {
        item: placed.item,
        sold: false,
      };
      const recordIndex = this.save.worldRelics!.findIndex(
        (candidate) => candidate.id === record.id,
      );
      if (recordIndex >= 0) this.save.worldRelics![recordIndex] = placed.record;
    }
    this.save.shopOffers = offers;
    this.save.shopDay = this.save.worldDay;
  }
}
