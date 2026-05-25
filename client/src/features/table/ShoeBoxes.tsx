import type { ReactNode } from "react";
import type { AppSettings } from "@blackjack/shared";
import type { TableSnapshot } from "./engine";

function formatDecksLeft(cardCount: number): string {
  return (Math.round((cardCount / 52) * 10) / 10).toFixed(1);
}

function Tray({ label, fillRatio, kind }: { label: string; fillRatio: number; kind: string }) {
  const fillPercent = Math.max(0, Math.min(100, Math.round(fillRatio * 100)));
  return (
    <>
      <strong>{label}</strong>
      <div className={`tray-graphic ${kind}`} aria-label={`${label} card stack`}>
        <span className="tray-stack" style={{ ["--fill" as string]: `${fillPercent}%` }} />
      </div>
    </>
  );
}

export function ShoeBoxes({
  snapshot,
  settings,
  dealer
}: {
  snapshot: TableSnapshot;
  settings: AppSettings;
  dealer: ReactNode;
}) {
  const totalCards = Math.max(1, settings.numberOfDecks * 52);
  const mode = settings.shoeDisplayMode;
  const shoeCards = snapshot.shoeCards;
  const discardCards = snapshot.discardCards;

  let shoeContent: React.ReactNode;
  let discardContent: React.ReactNode;

  if (mode === "hidden") {
    shoeContent = <strong>Shoe</strong>;
    discardContent = <strong>Discard</strong>;
  } else if (mode === "graphic") {
    shoeContent = <Tray label="Shoe" fillRatio={shoeCards / totalCards} kind="shoe" />;
    discardContent = <Tray label="Discard" fillRatio={discardCards / totalCards} kind="discard" />;
  } else if (mode === "numbers") {
    shoeContent = (
      <>
        <strong>Shoe</strong>
        <span>{shoeCards} cards</span>
        <span>{snapshot.cutReached ? "Cut reached" : "Cut live"}</span>
      </>
    );
    discardContent = (
      <>
        <strong>Discard</strong>
        <span>{discardCards} cards</span>
      </>
    );
  } else {
    shoeContent = (
      <>
        <strong>Shoe</strong>
        <span>{formatDecksLeft(shoeCards)} decks left</span>
        <span>{snapshot.cutReached ? "Cut reached" : "Cut live"}</span>
      </>
    );
    discardContent = (
      <>
        <strong>Discard</strong>
        <span>{formatDecksLeft(discardCards)} decks</span>
      </>
    );
  }

  return (
    <div className="rail top-rail">
      <div className="shoe-box">{shoeContent}</div>
      <div className="seat dealer-seat">{dealer}</div>
      <div className="shoe-box discard-box">{discardContent}</div>
    </div>
  );
}
