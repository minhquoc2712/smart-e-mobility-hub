import React from 'react';
import { useTheme } from '../../context/ThemeContext';

/**
 * Theme-adaptive, 100% transparent-background vector illustrations
 * for Electric Bike, Electric Scooter, Smart Parking Bay, and EV Charger.
 * Eliminates harsh white JPEG boxes in both Light Mode and Dark Mode.
 */
export function EvIllustration({ variant = 'bike', className = '' }) {
  const { isDark } = useTheme();

  const stroke = isDark ? '#d1fae5' : '#1e293b';
  const subStroke = isDark ? '#6ee7b7' : '#475569';
  const emerald = isDark ? '#34d399' : '#10b981';
  const emeraldDeep = isDark ? '#059669' : '#047857';
  const wheelFill = isDark ? 'rgba(52, 211, 153, 0.12)' : 'rgba(16, 185, 129, 0.12)';
  const groundLine = isDark ? 'rgba(52, 211, 153, 0.28)' : 'rgba(16, 185, 129, 0.26)';
  const beamColor = isDark ? 'rgba(52, 211, 153, 0.32)' : 'rgba(16, 185, 129, 0.22)';
  const cardBody = isDark ? '#183328' : '#ecfdf5';

  if (variant === 'scooter') {
    return (
      <div className={`ev-illustration-stage ${className}`.trim()}>
        <svg viewBox="0 0 260 185" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Electric campus scooter">
          {/* Ground shadow line */}
          <line x1="34" y1="158" x2="226" y2="158" stroke={groundLine} strokeWidth="3" strokeLinecap="round" />

          {/* LED Headlight beam */}
          <polygon points="186,58 242,44 242,78" fill={beamColor} />

          {/* Rear & Front Wheels */}
          <circle cx="68" cy="134" r="22" fill={wheelFill} stroke={stroke} strokeWidth="6" />
          <circle cx="68" cy="134" r="9" fill={emerald} stroke={stroke} strokeWidth="3" />
          <circle cx="192" cy="134" r="22" fill={wheelFill} stroke={stroke} strokeWidth="6" />
          <circle cx="192" cy="134" r="9" fill={emerald} stroke={stroke} strokeWidth="3" />

          {/* Rear fender */}
          <path d="M42 124 C46 104, 78 102, 88 120" stroke={emerald} strokeWidth="6" strokeLinecap="round" />
          {/* Front fender */}
          <path d="M168 118 C178 102, 208 104, 214 122" stroke={emerald} strokeWidth="6" strokeLinecap="round" />

          {/* Step-through battery deck & body */}
          <path
            d="M68 134 L94 134 L156 134 L176 92"
            stroke={emerald}
            strokeWidth="12"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect x="96" y="125" width="54" height="12" rx="6" fill={emeraldDeep} stroke={stroke} strokeWidth="2.5" />

          {/* Seat post & ergonomic saddle */}
          <path d="M92 128 L80 88" stroke={stroke} strokeWidth="6" strokeLinecap="round" />
          <path d="M62 84 C62 76, 98 76, 102 86 L66 88 Z" fill={emerald} stroke={stroke} strokeWidth="4" strokeLinejoin="round" />

          {/* Steering column, handlebar & LED lamp */}
          <path d="M192 134 L172 50" stroke={stroke} strokeWidth="6.5" strokeLinecap="round" />
          <path d="M154 50 L182 50" stroke={emerald} strokeWidth="7" strokeLinecap="round" />
          <circle cx="183" cy="59" r="6" fill="#34d399" stroke={stroke} strokeWidth="3" />

          {/* Smart charging cord accent */}
          <path d="M82 110 C48 96, 48 48, 92 44 L106 44" stroke={subStroke} strokeWidth="4" strokeLinecap="round" strokeDasharray="1 0" />
          <rect x="106" y="34" width="22" height="20" rx="6" fill={emerald} stroke={stroke} strokeWidth="3.5" />
          <line x1="128" y1="39" x2="137" y2="39" stroke={stroke} strokeWidth="3.5" strokeLinecap="round" />
          <line x1="128" y1="49" x2="137" y2="49" stroke={stroke} strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      </div>
    );
  }

  if (variant === 'parking') {
    return (
      <div className={`ev-illustration-stage ${className}`.trim()}>
        <svg viewBox="0 0 260 185" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Smart EV parking space">
          {/* Solar Canopy Roof */}
          <path d="M36 44 L224 28 L234 44 L46 60 Z" fill={emerald} stroke={stroke} strokeWidth="3.5" strokeLinejoin="round" />
          <line x1="66" y1="56" x2="66" y2="152" stroke={stroke} strokeWidth="5" strokeLinecap="round" />
          <line x1="198" y1="46" x2="198" y2="152" stroke={stroke} strokeWidth="5" strokeLinecap="round" />

          {/* Smart Bay Floor Markings */}
          <path d="M36 154 L224 154" stroke={groundLine} strokeWidth="4" strokeLinecap="round" />
          <rect x="84" y="128" width="92" height="22" rx="6" fill={wheelFill} stroke={emerald} strokeWidth="2.5" strokeDasharray="6 4" />

          {/* Parking Badge Emblem */}
          <rect x="106" y="68" width="48" height="48" rx="12" fill={cardBody} stroke={emerald} strokeWidth="3.5" />
          <text x="130" y="101" textAnchor="middle" fill={emerald} fontFamily="Inter, sans-serif" fontWeight="800" fontSize="26">
            P
          </text>
        </svg>
      </div>
    );
  }

  if (variant === 'charger') {
    return (
      <div className={`ev-illustration-stage ${className}`.trim()}>
        <svg viewBox="0 0 260 185" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Smart EV charging station">
          <line x1="56" y1="160" x2="204" y2="160" stroke={groundLine} strokeWidth="4" strokeLinecap="round" />

          {/* Charging Pedestal */}
          <rect x="86" y="28" width="76" height="126" rx="14" fill={cardBody} stroke={stroke} strokeWidth="4" />
          <rect x="78" y="148" width="92" height="12" rx="5" fill={emeraldDeep} stroke={stroke} strokeWidth="3" />

          {/* Digital Telemetry Screen */}
          <rect x="100" y="46" width="48" height="32" rx="6" fill="#0b1512" stroke={emerald} strokeWidth="2.5" />
          <path d="M126 52 L117 64 H125 L122 73 L133 60 H125 Z" fill="#34d399" />

          {/* Status LED bar */}
          <rect x="106" y="90" width="36" height="6" rx="3" fill={emerald} />
          <circle cx="124" cy="116" r="11" fill={wheelFill} stroke={emerald} strokeWidth="2.5" />

          {/* Charging Cable & Connector Holster */}
          <path d="M162 84 C194 84, 198 142, 174 142 C164 142, 162 124, 178 108" stroke={stroke} strokeWidth="5" strokeLinecap="round" />
          <rect x="172" y="96" width="18" height="12" rx="4" transform="rotate(-30 172 96)" fill={emerald} stroke={stroke} strokeWidth="3" />
        </svg>
      </div>
    );
  }

  // Default: Electric Campus Bike
  return (
    <div className={`ev-illustration-stage ${className}`.trim()}>
      <svg viewBox="0 0 260 185" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Electric campus bike">
        {/* Subtle ground line */}
        <line x1="30" y1="162" x2="230" y2="162" stroke={groundLine} strokeWidth="3" strokeLinecap="round" />

        {/* Headlight beam */}
        <polygon points="186,68 240,54 240,86" fill={beamColor} />

        {/* Rear & Front Wheels */}
        <circle cx="72" cy="128" r="30" fill={wheelFill} stroke={stroke} strokeWidth="6.5" />
        <circle cx="72" cy="128" r="20" stroke={subStroke} strokeWidth="2" strokeDasharray="4 4" />
        <circle cx="72" cy="128" r="8" fill={emerald} stroke={stroke} strokeWidth="3" />

        <circle cx="188" cy="128" r="30" fill={wheelFill} stroke={stroke} strokeWidth="6.5" />
        <circle cx="188" cy="128" r="20" stroke={subStroke} strokeWidth="2" strokeDasharray="4 4" />
        <circle cx="188" cy="128" r="8" fill={emerald} stroke={stroke} strokeWidth="3" />

        {/* Diamond E-Bike Frame */}
        <path
          d="M72 128 L104 80 L168 80 L124 128 Z"
          stroke={emerald}
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Integrated Lithium Battery Pack along downtube */}
        <path d="M132 119 L161 87" stroke={emeraldDeep} strokeWidth="13" strokeLinecap="round" />

        {/* Seat tube & Saddle */}
        <path d="M124 128 L96 64" stroke={stroke} strokeWidth="6.5" strokeLinecap="round" />
        <path d="M78 62 C78 54, 112 54, 116 64 L82 65 Z" fill={emerald} stroke={stroke} strokeWidth="3.5" strokeLinejoin="round" />

        {/* Front Fork, Stem & Handlebar */}
        <path d="M188 128 L164 54 L184 54" stroke={stroke} strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="182" cy="68" r="5.5" fill="#34d399" stroke={stroke} strokeWidth="3" />

        {/* Crankset & Pedal */}
        <circle cx="124" cy="128" r="12" fill={emerald} stroke={stroke} strokeWidth="4" />
        <path d="M124 128 L136 148 L146 148" stroke={stroke} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* Smart Charging Plug Accent */}
        <path d="M90 96 C46 82, 48 32, 102 32 L118 32" stroke={subStroke} strokeWidth="4.5" strokeLinecap="round" />
        <rect x="118" y="20" width="26" height="24" rx="7" fill={emerald} stroke={stroke} strokeWidth="3.5" />
        <line x1="144" y1="26" x2="155" y2="26" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
        <line x1="144" y1="38" x2="155" y2="38" stroke={stroke} strokeWidth="4" strokeLinecap="round" />
      </svg>
    </div>
  );
}
