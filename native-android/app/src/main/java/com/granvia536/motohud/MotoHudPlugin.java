package com.granvia536.motohud;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "MotoHud",
    permissions = {
        @Permission(
            alias = "location",
            strings = {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            }
        )
    }
)
public class MotoHudPlugin extends Plugin {
    private static final String PREFS = "motohud_widget";

    @PluginMethod
    public void startTracking(PluginCall call) {
        if (getPermissionState("location") != PermissionState.GRANTED) {
            requestPermissionForAlias("location", call, "locationPermissionCallback");
            return;
        }
        startService(call);
    }

    @PluginMethod
    public void startIfPermitted(PluginCall call) {
        boolean granted = getPermissionState("location") == PermissionState.GRANTED;
        if (granted) {
            try {
                Intent intent = new Intent(getContext(), MotoHudLocationService.class);
                intent.setAction(MotoHudLocationService.ACTION_START);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    getContext().startForegroundService(intent);
                } else {
                    getContext().startService(intent);
                }
            } catch (Exception ignored) {
                granted = false;
            }
        }
        JSObject result = new JSObject();
        result.put("active", granted);
        call.resolve(result);
    }

    @PermissionCallback
    private void locationPermissionCallback(PluginCall call) {
        if (getPermissionState("location") == PermissionState.GRANTED) {
            startService(call);
        } else {
            call.reject("MotoHUD needs location permission to show live speed in its home-screen widget.");
        }
    }

    private void startService(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), MotoHudLocationService.class);
            intent.setAction(MotoHudLocationService.ACTION_START);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not start MotoHUD GPS tracking: " + error.getMessage(), error);
        }
    }

    @PluginMethod
    public void stopTracking(PluginCall call) {
        getContext().stopService(new Intent(getContext(), MotoHudLocationService.class));
        call.resolve();
    }

    @PluginMethod
    public void isTracking(PluginCall call) {
        SharedPreferences prefs = getContext().getSharedPreferences(PREFS, 0);
        JSObject result = new JSObject();
        result.put("active", prefs.getBoolean("tracking", false));
        call.resolve(result);
    }

    @PluginMethod
    public void setUnit(PluginCall call) {
        String unit = call.getString("unit", "kmh");
        if (!"mph".equals(unit)) unit = "kmh";
        getContext().getSharedPreferences(PREFS, 0).edit().putString("unit", unit).apply();
        MotoHudWidgetProvider.updateAll(getContext());
        call.resolve();
    }
}
