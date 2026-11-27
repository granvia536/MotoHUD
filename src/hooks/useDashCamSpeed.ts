import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DigitDetection,
  LcdPolarity,
  recognizeSevenSegmentSpeed,
} from '../utils/sevenSegmentOcr';

export interface RoiBox {
  x: number; // 0..1 left
  y: number; // 0..1 top
  w: number; // 0..1 width
  h: number; // 0..1 height
}

export interface DashCamState {
  active: boolean;
  starting: boolean;
  error: string | null;
  stream: MediaStream | null;
  roi: RoiBox;
  polarity: LcdPolarity;
  dashSpeedKmh: number | null;
  confidence: number;
  digits: DigitDetection[];
  calibrationRatio: number;
  zoomSupported: boolean;
  zoomRange: { min: number; max: number; step: number };
  zoom: number;
  setRoi: (next: RoiBox) => void;
  setPolarity: (next: LcdPolarity) => void;
  setZoom: (nextZoom: number) => Promise<void>;
  startCamera: () => Promise<boolean>;
  stopCamera: () => void;
}

const ROI_STORAGE_KEY = 'motohud_dashcam_roi_v1';
const POLARITY_STORAGE_KEY = 'motohud_dashcam_polarity_v1';
const CALIBRATION_STORAGE_KEY = 'motohud_dashcam_cal_v1';

const DEFAULT_ROI: RoiBox = {
  x: 0.28,
  y: 0.36,
  w: 0.44,
  h: 0.28,
};

function clampRoi(box: RoiBox): RoiBox {
  const w = Math.max(0.14, Math.min(0.85, box.w));
  const h = Math.max(0.12, Math.min(0.7, box.h));
  const x = Math.max(0.02, Math.min(0.98 - w, box.x));
  const y = Math.max(0.02, Math.min(0.98 - h, box.y));
  return { x, y, w, h };
}

