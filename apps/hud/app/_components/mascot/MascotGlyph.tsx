// Pixel-art mark used by the mascot — the Claude Code "pet" rendered as a
// 16×10 grid of square pixels. Body cells use `currentColor` so the parent
// Mascot component can keep tinting it per state (accent, warn, success,
// critical, sky) without redefining geometry. Eyes use a fixed dark fill so
// they remain readable against every state tint.
//
// The grid is encoded as a string map for readability: `B` = body pixel,
// `E` = eye pixel, `.` = transparent.

const PIXEL_MAP = [
  '..BBBBBBBBBBBB..',
  '.BBBBBBBBBBBBBB.',
  'BBBBBBBBBBBBBBBB',
  'BBBBEBBBBBBEBBBB',
  'BBBBBBBBBBBBBBBB',
  'BBBBBBBBBBBBBBBB',
  'BBBBBBBBBBBBBBBB',
  '.BBBBBBBBBBBBBB.',
  'BB............BB',
  'BB............BB',
] as const;

const COLS = 16;
const ROWS = PIXEL_MAP.length;
const PIXEL = 6;
const OFFSET_X = (100 - COLS * PIXEL) / 2;
const OFFSET_Y = (100 - ROWS * PIXEL) / 2;
const EYE_FILL = '#1a0e08';

type Cell = { x: number; y: number; kind: 'body' | 'eye' };

const CELLS: Cell[] = PIXEL_MAP.flatMap((row, r) =>
  row.split('').flatMap<Cell>((ch, c) => {
    if (ch === 'B') return [{ x: c, y: r, kind: 'body' }];
    if (ch === 'E') return [{ x: c, y: r, kind: 'eye' }];
    return [];
  }),
);

export function MascotGlyph({ size = 160 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="presentation"
      aria-hidden="true"
      shapeRendering="crispEdges"
      className="overflow-visible"
    >
      {CELLS.map(({ x, y, kind }) => (
        <rect
          key={`${kind}-${x}-${y}`}
          x={OFFSET_X + x * PIXEL}
          y={OFFSET_Y + y * PIXEL}
          width={PIXEL}
          height={PIXEL}
          fill={kind === 'eye' ? EYE_FILL : 'currentColor'}
        />
      ))}
    </svg>
  );
}
