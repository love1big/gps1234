
import { Accelerometer, Gyroscope, Magnetometer, Barometer } from 'expo-sensors';
import { IMUData, SensorStatus, PositionData, ActivityState } from '../types';
import { loadHardwareDriver, computeVirtualGyro, sanitizeSensorData } from './hardwareDrivers';

const driver = loadHardwareDriver();

let lastAccelTime = 0;
let lastGyroTime = 0;
let lastMagTime = 0;
let lastBaroTime = 0;
let watchdogInterval: ReturnType<typeof setInterval> | null = null;

// --- ACCUMULATOR BUFFERS (PRE-INTEGRATION) ---
let accAccumulator = { x: 0, y: 0, z: 0, count: 0 };
let gyroAccumulator = { x: 0, y: 0, z: 0, count: 0 };

// Snapshot buffer for UI (Last known value)
const hwBuffer = {
  accel: { x: 0, y: 0, z: 0 },
  gyro: { x: 0, y: 0, z: 0 },
  mag: { x: 0, y: 0, z: 0 },
  baro: { pressure: 1013.25, relativeAltitude: 0 }
};

let prevAccel = { x: 0, y: 0, z: 0 };
let lastVirtualCalcTime = 0;

const ACCEL_HISTORY_LEN = 10;
const accelMagnitudeHistory = new Float32Array(ACCEL_HISTORY_LEN).fill(1.0); 
let historyIdx = 0;
let detectedActivity: ActivityState = 'UNKNOWN';

let virtualStepCount = 0;
let lastTimestamp = 0;

let subAccel: any = null;
let subGyro: any = null;
let subMag: any = null;
let subBaro: any = null;
let isInitializing = false;

// --- POWER PROFILE MANAGEMENT ---
type PowerProfile = 'HIGH_PERF' | 'BALANCED' | 'LOW_POWER' | 'ULTRA_LOW';
let currentProfile: PowerProfile = 'HIGH_PERF';

const safeSetInterval = (SensorObj: any, interval: number) => {
    try {
        if (SensorObj && typeof SensorObj.setUpdateInterval === 'function') {
            SensorObj.setUpdateInterval(interval);
        }
    } catch (e) { }
}

const getIntervalForProfile = (profile: PowerProfile, sensorType: 'MOTION' | 'ENV'): number => {
    switch (profile) {
        case 'HIGH_PERF': return sensorType === 'MOTION' ? 20 : 100; // 50Hz
        case 'BALANCED': return sensorType === 'MOTION' ? 60 : 200; // ~16Hz
        case 'LOW_POWER': return sensorType === 'MOTION' ? 200 : 1000; // 5Hz (Just enough for step detection)
        case 'ULTRA_LOW': return sensorType === 'MOTION' ? 2000 : 60000; // 0.5Hz for Motion (Wake check), 1min for Env
        default: return 60;
    }
};

export const setSensorPowerProfile = (profile: PowerProfile) => {
    if (currentProfile === profile) return;
    currentProfile = profile;
    
    // Dynamically adjust polling rates without detaching listeners if possible
    // This reduces overhead on the JS bridge
    safeSetInterval(Accelerometer, getIntervalForProfile(profile, 'MOTION'));
    safeSetInterval(Gyroscope, getIntervalForProfile(profile, 'MOTION'));
    safeSetInterval(Magnetometer, getIntervalForProfile(profile, 'ENV'));
    safeSetInterval(Barometer, 2000); // Barometer is slow anyway
};