export function useDashCamSpeed(options: {
  isAndroidApp: boolean;
  ensureAndroidCameraPermission?: () => Promise<boolean>;
  gpsSpeedMs: number;
  gpsActive: boolean;
  gpsAccuracyMeters: number | null;
}): DashCamState {
  const {
    isAndroidApp,
    ensureAndroidCameraPermission,
    gpsSpeedMs,
    gpsActive,
    gpsAccuracyMeters,
  } = options;

  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [dashSpeedKmh, setDashSpeedKmh] = useState<number | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [digits, setDigits] = useState<DigitDetection[]>([]);

  const [roi, setRoiState] = useState<RoiBox>(() => {
    try {
      const saved = localStorage.getItem(ROI_STORAGE_KEY);
      if (saved) return clampRoi(JSON.parse(saved) as RoiBox);
    } catch {
      // Ignore storage errors
    }
    return DEFAULT_ROI;
  });

  const [polarity, setPolarityState] = useState<LcdPolarity>(() => {
    try {
      const saved = localStorage.getItem(POLARITY_STORAGE_KEY);
      if (saved === 'dark-on-light' || saved === 'light-on-dark') return saved;
    } catch {
      // Ignore
    }
    return 'auto';
  });

  const [calibrationRatio, setCalibrationRatio] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(CALIBRATION_STORAGE_KEY));
      if (Number.isFinite(saved) && saved >= 0.85 && saved <= 1.05) {
        return saved;
      }
    } catch {
      // Ignore
    }
    return 0.96;
  });

  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 1, step: 0.1 });
  const [zoom, setZoomState] = useState(1);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const roiRef = useRef(roi);
  const polarityRef = useRef(polarity);
  const recentReadingsRef = useRef<number[]>([]);

  useEffect(() => {
    roiRef.current = roi;
  }, [roi]);

  useEffect(() => {
    polarityRef.current = polarity;
  }, [polarity]);

  const setRoi = useCallback((next: RoiBox) => {
    const clamped = clampRoi(next);
    setRoiState(clamped);
    try {
      localStorage.setItem(ROI_STORAGE_KEY, JSON.stringify(clamped));
    } catch {
      // Ignore
    }
  }, []);

  const setPolarity = useCallback((next: LcdPolarity) => {
    setPolarityState(next);
    try {
      localStorage.setItem(POLARITY_STORAGE_KEY, next);
    } catch {
      // Ignore
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    recentReadingsRef.current = [];
    setStream(null);
    setActive(false);
    setStarting(false);
    setDashSpeedKmh(null);
    setConfidence(0);
    setDigits([]);
  }, []);

  const setZoom = useCallback(async (nextZoom: number) => {
    const currentStream = streamRef.current;
    if (!currentStream) return;
    const track = currentStream.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({
        advanced: [{ zoom: nextZoom } as unknown as MediaTrackConstraintSet],
      });
      setZoomState(nextZoom);
    } catch {
      // Ignore unsupported zoom constraint errors
    }
  }, []);

  const startCamera = useCallback(async (): Promise<boolean> => {
    if (starting) return false;
    setError(null);
    setStarting(true);

    try {
      if (isAndroidApp && ensureAndroidCameraPermission) {
        const granted = await ensureAndroidCameraPermission();
        if (!granted) {
          setError('Camera permission is required to read your motorbike dash.');
          setStarting(false);
          return false;
        }
      }

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        !navigator.mediaDevices.getUserMedia
      ) {
        setError('Rear camera access is not available in this browser.');
        setStarting(false);
        return false;
      }

      stopCamera();

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = mediaStream;
      setStream(mediaStream);

      const track = mediaStream.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === 'function') {
        const caps = track.getCapabilities() as MediaTrackCapabilities & {
          zoom?: { min: number; max: number; step?: number };
        };
        if (caps.zoom && caps.zoom.max > caps.zoom.min) {
          setZoomSupported(true);
          setZoomRange({
            min: caps.zoom.min,
            max: Math.min(4, caps.zoom.max),
            step: caps.zoom.step || 0.1,
          });
          setZoomState(caps.zoom.min);
        } else {
          setZoomSupported(false);
        }
      }

      if (!videoRef.current) {
        const vid = document.createElement('video');
        vid.playsInline = true;
        vid.muted = true;
        vid.autoplay = true;
        videoRef.current = vid;
      }
      videoRef.current.srcObject = mediaStream;
      await videoRef.current.play();

      if (!canvasRef.current) {
        const canvas = document.createElement('canvas');
        canvas.width = 240;
        canvas.height = 120;
        canvasRef.current = canvas;
      }

      setActive(true);
      setStarting(false);
      return true;
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Unable to start rear camera.';
      setError(msg);
      stopCamera();
      return false;
    }
  }, [ensureAndroidCameraPermission, isAndroidApp, starting, stopCamera]);

  // Continuous background OCR loop when camera is active
  useEffect(() => {
    if (!active || !stream) return;

    let rafId = 0;
    let lastRun = 0;
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      rafId = requestAnimationFrame(tick);

      if (now - lastRun < 140) return;
      lastRun = now;

      const vid = videoRef.current;
      const canvas = canvasRef.current;
      if (!vid || !canvas || vid.readyState < 2 || vid.videoWidth === 0) return;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const currentRoi = roiRef.current;
      const sx = Math.round(currentRoi.x * vid.videoWidth);
      const sy = Math.round(currentRoi.y * vid.videoHeight);
      const sw = Math.max(16, Math.round(currentRoi.w * vid.videoWidth));
      const sh = Math.max(16, Math.round(currentRoi.h * vid.videoHeight));

      ctx.drawImage(vid, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const res = recognizeSevenSegmentSpeed(imgData, polarityRef.current);

      setDigits(res.digits);

      if (res.value !== null && res.confidence >= 0.48) {
        const buf = recentReadingsRef.current;
        buf.push(res.value);
        if (buf.length > 5) buf.shift();

        // Temporal median filter rejects single-frame glare spikes
        const sorted = [...buf].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];

        // Require at least 2 close readings before changing far from current
        const closeCount = buf.filter((v) => Math.abs(v - median) <= 3).length;
        if (closeCount >= 2 || buf.length === 1) {
          setDashSpeedKmh(median);
          setConfidence(res.confidence);
        }
      } else {
        setConfidence(0);
      }
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
    };
  }, [active, stream]);

  // Self-calibrate dash-to-true-GPS ratio during steady riding (>18 km/h)
  useEffect(() => {
    if (!active || !gpsActive || dashSpeedKmh === null) return;
    if (gpsAccuracyMeters !== null && gpsAccuracyMeters > 16) return;

    const gpsKmh = gpsSpeedMs * 3.6;
    if (dashSpeedKmh >= 18 && gpsKmh >= 15) {
      const sampleRatio = gpsKmh / dashSpeedKmh;
      if (sampleRatio >= 0.85 && sampleRatio <= 1.05) {
        setCalibrationRatio((prev) => {
          const next = prev * 0.96 + sampleRatio * 0.04;
          try {
            localStorage.setItem(CALIBRATION_STORAGE_KEY, next.toFixed(4));
          } catch {
            // Ignore
          }
          return next;
        });
      }
    }
  }, [active, dashSpeedKmh, gpsAccuracyMeters, gpsActive, gpsSpeedMs]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return {
    active,
    starting,
    error,
    stream,
    roi,
    polarity,
    dashSpeedKmh,
    confidence,
    digits,
    calibrationRatio,
    zoomSupported,
    zoomRange,
    zoom,
    setRoi,
    setPolarity,
    setZoom,
    startCamera,
    stopCamera,
  };
}
