import { lazy, memo, useEffect } from "react";
import { useAppSelector, useGameStore } from "../state/GameContext";
import type { WorldPageId } from "./WorldPageCatalog";

const MapPage = lazy(() =>
  import("../../features/map/pages/MapPage/MapPage").then((module) => ({
    default: module.MapPage,
  })),
);
const HeroPage = lazy(() =>
  import("../../features/equipment/pages/HeroPage/HeroPage").then((module) => ({
    default: module.HeroPage,
  })),
);
const InventoryPage = lazy(() =>
  import("../../features/equipment/pages/InventoryPage/InventoryPage").then(
    (module) => ({
      default: module.InventoryPage,
    }),
  ),
);
const ForgePage = lazy(() =>
  import("../../features/equipment/pages/ForgePage/ForgePage").then(
    (module) => ({
      default: module.ForgePage,
    }),
  ),
);
const LegacyPage = lazy(() =>
  import("../../features/equipment/pages/LegacyPage/LegacyPage").then(
    (module) => ({
      default: module.LegacyPage,
    }),
  ),
);
const SkillsPage = lazy(() =>
  import("../../features/equipment/pages/SkillsPage/SkillsPage").then(
    (module) => ({
      default: module.SkillsPage,
    }),
  ),
);
const CollectionsPage = lazy(() =>
  import("../../features/equipment/pages/CollectionsPage/CollectionsPage").then(
    (module) => ({
      default: module.CollectionsPage,
    }),
  ),
);
const ShopPage = lazy(() =>
  import("../../features/equipment/pages/ShopPage/ShopPage").then((module) => ({
    default: module.ShopPage,
  })),
);
const ContractsPage = lazy(() =>
  import("../../features/contracts/pages/ContractsPage/ContractsPage").then(
    (module) => ({
      default: module.ContractsPage,
    }),
  ),
);
const ChroniclePage = lazy(() =>
  import("../../features/world/pages/ChroniclePage/ChroniclePage").then(
    (module) => ({
      default: module.ChroniclePage,
    }),
  ),
);
const RankingsPage = lazy(() =>
  import("../../features/rankings/pages/RankingsPage/RankingsPage").then(
    (module) => ({
      default: module.RankingsPage,
    }),
  ),
);

function NavigationScroll({ page }: { page: WorldPageId }) {
  const store = useGameStore();
  const navigation = useAppSelector((state) => state.navigation);

  useEffect(() => {
    if (!navigation || navigation.page !== page) return;
    const frame = requestAnimationFrame(() => {
      if (navigation.anchor) {
        const target = document.getElementById(
          navigation.anchor.replace(/^#/, ""),
        );
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else window.scrollTo({ top: 0, behavior: "instant" });
      store.completeNavigation(navigation.id);
    });
    return () => cancelAnimationFrame(frame);
  }, [page, navigation, store]);
  return null;
}

export const PageRouter = memo(function PageRouter({
  page,
}: {
  page: WorldPageId;
}) {
  const equipmentPage =
    page === "hero" || page === "career" || page === "class-change" ? (
      <HeroPage section={page === "career" ? "history" : "equipment"} />
    ) : page === "arsenal" ? (
      <InventoryPage />
    ) : page === "forge" ? (
      <ForgePage />
    ) : page === "legacy" ? (
      <LegacyPage />
    ) : page === "skills" ? (
      <SkillsPage />
    ) : page === "collections" ? (
      <CollectionsPage />
    ) : page === "shop" ? (
      <ShopPage />
    ) : null;

  return (
    <>
      {equipmentPage ?? (
        <section className="page active" id={`page-${page}`}>
          {page === "map" ? (
            <MapPage />
          ) : page === "contracts" ? (
            <ContractsPage />
          ) : page === "chronicle" ||
            page === "fighters" ||
            page === "relics" ||
            page === "history" ? (
            <ChroniclePage section={page} />
          ) : (
            <RankingsPage elite={page === "elite"} />
          )}
        </section>
      )}
      <NavigationScroll page={page} />
    </>
  );
});
