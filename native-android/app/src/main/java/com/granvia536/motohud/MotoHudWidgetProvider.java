package com.granvia536.motohud;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.widget.RemoteViews;
import java.util.Locale;

public class MotoHudWidgetProvider extends AppWidgetProvider {
    private static final String PREFS = "motohud_widget";

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) updateWidget(context, manager, id);
    }

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (manager == null) return;
        ComponentName component = new ComponentName(context, MotoHudWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(component);
        if (ids == null) return;
        for (int id : ids) updateWidget(context, manager, id);
    }

    private static void updateWidget(Context context, AppWidgetManager manager, int id) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean tracking = prefs.getBoolean("tracking", false);
        float speedMs = prefs.getFloat("speed_ms", 0f);
        String unit = prefs.getString("unit", "kmh");
        float speed = unit.equals("mph") ? speedMs * 2.236936f : speedMs * 3.6f;
        int displayedSpeed = Math.round(Math.max(0f, speed));

        int zoneColor;
        int zoneTextColor;
        String zone;
        float kmh = speedMs * 3.6f;
        if (kmh <= 30f) {
            zone = "URBAN CRAWL · SAFE";
            zoneColor = Color.rgb(16, 185, 129);
            zoneTextColor = Color.rgb(9, 10, 13);
        } else if (kmh <= 55f) {
            zone = "CITY PACE · CAUTION";
            zoneColor = Color.rgb(245, 158, 11);
            zoneTextColor = Color.rgb(9, 10, 13);
        } else if (kmh <= 85f) {
            zone = "OPEN ROAD · HIGH RISK";
            zoneColor = Color.rgb(249, 115, 22);
            zoneTextColor = Color.rgb(9, 10, 13);
        } else if (kmh <= 115f) {
            zone = "SEVERE DANGER · SPEED KILLS";
            zoneColor = Color.rgb(220, 38, 38);
            zoneTextColor = Color.WHITE;
        } else {
            zone = "LETHAL VELOCITY · EXTREME";
            zoneColor = Color.rgb(255, 30, 66);
            zoneTextColor = Color.WHITE;
        }

        int inactiveBoxColor = Color.rgb(39, 39, 42);
        int inactiveBarColor = Color.rgb(82, 82, 91);

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_motohud);
        views.setTextViewText(R.id.widget_speed, tracking ? String.format(Locale.getDefault(), "%d", displayedSpeed) : "—");
        views.setTextViewText(R.id.widget_unit, unit.equals("mph") ? "mph" : "km/h");
        views.setTextViewText(R.id.widget_zone, tracking ? zone : "TAP TO START GPS");
        views.setTextViewText(R.id.widget_status, tracking ? "GPS LIVE" : "GPS OFF");
        views.setInt(R.id.widget_top_bar, "setBackgroundColor", tracking ? zoneColor : inactiveBarColor);
        views.setInt(R.id.widget_zone_box, "setBackgroundColor", tracking ? zoneColor : inactiveBoxColor);
        views.setTextColor(R.id.widget_zone, tracking ? zoneTextColor : Color.WHITE);
        views.setTextColor(R.id.widget_speed, tracking ? Color.WHITE : Color.LTGRAY);

        Intent launch = new Intent(context, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(
            context, 101, launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_root, pending);
        manager.updateAppWidget(id, views);
    }
}
