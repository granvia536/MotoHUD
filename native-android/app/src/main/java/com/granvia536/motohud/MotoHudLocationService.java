package com.granvia536.motohud;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.IBinder;
import android.content.pm.ServiceInfo;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import java.util.Locale;

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
        startTrackingForeground();
        requestGpsUpdates();
        return START_STICKY;
    }

    private void startTrackingForeground() {
        Intent openApp = new Intent(this, MainActivity.class);
        openApp.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this, 0, openApp,
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

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean("tracking", true).apply();
        MotoHudWidgetProvider.updateAll(this);
    }

    private void requestGpsUpdates() {
        boolean fine = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
        boolean coarse = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;

        if (!fine && !coarse) {
            stopSelf();
            return;
        }

        try {
            if (fine && locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(LocationManager.GPS_PROVIDER, 1000L, 0f, this);
            } else {
                locationManager.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 2000L, 0f, this);
            }
        } catch (SecurityException error) {
            stopSelf();
        }
    }

    @Override
    public void onLocationChanged(Location location) {
        float speed = location.hasSpeed() ? Math.max(0f, location.getSpeed()) : 0f;
        if (!location.hasSpeed() && lastLocation != null) {
            long elapsed = location.getTime() - lastLocation.getTime();
            if (elapsed > 0) speed = lastLocation.distanceTo(location) / (elapsed / 1000f);
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
            .apply();

        MotoHudWidgetProvider.updateAll(this);
    }

    @Override
    public void onProviderDisabled(String provider) {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        prefs.edit().putFloat("speed_ms", 0f).apply();
        MotoHudWidgetProvider.updateAll(this);
    }

    @Override
    public void onProviderEnabled(String provider) { }

    @Override
    public void onStatusChanged(String provider, int status, android.os.Bundle extras) { }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "MotoHUD ride tracking", NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Keeps GPS speed available to the MotoHUD home-screen widget.");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) manager.createNotificationChannel(channel);
        }
    }

    @Override
    public void onDestroy() {
        if (locationManager != null) {
            try { locationManager.removeUpdates(this); } catch (SecurityException ignored) { }
        }
        getSharedPreferences(PREFS, MODE_PRIVATE).edit()
            .putBoolean("tracking", false)
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
