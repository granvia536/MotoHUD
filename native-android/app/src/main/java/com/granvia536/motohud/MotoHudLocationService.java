package com.granvia536.motohud;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

public class MotoHudLocationService extends Service implements LocationListener {
    public static final String ACTION_START = "com.granvia536.motohud.START_TRACKING";
    private static final String CHANNEL_ID = "motohud_tracking";
    private static final int NOTIFICATION_ID = 7301;
    private static final String PREFS = "motohud_widget";

    private LocationManager locationManager;
    private Location lastLocation;

    @Override
    public void onCreate() {
        super.onCreate();
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!hasAnyLocationPermission()) {
            stopSelf();
            return START_NOT_STICKY;
        }
        startTrackingForeground();
        requestGpsUpdates();
        return START_STICKY;
    }

    private boolean hasAnyLocationPermission() {
        boolean fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        return fine || coarse;
    }

    private void startTrackingForeground() {
        Intent openApp = new Intent(this, MainActivity.class);
        openApp.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            openApp,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setContentTitle("MotoHUD GPS is running")
            .setContentText("Live speed is being sent to your home-screen widget.")
            .setContentIntent(pendingIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(
                    NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
                );
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (SecurityException error) {
            stopSelf();
            return;
        }

        getSharedPreferences(PREFS, MODE_PRIVATE)
            .edit()
            .putBoolean("tracking", true)
            .apply();
        MotoHudWidgetProvider.updateAll(this);
    }

    private void requestGpsUpdates() {
        if (locationManager == null) return;

        boolean fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;

        if (!fine && !coarse) {
            stopSelf();
            return;
        }

        boolean requestedAny = false;

        if (fine) {
            try {
                if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                    Location lastGps = locationManager.getLastKnownLocation(LocationManager.GPS_PROVIDER);
                    if (lastGps != null && System.currentTimeMillis() - lastGps.getTime() < 15000L) {
                        onLocationChanged(lastGps);
                    }
                    locationManager.requestLocationUpdates(
                        LocationManager.GPS_PROVIDER,
                        500L,
                        0f,
                        this
                    );
                    requestedAny = true;
                }
            } catch (Exception ignored) { }
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                if (locationManager.hasProvider(LocationManager.FUSED_PROVIDER)) {
                    locationManager.requestLocationUpdates(
                        LocationManager.FUSED_PROVIDER,
                        1000L,
                        0f,
                        this
                    );
                    requestedAny = true;
                }
            } catch (Exception ignored) { }
        }

        try {
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER,
                    2000L,
                    0f,
                    this
                );
                requestedAny = true;
            }
        } catch (Exception ignored) { }

        if (!requestedAny) {
            try {
                locationManager.requestLocationUpdates(
                    LocationManager.PASSIVE_PROVIDER,
                    1000L,
                    0f,
                    this
                );
            } catch (Exception ignored) { }
        }
    }

    @Override
    public void onLocationChanged(Location location) {
        if (location == null) return;
        float speed = 0f;
        if (location.hasSpeed()) {
            speed = Math.max(0f, location.getSpeed());
        } else if (lastLocation != null) {
            long elapsed = location.getTime() - lastLocation.getTime();
            if (elapsed > 300L && elapsed < 15000L) {
                float dist = lastLocation.distanceTo(location);
                float candidate = dist / (elapsed / 1000f);
                if (candidate <= 95f) {
                    speed = candidate;
                }
            }
        }
        if (speed < 0.35f) {
            speed = 0f;
        }
        lastLocation = location;

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        prefs.edit()
            .putFloat("speed_ms", speed)
            .putLong("fix_time", System.currentTimeMillis())
            .putBoolean("tracking", true)
            .putBoolean("has_fix", true)
            .apply();

        MotoHudWidgetProvider.updateAll(this);
    }

    @Override
    public void onProviderDisabled(String provider) {
        if (LocationManager.GPS_PROVIDER.equals(provider)) {
            SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            prefs.edit().putFloat("speed_ms", 0f).apply();
            MotoHudWidgetProvider.updateAll(this);
        }
    }

    @Override
    public void onProviderEnabled(String provider) {
        requestGpsUpdates();
    }

    @Override
    public void onStatusChanged(String provider, int status, android.os.Bundle extras) { }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "MotoHUD ride tracking",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Keeps GPS speed available to the MotoHUD home-screen widget.");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    @Override
    public void onDestroy() {
        if (locationManager != null) {
            try {
                locationManager.removeUpdates(this);
            } catch (Exception ignored) { }
        }
        getSharedPreferences(PREFS, MODE_PRIVATE)
            .edit()
            .putBoolean("tracking", false)
            .putBoolean("has_fix", false)
            .putFloat("speed_ms", 0f)
            .apply();
        MotoHudWidgetProvider.updateAll(this);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
