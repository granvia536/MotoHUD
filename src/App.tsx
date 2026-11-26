import React, { useEffect, useMemo, useState } from 'react';
import {
  Maximize2,
  Minimize2,
  RotateCcw,
  SlidersHorizontal,
  Lock,
  Unlock,
  AlertTriangle,
} from 'lucide-react';
import { useGpsSpeed } from './hooks/useGpsSpeed';
import { DangerArcGauge } from './components/DangerArcGauge';
import { DangerScaleDrawer } from './components/DangerScaleDrawer';
import {
  DANGER_ZONES,
  SpeedUnit,
  calculateEquivalentDropMeters,
  calculateStoppingDistanceMeters,
  formatDistanceMeters,
  formatHeading,
  formatTripDistance,
  getDangerZone,
  msToUnit,
  unitLabel,
} from './utils/speedPhysics';

const UNIT_STORAGE_KEY = 'motospeed_unit_pref';

export default function App() {
  const [unit, setUnit] = useState<SpeedUnit>(() => {
    try {
      const saved = localStorage.getItem(UNIT_STORAGE_KEY);
      return saved === 'mph' ? 'mph' : 'kmh';
    } catch {
      return 'kmh';
    }
  });

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);
  const [simSpeedKmh, setSimSpeedKmh] = useState(64);

  const gps = useGpsSpeed();

  const handleToggleUnit = (nextUnit: SpeedUnit) => {
    setUnit(nextUnit);
    try {
      localStorage.setItem(UNIT_STORAGE_KEY, nextUnit);
    } catch {
      // Ignore storage failures
    }
  };

  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Gracefully ignore if embedded iframe restricts fullscreen
    }
  };

  const activeSpeedMs = isSimulated ? simSpeedKmh / 3.6 : gps.speedMs;
  const activeZone = useMemo(
    () => getDangerZone(activeSpeedMs),
    [activeSpeedMs]
  );

  const stoppingDistMeters = calculateStoppingDistanceMeters(activeSpeedMs);
  const dropHeightMeters = calculateEquivalentDropMeters(activeSpeedMs);
  const dropStories = Math.max(0, Math.round(dropHeightMeters / 3));

  const currentKmh = activeSpeedMs * 3.6;
  const energyRatioVs30 =
    currentKmh > 1 ? Math.pow(currentKmh / 30, 2) : 0;

  const isLethal = activeZone.id === 'lethal';
  const isSevereOrHigher =
    activeZone.id === 'severe' || activeZone.id === 'lethal';

  const gpsSummaryText = (() => {
    if (isSimulated) return 'Simulation Mode';
    switch (gps.status) {
      case 'active':
        return gps.accuracyMeters !== null
          ? `GPS Active · ±${gps.accuracyMeters}m`
          : 'GPS Active';
      case 'requesting':
        return 'Acquiring GPS';
      case 'timeout':
        return 'Searching Satellites';
      case 'denied':
        return 'GPS Denied';
      case 'unavailable':
        return 'GPS Unavailable';
      case 'unsupported':
        return 'No GPS Hardware';
    }
  })();

  const peakSpeedDisplay = Math.round(
    msToUnit(
      isSimulated ? Math.max(gps.maxSpeedMs, activeSpeedMs) : gps.maxSpeedMs,
      unit
    )
  );
  const avgSpeedDisplay = Math.round(msToUnit(gps.avgSpeedMs, unit));

  return (
    <div className="relative min-h-[100dvh] w-full bg-[#090A0D] text-zinc-100 flex flex-col overflow-x-hidden">
      {/* Full-screen dynamic speed-danger radial atmosphere */}
      <div
        className={`pointer-events-none fixed inset-0 transition-all duration-300 ${
          isLethal ? 'animate-lethal-pulse' : ''
        }`}
        style={{
          background: `radial-gradient(circle at 50% 42%, ${activeZone.glowRgba} 0%, rgba(9, 10, 13, 0) 68%)`,
        }}
        aria-hidden="true"
      />

      {/* Full-screen peripheral danger frame border when in severe/lethal zone */}
      <div
        className="pointer-events-none fixed inset-0 transition-opacity duration-200"
        style={{
          boxShadow: isSevereOrHigher
            ? `inset 0 0 0 3px ${activeZone.accentHex}`
            : 'inset 0 0 0 0px transparent',
          opacity: isSevereOrHigher ? (isLethal ? 0.9 : 0.6) : 0,
        }}
        aria-hidden="true"
      />

      {/* Compact Top HUD Bar */}
      <header className="relative z-20 pt-safe px-4 sm:px-6 h-14 flex items-center justify-between gap-4 border-b border-zinc-800/60 bg-[#090A0D]/75 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-display text-xl font-bold tracking-tight text-zinc-100 whitespace-nowrap shrink-0">
            MotoSpeed
          </span>
          <span className="text-zinc-700" aria-hidden="true">
            ·
          </span>
          <span className="text-xs font-mono tabular-nums text-zinc-300 truncate">
            {gpsSummaryText}
          </span>
          {!isSimulated && gps.headingDeg !== null && (
            <>
              <span className="hidden sm:inline text-zinc-700" aria-hidden="true">
                ·
              </span>
              <span className="hidden sm:inline text-xs font-mono tabular-nums text-zinc-400 whitespace-nowrap shrink-0">
                {formatHeading(gps.headingDeg)}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {gps.wakeLockSupported && (
            <button
              type="button"
              onClick={gps.toggleWakeLock}
              className={`min-h-[44px] min-w-[44px] px-2.5 flex items-center justify-center gap-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                gps.wakeLockActive
                  ? 'text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/15'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70'
              }`}
              title={
                gps.wakeLockActive
                  ? 'Screen wake lock active'
                  : 'Allow screen to sleep'
              }
              aria-label={
                gps.wakeLockActive
                  ? 'Screen stays awake, tap to allow sleep'
                  : 'Keep screen awake'
              }
            >
              {gps.wakeLockActive ? (
                <Lock className="w-4 h-4" />
              ) : (
                <Unlock className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">
                {gps.wakeLockActive ? 'Screen Awake' : 'Auto Sleep'}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800/70 transition-colors cursor-pointer"
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen HUD'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </header>

      {/* Non-blocking GPS permission / signal notice */}
      {!isSimulated &&
        (gps.status === 'denied' ||
          gps.status === 'unavailable' ||
          gps.status === 'unsupported') && (
          <div className="relative z-20 mx-4 sm:mx-6 mt-3 px-4 py-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-zinc-200 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="truncate">{gps.errorMessage}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {gps.status !== 'unsupported' && (
                <button
                  type="button"
                  onClick={gps.retryGps}
                  className="min-h-[38px] px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-100 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Retry GPS
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsSimulated(true)}
                className="min-h-[38px] px-3 rounded-lg bg-amber-400 hover:bg-amber-300 text-xs font-semibold text-zinc-950 transition-colors whitespace-nowrap cursor-pointer"
              >
                Simulate Speed
              </button>
            </div>
          </div>
        )}

      {/* Main Full-Screen Cockpit Area */}
      <main className="relative z-10 flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-6 flex flex-col lg:grid lg:grid-cols-12 lg:gap-8 items-center justify-between lg:items-stretch">
        {/* Primary Speedometer & Danger Stage */}
        <section
          aria-label="Live speed and danger indicator"
          className="w-full lg:col-span-7 flex flex-col items-center justify-center flex-1 py-1"
        >
          <DangerArcGauge
            speedMs={activeSpeedMs}
            unit={unit}
            onToggleUnit={handleToggleUnit}
            zone={activeZone}
            isSimulated={isSimulated}
          />
        </section>

        {/* Secondary Rider Telemetry & Danger Physics */}
        <section
          aria-label="Impact physics and trip telemetry"
          className="w-full lg:col-span-5 flex flex-col justify-center gap-3 sm:gap-4 mt-3 lg:mt-0"
        >
          {/* Mobile & Desktop Core Impact Physics Grid */}
          <div className="grid grid-cols-3 lg:grid-cols-2 gap-2.5 sm:gap-3">
            <div className="p-3 sm:p-4 rounded-2xl bg-zinc-900/75 border border-zinc-800/90">
              <div className="text-[11px] sm:text-xs text-zinc-400">
                Stopping Dist
              </div>
              <div className="font-mono text-lg sm:text-2xl font-bold tabular-nums text-zinc-100 mt-0.5">
                {formatDistanceMeters(stoppingDistMeters, unit)}
              </div>
              <div className="hidden sm:block text-[11px] text-zinc-500 mt-1">
                1s reaction + 0.7g dry brake
              </div>
            </div>

            <div className="p-3 sm:p-4 rounded-2xl bg-zinc-900/75 border border-zinc-800/90">
              <div className="text-[11px] sm:text-xs text-zinc-400">
                Impact Drop
              </div>
              <div
                className={`font-mono text-lg sm:text-2xl font-bold tabular-nums mt-0.5 ${
                  dropHeightMeters >= 20 ? activeZone.textColorClass : 'text-zinc-100'
                }`}
              >
                {formatDistanceMeters(dropHeightMeters, unit)}
              </div>
              <div className="hidden sm:block text-[11px] text-zinc-500 mt-1">
                {dropStories > 0
                  ? `~${dropStories} ${dropStories === 1 ? 'story' : 'stories'} freefall`
                  : 'Stationary impact'}
              </div>
            </div>

            <div className="p-3 sm:p-4 rounded-2xl bg-zinc-900/75 border border-zinc-800/90 lg:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] sm:text-xs text-zinc-400">
                  Peak Speed
                </span>
                <span className="hidden lg:inline text-[11px] font-mono tabular-nums text-zinc-500">
                  Avg {avgSpeedDisplay} {unitLabel(unit)} ·{' '}
                  {formatTripDistance(gps.tripDistanceMeters, unit)}
                </span>
              </div>
              <div className="font-mono text-lg sm:text-2xl font-bold tabular-nums text-zinc-100 mt-0.5">
                {peakSpeedDisplay}{' '}
                <span className="text-xs font-normal text-zinc-400">
                  {unitLabel(unit)}
                </span>
              </div>
              <div className="hidden lg:block text-xs text-zinc-400 mt-1.5">
                {energyRatioVs30 > 1
                  ? `Kinetic energy is ${energyRatioVs30.toFixed(1)}× higher than 30 km/h urban speed.`
                  : activeZone.fatalityNote}
              </div>
            </div>
          </div>

          {/* Desktop-only Danger Spectrum Strip & Live Simulation Slider */}
          <div className="hidden lg:flex flex-col gap-3 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/90">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300">
                Danger Spectrum by Speed
              </span>
              <span className="text-xs font-mono tabular-nums text-zinc-400">
                {gps.altitudeMeters !== null
                  ? `Alt ${gps.altitudeMeters} m`
                  : 'High-Accuracy GPS'}
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1.5">
              {DANGER_ZONES.map((z) => {
                const active = z.id === activeZone.id;
                return (
                  <div
                    key={z.id}
                    className={`p-2 rounded-xl border transition-colors ${
                      active
                        ? `${z.surfaceTintClass} ${z.borderTintClass}`
                        : 'bg-zinc-950/60 border-zinc-800/70 opacity-65'
                    }`}
                  >
                    <div
                      className="h-1.5 w-full rounded-full mb-1.5"
                      style={{ backgroundColor: z.accentHex }}
                    />
                    <div className="text-[11px] font-semibold text-zinc-100 truncate">
                      {z.label}
                    </div>
                    <div className="text-[10px] font-mono tabular-nums text-zinc-400">
                      {z.maxKmh === null
                        ? `${Math.round(msToUnit(z.minKmh / 3.6, unit))}+`
                        : `${Math.round(msToUnit(z.minKmh / 3.6, unit))}–${Math.round(
                            msToUnit(z.maxKmh / 3.6, unit)
                          )}`}
                    </div>
                  </div>
                );
              })}
            </div>

            {isSimulated && (
              <div className="pt-2 border-t border-zinc-800/80 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-amber-400 font-medium">
                    Simulation Throttle
                  </span>
                  <span className="font-mono font-bold tabular-nums text-zinc-100">
                    {Math.round(msToUnit(simSpeedKmh / 3.6, unit))}{' '}
                    {unitLabel(unit)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={180}
                  step={1}
                  value={simSpeedKmh}
                  onChange={(e) => setSimSpeedKmh(Number(e.target.value))}
                  aria-label="Simulated motorbike speed"
                  className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                />
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Bottom Thumb-Zone Action Bar */}
      <footer className="relative z-20 pb-safe px-4 sm:px-6 pt-2 border-t border-zinc-800/60 bg-[#090A0D]/80 backdrop-blur-md shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="min-h-[44px] px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs sm:text-sm font-medium text-zinc-100 flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4 text-zinc-400" />
            <span>Danger Guide</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsSimulated((prev) => !prev)}
              className={`min-h-[44px] px-4 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isSimulated
                  ? 'bg-amber-400 text-zinc-950 hover:bg-amber-300'
                  : 'bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200'
              }`}
            >
              {isSimulated ? 'Live GPS' : 'Simulate'}
            </button>

            <button
              type="button"
              onClick={gps.resetTrip}
              className="min-h-[44px] min-w-[44px] px-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs sm:text-sm font-medium text-zinc-300 hover:text-zinc-100 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Reset peak speed and trip distance"
              aria-label="Reset trip stats"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Mobile Simulation Slider Bar when Simulate mode is active on small screens */}
      {isSimulated && !drawerOpen && (
        <div className="lg:hidden relative z-20 px-4 py-2.5 bg-zinc-950/95 border-t border-zinc-800">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-medium text-amber-400 whitespace-nowrap">
              Test Speed
            </span>
            <input
              type="range"
              min={0}
              max={180}
              step={1}
              value={simSpeedKmh}
              onChange={(e) => setSimSpeedKmh(Number(e.target.value))}
              aria-label="Simulated speed slider"
              className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
            <span className="text-xs font-mono font-bold tabular-nums text-zinc-200 w-16 text-right">
              {Math.round(msToUnit(simSpeedKmh / 3.6, unit))} {unitLabel(unit)}
            </span>
          </div>
        </div>
      )}

      {/* Danger Scale & Simulation Bottom Sheet / Drawer */}
      <DangerScaleDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        unit={unit}
        currentZone={activeZone}
        isSimulated={isSimulated}
        simSpeedKmh={simSpeedKmh}
        onToggleSimulation={(enabled) => setIsSimulated(enabled)}
        onChangeSimSpeedKmh={setSimSpeedKmh}
      />
    </div>
  );
}
