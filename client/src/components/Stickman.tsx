// A faceless stickman drawn as SVG. CSS classes (raised, drawer, speaking, spoken) switch the animations on.
interface Props {
  color: string;
  name?: string;
  x?: number; y?: number; scale?: number;
  raised?: boolean; drawer?: boolean; speaking?: boolean; spoken?: boolean;
  badge?: string;
}

export function Stickman({ color, name = '', x = 0, y = 0, scale = 1, raised, drawer, speaking, spoken, badge = '' }: Props) {
  const cls = ['man', raised && 'raised', drawer && 'drawer', speaking && 'speaking', spoken && 'spoken'].filter(Boolean).join(' ');
  return (
    <g className={cls} transform={`translate(${x} ${y}) scale(${scale})`} style={{ color }}>
      <ellipse className="spot" cx={0} cy={22} rx={32} ry={8} fill={color} />
      <g className="body" stroke={color} strokeWidth={5} strokeLinecap="round" fill="none">
        <circle cx={0} cy={-62} r={12} fill={color} stroke="none" />
        <line x1={0} y1={-50} x2={0} y2={-8} />
        <line x1={0} y1={-8} x2={-14} y2={20} />
        <line x1={0} y1={-8} x2={14} y2={20} />
        <line x1={0} y1={-42} x2={-17} y2={-22} />
        <line className="arm-down" x1={0} y1={-42} x2={17} y2={-22} />
        <g className="arm-up" transform="translate(0 -42)">
          <g className="wave">
            <line x1={0} y1={0} x2={20} y2={-34} />
            <circle cx={21} cy={-39} r={6} fill={color} stroke="none" />
          </g>
        </g>
      </g>
      <text className="hand-emoji" x={30} y={-96} textAnchor="middle">✋</text>
      <text className="badge" x={-26} y={-88} textAnchor="middle">{badge}</text>
      {/* name label: counter-scaled so it stays readable when the crowd is big */}
      <g transform={`translate(0 44) scale(${1 / scale})`}>
        <text className="man-name" x={0} y={0} textAnchor="middle">{name}</text>
      </g>
    </g>
  );
}

/** Small standalone stickman for the lobby and profile pages. */
export function PreviewMan({ color, raised, className, onClick, label }: {
  color: string; raised?: boolean; className?: string; onClick?: () => void; label?: string;
}) {
  const interactive = !!onClick;
  return (
    <svg
      className={className} viewBox="-50 -118 100 170"
      aria-label={label} aria-hidden={label ? undefined : true}
      role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={e => interactive && (e.key === 'Enter' || e.key === ' ') && onClick!()}
    >
      <Stickman color={color} raised={raised} />
    </svg>
  );
}