export const initSensorListeners = async (isLowEndDevice: boolean = false) => {
  if (isInitializing) return;
  isInitializing = true;
  stopSensorListeners(); 
  
  // Set initial profile based on device class
  currentProfile = isLowEndDevice ? 'BALANCED' : 'HIGH_PERF';
  const motionInterval = getIntervalForProfile(currentProfile, 'MOTION');

  try {
      try {
        const accelAvailable = await Accelerometer.isAvailableAsync();
        if (accelAvailable) {
            safeSetInterval(Accelerometer, motionInterval);
            subAccel = Accelerometer.addListener(data => {
                const x = sanitizeSensorData(data.x);
                const y = sanitizeSensorData(data.y);
                const z = sanitizeSensorData(data.z);
                
                // Update Snapshot
                hwBuffer.accel = { x, y, z };
                lastAccelTime = Date.now();
                
                // Accumulate for Pre-integration
                accAccumulator.x += x;
                accAccumulator.y += y;
                accAccumulator.z += z;
                accAccumulator.count++;

                const mag = Math.sqrt(x*x + y*y + z*z);
                if (Number.isFinite(mag)) {
                    accelMagnitudeHistory[historyIdx] = mag;
                    historyIdx = (historyIdx + 1) % ACCEL_HISTORY_LEN;
                }
            });
        }
      } catch (e) { }

      try {
        const gyroAvailable = await Gyroscope.isAvailableAsync();
        if (gyroAvailable) {
            safeSetInterval(Gyroscope, motionInterval);
            subGyro = Gyroscope.addListener(data => {
                const x = sanitizeSensorData(data.x);
                const y = sanitizeSensorData(data.y);
                const z = sanitizeSensorData(data.z);
                
                hwBuffer.gyro = { x, y, z };
                lastGyroTime = Date.now();

                // Accumulate
                gyroAccumulator.x += x;
                gyroAccumulator.y += y;
                gyroAccumulator.z += z;
                gyroAccumulator.count++;
            });
        }
      } catch (e) { }

      try {
        const magAvailable = await Magnetometer.isAvailableAsync();
        if (magAvailable) {
            safeSetInterval(Magnetometer, getIntervalForProfile(currentProfile, 'ENV')); 
            subMag = Magnetometer.addListener(data => {
                hwBuffer.mag = {
                    x: sanitizeSensorData(data.x),
                    y: sanitizeSensorData(data.y),
                    z: sanitizeSensorData(data.z)
                };
                lastMagTime = Date.now();
            });
        }
      } catch (e) { }

      try {
        const baroAvailable = await Barometer.isAvailableAsync();
        if (baroAvailable) {
            safeSetInterval(Barometer, 2000); 
            subBaro = Barometer.addListener(data => {
                if (data && !Number.isNaN(data.pressure)) {
                    hwBuffer.baro = {
                        pressure: data.pressure,
                        relativeAltitude: data.relativeAltitude ?? 0
                    };
                    lastBaroTime = Date.now();
                }
            });
        }
      } catch (e) { }

      startWatchdog();

  } catch (e) { } finally {
      isInitializing = false;
  }
};

const startWatchdog = () => {
    if (watchdogInterval) clearInterval(watchdogInterval);
    watchdogInterval = setInterval(() => {
        const now = Date.now();
        // Relaxed watchdog in ultra low power mode
        const timeout = currentProfile === 'ULTRA_LOW' ? 20000 : 8000;
        
        if (now - lastAccelTime > timeout && subAccel) {
            // Only restart if we expect data but aren't getting it
            stopSensorListeners();
            setTimeout(() => initSensorListeners(currentProfile === 'BALANCED'), 500);
        }
    }, 30000);
};

export const stopSensorListeners = () => {
    if (watchdogInterval) {
        clearInterval(watchdogInterval);
        watchdogInterval = null;
    }
    try {
        subAccel && subAccel.remove();
        subGyro && subGyro.remove();
        subMag && subMag.remove();
        subBaro && subBaro.remove();
    } catch (e) { }
    
    subAccel = null;
    subGyro = null;
    subMag = null;
    subBaro = null;
    
    // Reset Accumulators
    accAccumulator = { x: 0, y: 0, z: 0, count: 0 };
    gyroAccumulator = { x: 0, y: 0, z: 0, count: 0 };
    
    isInitializing = false;
};

export const triggerSensorPulse = async (): Promise<boolean> => {
    stopSensorListeners();
    // Use a slightly longer delay to ensure hardware releases the resource
    setTimeout(() => initSensorListeners(currentProfile === 'BALANCED'), 500);
    return true;
};

const detectActivityFromSensors = (): ActivityState => {
    let sum = 0;
    let sumSq = 0;
    
    for (let i = 0; i < ACCEL_HISTORY_LEN; i++) {
        const val = accelMagnitudeHistory[i];
        sum += val;
        sumSq += val * val;
    }
    
    const mean = sum / ACCEL_HISTORY_LEN;
    const variance = (sumSq / ACCEL_HISTORY_LEN) - (mean * mean);
    
    if (variance < 0.005) return 'STILL'; 
    if (variance < 0.05) return 'DRIVING'; 
    if (variance >= 0.05) return 'WALKING'; 
    
    return 'UNKNOWN';
};

