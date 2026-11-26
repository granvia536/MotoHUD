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
        ComponentName component = new ComponentName(context, MotoHudWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(component);
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
        String zone;
        float kmh = speedMs * 3.6f;
        if (kmh <= 30f) {
            zone = "URBAN CRAWL";
            zoneColor = Color.rgb(16, 185, 129);
        } else if (kmh <= 55f) {
            zone = "CITY PACE";
            zoneColor = Color.rgb(245, 158, 11);
        } else if (kmh <= 85f) {
            zone = "OPEN ROAD RISK";
            zoneColor = Color.rgb(249, 115, 22);
        } else if (kmh <= 115f) {
            zone = "SEVERE DANGER";
            zoneColor = Color.rgb(239, 68, 68);
        } else {
            zone = "LETHAL VELOCITY";
            zoneColor = Color.rgb(255, 30, 66);
        }

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_motohud);
        views.setTextViewText(R.id.widget_speed, tracking ? String.format(Locale.getDefault(), "%d", displayedSpeed) : "—");
        views.setTextViewText(R.id.widget_unit, unit.equals("mph") ? "mph" : "km/h");
        views.setTextViewText(R.id.widget_zone, tracking ? zone : "TAP APP TO START GPS");
        views.setTextViewText(R.id.widget_status, tracking ? "GPS LIVE" : "GPS OFF");
        views.setInt(R.id.widget_zone_bar, "setBackgroundColor", tracking ? zoneColor : Color.DKGRAY);
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
