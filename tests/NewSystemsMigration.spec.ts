import { normalizeFactionCampaigns } from "../src/gameplay/FactionCampaign";
import { normalizeWorldSave } from "../src/gameplay/WorldSaveMigration";
import { validateWorldSave } from "../src/gameplay/WorldSaveValidation";
import { WorldGame } from "../src/gameplay/WorldGame";
import type { GameSave } from "../src/gameplay/WorldTypes";
import { parseWorldSave, serializeWorldSave } from "../src/gameplay/WorldSaveStorage";

describe("new systems migration regressions", () => {
  test("roundtrips elite season champions and retains histories predating the field", () => {
    const save = WorldGame.create("Архивариус", "Knight", 819).save;
    save.worldSeasonHistory = [{
      number: 1, startsDay: 1, endsDay: 50, ruleId: "new-blood", champions: [],
      promotedIds: [], demotedIds: [], retiredIds: [], mentorIds: [], newcomerIds: [], summary: "Первый сезон",
      eliteChampion: { fighterId: "hero", fighterName: save.hero.name, arenaId: "elite", points: 18, place: 1 },
    }];
    const roundtrip = parseWorldSave(serializeWorldSave(save));
    expect(roundtrip.worldSeasonHistory?.[0].eliteChampion).toEqual(save.worldSeasonHistory[0].eliteChampion);
    const old = JSON.parse(JSON.stringify(save)) as GameSave;
    delete old.worldSeasonHistory![0].eliteChampion;
    expect(parseWorldSave(JSON.stringify(old)).worldSeasonHistory?.[0].eliteChampion).toBeUndefined();
    save.worldSeasonHistory[0].eliteChampion!.place = 2;
    expect(validateWorldSave(save).issues.some((issue) => issue.path === "$.worldSeasonHistory[0].eliteChampion")).toBe(true);
    expect(normalizeWorldSave(save).worldSeasonHistory?.[0].eliteChampion?.place).toBe(1);
  });
  test.each([undefined, null, 4, "wardens-campaign-1", {}, { includes: true }])(
    "normalizes non-array claimed stages without granting rewards: %p", (claimedStageIds) => {
      const state = normalizeFactionCampaigns({ wardens: { stage: 3, claimedStageIds, progress: 99 } });
      expect(state.wardens).toEqual({ stage: 0, progress: 3, claimedStageIds: [] });
    },
  );

  test("normalizes equipment resonance on current and pre-battle snapshots", () => {
    const game = WorldGame.create("Резонанс прошлого", "Knight", 818);
    game.beginDuel();
    const save = JSON.parse(JSON.stringify(game.save)) as GameSave;
    const session = save.pendingBattle!.session;
    const snapshots = [session.hero, session.enemy, session.heroBefore, session.enemyBefore];
    snapshots.forEach((snapshot) => {
      snapshot.equipmentResonance = {
        setId: "wanderer", setName: "Путь странника", path: "guard", stage: 1,
        pieces: 99, description: "",
      };
      const raw = snapshot.equipmentResonance as unknown as Record<string, unknown>;
      raw.stage = 8;
      delete raw.description;
    });
    const normalized = normalizeWorldSave(save);
    const result = normalized.pendingBattle!.session;
    [result.hero, result.enemy, result.heroBefore, result.enemyBefore].forEach((snapshot) => {
      expect(snapshot.equipmentResonance).toEqual({
        setId: "wanderer", setName: "Путь странника", path: "guard", stage: 3,
        pieces: 6, description: "Путь странника",
      });
    });
    expect(validateWorldSave(normalized)).toEqual({ valid: true, issues: [] });
  });
});
