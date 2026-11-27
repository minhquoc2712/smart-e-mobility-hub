import React from 'react';
import { useTheme } from '../../context/ThemeContext';

/**
 * Vector emblem of Vietnam National University Ho Chi Minh City (VNU-HCM / ĐHQG-HCM).
 * Adapts navy strokes/text automatically when Dark Mode is enabled.
 */
export function VnuLogo({ height = 38, showText = true }) {
  const { isDark } = useTheme();
  const navy = isDark ? '#bfdbfe' : '#1e2f6d';
  const sky = isDark ? '#38bdf8' : '#1a85c8';

  const viewWidth = showText ? 295 : 132;

  return (
    <svg
      height={height}
      viewBox={`0 0 ${viewWidth} 96`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Vietnam National University Ho Chi Minh City"
      style={{ display: 'block', width: 'auto', flexShrink: 0 }}
    >
      {/* Left wing: 5 diagonal cyan-blue bars */}
      <polygon points="8,14 20,14 62,84 50,84" fill={sky} />
      <polygon points="24,14 36,14 69,70 57,70" fill={sky} />
      <polygon points="40,14 52,14 76,56 64,56" fill={sky} />
      <polygon points="56,14 68,14 83,42 71,42" fill={sky} />
      <polygon points="72,14 84,14 90,28 78,28" fill={sky} />

      {/* Right wing: 5 curved navy horizontal ribbons interlocking the V */}
      <path d="M90 22 C96 15, 102 14, 126 14 L126 24 L84 24 Z" fill={navy} />
      <path d="M82 36 C88 29, 95 28, 126 28 L126 38 L76 38 Z" fill={navy} />
      <path d="M74 50 C80 43, 88 42, 126 42 L126 52 L68 52 Z" fill={navy} />
      <path d="M66 64 C72 57, 80 56, 126 56 L126 66 L60 66 Z" fill={navy} />
      <path d="M50 84 L58 72 C64 69, 72 70, 126 70 L126 80 L66 80 L62 84 Z" fill={navy} />

      {showText && (
        <g fill={navy} fontFamily="Inter, system-ui, sans-serif" fontWeight="800" letterSpacing="0.03em">
          <text x="136" y="30" fontSize="18">VIET NAM</text>
          <text x="136" y="49" fontSize="18">NATIONAL</text>
          <text x="136" y="68" fontSize="18">UNIVERSITY</text>
          <text x="136" y="83" fontSize="13.2" fontWeight="700" letterSpacing="0.04em">
            HO CHI MINH CITY
          </text>
        </g>
      )}
    </svg>
  );
}
