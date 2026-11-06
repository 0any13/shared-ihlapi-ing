import { PALETTE } from '../palette';

export function Swatches({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  return (
    <div className="swatches">
      {PALETTE.map(c => (
        <button
          key={c} type="button"
          className={'swatch' + (c === value ? ' on' : '')}
          style={{ ['--c' as string]: c }}
          aria-label={'Pick color ' + c}
          onClick={() => onPick(c)}
        />
      ))}
    </div>
  );
}
