import React, { useEffect, useMemo, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
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

interface MotoHudNativePlugin {
  startTracking(): Promise<void>;
  stopTracking(): Promise<void>;
  isTracking(): Promise<{ active: boolean }>;
  setUnit(options: { unit: SpeedUnit }): Promise<void>;
}

const MotoHudNative = registerPlugin<MotoHudNativePlugin>('MotoHud');

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
  const [nativeTrackingActive, setNativeTrackingActive] = useState(false);
  const isAndroidApp = Capacitor.getPlatform() === 'android';

  const gps = useGpsSpeed();

  useEffect(() => {
    if (!isAndroidApp) return;
    MotoHudNative.isTracking()
      .then(({ active }) => setNativeTrackingActive(active))
      .catch(() => setNativeTrackingActive(false));
    void MotoHudNative.setUnit({ unit });
  }, [isAndroidApp]);

  const toggleNativeTracking = async () => {
    try {
      if (nativeTrackingActive) {
        await MotoHudNative.stopTracking();
        setNativeTrackingActive(false);
      } else {
        await MotoHudNative.startTracking();
        setNativeTrackingActive(true);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to change GPS tracking.';
      window.alert(message);
    }
  };

  const handleToggleUnit = (nextUnit: SpeedUnit) => {
    setUnit(nextUnit);
    if (isAndroidApp) void MotoHudNative.setUnit({ unit: nextUnit }).catch(() => {});
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
      // Gracefully ignore if embedded iframe or WebView restricts fullscreen
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
  const isElevatedDanger = activeZone.id !== 'safe';

  const gpsSummaryText = (() => {
    if (isSimulated) return 'SIM';
    switch (gps.status) {
      case 'active':
        return gps.accuracyMeters !== null
          ? `GPS ±${gps.accuracyMeters}m`
          : 'GPS Live';
      case 'requesting':
        return 'GPS Lock…';
      case 'timeout':
        return 'GPS Search…';
      case 'denied':
        return 'GPS Denied';
      case 'unavailable':
        return 'No Signal';
      case 'unsupported':
        return 'No GPS';
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
    <div className="relative h-[100dvh] w-full bg-[#090A0D] text-zinc-100 flex flex-col overflow-hidden">
      {/* Full-screen dynamic speed-danger radial atmosphere */}
      <div
        className={`pointer-events-none fixed inset-0 transition-all duration-300 ${
          isLethal ? 'animate-lethal-pulse' : ''
        }`}
        style={{
          background: `radial-gradient(circle at 50% 45%, ${activeZone.glowRgba} 0%, rgba(9, 10, 13, 0.92) 72%)`,
        }}
        aria-hidden="true"
      />

      {/* Full-screen peripheral danger frame border */}
      <div
        className="pointer-events-none fixed inset-0 transition-opacity duration-200"
        style={{
          boxShadow: isElevatedDanger
            ? `inset 0 0 0 ${isLethal ? '6px' : '3px'} ${activeZone.accentHex}`
            : 'inset 0 0 0 0px transparent',
          opacity: isElevatedDanger ? (isLethal ? 0.95 : 0.65) : 0,
        }}
        aria-hidden="true"
      />

      {/* Ultra-compact Top HUD Strip */}
      <header className="relative z-20 pt-safe px-3 sm:px-6 h-12 flex items-center justify-between gap-2 bg-[#090A0D]/65 backdrop-blur-md border-b border-zinc-800/50 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="font-display text-lg font-bold tracking-tight text-zinc-100 whitespace-nowrap shrink-0">
            MotoHUD
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

        <div className="flex items-center gap-1 shrink-0">
          {gps.wakeLockSupported && (
            <button
              type="button"
              onClick={gps.toggleWakeLock}
              className={`min-h-[44px] min-w-[44px] px-2.5 flex items-center justify-center gap-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                gps.wakeLockActive
                  ? 'text-emerald-400 hover:bg-emerald-500/10'
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
                {gps.wakeLockActive ? 'Awake' : 'Sleep'}
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
          <div className="relative z-20 mx-3 sm:mx-6 mt-2 px-3 py-2 rounded-xl bg-zinc-900/95 border border-zinc-800 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 text-xs text-zinc-200 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="truncate">{gps.errorMessage}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {gps.status !== 'unsupported' && (
                <button
                  type="button"
                  onClick={gps.retryGps}
                  className="min-h-[36px] px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-100 transition-colors whitespace-nowrap cursor-pointer"
                >
                  Retry
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsSimulated(true)}
                className="min-h-[36px] px-2.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-xs font-semibold text-zinc-950 transition-colors whitespace-nowrap cursor-pointer"
              >
                Simulate
              </button>
            </div>
          </div>
        )}

      {/* Main Full-Screen Speedometer Stage */}
      <main className="relative z-10 flex-1 min-h-0 w-full max-w-7xl mx-auto px-3 sm:px-6 py-2 sm:py-5 flex flex-col lg:grid lg:grid-cols-12 lg:gap-8 items-center justify-between lg:items-stretch">
        {/* Dominant Giant Speedometer */}
        <section
          aria-label="Live speed and danger indicator"
          className="w-full flex-1 min-h-0 lg:col-span-8 flex flex-col items-center justify-center"
        >
          <DangerArcGauge
            speedMs={activeSpeedMs}
            unit={unit}
            onToggleUnit={handleToggleUnit}
            zone={activeZone}
            isSimulated={isSimulated}
          />
        </section>

        {/* Mobile single-line physics summary (minimal vertical footprint) */}
        <div className="lg:hidden w-full max-w-2xl pt-2 pb-1 flex items-center justify-between gap-2 text-xs font-mono tabular-nums text-zinc-300 shrink-0">
          <div>
            <span className="text-zinc-500">Stop </span>
            <span className="font-bold text-zinc-100">
              {formatDistanceMeters(stoppingDistMeters, unit)}
            </span>
          </div>
          <span className="text-zinc-700" aria-hidden="true">
            ·
          </span>
          <div>
            <span className="text-zinc-500">Drop </span>
            <span
              className={`font-bold ${
                dropHeightMeters >= 20
                  ? activeZone.textColorClass
                  : 'text-zinc-100'
              }`}
            >
              {formatDistanceMeters(dropHeightMeters, unit)}
            </span>
          </div>
          <span className="text-zinc-700" aria-hidden="true">
            ·
          </span>
          <div>
            <span className="text-zinc-500">Peak </span>
            <span className="font-bold text-zinc-100">
              {peakSpeedDisplay} {unitLabel(unit)}
            </span>
          </div>
        </div>

        {/* Desktop / Landscape Right Telemetry Column */}
        <section
          aria-label="Impact physics and trip telemetry"
          className="hidden lg:flex lg:col-span-4 flex-col justify-center gap-4"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-2xl bg-zinc-900/75 border border-zinc-800/90">
              <div className="text-xs text-zinc-400">Stopping Dist</div>
              <div className="font-mono text-2xl font-bold tabular-nums text-zinc-100 mt-0.5">
                {formatDistanceMeters(stoppingDistMeters, unit)}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">
                1s reaction + 0.7g dry brake
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900/75 border border-zinc-800/90">
              <div className="text-xs text-zinc-400">Impact Drop</div>
              <div
                className={`font-mono text-2xl font-bold tabular-nums mt-0.5 ${
                  dropHeightMeters >= 20
                    ? activeZone.textColorClass
                    : 'text-zinc-100'
                }`}
              >
                {formatDistanceMeters(dropHeightMeters, unit)}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">
                {dropStories > 0
                  ? `~${dropStories} ${dropStories === 1 ? 'story' : 'stories'} freefall`
                  : 'Stationary impact'}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-900/75 border border-zinc-800/90 col-span-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-zinc-400">Peak Speed</span>
                <span className="text-[11px] font-mono tabular-nums text-zinc-500">
                  Avg {avgSpeedDisplay} {unitLabel(unit)} ·{' '}
                  {formatTripDistance(gps.tripDistanceMeters, unit)}
                </span>
              </div>
              <div className="font-mono text-2xl font-bold tabular-nums text-zinc-100 mt-0.5">
                {peakSpeedDisplay}{' '}
                <span className="text-xs font-normal text-zinc-400">
                  {unitLabel(unit)}
                </span>
              </div>
              <div className="text-xs text-zinc-400 mt-1.5">
                {energyRatioVs30 > 1
                  ? `Kinetic energy is ${energyRatioVs30.toFixed(1)}× higher than 30 km/h urban speed.`
                  : activeZone.fatalityNote}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/90">
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

      {/* Mobile Simulation Slider Bar when Simulate mode is active */}
      {isSimulated && !drawerOpen && (
        <div className="lg:hidden relative z-20 px-4 py-2 bg-zinc-950/95 border-t border-zinc-800 shrink-0">
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

      {/* Compact Bottom Action Strip */}
      <footer className="relative z-20 pb-safe px-3 sm:px-6 pt-1.5 border-t border-zinc-800/50 bg-[#090A0D]/75 backdrop-blur-md shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="min-h-[44px] px-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs sm:text-sm font-medium text-zinc-100 flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4 text-zinc-400" />
            <span>Danger Guide</span>
          </button>

          <div className="flex items-center gap-2">
            {isAndroidApp && (
              <button
                type="button"
                onClick={toggleNativeTracking}
                className={`min-h-[44px] px-3 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  nativeTrackingActive
                    ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
                    : 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400'
                }`}
                title="Keeps the home-screen widget updated while MotoHUD is closed"
              >
                {nativeTrackingActive ? 'Stop Ride' : 'Start Ride'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsSimulated((prev) => !prev)}
              className={`min-h-[44px] px-3.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
              className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs sm:text-sm font-medium text-zinc-300 hover:text-zinc-100 flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Reset peak speed and trip distance"
              aria-label="Reset trip stats"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          </div>
        </div>
      </footer>

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
