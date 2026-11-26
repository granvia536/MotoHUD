package com.granvia536.motohud;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.util.TypedValue;
import android.widget.RemoteViews;
import java.util.Locale;

public class MotoHudWidgetProvider extends AppWidgetProvider {
    private static final String PREFS = "motohud_widget";
    public static final String ACTION_TOGGLE_UNIT = "com.granvia536.motohud.TOGGLE_UNIT";
    private static final float MAX_KMH = 120f;

    private static final int[] BAR_IDS = {
        R.id.widget_bar_0, R.id.widget_bar_1, R.id.widget_bar_2, R.id.widget_bar_3,
        R.id.widget_bar_4, R.id.widget_bar_5, R.id.widget_bar_6, R.id.widget_bar_7,
        R.id.widget_bar_8, R.id.widget_bar_9, R.id.widget_bar_10, R.id.widget_bar_11,
        R.id.widget_bar_12, R.id.widget_bar_13, R.id.widget_bar_14, R.id.widget_bar_15,
        R.id.widget_bar_16, R.id.widget_bar_17, R.id.widget_bar_18, R.id.widget_bar_19,
        R.id.widget_bar_20, R.id.widget_bar_21, R.id.widget_bar_22, R.id.widget_bar_23,
    };

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent != null && ACTION_TOGGLE_UNIT.equals(intent.getAction())) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String current = prefs.getString("unit", "kmh");
            String next = "mph".equals(current) ? "kmh" : "mph";
            prefs.edit().putString("unit", next).apply();
            updateAll(context);
            return;
        }
        super.onReceive(context, intent);
    }

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) updateWidget(context, manager, id, null);
    }

    @Override
    public void onAppWidgetOptionsChanged(
        Context context,
        AppWidgetManager manager,
        int appWidgetId,
        Bundle newOptions
    ) {
        updateWidget(context, manager, appWidgetId, newOptions);
    }

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        if (manager == null) return;
        ComponentName component = new ComponentName(context, MotoHudWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(component);
        if (ids == null) return;
        for (int id : ids) updateWidget(context, manager, id, null);
    }

    private static float computeSpeedFontSp(AppWidgetManager manager, int id, Bundle options) {
        Bundle opts = options != null ? options : manager.getAppWidgetOptions(id);
        if (opts == null) return 84f;
        int minWidth = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 180);
        int minHeight = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 160);
        int maxWidth = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, minWidth);
        int maxHeight = opts.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, minHeight);
        int w = Math.max(minWidth, maxWidth);
        int h = Math.max(minHeight, maxHeight);
        float scaled = Math.min(w * 0.45f, h * 0.42f);
        return Math.max(60f, Math.min(168f, scaled));
    }

    private static int colorForKmh(float kmh) {
        if (kmh <= 30f) return Color.rgb(16, 185, 129);
        if (kmh <= 55f) return Color.rgb(245, 158, 11);
        if (kmh <= 85f) return Color.rgb(249, 115, 22);
        if (kmh <= 115f) return Color.rgb(239, 68, 68);
        return Color.rgb(255, 30, 66);
    }

    private static void updateWidget(
        Context context,
        AppWidgetManager manager,
        int id,
        Bundle options
    ) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        boolean tracking = prefs.getBoolean("tracking", false);
        float speedMs = prefs.getFloat("speed_ms", 0f);
        String unit = prefs.getString("unit", "kmh");
        boolean isMph = "mph".equals(unit);
        float speed = isMph ? speedMs * 2.236936f : speedMs * 3.6f;
        int displayedSpeed = Math.round(Math.max(0f, speed));
        float kmh = Math.max(0f, speedMs * 3.6f);

        int zoneColor;
        int zoneBgRes;
        String zoneTitle;
        String zoneRange;

        if (kmh <= 30f) {
            zoneTitle = "URBAN CRAWL";
            zoneRange = isMph ? "0–19 mph" : "0–30 km/h";
            zoneColor = Color.rgb(16, 185, 129);
            zoneBgRes = R.drawable.widget_zone_safe;
        } else if (kmh <= 55f) {
            zoneTitle = "CITY PACE";
            zoneRange = isMph ? "19–34 mph" : "31–55 km/h";
            zoneColor = Color.rgb(245, 158, 11);
            zoneBgRes = R.drawable.widget_zone_caution;
        } else if (kmh <= 85f) {
            zoneTitle = "OPEN ROAD RISK";
            zoneRange = isMph ? "35–53 mph" : "56–85 km/h";
            zoneColor = Color.rgb(249, 115, 22);
            zoneBgRes = R.drawable.widget_zone_high;
        } else if (kmh <= 115f) {
            zoneTitle = "SEVERE DANGER";
            zoneRange = isMph ? "53–71 mph" : "86–115 km/h";
            zoneColor = Color.rgb(239, 68, 68);
            zoneBgRes = R.drawable.widget_zone_severe;
        } else {
            zoneTitle = "LETHAL VELOCITY";
            zoneRange = isMph ? "72+ mph" : "116+ km/h";
            zoneColor = Color.rgb(255, 30, 66);
            zoneBgRes = R.drawable.widget_zone_lethal;
        }

        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_motohud);

        int inactiveBar = Color.rgb(28, 30, 38);
        int activeSegments = !tracking || kmh < 0.8f
            ? 0
            : Math.max(1, Math.min(BAR_IDS.length, Math.round((kmh / MAX_KMH) * BAR_IDS.length)));

        for (int i = 0; i < BAR_IDS.length; i++) {
            float segKmh = ((i + 1f) / BAR_IDS.length) * MAX_KMH;
            int barColor = i < activeSegments ? colorForKmh(segKmh) : inactiveBar;
            views.setInt(BAR_IDS[i], "setBackgroundColor", barColor);
        }

        views.setTextViewText(R.id.widget_scale_0, "0");
        views.setTextViewText(R.id.widget_scale_1, isMph ? "19" : "30");
        views.setTextViewText(R.id.widget_scale_2, isMph ? "37" : "60");
        views.setTextViewText(R.id.widget_scale_3, isMph ? "56" : "90");
        views.setTextViewText(R.id.widget_scale_4, isMph ? "75" : "120");

        views.setTextViewText(R.id.widget_speed, String.format(Locale.getDefault(), "%d", tracking ? displayedSpeed : 0));
        views.setTextViewTextSize(
            R.id.widget_speed,
            TypedValue.COMPLEX_UNIT_SP,
            computeSpeedFontSp(manager, id, options)
        );
        views.setTextViewText(R.id.widget_unit, isMph ? "mph" : "km/h");

        views.setInt(R.id.widget_zone_box, "setBackgroundResource", tracking ? zoneBgRes : R.drawable.widget_zone_off);
        views.setInt(R.id.widget_zone_dot, "setBackgroundColor", tracking ? zoneColor : Color.rgb(82, 82, 91));
        views.setTextViewText(R.id.widget_zone, zoneTitle);
        views.setTextColor(R.id.widget_zone, tracking ? zoneColor : Color.rgb(212, 212, 216));
        views.setTextViewText(R.id.widget_zone_range, tracking ? zoneRange : "TAP FOR GPS");

        Intent launch = new Intent(context, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent launchPending = PendingIntent.getActivity(
            context,
            101,
            launch,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_root, launchPending);

        Intent toggleUnit = new Intent(context, MotoHudWidgetProvider.class);
        toggleUnit.setAction(ACTION_TOGGLE_UNIT);
        PendingIntent unitPending = PendingIntent.getBroadcast(
            context,
            102,
            toggleUnit,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.widget_unit, unitPending);

        manager.updateAppWidget(id, views);
    }
}
