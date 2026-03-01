import { IMUData, PositionData, Satellite, GNSSConfig } from '../types';

export interface MitigationResult {
    correctedPosition: PositionData;
    correctedIMU: IMUData;
    multipathDetected: boolean;
    atmosphericDelayMeters: number;
    biasCorrected: boolean;
}

// Simple atmospheric model (Klobuchar-like for Ionosphere + Hopfield-like for Troposphere)
export const calculateAtmosphericDelay = (elevationDeg: number, isDualFrequency: boolean): number => {
    if (isDualFrequency) {
        // Dual frequency cancels out ~99% of ionospheric delay
        return 0.1; // Residual tropospheric delay
    }
    
    // Simplified mapping function: delay increases as elevation decreases
    // 1 / sin(elevation)
    const elevationRad = Math.max(elevationDeg, 5) * (Math.PI / 180); // Cap at 5 degrees to avoid infinity
    const mappingFunction = 1.0 / Math.sin(elevationRad);
    
    // Base zenith delay (approx 2.5m troposphere + 5m ionosphere)
    const zenithDelay = 7.5; 
    
    return zenithDelay * mappingFunction;
};

// Multipath detection heuristic based on SNR and elevation
export const detectMultipath = (sat: Satellite, environment: GNSSConfig['environment']): boolean => {
    // Urban environments have much higher multipath probability
    const envFactor = environment === 'dense_urban' ? 1.5 : (environment === 'suburban' ? 1.0 : 0.5);
    
    // Low elevation + Low SNR = High probability of multipath
    if (sat.elevation < 25 && sat.snr < 30) {
        return Math.random() < (0.6 * envFactor);
    }
    
    // High SNR but low elevation might be a strong reflection
    if (sat.elevation < 15 && sat.snr > 40) {
        return Math.random() < (0.4 * envFactor);
    }
    
    return false;
};

// Sensor Bias Estimation (Exponential Moving Average)
class SensorBiasEstimator {
    private accelBias = { x: 0, y: 0, z: 0 };
    private gyroBias = { x: 0, y: 0, z: 0 };
    private sampleCount = 0;
    private readonly MAX_SAMPLES = 1000; // Calibration period
    private isCalibrated = false;

    public updateAndCorrect(imu: IMUData, isStationary: boolean): IMUData {
        if (isStationary && !this.isCalibrated) {
            // Accumulate bias when stationary
            // Expected accel is [0, 0, 1] (assuming Z is up)
            this.accelBias.x = (this.accelBias.x * this.sampleCount + imu.accelX) / (this.sampleCount + 1);
            this.accelBias.y = (this.accelBias.y * this.sampleCount + imu.accelY) / (this.sampleCount + 1);
            this.accelBias.z = (this.accelBias.z * this.sampleCount + (imu.accelZ - 1.0)) / (this.sampleCount + 1);
            
            // Expected gyro is [0, 0, 0]
            this.gyroBias.x = (this.gyroBias.x * this.sampleCount + imu.gyroX) / (this.sampleCount + 1);
            this.gyroBias.y = (this.gyroBias.y * this.sampleCount + imu.gyroY) / (this.sampleCount + 1);
            this.gyroBias.z = (this.gyroBias.z * this.sampleCount + imu.gyroZ) / (this.sampleCount + 1);
            
            this.sampleCount++;
            if (this.sampleCount >= this.MAX_SAMPLES) {
                this.isCalibrated = true;
            }
        }

        // Apply correction
        return {
            ...imu,
            accelX: imu.accelX - this.accelBias.x,
            accelY: imu.accelY - this.accelBias.y,
            accelZ: imu.accelZ - this.accelBias.z,
            gyroX: imu.gyroX - this.gyroBias.x,
            gyroY: imu.gyroY - this.gyroBias.y,
            gyroZ: imu.gyroZ - this.gyroBias.z,
        };
    }
    
    public getStatus() {
        return this.isCalibrated;
    }
}

const biasEstimator = new SensorBiasEstimator();

export const runMitigationPipeline = (
    pos: PositionData,
    imu: IMUData,
    sats: Satellite[],
    config: GNSSConfig,
    isStationary: boolean
): MitigationResult => {
    let multipathDetected = false;
    let totalAtmoDelay = 0;
    let validSats = 0;

    // 1. Satellite-level mitigations (Multipath & Atmosphere)
    sats.forEach(sat => {
        if (!sat.usedInFix) return;

        // Check for multipath
        if (config.rfMultipathRejection && detectMultipath(sat, config.environment)) {
            multipathDetected = true;
            // In a real engine, we would de-weight or exclude this satellite
            // Here we simulate the effect by marking it
        } else {
            // Calculate atmospheric delay for valid satellites
            const delay = calculateAtmosphericDelay(sat.elevation, config.dualFrequencyMode);
            totalAtmoDelay += delay;
            validSats++;
        }
    });

    const avgAtmoDelay = validSats > 0 ? totalAtmoDelay / validSats : 0;

    // 2. Position Correction (Simulated effect of atmospheric delay on altitude)
    // Atmospheric delay typically makes the calculated distance to satellite longer,
    // which often manifests as a positive altitude error.
    const correctedPosition = { ...pos };
    if (config.sensorFusion && validSats > 0) {
        // Apply a fraction of the delay as altitude correction
        correctedPosition.altitude -= (avgAtmoDelay * 0.5);
    }

    // 3. IMU Sensor Bias Correction
    const correctedIMU = biasEstimator.updateAndCorrect(imu, isStationary);

    return {
        correctedPosition,
        correctedIMU,
        multipathDetected,
        atmosphericDelayMeters: avgAtmoDelay,
        biasCorrected: biasEstimator.getStatus()
    };
};
