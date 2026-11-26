import { useCallback, useEffect, useRef, useState } from 'react';
import { haversineDistanceMeters } from '../utils/speedPhysics';

export type GpsStatus =
  | 'requesting'
  | 'active'
  | 'denied'
  | 'unavailable'
  | 'timeout'
  | 'unsupported';

export interface GpsTelemetry {
  speedMs: number;
  rawSpeedMs: number;
  maxSpeedMs: number;
  avgSpeedMs: number;
  tripDistanceMeters: number;
  accuracyMeters: number | null;
  headingDeg: number | null;
  altitudeMeters: number | null;
  status: GpsStatus;
  errorMessage: string | null;
  lastFixTime: number | null;
  speedSource: 'doppler' | 'haversine' | 'idle';
  wakeLockActive: boolean;
  wakeLockSupported: boolean;
  resetTrip: () => void;
  retryGps: () => void;
  toggleWakeLock: () => Promise<void>;
}

interface LastPositionSample {
  lat: number;
  lon: number;
  timestamp: number;
  accuracy: number;
}

const DEADBAND_MS = 0.35; // ~1.26 km/h stationary jitter suppression
const EMA_ALPHA = 0.55; // Responsive smoothing for motorbike acceleration

export function useGpsSpeed(): GpsTelemetry {
  const [speedMs, setSpeedMs] = useState(0);
  const [rawSpeedMs, setRawSpeedMs] = useState(0);
  const [maxSpeedMs, setMaxSpeedMs] = useState(0);
  const [avgSpeedMs, setAvgSpeedMs] = useState(0);
  const [tripDistanceMeters, setTripDistanceMeters] = useState(0);
  const [accuracyMeters, setAccuracyMeters] = useState<number | null>(null);
  const [headingDeg, setHeadingDeg] = useState<number | null>(null);
  const [altitudeMeters, setAltitudeMeters] = useState<number | null>(null);
  const [status, setStatus] = useState<GpsStatus>('requesting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastFixTime, setLastFixTime] = useState<number | null>(null);
  const [speedSource, setSpeedSource] = useState<'doppler' | 'haversine' | 'idle'>('idle');
  const [watchNonce, setWatchNonce] = useState(0);

  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const userWantedWakeLockRef = useRef(true);
  const wakeLockSupported =
    typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  const smoothedSpeedRef = useRef(0);
  const lastSampleRef = useRef<LastPositionSample | null>(null);
  const tripDistanceRef = useRef(0);
  const movingTimeMsRef = useRef(0);

  const acquireWakeLock = useCallback(async () => {
    if (!wakeLockSupported) return;
    try {
      if (wakeLockRef.current && !wakeLockRef.current.released) return;
      const sentinel = await navigator.wakeLock.request('screen');
      wakeLockRef.current = sentinel;
      setWakeLockActive(true);
      sentinel.addEventListener('release', () => {
        setWakeLockActive(false);
      });
    } catch {
      setWakeLockActive(false);
    }
  }, [wakeLockSupported]);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // Ignore release errors
      }
      wakeLockRef.current = null;
    }
    setWakeLockActive(false);
  }, []);

  const toggleWakeLock = useCallback(async () => {
    if (wakeLockActive) {
      userWantedWakeLockRef.current = false;
      await releaseWakeLock();
    } else {
      userWantedWakeLockRef.current = true;
      await acquireWakeLock();
    }
  }, [wakeLockActive, acquireWakeLock, releaseWakeLock]);

  useEffect(() => {
    if (!wakeLockSupported) return;
    if (userWantedWakeLockRef.current) {
      void acquireWakeLock();
    }

    const handleVisibility = () => {
      if (
        document.visibilityState === 'visible' &&
        userWantedWakeLockRef.current
      ) {
        void acquireWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      void releaseWakeLock();
    };
  }, [wakeLockSupported, acquireWakeLock, releaseWakeLock]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setStatus('unsupported');
      setErrorMessage('GPS geolocation is not supported by this browser.');
      return;
    }

    setStatus('requesting');
    setErrorMessage(null);

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { coords, timestamp } = position;
        const fixTime = timestamp || Date.now();
        const accuracy = typeof coords.accuracy === 'number' ? coords.accuracy : 999;

        setStatus('active');
        setErrorMessage(null);
        setAccuracyMeters(Number.isFinite(accuracy) ? Math.round(accuracy) : null);
        setHeadingDeg(
          coords.heading !== null &&
            typeof coords.heading === 'number' &&
            !Number.isNaN(coords.heading)
            ? coords.heading
            : null
        );
        setAltitudeMeters(
          coords.altitude !== null &&
            typeof coords.altitude === 'number' &&
            !Number.isNaN(coords.altitude)
            ? Math.round(coords.altitude)
            : null
        );
        setLastFixTime(fixTime);

        const prev = lastSampleRef.current;
        let instantSpeedMs = 0;
        let currentSource: 'doppler' | 'haversine' | 'idle' = 'idle';

        // Prefer native Doppler GPS speed when available and valid
        if (
          coords.speed !== null &&
          typeof coords.speed === 'number' &&
          !Number.isNaN(coords.speed) &&
          coords.speed >= 0
        ) {
          instantSpeedMs = coords.speed;
          currentSource = 'doppler';
        } else if (prev) {
          const dtSec = (fixTime - prev.timestamp) / 1000;
          if (dtSec >= 0.4 && dtSec <= 15 && accuracy <= 50 && prev.accuracy <= 50) {
            const dist = haversineDistanceMeters(
              prev.lat,
              prev.lon,
              coords.latitude,
              coords.longitude
            );
            // Ignore GPS jitter smaller than half the combined accuracy radius
            const noiseFloor = Math.min(12, (accuracy + prev.accuracy) * 0.25);
            if (dist > noiseFloor) {
              const candidateSpeed = dist / dtSec;
              // Reject impossible motorbike spikes (> 95 m/s = 342 km/h)
              if (candidateSpeed <= 95) {
                instantSpeedMs = candidateSpeed;
              }
            }
            currentSource = 'haversine';
          }
        }

        // Accumulate trip distance when accuracy is reasonable
        if (prev && accuracy <= 45) {
          const dtMs = fixTime - prev.timestamp;
          if (dtMs > 0 && dtMs <= 15000) {
            const deltaDist = haversineDistanceMeters(
              prev.lat,
              prev.lon,
              coords.latitude,
              coords.longitude
            );
            // Only accumulate distance when actually moving
            if (instantSpeedMs >= DEADBAND_MS && deltaDist < 800) {
              tripDistanceRef.current += deltaDist;
              movingTimeMsRef.current += dtMs;
              setTripDistanceMeters(tripDistanceRef.current);
              if (movingTimeMsRef.current > 0) {
                setAvgSpeedMs(
                  tripDistanceRef.current / (movingTimeMsRef.current / 1000)
                );
              }
            }
          }
        }

        lastSampleRef.current = {
          lat: coords.latitude,
          lon: coords.longitude,
          timestamp: fixTime,
          accuracy,
        };

        // Stationary deadband
        const cleanInstant = instantSpeedMs < DEADBAND_MS ? 0 : instantSpeedMs;
        setRawSpeedMs(cleanInstant);
        setSpeedSource(currentSource);

        // Smooth speed with EMA; snap quickly to 0 if raw drops to 0 twice
        const nextSmoothed =
          cleanInstant === 0 && smoothedSpeedRef.current < 1.2
            ? 0
            : EMA_ALPHA * cleanInstant +
              (1 - EMA_ALPHA) * smoothedSpeedRef.current;

        smoothedSpeedRef.current = nextSmoothed < DEADBAND_MS ? 0 : nextSmoothed;
        setSpeedMs(smoothedSpeedRef.current);
        setMaxSpeedMs((prevMax) =>
          Math.max(prevMax, smoothedSpeedRef.current)
        );
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied');
          setErrorMessage(
            'Location permission denied. Enable GPS access in browser settings or use Simulation mode.'
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setStatus('unavailable');
          setErrorMessage(
            'GPS signal unavailable. Move outdoors for clear satellite lock.'
          );
        } else if (err.code === err.TIMEOUT) {
          setStatus('timeout');
          setErrorMessage(
            'Waiting for high-accuracy GPS satellite fix...'
          );
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [watchNonce]);

  const resetTrip = useCallback(() => {
    tripDistanceRef.current = 0;
    movingTimeMsRef.current = 0;
    setTripDistanceMeters(0);
    setMaxSpeedMs(0);
    setAvgSpeedMs(0);
  }, []);

  const retryGps = useCallback(() => {
    setWatchNonce((n) => n + 1);
  }, []);

  return {
    speedMs,
    rawSpeedMs,
    maxSpeedMs,
    avgSpeedMs,
    tripDistanceMeters,
    accuracyMeters,
    headingDeg,
    altitudeMeters,
    status,
    errorMessage,
    lastFixTime,
    speedSource,
    wakeLockActive,
    wakeLockSupported,
    resetTrip,
    retryGps,
    toggleWakeLock,
  };
}