const REUSABLE_IMU: IMUData = {
    accelX: 0, accelY: 0, accelZ: 0,
    gyroX: 0, gyroY: 0, gyroZ: 0,
    magX: 0, magY: 0, magZ: 0,
    pressure: 1013.25, stepCount: 0, source: 'VIRTUAL'
};

export const getSensorFusionData = (gpsPos: PositionData, dtMs: number, autoDriveEnabled: boolean): { data: IMUData, status: SensorStatus, activity: ActivityState } => {
  const now = Date.now();
  
  // VIRTUAL GYRO
  const dtSec = (now - lastVirtualCalcTime) / 1000;
  if (dtSec > 0 && dtSec < 1.0) { 
      if (now - lastGyroTime > 2000) {
          const vGyro = computeVirtualGyro(hwBuffer.accel, prevAccel, dtSec);
          hwBuffer.gyro = vGyro;
      }
  }
  prevAccel = { ...hwBuffer.accel };
  lastVirtualCalcTime = now;

  const TIMEOUT = currentProfile === 'ULTRA_LOW' ? 20000 : 4000; 
  const status: SensorStatus = {
    accel: (now - lastAccelTime < TIMEOUT) ? 'REAL' : 'DETECTING',
    gyro: (now - lastGyroTime < TIMEOUT) ? 'REAL' : (now - lastVirtualCalcTime < TIMEOUT ? 'VIRTUAL' : 'DETECTING'),
    mag: (now - lastMagTime < TIMEOUT) ? 'REAL' : 'DETECTING',
    baro: (now - lastBaroTime < TIMEOUT) ? 'REAL' : 'VIRTUAL'
  };

  detectedActivity = detectActivityFromSensors();

  let intAccelX = hwBuffer.accel.x;
  let intAccelY = hwBuffer.accel.y;
  let intAccelZ = hwBuffer.accel.z;
  let intGyroX = hwBuffer.gyro.x;
  let intGyroY = hwBuffer.gyro.y;
  let intGyroZ = hwBuffer.gyro.z;

  if (accAccumulator.count > 0) {
      intAccelX = accAccumulator.x / accAccumulator.count;
      intAccelY = accAccumulator.y / accAccumulator.count;
      intAccelZ = accAccumulator.z / accAccumulator.count;
      accAccumulator.x = 0; accAccumulator.y = 0; accAccumulator.z = 0; accAccumulator.count = 0;
  }
  
  if (gyroAccumulator.count > 0) {
      intGyroX = gyroAccumulator.x / gyroAccumulator.count;
      intGyroY = gyroAccumulator.y / gyroAccumulator.count;
      intGyroZ = gyroAccumulator.z / gyroAccumulator.count;
      gyroAccumulator.x = 0; gyroAccumulator.y = 0; gyroAccumulator.z = 0; gyroAccumulator.count = 0;
  }

  REUSABLE_IMU.accelX = intAccelX;
  REUSABLE_IMU.accelY = intAccelY;
  REUSABLE_IMU.accelZ = intAccelZ;
  REUSABLE_IMU.gyroX = intGyroX;
  REUSABLE_IMU.gyroY = intGyroY;
  REUSABLE_IMU.gyroZ = intGyroZ;
  REUSABLE_IMU.magX = hwBuffer.mag.x;
  REUSABLE_IMU.magY = hwBuffer.mag.y;
  REUSABLE_IMU.magZ = hwBuffer.mag.z;
  REUSABLE_IMU.pressure = hwBuffer.baro.pressure || 1013.25;
  REUSABLE_IMU.source = (status.accel === 'REAL') ? 'REAL' : 'VIRTUAL';

  if (detectedActivity === 'WALKING') {
      const accelMag = Math.sqrt(intAccelX**2 + intAccelY**2 + intAccelZ**2);
      if (accelMag > 1.2 && now - lastTimestamp > 500) {
         // SAFETY CHECK for long running sessions (10^15 limit)
         if (virtualStepCount < Number.MAX_SAFE_INTEGER) {
             virtualStepCount++;
         }
         lastTimestamp = now;
      }
  }
  REUSABLE_IMU.stepCount = virtualStepCount;

  return { data: REUSABLE_IMU, status, activity: detectedActivity };
};
