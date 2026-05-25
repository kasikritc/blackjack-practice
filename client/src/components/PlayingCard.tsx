import { isRed, suitSymbol, type GameCard } from "../lib/cards";

interface PlayingCardProps {
  card?: GameCard | null;
  faceUp: boolean;
}

export function PlayingCard({ card, faceUp }: PlayingCardProps) {
  if (!faceUp || !card) {
    return <div className="card back" aria-label="Face-down card" />;
  }
  const symbol = suitSymbol(card.suit);
  return (
    <div
      className={`card${isRed(card.suit) ? " red" : ""}`}
      aria-label={`${card.rank} of ${card.suit}`}
    >
      <span className="rank corner">
        <span>{card.rank}</span>
        <span>{symbol}</span>
      </span>
      <span className="pip">{symbol}</span>
      <span className="rank bottom-rank corner">
        <span>{card.rank}</span>
        <span>{symbol}</span>
      </span>
    </div>
  );
}

export function Hand({ cards }: { cards: GameCard[] }) {
  return (
    <div className="hand">
      {cards.map(card => (
        <PlayingCard key={card.id} card={card} faceUp={card.visible} />
      ))}
    </div>
  );
}
