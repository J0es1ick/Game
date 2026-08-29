import type { CSSProperties } from "react";
import { PageHeading } from "../components/common";
import { useGame } from "../state/GameContext";
import { ItemCard } from "./ItemCard";
import { number } from "./model";
import "./equipment-react.css";

function ShopSupplies() {
  const { game, act, notify } = useGame();
  const hero = game.save.hero;
  const price = game.temperingMarkPrice();
  const buy = (quantity: number) => {
    const result = act((world) => world.buyTemperingMarks(quantity));
    if (result)
      notify({
        eyebrow: "ПОКУПКА В ЛАВКЕ",
        title: "Печати закалки куплены",
        description: `Печатей: +${result.quantity}. Потрачено ${number.format(result.cost)} монет.`,
        symbol: "⚒",
        tone: "positive",
        sound: "loot",
        replaceKey: "shop-tempering-marks",
        aggregation: {
          key: "shop-tempering-marks",
          count: result.quantity,
          totals: { cost: result.cost },
          format: (count, totals) => ({
            description: `Печатей: +${count}. Потрачено ${number.format(totals.cost)} монет.`,
          }),
        },
      });
  };
  return (
    <section
      className="shop-supplies paper-panel"
      id="shop-supplies"
      aria-labelledby="shop-supplies-title"
    >
      <div className="shop-supplies-copy">
        <p className="eyebrow">ПОСТОЯННО В ПРОДАЖЕ</p>
        <h2 id="shop-supplies-title" data-term="marks" tabIndex={0}>
          Печати закалки
        </h2>
        <p>
          Для закалки и перековки снаряжения в кузнице. Можно купить в любой
          день — время в мире не проходит.
        </p>
      </div>
      <div className="shop-supplies-pricing">
        <dl className="shop-supplies-totals">
          <div>
            <dt>В запасе</dt>
            <dd>
              <strong>{number.format(hero.temperingMarks)}</strong>
            </dd>
          </div>
          <div>
            <dt>За одну печать</dt>
            <dd>
              <strong>{number.format(price)} ¤</strong>
            </dd>
          </div>
        </dl>
        <div className="shop-supplies-actions">
          {[1, 5].map((quantity) => (
            <button
              key={quantity}
              className="button shop-supply-buy"
              type="button"
              disabled={hero.gold < price * quantity}
              onClick={() => buy(quantity)}
            >
              <span>
                {quantity === 1 ? "Купить 1 печать" : "Купить 5 печатей"}
              </span>
              <span className="shop-supply-cost">
                {number.format(price * quantity)} ¤
              </span>
            </button>
          ))}
        </div>
        <p className="shop-supplies-note">
          Цена учитывает репутацию у фракции лавки. Без наценки за количество.
        </p>
      </div>
    </section>
  );
}

export function ShopPage() {
  const { game } = useGame();
  const controller = game.shopController();
  return (
    <section className="page active equipment-page" id="page-shop">
      <PageHeading
        eyebrow="АССОРТИМЕНТ МЕНЯЕТСЯ РАЗ В ДВА ДНЯ"
        title="Лавка Ионы"
      >
        <p id="shop-description">
          Ассортимент обновлён на {game.save.shopDay}-й день. Следующая смена не
          позднее {game.save.shopDay + 2}-го дня.
        </p>
      </PageHeading>
      <section
        className="shop-controller paper-panel"
        id="shop-controller"
        style={{ "--faction-accent": controller.accent } as CSSProperties}
      >
        <div>
          <p className="eyebrow">ПОСТАВЩИК ТЕКУЩЕГО ЦИКЛА</p>
          <h2>{controller.name}</h2>
        </div>
        <p>{controller.effect}</p>
        <strong className="shop-price-index">
          Индекс цен: {Math.round(controller.priceModifier * 100)}%
        </strong>
      </section>
      <ShopSupplies />
      <div className="shopkeeper">
        <div className="shopkeeper-mark">И</div>
        <blockquote>
          «Редкость не делает вещь полезной. Сначала реши, какой бой ты хочешь
          вести».
        </blockquote>
      </div>
      <div className="item-grid shop-grid" id="shop-grid">
        {game.save.shopOffers.map((offer, index) => (
          <ItemCard
            key={offer.item.id}
            item={offer.item}
            shopIndex={index}
            sold={offer.sold}
          />
        ))}
      </div>
    </section>
  );
}
