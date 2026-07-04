const OUTER_PATH =
  "M 64.05 3.55 Q 61.00 3.00 57.65 4.10 Q 54.30 5.20 31.40 20.30 Q 8.50 35.40 5.95 38.50 Q 3.40 41.60 3.20 44.90 Q 3.00 48.20 3.60 49.95 Q 4.20 51.70 6.00 53.80 Q 7.80 55.90 15.80 58.50 Q 23.80 61.10 25.50 53.60 Q 27.20 46.10 30.20 41.90 Q 33.20 37.70 38.20 34.35 Q 43.20 31.00 49.00 29.65 Q 54.80 28.30 48.45 33.60 Q 42.10 38.90 40.75 41.25 Q 39.40 43.60 38.90 48.10 Q 38.40 52.60 40.25 58.55 Q 42.10 64.50 46.15 70.40 Q 50.20 76.30 53.15 79.15 Q 56.10 82.00 60.05 82.55 Q 64.00 83.10 66.80 81.70 Q 69.60 80.30 71.65 76.95 Q 73.70 73.60 73.85 44.00 Q 74.00 14.40 73.50 12.45 Q 73.00 10.50 71.45 8.30 Q 69.90 6.10 68.50 5.10 Q 67.10 4.10 64.05 3.55 Z";

const STAR_PATH =
  "M 69.50 24.10 Q 69.90 24.30 69.70 24.80 Q 69.50 25.30 67.95 26.40 Q 66.40 27.50 66.95 29.40 Q 67.50 31.30 67.30 31.60 Q 67.10 31.90 66.50 31.85 Q 65.90 31.80 64.80 30.80 Q 63.70 29.80 62.90 30.00 Q 62.10 30.20 60.95 31.10 Q 59.80 32.00 59.40 31.85 Q 59.00 31.70 59.55 29.50 Q 60.10 27.30 58.65 26.20 Q 57.20 25.10 57.20 24.45 Q 57.20 23.80 59.30 23.85 Q 61.40 23.90 61.85 22.45 Q 62.30 21.00 62.95 20.35 Q 63.60 19.70 63.90 20.05 Q 64.20 20.40 64.15 21.05 Q 64.10 21.70 64.75 22.80 Q 65.40 23.90 67.25 23.90 Q 69.10 23.90 69.50 24.10 Z";

/**
 * Square loading frame: the flame logo sits static and centered inside a
 * rounded square, while a bright gradient segment travels around the
 * square's border to indicate loading/activity.
 *
 * size      - rendered width/height in px (frame is always square)
 * color     - base gold tone used for dim fill/borders
 * speed     - seconds per full lap around the border
 * arcLength - length of the bright traveling segment, out of 100
 * radius    - corner radius of the square frame
 */
export default function SpinnerSquare({
  size = 64,
  color = "#f7ce5c",
  logoColor = "#dba536",
  starColor = "#fff3d0",
  speed = 1.8,
  arcLength = 20,
  radius = 20,
}) {
  const gap = 100 - arcLength;

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="square-edge-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#fbe2a0" />
          <stop offset="100%" stopColor="#dba536" />
        </linearGradient>
      </defs>

      <style>{`
        @keyframes square-edge-trace {
          to { stroke-dashoffset: -100; }
        }
      `}</style>

      {/* faint static border, always visible */}
      <rect
        x="4"
        y="4"
        width="92"
        height="92"
        rx={radius}
        ry={radius}
        fill="none"
        stroke={color}
        strokeOpacity="0.18"
        strokeWidth="2.4"
      />

      {/* bright segment chasing around the square border */}
      <rect
        x="4"
        y="4"
        width="92"
        height="92"
        rx={radius}
        ry={radius}
        fill="none"
        stroke="url(#square-edge-gradient)"
        strokeWidth="2.6"
        strokeLinecap="round"
        pathLength="100"
        strokeDasharray={`${arcLength} ${gap}`}
        style={{ animation: `square-edge-trace ${speed}s linear infinite` }}
      />

      {/* static flame mark, centered */}
      <g transform="translate(20.9,17.3) scale(0.754)">
        <path fill={logoColor} d={OUTER_PATH} />
        <path fill={starColor} d={STAR_PATH} />
      </g>
    </svg>
  );
}

// Usage:
// <SpinnerSquare size={56} />
// <SpinnerSquare size={80} speed={1.4} arcLength={26} radius={24} />
