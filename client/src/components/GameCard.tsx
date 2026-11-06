import type { CardPublic } from '../../../shared/types';

// key={seq}: a NEW card remounts the element, which restarts the CSS draw animation.
export function GameCard({ card }: { card: CardPublic | null }) {
  return (
    <div className="card-wrap">
      <div key={card ? card.seq : 'down'} className={card ? `card lvl-${card.level} drawing` : 'card face-down'}>
        <div className="card-face card-back">
          <span className="display logo mark">Ihlapi-ing</span>
          <small>The deck is waiting</small>
        </div>
        <div className="card-face card-front">
          <span className="chip card-chip">{card ? 'Level ' + card.level : ''}</span>
          <p className={'card-text' + (card && card.text.length > 110 ? ' long' : '')}>{card?.text}</p>
          {/* Community cards are only marked as such, never with an author's name */}
          {card && !card.is_original && <span className="chip card-chip">Community card</span>}
        </div>
      </div>
    </div>
  );
}
