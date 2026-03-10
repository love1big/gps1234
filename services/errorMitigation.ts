import { IMUData, PositionData, Satellite, GNSSConfig } from '../types';

export interface MitigationResult {
    correctedPosition: PositionData;
    correctedIMU: IMUData;
    multipathDetected: boolean;
    atmosphericDelayMeters: number;
    biasCorrected: boolean;
    jammingProbability: number;
    spoofingProbability: number;
    raimStatus: 'NONE' | 'FD' | 'FDE'; // Fault Detection, Fault Detection & Exclusion
    excludedSatellites: number;
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

// Anti-Jamming Heuristics
export const detectJamming = (sats: Satellite[], isStationary: boolean, environment: GNSSConfig['environment']): number => {
    if (sats.length === 0) return 0;
    
    let totalSnr = 0;
    let trackedCount = 0;
    
    sats.forEach(sat => {
        if (sat.status === 'tracking' || sat.usedInFix) {
            totalSnr += sat.snr;
            trackedCount++;
        }
    });
    
    if (trackedCount === 0) return 0;
    
    const avgSnr = totalSnr / trackedCount;
    let jammingProb = 0;
    
    // If average SNR drops below 25 dBHz, it's highly suspicious, especially if not in dense urban
    if (avgSnr < 25) {
        jammingProb += (25 - avgSnr) * 5; 
    }
    
    // If we see many satellites but can track very few, it might be broadband jamming
    if (sats.length > 15 && trackedCount < 4) {
        jammingProb += 30;
    }
    
    // Environment context: Urban canyons naturally have lower SNR, so reduce false positives
    if (environment === 'dense_urban') {
        jammingProb *= 0.6;
    } else if (environment === 'open_sky') {
        jammingProb *= 1.5; // Open sky should have excellent SNR; if it doesn't, suspect jamming
    }
    
    return Math.min(100, Math.max(0, jammingProb));
};

// Anti-Spoofing Heuristics
export const detectSpoofing = (sats: Satellite[], pos: PositionData, imu: IMUData, isStationary: boolean): number => {
    if (sats.length === 0) return 0;
    
    let spoofingProb = 0;
    let totalSnr = 0;
    let trackedCount = 0;
    
    sats.forEach(sat => {
        if (sat.status === 'tracking' || sat.usedInFix) {
            totalSnr += sat.snr;
            trackedCount++;
        }
    });
    
    if (trackedCount > 0) {
        const avgSnr = totalSnr / trackedCount;
        let snrVariance = 0;
        
        sats.forEach(sat => {
            if (sat.status === 'tracking' || sat.usedInFix) {
                snrVariance += Math.pow(sat.snr - avgSnr, 2);
            }
        });
        snrVariance /= trackedCount;
        
        // Spoofers often transmit all signals at the exact same power level
        // Real signals have high variance due to different elevations and multipath
        if (snrVariance < 2.0 && avgSnr > 40) {
            spoofingProb += 60; // Highly suspicious: strong, uniform signals
        }
    }
    
    // Position jump check: If speed is impossible given IMU data
    const imuAccelMagnitude = Math.sqrt(Math.pow(imu.accelX, 2) + Math.pow(imu.accelY, 2) + Math.pow(imu.accelZ - 1.0, 2));
    if (pos.speed > 30 && imuAccelMagnitude < 0.1 && isStationary) {
        // We are supposedly moving at 108 km/h, but IMU says we are perfectly still
        spoofingProb += 80;
    }
    
    return Math.min(100, Math.max(0, spoofingProb));
};

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

    // 3. IMU Sensor Bias Correction & ZUPT (Zero Velocity Update)
    const correctedIMU = biasEstimator.updateAndCorrect(imu, isStationary);
    if (isStationary) {
        // ZUPT: If we are physically stationary, force speed to 0 to prevent drift
        correctedPosition.speed = 0;
    }

    // 4. Anti-Jamming and Anti-Spoofing Detection
    const jammingProbability = detectJamming(sats, isStationary, config.environment);
    const spoofingProbability = detectSpoofing(sats, pos, imu, isStationary);

    // 5. RAIM (Receiver Autonomous Integrity Monitoring)
    let raimStatus: 'NONE' | 'FD' | 'FDE' = 'NONE';
    let excludedSatellites = 0;
    
    // RAIM requires redundant satellites. 
    // 4 = 3D Fix, 5 = Fault Detection (FD), 6+ = Fault Detection & Exclusion (FDE)
    if (validSats >= 6) {
        raimStatus = 'FDE';
        // Simulate FDE: Exclude satellites with extreme multipath or low SNR
        sats.forEach(sat => {
            if (sat.usedInFix && (sat.snr < 15 || detectMultipath(sat, config.environment))) {
                excludedSatellites++;
            }
        });
        
        // If we excluded faulty satellites, improve the reported accuracy
        if (excludedSatellites > 0) {
            correctedPosition.accuracy = Math.max(1.0, correctedPosition.accuracy * 0.8);
        }
    } else if (validSats === 5) {
        raimStatus = 'FD';
        // Can detect a fault but not exclude it. If multipath is high, degrade accuracy.
        if (multipathDetected) {
            correctedPosition.accuracy *= 1.2;
        }
    }

    return {
        correctedPosition,
        correctedIMU,
        multipathDetected,
        atmosphericDelayMeters: avgAtmoDelay,
        biasCorrected: biasEstimator.getStatus(),
        jammingProbability,
        spoofingProbability,
        raimStatus,
        excludedSatellites
    };
};
