import React from 'react';
import {
  DANGER_ZONES,
  DangerZone,
  SpeedUnit,
  msToUnit,
  unitLabel,
} from '../utils/speedPhysics';

interface DangerArcGaugeProps {
  speedMs: number;
  unit: SpeedUnit;
  onToggleUnit: (unit: SpeedUnit) => void;
  zone: DangerZone;
  isSimulated: boolean;
}

const MAX_KMH = 180;
const START_ANGLE = -125;
const END_ANGLE = 125;
const TOTAL_SWEEP = END_ANGLE - START_ANGLE;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return [
    'M',
    start.x.toFixed(2),
    start.y.toFixed(2),
    'A',
    r,
    r,
    0,
    largeArcFlag,
    0,
    end.x.toFixed(2),
    end.y.toFixed(2),
  ].join(' ');
}

function kmhToAngle(kmh: number): number {
  const clamped = Math.max(0, Math.min(MAX_KMH, kmh));
  return START_ANGLE + (clamped / MAX_KMH) * TOTAL_SWEEP;
}

export const DangerArcGauge: React.FC<DangerArcGaugeProps> = ({
  speedMs,
  unit,
  onToggleUnit,
  zone,
  isSimulated,
}) => {
  const currentKmh = Math.max(0, speedMs * 3.6);
  const displayValue = Math.round(msToUnit(speedMs, unit));
  const activeEndAngle = kmhToAngle(currentKmh);

  const cx = 200;
  const cy = 200;
  const trackRadius = 164;
  const zoneBandRadius = 178;

  // Major scale labels aligned to physical speed
  const majorMarks =
    unit === 'kmh'
      ? [0, 30, 60, 90, 120, 150, 180].map((v) => ({
          label: String(v),
          angle: kmhToAngle(v),
        }))
      : [0, 20, 40, 60, 80, 100, 110].map((mph) => ({
          label: String(mph),
          angle: kmhToAngle(mph * 1.60934),
        }));

  // Minor ticks every 10 km/h (or 10 mph)
  const tickValues =
    unit === 'kmh'
      ? Array.from({ length: 19 }, (_, i) => i * 10)
      : Array.from({ length: 12 }, (_, i) => i * 10 * 1.60934);

  return (
    <div className="relative flex flex-col items-center justify-center w-full max-w-[440px] mx-auto select-none">
      <div className="relative w-full aspect-square max-h-[54vh] min-h-[290px] flex items-center justify-center">
        <svg
          viewBox="0 0 400 375"
          className="w-full h-full overflow-visible"
          role="img"
          aria-label={`Current speed ${displayValue} ${unitLabel(unit)}, danger level ${zone.label}`}
        >
          <defs>
            <filter id="arc-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Outer static danger-zone spectrum band */}
          {DANGER_ZONES.map((z) => {
            const zStart = kmhToAngle(z.minKmh);
            const zEnd = kmhToAngle(z.maxKmh ?? MAX_KMH);
            const isCurrent = z.id === zone.id;
            return (
              <path
                key={z.id}
                d={describeArc(cx, cy, zoneBandRadius, zStart + 0.8, zEnd - 0.8)}
                fill="none"
                stroke={z.accentHex}
                strokeWidth={isCurrent ? 6 : 3.5}
                strokeLinecap="butt"
                strokeOpacity={isCurrent ? 0.95 : 0.25}
              />
            );
          })}

          {/* Main recessed track */}
          <path
            d={describeArc(cx, cy, trackRadius, START_ANGLE, END_ANGLE)}
            fill="none"
            stroke="#1E2028"
            strokeWidth={14}
            strokeLinecap="round"
          />

          {/* Active speed sweep arc */}
          {currentKmh > 0.5 && (
            <path
              d={describeArc(
                cx,
                cy,
                trackRadius,
                START_ANGLE,
                Math.max(START_ANGLE + 1.5, activeEndAngle)
              )}
              fill="none"
              stroke={zone.accentHex}
              strokeWidth={14}
              strokeLinecap="round"
              filter="url(#arc-glow)"
              style={{ transition: 'stroke 180ms ease-out' }}
            />
          )}

          {/* Scale ticks */}
          {tickValues.map((kmhVal, idx) => {
            const angle = kmhToAngle(kmhVal);
            const isMajor = idx % 3 === 0 || unit === 'mph';
            const outer = polarToCartesian(cx, cy, trackRadius - 14, angle);
            const inner = polarToCartesian(
              cx,
              cy,
              trackRadius - (isMajor ? 25 : 20),
              angle
            );
            const isPassed = currentKmh >= kmhVal;
            return (
              <line
                key={idx}
                x1={outer.x}
                y1={outer.y}
                x2={inner.x}
                y2={inner.y}
                stroke={isPassed ? zone.accentHex : '#3F4352'}
                strokeWidth={isMajor ? 2.5 : 1.5}
                strokeLinecap="round"
              />
            );
          })}

          {/* Scale numerals */}
          {majorMarks.map((mark) => {
            const pos = polarToCartesian(cx, cy, trackRadius - 40, mark.angle);
            return (
              <text
                key={mark.label}
                x={pos.x}
                y={pos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-zinc-400 font-mono text-[13px] font-medium tabular-nums"
              >
                {mark.label}
              </text>
            );
          })}
        </svg>

        {/* Center digital speed readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-5 pointer-events-none">
          {isSimulated && (
            <span className="text-[11px] font-medium tracking-wider uppercase text-amber-400 mb-1">
              Simulation Preview
            </span>
          )}
          <div
            className="font-display font-bold tabular-nums leading-[0.86] tracking-tight transition-colors duration-150"
            style={{
              fontSize: 'clamp(5.25rem, 21vw, 9.25rem)',
              color: currentKmh >= 86 ? '#FFFFFF' : '#F4F4F5',
              textShadow:
                currentKmh >= 56
                  ? `0 0 42px ${zone.glowRgba}`
                  : 'none',
            }}
          >
            {displayValue}
          </div>

          {/* Interactive unit toggle inside the lower center opening */}
          <div className="pointer-events-auto mt-3 flex items-center bg-zinc-900/90 border border-zinc-800 rounded-lg p-1">
            <button
              type="button"
              onClick={() => onToggleUnit('kmh')}
              className={`min-h-[38px] px-3.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                unit === 'kmh'
                  ? 'bg-zinc-100 text-zinc-950'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              aria-pressed={unit === 'kmh'}
            >
              km/h
            </button>
            <button
              type="button"
              onClick={() => onToggleUnit('mph')}
              className={`min-h-[38px] px-3.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                unit === 'mph'
                  ? 'bg-zinc-100 text-zinc-950'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
              aria-pressed={unit === 'mph'}
            >
              mph
            </button>
          </div>
        </div>
      </div>

      {/* Explicit Danger Status Callout (Color always paired with text label) */}
      <div
        className={`w-full mt-1 px-4 py-3 rounded-2xl border transition-colors duration-200 ${zone.surfaceTintClass} ${zone.borderTintClass}`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className={`text-lg sm:text-xl font-bold tracking-tight ${zone.textColorClass}`}>
            {zone.label}
          </span>
          <span className="text-xs font-mono tabular-nums text-zinc-300">
            {zone.maxKmh === null
              ? `${Math.round(msToUnit(zone.minKmh / 3.6, unit))}+ ${unitLabel(unit)}`
              : `${Math.round(msToUnit(zone.minKmh / 3.6, unit))}–${Math.round(msToUnit(zone.maxKmh / 3.6, unit))} ${unitLabel(unit)}`}
          </span>
        </div>
        <p className="text-xs sm:text-sm text-zinc-200 mt-1 leading-snug">
          {zone.shortWarning}
        </p>
      </div>
    </div>
  );
};
