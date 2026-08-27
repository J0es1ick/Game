import { FACTION_ITEM_TEMPLATES } from "../src/catalogs/FactionEquipmentCatalog";
import { createItem } from "../src/factories/ItemFactory";
import { SeededRandom } from "../src/gameplay/RandomSource";
import {
  claimFactionCampaignReward, factionCampaignViews, factionMentorAccess,
  normalizeFactionCampaigns, recordFactionCampaignEvent,
} from "../src/gameplay/FactionCampaign";

describe("faction campaigns", () => {
  test("requires reputation and only counts contracts of the matching faction", () => {
    let state = normalizeFactionCampaigns(undefined);
    state = recordFactionCampaignEvent(state, { wardens: 19 }, { kind: "contract", factionId: "wardens", amount: 9 });
    expect(state.wardens.progress).toBe(0);
    state = recordFactionCampaignEvent(state, { wardens: 20 }, { kind: "contract", factionId: "red-ledger", amount: 9 });
    expect(state.wardens.progress).toBe(0);
    state = recordFactionCampaignEvent(state, { wardens: 20 }, { kind: "contract", factionId: "wardens", amount: 3 });
    expect(factionCampaignViews(state, { wardens: 20 })[0].claimable).toBe(true);
  });

  test("unlocks mentor training and awards each pair once in a three-stage chain", () => {
    const reputation = { wardens: 75 };
    let state = normalizeFactionCampaigns(undefined);
    const awarded: string[] = [];
    for (const kind of ["contract", "tournament", "tournament"] as const) {
      state = recordFactionCampaignEvent(state, reputation, { kind, factionId: "wardens", amount: 20 });
      const claimed = claimFactionCampaignReward(state, reputation, "wardens");
      state = claimed.state;
      awarded.push(...claimed.reward.slots);
      expect(() => claimFactionCampaignReward(state, reputation, "wardens")).toThrow();
    }
    expect(new Set(awarded).size).toBe(6);
    expect(factionMentorAccess(state, reputation)[0].experienceMultiplier).toBe(1.2);
    expect(factionMentorAccess(state, { wardens: 0 })).toEqual([]);
    expect(factionCampaignViews(state, reputation)[0].completed).toBe(true);
    expect(normalizeFactionCampaigns(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  test("normalizes invalid progress without skipping chain stages", () => {
    expect(normalizeFactionCampaigns({ wardens: { stage: 9, progress: -7, claimedStageIds: ["wardens-campaign-3"] } }).wardens)
      .toEqual({ stage: 0, progress: 0, claimedStageIds: [] });
  });

  test("keeps faction equipment out of random loot", () => {
    const random = new SeededRandom(551);
    const exclusive = new Set(FACTION_ITEM_TEMPLATES.map((item) => item.id));
    for (let index = 0; index < 300; index += 1) {
      const item = createItem(30, { classId: "Knight", randomSource: random });
      expect(exclusive.has(item.templateId)).toBe(false);
    }
    expect(FACTION_ITEM_TEMPLATES).toHaveLength(18);
    expect(FACTION_ITEM_TEMPLATES.every((item) => item.allowedClasses === "all" && item.exclusiveToFaction)).toBe(true);
  });
});
