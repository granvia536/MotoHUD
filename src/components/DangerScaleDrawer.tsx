import React from 'react';
import { X } from 'lucide-react';
import {
  DANGER_ZONES,
  DangerZone,
  SpeedUnit,
  formatSpeedRange,
  msToUnit,
  unitLabel,
} from '../utils/speedPhysics';

interface DangerScaleDrawerProps {
  open: boolean;
  onClose: () => void;
  unit: SpeedUnit;
  currentZone: DangerZone;
  isSimulated: boolean;
  simSpeedKmh: number;
  onToggleSimulation: (enabled: boolean) => void;
  onChangeSimSpeedKmh: (kmh: number) => void;
}

export const DangerScaleDrawer: React.FC<DangerScaleDrawerProps> = ({
  open,
  onClose,
  unit,
  currentZone,
  isSimulated,
  simSpeedKmh,
  onToggleSimulation,
  onChangeSimSpeedKmh,
}) => {
  if (!open) return null;

  const simDisplay = Math.round(msToUnit(simSpeedKmh / 3.6, unit));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-center lg:justify-end bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Speed danger scale and test simulation"
      onClick={onClose}
    >
      <div
        className="w-full lg:w-[440px] lg:h-full max-h-[88vh] lg:max-h-none bg-[#111319] border-t lg:border-t-0 lg:border-l border-zinc-800 rounded-t-3xl lg:rounded-none flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile drag handle affordance */}
        <div className="lg:hidden pt-3 pb-1">
          <div className="w-10 h-1.5 bg-zinc-700 rounded-full mx-auto" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">
              Danger by Speed Guide
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Motorcycle kinetic energy scales with speed squared
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70 transition-colors cursor-pointer"
            aria-label="Close guide"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Interactive Simulation Preview Control */}
          <div className="p-4 rounded-2xl bg-zinc-900/80 border border-zinc-800 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-zinc-100">
                  Test Danger Colors
                </div>
                <div className="text-xs text-zinc-400">
                  Preview HUD alerts without riding
                </div>
              </div>
              <button
                type="button"
                onClick={() => onToggleSimulation(!isSimulated)}
                className={`min-h-[44px] px-4 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isSimulated
                    ? 'bg-amber-400 text-zinc-950 hover:bg-amber-300'
                    : 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
                }`}
              >
                {isSimulated ? 'Use Live GPS' : 'Simulate Speed'}
              </button>
            </div>

            {isSimulated && (
              <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-400">Simulated Velocity</span>
                  <span className="font-mono font-bold tabular-nums text-zinc-100">
                    {simDisplay} {unitLabel(unit)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={180}
                  step={1}
                  value={simSpeedKmh}
                  onChange={(e) => onChangeSimSpeedKmh(Number(e.target.value))}
                  aria-label="Simulated speed slider"
                  className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                />
                <div className="grid grid-cols-5 gap-1.5 pt-1">
                  {[20, 45, 75, 105, 145].map((presetKmh) => {
                    const presetDisplay = Math.round(
                      msToUnit(presetKmh / 3.6, unit)
                    );
                    return (
                      <button
                        key={presetKmh}
                        type="button"
                        onClick={() => onChangeSimSpeedKmh(presetKmh)}
                        className="min-h-[40px] rounded-lg bg-zinc-800/90 hover:bg-zinc-700 text-xs font-mono tabular-nums text-zinc-200 transition-colors cursor-pointer"
                      >
                        {presetDisplay}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 5 Danger Zones Breakdown */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-zinc-400 tracking-wide">
              Fatality &amp; Impact Zones
            </h3>
            {DANGER_ZONES.map((zone) => {
              const isActive = zone.id === currentZone.id;
              return (
                <div
                  key={zone.id}
                  className={`p-3.5 rounded-2xl border transition-colors ${
                    isActive
                      ? `${zone.surfaceTintClass} ${zone.borderTintClass}`
                      : 'bg-zinc-900/40 border-zinc-800/80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{ backgroundColor: zone.accentHex }}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-semibold text-zinc-100">
                        {zone.label}
                      </span>
                    </div>
                    <span className="text-xs font-mono font-medium tabular-nums text-zinc-300">
                      {formatSpeedRange(zone, unit)}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-300 mt-1.5 leading-relaxed">
                    {zone.fatalityNote}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer action */}
        <div className="p-4 pb-safe border-t border-zinc-800/80 bg-[#111319]">
          <button
            type="button"
            onClick={onClose}
            className="w-full min-h-[48px] rounded-xl bg-zinc-100 text-zinc-950 font-semibold text-sm hover:bg-white transition-colors cursor-pointer"
          >
            Return to Speedometer
          </button>
        </div>
      </div>
    </div>
  );
};
