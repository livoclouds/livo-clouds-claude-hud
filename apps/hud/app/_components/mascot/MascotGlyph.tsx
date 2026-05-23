// Pure SVG mark used by the mascot. The four-point ✦ star inherits color from
// the parent so the Mascot component can tint it per state without redefining
// the geometry.
export function MascotGlyph({ size = 160 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="presentation"
      aria-hidden="true"
      className="overflow-visible"
    >
      <defs>
        <radialGradient id="mascot-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.95" />
          <stop offset="55%" stopColor="currentColor" stopOpacity="0.75" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.35" />
        </radialGradient>
      </defs>
      {/* Soft halo */}
      <circle
        cx="50"
        cy="50"
        r="34"
        fill="currentColor"
        fillOpacity="0.08"
      />
      {/* Stylized Claude ✦ — four cardinal lobes meeting at center */}
      <path
        d="M50 4 L56 44 L96 50 L56 56 L50 96 L44 56 L4 50 L44 44 Z"
        fill="url(#mascot-core)"
        stroke="currentColor"
        strokeOpacity="0.45"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      {/* Center pip */}
      <circle cx="50" cy="50" r="3" fill="currentColor" fillOpacity="0.9" />
    </svg>
  );
}
