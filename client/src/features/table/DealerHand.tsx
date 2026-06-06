import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { PlayingCard } from "../../components/PlayingCard";
import type { GameCard } from "../../lib/cards";

interface DealerHandMetrics {
  areaWidth: number;
  cardWidth: number;
  gap: number;
}

interface PositionedCard {
  card: GameCard;
  left: number;
  role: "hit" | "upcard" | "hole";
  width: number;
}

const DEFAULT_METRICS: DealerHandMetrics = {
  areaWidth: 0,
  cardWidth: 70,
  gap: 6
};

function responsiveCardWidth(): number {
  if (window.innerWidth <= 640) return 42;
  return Math.min(70, Math.max(52, window.innerWidth * 0.12));
}

function responsiveGap(): number {
  return Math.min(6, Math.max(2, window.innerWidth * 0.008));
}

export function DealerHand({ cards }: { cards: GameCard[] }) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState(DEFAULT_METRICS);

  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;

    const measure = () => {
      const next = {
        areaWidth: area.clientWidth,
        cardWidth: responsiveCardWidth(),
        gap: responsiveGap()
      };
      setMetrics(current =>
        current.areaWidth === next.areaWidth &&
        current.cardWidth === next.cardWidth &&
        current.gap === next.gap
          ? current
          : next
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const upcard = cards[0];
  const hole = cards[1];
  const hits = cards.slice(2).reverse();
  const { areaWidth, cardWidth, gap } = metrics;
  const holeVisible = hole?.visible ?? false;
  const anchoredWidth = hole ? (holeVisible ? cardWidth * 2 + gap : cardWidth * 1.2) : cardWidth;
  const upcardLeft = (areaWidth - anchoredWidth) / 2;
  const anchoredLeft = upcardLeft - hits.length * (cardWidth + gap);
  const centered = hits.length > 0 && anchoredLeft < 0;
  const visibleCards = [
    ...hits.map(card => ({ card, role: "hit" as const })),
    ...(upcard ? [{ card: upcard, role: "upcard" as const }] : []),
    ...(hole ? [{ card: hole, role: "hole" as const }] : [])
  ];

  let positionedCards: PositionedCard[];
  if (centered) {
    const count = visibleCards.length;
    const centeredGap = count > 1 ? Math.min(gap, areaWidth / (count * 4)) : 0;
    const fittedWidth =
      count > 0 ? Math.max(1, (areaWidth - centeredGap * (count - 1)) / count) : cardWidth;
    const renderWidth = Math.min(cardWidth, fittedWidth);
    const totalWidth = count * renderWidth + Math.max(0, count - 1) * centeredGap;
    const start = Math.max(0, (areaWidth - totalWidth) / 2);
    positionedCards = visibleCards.map((item, index) => ({
      ...item,
      left: start + index * (renderWidth + centeredGap),
      width: renderWidth
    }));
  } else {
    positionedCards = [
      ...hits.map((card, index) => ({
        card,
        left: upcardLeft - (hits.length - index) * (cardWidth + gap),
        role: "hit" as const,
        width: cardWidth
      })),
      ...(upcard
        ? [{ card: upcard, left: upcardLeft, role: "upcard" as const, width: cardWidth }]
        : []),
      ...(hole
        ? [
            {
              card: hole,
              left: hole.visible ? upcardLeft + cardWidth + gap : upcardLeft + cardWidth * 0.2,
              role: "hole" as const,
              width: cardWidth
            }
          ]
        : [])
    ];
  }

  return (
    <div
      ref={areaRef}
      className={`table-dealer-hand${centered ? " is-centered" : ""}`}
      data-centered={centered}
    >
      {positionedCards.map(item => {
        const style = {
          left: item.left,
          width: item.width,
          ["--dealer-render-width"]: `${item.width}px`
        } as CSSProperties;
        return (
          <div
            key={item.card.id}
            className={`dealer-card-slot is-${item.role}${item.role === "hole" && !item.card.visible ? " is-hidden" : ""}`}
            data-card-role={item.role}
            style={style}
          >
            <PlayingCard card={item.card} faceUp={item.card.visible} />
          </div>
        );
      })}
    </div>
  );
}
