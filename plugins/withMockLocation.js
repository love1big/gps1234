const { withMainApplication, withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withMockLocation = (config) => {
  // 1. Add Permissions to AndroidManifest
  config = withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults.manifest;
    
    if (!androidManifest['uses-permission']) {
      androidManifest['uses-permission'] = [];
    }
    
    const permissions = [
      'android.permission.ACCESS_MOCK_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION'
    ];

    permissions.forEach(perm => {
      const hasPerm = androidManifest['uses-permission'].some(
        (p) => p.$['android:name'] === perm
      );
      if (!hasPerm) {
        androidManifest['uses-permission'].push({
          $: { 'android:name': perm }
        });
      }
    });

    return config;
  });

  // 2. Inject Java Code
  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const packageName = config.android.package || 'com.anonymous.omnignsspromobile';
      const packagePath = packageName.replace(/\./g, '/');
      const srcDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java', packagePath);
      
      if (!fs.existsSync(srcDir)) {
        fs.mkdirSync(srcDir, { recursive: true });
      }

      // MockLocationModule.java
      const moduleCode = `package ${packageName};

import android.content.Context;
import android.location.Location;
import android.location.LocationManager;
import android.os.Build;
import android.os.SystemClock;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableMap;

public class MockLocationModule extends ReactContextBaseJavaModule {
    private LocationManager locationManager;
    private static final String PROVIDER = LocationManager.GPS_PROVIDER;

    public MockLocationModule(ReactApplicationContext reactContext) {
        super(reactContext);
        locationManager = (LocationManager) reactContext.getSystemService(Context.LOCATION_SERVICE);
    }

    @Override
    public String getName() {
        return "MockLocationModule";
    }

    @ReactMethod
    public void setMockLocation(ReadableMap locationData) {
        try {
            if (locationManager.getProvider(PROVIDER) == null) {
                locationManager.addTestProvider(PROVIDER, false, false, false, false, true, true, true, 0, 5);
            }
            locationManager.setTestProviderEnabled(PROVIDER, true);

            Location mockLocation = new Location(PROVIDER);
            mockLocation.setLatitude(locationData.getDouble("latitude"));
            mockLocation.setLongitude(locationData.getDouble("longitude"));
            mockLocation.setAltitude(locationData.getDouble("altitude"));
            mockLocation.setAccuracy((float) locationData.getDouble("accuracy"));
            mockLocation.setBearing((float) locationData.getDouble("bearing"));
            mockLocation.setSpeed((float) locationData.getDouble("speed"));
            mockLocation.setTime(System.currentTimeMillis());
            
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN_MR1) {
                mockLocation.setElapsedRealtimeNanos(SystemClock.elapsedRealtimeNanos());
            }

            locationManager.setTestProviderLocation(PROVIDER, mockLocation);
        } catch (SecurityException e) {
            // App is not set as mock location app in developer options
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
`;
      fs.writeFileSync(path.join(srcDir, 'MockLocationModule.java'), moduleCode);

      // MockLocationPackage.java
      const packageCode = `package ${packageName};

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class MockLocationPackage implements ReactPackage {
    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }

    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        List<NativeModule> modules = new ArrayList<>();
        modules.add(new MockLocationModule(reactContext));
        return modules;
    }
}
`;
      fs.writeFileSync(path.join(srcDir, 'MockLocationPackage.java'), packageCode);

      return config;
    }
  ]);

  // 3. Register Package in MainApplication.java
  config = withMainApplication(config, (config) => {
    let mainApplication = config.modResults.contents;
    
    // Add import
    if (!mainApplication.includes('import com.anonymous.omnignsspromobile.MockLocationPackage;')) {
      const packageName = config.android.package || 'com.anonymous.omnignsspromobile';
      mainApplication = mainApplication.replace(
        'import com.facebook.react.ReactApplication;',
        `import com.facebook.react.ReactApplication;\nimport ${packageName}.MockLocationPackage;`
      );
    }

    // Add package
    if (!mainApplication.includes('new MockLocationPackage()')) {
      mainApplication = mainApplication.replace(
        'new MainReactPackage()',
        'new MainReactPackage(),\n          new MockLocationPackage()'
      );
      // For newer Expo versions using PackageList
      mainApplication = mainApplication.replace(
        'List<ReactPackage> packages = new PackageList(this).getPackages();',
        'List<ReactPackage> packages = new PackageList(this).getPackages();\n      packages.add(new MockLocationPackage());'
      );
    }

    config.modResults.contents = mainApplication;
    return config;
  });

  return config;
};

module.exports = withMockLocation;
