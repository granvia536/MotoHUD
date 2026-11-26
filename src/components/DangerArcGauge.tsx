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
const SEGMENT_COUNT = 36;

function getZoneForKmh(kmh: number): DangerZone {
  for (let i = DANGER_ZONES.length - 1; i >= 0; i--) {
    if (kmh >= DANGER_ZONES[i].minKmh) {
      return DANGER_ZONES[i];
    }
  }
  return DANGER_ZONES[0];
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
  const clampedRatio = Math.min(1, currentKmh / MAX_KMH);
  const activeSegments =
    currentKmh < 0.8 ? 0 : Math.max(1, Math.round(clampedRatio * SEGMENT_COUNT));

  const scaleMarks =
    unit === 'kmh'
      ? [0, 30, 60, 90, 120, 150, 180]
      : [0, 20, 40, 60, 80, 100, 112];

  const isHighDanger = zone.id === 'high' || zone.id === 'severe' || zone.id === 'lethal';
  const isLethal = zone.id === 'lethal';

  return (
    <div className="w-full h-full flex flex-col items-center justify-between sm:justify-center gap-3 sm:gap-5 select-none">
      {/* Full-Width Superbike Segmented Speed-Danger Tach Bar */}
      <div className="w-full max-w-2xl px-1">
        <div
          className="grid gap-[3px] sm:gap-1 items-end h-10 sm:h-14"
          style={{ gridTemplateColumns: `repeat(${SEGMENT_COUNT}, minmax(0, 1fr))` }}
          role="img"
          aria-label={`Speed gauge at ${displayValue} ${unitLabel(unit)}, ${zone.label}`}
        >
          {Array.from({ length: SEGMENT_COUNT }, (_, idx) => {
            const segKmh = ((idx + 1) / SEGMENT_COUNT) * MAX_KMH;
            const segZone = getZoneForKmh(segKmh);
            const isLit = idx < activeSegments;
            // Gentle superbike curve: taller bars toward the right/high-speed end
            const heightPct = 52 + (idx / (SEGMENT_COUNT - 1)) * 48;

            return (
              <div
                key={idx}
                className="w-full rounded-[2px] transition-opacity duration-100"
                style={{
                  height: `${heightPct}%`,
                  backgroundColor: isLit ? segZone.accentHex : '#1C1E26',
                  opacity: isLit ? 1 : 0.7,
                  boxShadow:
                    isLit && idx >= activeSegments - 3
                      ? `0 0 12px ${segZone.glowRgba}`
                      : 'none',
                }}
              />
            );
          })}
        </div>

        {/* Scale numerals aligned under the segmented bar */}
        <div className="flex items-center justify-between mt-1.5 px-0.5">
          {scaleMarks.map((val) => (
            <span
              key={val}
              className="font-mono text-[11px] sm:text-xs font-medium tabular-nums text-zinc-500"
            >
              {val}
            </span>
          ))}
        </div>
      </div>

      {/* MASSIVE Center Digital Speedometer Readout */}
      <div className="flex-1 w-full flex flex-col items-center justify-center min-h-0 py-1">
        {isSimulated && (
          <span className="text-xs font-semibold tracking-wider uppercase text-amber-400 mb-1">
            Simulation Mode
          </span>
        )}

        <div className="flex flex-col items-center justify-center w-full">
          <div
            className="font-display font-bold tabular-nums leading-[0.82] tracking-[-0.03em] text-center transition-colors duration-150"
            style={{
              fontSize: 'clamp(7.5rem, min(46vw, 40vh), 20rem)',
              color: '#FFFFFF',
              textShadow: isHighDanger
                ? `0 0 56px ${zone.glowRgba}, 0 4px 24px rgba(0,0,0,0.65)`
                : '0 4px 24px rgba(0,0,0,0.5)',
            }}
          >
            {displayValue}
          </div>

          <button
            type="button"
            onClick={() => onToggleUnit(unit === 'kmh' ? 'mph' : 'kmh')}
            className="mt-1 sm:mt-2 min-h-[44px] px-5 rounded-xl bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800/90 font-display text-xl sm:text-2xl font-semibold tracking-wide text-zinc-300 hover:text-white transition-colors cursor-pointer"
            aria-label={`Speed unit ${unitLabel(unit)}, tap to switch`}
            title="Tap to switch km/h or mph"
          >
            {unitLabel(unit)}
          </button>
        </div>
      </div>

      {/* High-Visibility Full-Width Danger-by-Speed Banner */}
      <div
        className={`w-full max-w-2xl rounded-2xl px-4 py-3 sm:py-3.5 border transition-colors duration-200 ${
          isLethal ? 'animate-pulse' : ''
        }`}
        style={{
          backgroundColor:
            zone.id === 'safe'
              ? 'rgba(16, 185, 129, 0.14)'
              : zone.id === 'caution'
              ? 'rgba(245, 158, 11, 0.18)'
              : zone.id === 'high'
              ? 'rgba(249, 115, 22, 0.22)'
              : zone.id === 'severe'
              ? 'rgba(239, 68, 68, 0.28)'
              : 'rgba(220, 38, 38, 0.42)',
          borderColor: zone.accentHex,
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-3.5 h-3.5 rounded-sm shrink-0"
              style={{ backgroundColor: zone.accentHex }}
              aria-hidden="true"
            />
            <span
              className={`font-display text-2xl sm:text-3xl font-bold uppercase tracking-wide truncate ${
                isLethal ? 'text-white' : zone.textColorClass
              }`}
            >
              {zone.label}
            </span>
          </div>
          <span className="font-mono text-xs sm:text-sm font-bold tabular-nums text-zinc-100 whitespace-nowrap shrink-0">
            {zone.maxKmh === null
              ? `${Math.round(msToUnit(zone.minKmh / 3.6, unit))}+ ${unitLabel(unit)}`
              : `${Math.round(msToUnit(zone.minKmh / 3.6, unit))}–${Math.round(
                  msToUnit(zone.maxKmh / 3.6, unit)
                )} ${unitLabel(unit)}`}
          </span>
        </div>
        <p className="text-xs sm:text-sm text-zinc-100 mt-1 font-medium leading-snug">
          {zone.shortWarning}
        </p>
      </div>
    </div>
  );
};
