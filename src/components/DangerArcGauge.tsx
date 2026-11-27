import React from 'react';
import { Camera } from 'lucide-react';
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
  onOpenControls: () => void;
  dashCamActive: boolean;
  onOpenDashCam: () => void;
}

const MAX_KMH = 120;
const SEGMENT_COUNT = 24;

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
  onOpenControls,
  dashCamActive,
  onOpenDashCam,
}) => {
  const currentKmh = Math.max(0, speedMs * 3.6);
  const displayValue = Math.round(msToUnit(speedMs, unit));
  const clampedRatio = Math.min(1, currentKmh / MAX_KMH);
  const activeSegments =
    currentKmh < 0.8 ? 0 : Math.max(1, Math.round(clampedRatio * SEGMENT_COUNT));

  const scaleMarks =
    unit === 'kmh' ? [0, 30, 60, 90, 120] : [0, 15, 30, 45, 60, 75];

  const isHighDanger =
    zone.id === 'high' || zone.id === 'severe' || zone.id === 'lethal';
  const isLethal = zone.id === 'lethal';

  return (
    <div className="w-full h-full flex flex-col items-center justify-between gap-4 select-none">
      {/* Top Segmented Speed-Danger Bar (0 to 120 km/h) */}
      <div className="w-full max-w-2xl px-1 pt-1">
        <div
          className="grid gap-[4px] sm:gap-1.5 items-end h-11 sm:h-14"
          style={{ gridTemplateColumns: `repeat(${SEGMENT_COUNT}, minmax(0, 1fr))` }}
          role="img"
          aria-label={`Speed gauge at ${displayValue} ${unitLabel(unit)}, ${zone.label}`}
        >
          {Array.from({ length: SEGMENT_COUNT }, (_, idx) => {
            const segKmh = ((idx + 1) / SEGMENT_COUNT) * MAX_KMH;
            const segZone = getZoneForKmh(segKmh);
            const isLit = idx < activeSegments;
            const heightPct = 52 + (idx / (SEGMENT_COUNT - 1)) * 48;

            return (
              <div
                key={idx}
                className="w-full rounded-[3px] transition-opacity duration-100"
                style={{
                  height: `${heightPct}%`,
                  backgroundColor: isLit ? segZone.accentHex : '#1C1E26',
                  opacity: isLit ? 1 : 0.75,
                  boxShadow:
                    isLit && idx >= activeSegments - 2
                      ? `0 0 12px ${segZone.glowRgba}`
                      : 'none',
                }}
              />
            );
          })}
        </div>

        {/* Scale numerals aligned under the segmented bar */}
        <div className="flex items-center justify-between mt-2 px-0.5">
          {scaleMarks.map((val) => (
            <span
              key={val}
              className="font-mono text-xs sm:text-sm font-medium tabular-nums text-zinc-400"
            >
              {val}
            </span>
          ))}
        </div>
      </div>

      {/* MASSIVE Center Digital Speedometer Readout */}
      <div className="flex-1 w-full flex flex-col items-center justify-center min-h-0">
        {isSimulated && (
          <span className="text-xs font-semibold tracking-wider uppercase text-amber-400 mb-2">
            Simulation
          </span>
        )}

        <div
          className="font-display font-bold tabular-nums leading-[0.82] tracking-[-0.03em] text-center transition-colors duration-150"
          style={{
            fontSize: 'clamp(9.5rem, min(52vw, 44vh), 22rem)',
            color: '#FFFFFF',
            textShadow: isHighDanger
              ? `0 0 56px ${zone.glowRgba}, 0 4px 24px rgba(0,0,0,0.65)`
              : '0 4px 24px rgba(0,0,0,0.5)',
          }}
        >
          {displayValue}
        </div>

        <div className="mt-3 sm:mt-4 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => onToggleUnit(unit === 'kmh' ? 'mph' : 'kmh')}
            className="min-h-[44px] px-6 rounded-xl bg-zinc-900/85 hover:bg-zinc-800 border border-zinc-800/90 font-display text-2xl sm:text-3xl font-semibold tracking-wide text-zinc-200 hover:text-white transition-colors cursor-pointer"
            aria-label={`Speed unit ${unitLabel(unit)}, tap to switch`}
            title="Tap to switch km/h or mph"
          >
            {unitLabel(unit)}
          </button>

          <button
            type="button"
            onClick={onOpenDashCam}
            className={`min-h-[44px] min-w-[44px] px-3 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
              dashCamActive
                ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/25'
                : 'bg-zinc-900/85 border-zinc-800/90 text-zinc-300 hover:text-white hover:bg-zinc-800'
            }`}
            aria-label={
              dashCamActive
                ? 'Dash camera active, tap to adjust'
                : 'Film motorbike dashboard to improve speed accuracy'
            }
            title={
              dashCamActive
                ? 'Dash Cam Fusion Active'
                : 'Read dash speed with rear camera'
            }
          >
            <Camera className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Bottom Danger-by-Speed Banner (tap to open Guide & Controls) */}
      <button
        type="button"
        onClick={onOpenControls}
        className={`w-full max-w-2xl rounded-2xl px-4 sm:px-5 py-3.5 sm:py-4 border transition-colors duration-200 cursor-pointer text-left ${
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
        aria-label={`Danger zone ${zone.label}. Tap for speed guide and settings.`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-4 h-4 rounded-[4px] shrink-0"
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
          <span className="font-mono text-sm sm:text-base font-bold tabular-nums text-zinc-100 whitespace-nowrap shrink-0">
            {zone.maxKmh === null
              ? `${Math.round(msToUnit(zone.minKmh / 3.6, unit))}+ ${unitLabel(unit)}`
              : `${Math.round(msToUnit(zone.minKmh / 3.6, unit))}–${Math.round(
                  msToUnit(zone.maxKmh / 3.6, unit)
                )} ${unitLabel(unit)}`}
          </span>
        </div>
      </button>
    </div>
  );
};
