
import * as Device from 'expo-device';
import { Platform, Dimensions } from 'react-native';

export type DeviceQuirk = 
  | 'SAMSUNG_BG_KILL' 
  | 'NO_GYRO' 
  | 'SLOW_SENSORS' 
  | 'UNRELIABLE_BARO' 
  | 'MTK_GPS_LAG'
  | 'HUAWEI_POWER_KILL' 
  | 'XIAOMI_DELAYED_START'
  | 'OLD_WEBVIEW_JS'
  | 'TV_INTERFACE'      // New: Android TV / Apple TV
  | 'CAR_HEAD_UNIT'     // New: CarPlay / Android Auto (Simulated)
  | 'WINDOWS_LEGACY';   // New: Old Windows Surface / Laptops

export interface DriverProfile {
    manufacturer: string;
    modelName: string;
    osVersion: string;
    quirks: Set<DeviceQuirk>;
    sensorDelay: number;
    virtualGyroEnabled: boolean;
    deviceType: 'PHONE' | 'TABLET' | 'TV' | 'DESKTOP' | 'CAR';
}

// --- ADVANCED SIGNAL PROCESSING: 1D KALMAN FILTER ---
// Lightweight implementation to smooth raw hardware jitter BEFORE it enters the main EKF
export class KalmanFilter1D {
    private x: number = 0; // Value
    private p: number = 1; // Estimation Error Covariance
    private q: number;     // Process Noise Covariance
    private r: number;     // Measurement Noise Covariance
    private k: number = 0; // Kalman Gain
    private initialized: boolean = false;

    constructor(processNoise = 0.001, measurementNoise = 0.1) {
        this.q = processNoise;
        this.r = measurementNoise;
    }

    public filter(measurement: number): number {
        if (!this.initialized) {
            this.x = measurement;
            this.initialized = true;
            return measurement;
        }

        // Prediction Update
        this.p = this.p + this.q;

        // Measurement Update
        this.k = this.p / (this.p + this.r);
        this.x = this.x + this.k * (measurement - this.x);
        this.p = (1 - this.k) * this.p;

        return this.x;
    }

    public reset() {
        this.initialized = false;
        this.p = 1;
    }
}

// Instantiate Global Filters for Hardware Input
export const LatFilter = new KalmanFilter1D(0.00001, 0.0001);
export const LonFilter = new KalmanFilter1D(0.00001, 0.0001);
export const AltFilter = new KalmanFilter1D(0.01, 0.5);

// Database of known legacy behaviors
const getQuirksForDevice = (): Set<DeviceQuirk> => {
    const quirks = new Set<DeviceQuirk>();
    const brand = Device.brand?.toLowerCase() || '';
    const model = Device.modelName?.toLowerCase() || '';
    const osVer = Platform.Version; 
    const dim = Dimensions.get('window');
    
    // 1. Samsung Power Management Aggression
    if (brand === 'samsung') {
        quirks.add('SAMSUNG_BG_KILL');
    }

    // 2. Huawei / Honor (PowerGenie)
    if (brand === 'huawei' || brand === 'honor') {
        quirks.add('HUAWEI_POWER_KILL');
    }

    // 3. Xiaomi / Redmi (MIUI Optimizations)
    if (brand === 'xiaomi' || brand === 'redmi' || brand === 'poco') {
        quirks.add('XIAOMI_DELAYED_START');
    }

    // 4. MediaTek Chipsets (Common in budget phones)
    if (model.includes('mtk') || model.includes('infinix') || brand === 'tecno' || brand === 'itel') {
        quirks.add('MTK_GPS_LAG');
    }

    // 5. Legacy & Low Spec Detection
    if (Platform.OS === 'android' && typeof osVer === 'number' && osVer < 25) { 
        quirks.add('SLOW_SENSORS');
        quirks.add('OLD_WEBVIEW_JS');
    }
    if (Device.deviceYearClass && Device.deviceYearClass < 2017) {
        quirks.add('SLOW_SENSORS');
    }

    // 6. TV Detection (Android TV / Fire Stick)
    if (Device.deviceType === 2 || (Platform.OS === 'android' && model.includes('bravia')) || model.includes('shield')) {
        quirks.add('TV_INTERFACE');
    }

    // 7. Car Head Unit Detection (Heuristic)
    const aspectRatio = dim.width / dim.height;
    if (Platform.OS === 'android' && aspectRatio > 1.8 && dim.height < 600) {
        quirks.add('CAR_HEAD_UNIT');
    }

    // 8. Legacy Windows / Desktop
    if (Platform.OS === 'web' || Platform.OS === 'windows') {
        const userAgent = (navigator as any).userAgent || '';
        if (userAgent.indexOf('Trident') > -1 || userAgent.indexOf('Edge/') > -1) {
             quirks.add('WINDOWS_LEGACY');
             quirks.add('OLD_WEBVIEW_JS');
        }
        if (Device.deviceType === 3) { 
             // Desktop
        }
    }

    return quirks;
};

export const loadHardwareDriver = (): DriverProfile => {
    const quirks = getQuirksForDevice();
    const year = Device.deviceYearClass || 2016;

    let delay = 100; // Standard 10Hz
    
    if (quirks.has('SLOW_SENSORS') || year < 2018) {
        delay = 250; // 4Hz for legacy
    }
    
    if (year < 2015 || quirks.has('OLD_WEBVIEW_JS') || quirks.has('WINDOWS_LEGACY')) {
        delay = 500; // 2Hz to save main thread and prevent IE crash
    }

    let deviceType: DriverProfile['deviceType'] = 'PHONE';
    if (quirks.has('TV_INTERFACE')) deviceType = 'TV';
    else if (quirks.has('CAR_HEAD_UNIT')) deviceType = 'CAR';
    else if (Platform.OS === 'windows' || Platform.OS === 'macos' || Platform.OS === 'web') deviceType = 'DESKTOP';
    else if (Device.deviceType === 1) deviceType = 'TABLET';

    return {
        manufacturer: Device.manufacturer || 'Generic',
        modelName: Device.modelName || 'Unknown',
        osVersion: String(Platform.Version),
        quirks,
        sensorDelay: delay,
        virtualGyroEnabled: true,
        deviceType
    };
};

export const computeVirtualGyro = (
    currAccel: {x:number, y:number, z:number}, 
    prevAccel: {x:number, y:number, z:number},
    dt: number
) => {
    if (dt < 0.001) return { x: 0, y: 0, z: 0 };

    const dx = (currAccel.x - prevAccel.x) / dt;
    const dy = (currAccel.y - prevAccel.y) / dt;
    const dz = (currAccel.z - prevAccel.z) / dt;
    
    const scale = 0.5;
    
    return {
        x: sanitizeSensorData(dy * scale),
        y: sanitizeSensorData(dx * scale),
        z: sanitizeSensorData(dz * scale)
    };
};

export const sanitizeSensorData = (val: number): number => {
    if (typeof val !== 'number') return 0;
    if (isNaN(val) || !isFinite(val)) return 0;
    if (val > 100000) return 100000;
    if (val < -100000) return -100000;
    return val;
};
