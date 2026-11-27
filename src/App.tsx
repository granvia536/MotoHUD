import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { AlertTriangle } from 'lucide-react';
import { useGpsSpeed } from './hooks/useGpsSpeed';
import { useDashCamSpeed } from './hooks/useDashCamSpeed';
import { DangerArcGauge } from './components/DangerArcGauge';
import { DangerScaleDrawer } from './components/DangerScaleDrawer';
import { DashCamModal } from './components/DashCamModal';
import {
  SpeedUnit,
  getDangerZone,
  msToUnit,
  unitLabel,
} from './utils/speedPhysics';

const UNIT_STORAGE_KEY = 'motospeed_unit_pref';

interface MotoHudNativePlugin {
  ensureCameraPermission(): Promise<{ granted: boolean }>;
  startTracking(): Promise<void>;
  startIfPermitted(): Promise<{ active: boolean }>;
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
  const [dashCamModalOpen, setDashCamModalOpen] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);
  const [simSpeedKmh, setSimSpeedKmh] = useState(64);
  const [nativeTrackingActive, setNativeTrackingActive] = useState(false);
  const [nativeError, setNativeError] = useState<string | null>(null);
  const isAndroidApp = Capacitor.getPlatform() === 'android';

  const gps = useGpsSpeed();

  const ensureAndroidCameraPermission = useCallback(async () => {
    try {
      const { granted } = await MotoHudNative.ensureCameraPermission();
      return granted;
    } catch {
      return false;
    }
  }, []);

  const dashCam = useDashCamSpeed({
    isAndroidApp,
    ensureAndroidCameraPermission,
    gpsSpeedMs: gps.speedMs,
    gpsActive: gps.status === 'active',
    gpsAccuracyMeters: gps.accuracyMeters,
  });

  useEffect(() => {
    if (!isAndroidApp) return;
    void MotoHudNative.setUnit({ unit });
    MotoHudNative.startIfPermitted()
      .then(({ active }) => setNativeTrackingActive(active))
      .catch(() => {
        MotoHudNative.isTracking()
          .then(({ active }) => setNativeTrackingActive(active))
          .catch(() => setNativeTrackingActive(false));
      });
  }, [isAndroidApp]);

  const toggleNativeTracking = async () => {
    setNativeError(null);
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
      setNativeError(message);
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

  const handleOpenDashCam = () => {
    setDashCamModalOpen(true);
    if (!dashCam.active && !dashCam.starting) {
      void dashCam.startCamera();
    }
  };

  // Fuse GPS + Rear Camera Dash OCR when camera is actively reading the dash
  const activeSpeedMs = useMemo(() => {
    if (isSimulated) {
      return simSpeedKmh / 3.6;
    }
    if (dashCam.active && dashCam.dashSpeedKmh !== null) {
      if (dashCam.dashSpeedKmh === 0) return 0;
      const calibratedDashMs =
        (dashCam.dashSpeedKmh * dashCam.calibrationRatio) / 3.6;
      const gpsFresh =
        gps.status === 'active' &&
        gps.lastFixTime !== null &&
        Date.now() - gps.lastFixTime < 3500;
      if (gpsFresh) {
        return 0.65 * calibratedDashMs + 0.35 * gps.speedMs;
      }
      return calibratedDashMs;
    }
    return gps.speedMs;
  }, [
    dashCam.active,
    dashCam.calibrationRatio,
    dashCam.dashSpeedKmh,
    gps.lastFixTime,
    gps.speedMs,
    gps.status,
    isSimulated,
    simSpeedKmh,
  ]);

  const activeZone = useMemo(
    () => getDangerZone(activeSpeedMs),
    [activeSpeedMs]
  );

  const isLethal = activeZone.id === 'lethal';
  const isElevatedDanger = activeZone.id !== 'safe';

  const gpsSummaryText = (() => {
    if (isSimulated) return 'Simulation Mode';
    const camTag =
      dashCam.active && dashCam.dashSpeedKmh !== null
        ? ` · Dash Cam ${dashCam.dashSpeedKmh} km/h`
        : dashCam.active
        ? ' · Dash Cam Aiming'
        : '';
    switch (gps.status) {
      case 'active':
        return `${
          gps.accuracyMeters !== null
            ? `GPS Active · ±${gps.accuracyMeters}m`
            : 'GPS Active'
        }${camTag}`;
      case 'requesting':
        return `Acquiring GPS…${camTag}`;
      case 'timeout':
        return `Searching Satellites…${camTag}`;
      case 'denied':
        return `GPS Denied${camTag}`;
      case 'unavailable':
        return `GPS Unavailable${camTag}`;
      case 'unsupported':
        return `No GPS Hardware${camTag}`;
    }
  })();

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

      {/* Non-blocking GPS permission / signal notice only when needed */}
      {nativeError && (
        <div className="relative z-20 mx-3 sm:mx-6 mt-3 px-3 py-2 rounded-xl bg-zinc-900/95 border border-red-500/40 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 text-xs text-red-200 min-w-0">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="truncate">{nativeError}</span>
          </div>
          <button
            type="button"
            onClick={() => setNativeError(null)}
            className="min-h-[36px] px-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-100 transition-colors whitespace-nowrap cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {!isSimulated &&
        !dashCam.active &&
        (gps.status === 'denied' ||
          gps.status === 'unavailable' ||
          gps.status === 'unsupported') && (
          <div className="relative z-20 mx-3 sm:mx-6 mt-3 px-3 py-2 rounded-xl bg-zinc-900/95 border border-zinc-800 flex items-center justify-between gap-2 shrink-0">
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

      {/* Pure Full-Screen HUD matching screenshot */}
      <main className="relative z-10 flex-1 min-h-0 w-full max-w-4xl mx-auto px-4 sm:px-8 pt-safe pb-safe flex flex-col">
        <DangerArcGauge
          speedMs={activeSpeedMs}
          unit={unit}
          onToggleUnit={handleToggleUnit}
          zone={activeZone}
          isSimulated={isSimulated}
          onOpenControls={() => setDrawerOpen(true)}
          dashCamActive={dashCam.active}
          onOpenDashCam={handleOpenDashCam}
        />
      </main>

      {/* Inline Simulation Slider only when Simulation Mode is active */}
      {isSimulated && !drawerOpen && (
        <div className="relative z-20 px-4 pb-safe pt-2 bg-zinc-950/90 border-t border-zinc-800 shrink-0">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsSimulated(false)}
              className="min-h-[38px] px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-100 whitespace-nowrap cursor-pointer"
            >
              Live GPS
            </button>
            <input
              type="range"
              min={0}
              max={120}
              step={1}
              value={Math.min(120, simSpeedKmh)}
              onChange={(e) => setSimSpeedKmh(Number(e.target.value))}
              aria-label="Simulated speed slider"
              className="flex-1 h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
            />
            <span className="text-xs font-mono font-bold tabular-nums text-amber-400 w-16 text-right">
              {Math.round(msToUnit(Math.min(120, simSpeedKmh) / 3.6, unit))}{' '}
              {unitLabel(unit)}
            </span>
          </div>
        </div>
      )}

      {/* Controls & Danger Guide Drawer (opened by tapping bottom danger banner) */}
      <DangerScaleDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        unit={unit}
        currentZone={activeZone}
        activeSpeedMs={activeSpeedMs}
        peakSpeedMs={gps.maxSpeedMs}
        tripDistanceMeters={gps.tripDistanceMeters}
        gpsLabel={gpsSummaryText}
        isSimulated={isSimulated}
        simSpeedKmh={simSpeedKmh}
        onToggleSimulation={(enabled) => setIsSimulated(enabled)}
        onChangeSimSpeedKmh={setSimSpeedKmh}
        onResetTrip={gps.resetTrip}
        isFullscreen={isFullscreen}
        onToggleFullscreen={toggleFullscreen}
        wakeLockSupported={gps.wakeLockSupported}
        wakeLockActive={gps.wakeLockActive}
        onToggleWakeLock={gps.toggleWakeLock}
        isAndroidApp={isAndroidApp}
        nativeTrackingActive={nativeTrackingActive}
        onToggleNativeTracking={toggleNativeTracking}
        dashCamActive={dashCam.active}
        onOpenDashCam={handleOpenDashCam}
      />

      {/* Rear Camera Alignment & Dash Speed Fusion Modal */}
      <DashCamModal
        open={dashCamModalOpen}
        onClose={() => setDashCamModalOpen(false)}
        dashCam={dashCam}
        unit={unit}
        gpsSpeedMs={gps.speedMs}
      />
    </div>
  );
}
