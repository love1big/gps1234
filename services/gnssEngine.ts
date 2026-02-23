import { Satellite, PositionData, GNSSConfig, Constellation, IMUData, LogEntry, SensorStatus, ActivityState, ChipsetProfile, EphemerisData, SystemScanState, WeatherCondition } from '../types';
import { INITIAL_POSITION } from '../constants';
import { getSensorFusionData } from './sensorManager';
import { sanitizeSensorData, LatFilter, LonFilter, AltFilter } from './hardwareDrivers';
import { scanRfEnvironment } from './rfLandscape';

const EARTH_RADIUS_KM = 6378.137;
const MU = 398600.4418; 
const J2 = 1.08262668e-3; 
const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const IONO_HEIGHT_KM = 350.0; 
const PI = Math.PI;

const FREQ_L1 = 1575.42;
const FREQ_L5 = 1176.45;

// --- MILITARY GRADE PHYSICS LIMITS ---
const MAX_VELOCITY_MS = 2000; // ~Mach 6 (Safety Cutoff)
const MAX_ACCEL_MS2 = 100; // ~10G
const MAX_ALTITUDE_M = 50000; // Stratosphere limit
const MIN_ALTITUDE_M = -500; // Dead Sea level safety

const LUT_SIZE = 3600;
const SIN_LUT = new Float32Array(LUT_SIZE);
const COS_LUT = new Float32Array(LUT_SIZE);

for(let i=0; i<LUT_SIZE; i++) {
    const rad = (i / 10) * DEG_TO_RAD;
    SIN_LUT[i] = Math.sin(rad);
    COS_LUT[i] = Math.cos(rad);
}

const getFastSin = (deg: number) => {
    if (!Number.isFinite(deg)) return 0;
    // Safety Modulo for large inputs (e.g. 10^56)
    const safeDeg = deg % 360;
    return SIN_LUT[((Math.abs(safeDeg) * 10) | 0) % LUT_SIZE] * (safeDeg < 0 ? -1 : 1) || 0;
};
const getFastCos = (deg: number) => {
    if (!Number.isFinite(deg)) return 1;
    const safeDeg = deg % 360;
    return COS_LUT[((Math.abs(safeDeg) * 10) | 0) % LUT_SIZE] || 1;
};

const STATE_SIZE = 6;
const FILTER_STATE = new Float64Array(STATE_SIZE); 
const COVARIANCE = new Float64Array(STATE_SIZE * STATE_SIZE); 

let consecutiveRejections = 0; 
let lastValidUpdate = Date.now();
let signalLossStartTime = 0;
let lastOrbitCalcTime = 0; 

let anchorLat = INITIAL_POSITION.latitude;
let anchorLon = INITIAL_POSITION.longitude;
let isAnchorInitialized = false;
let lastKnownGoodLat = INITIAL_POSITION.latitude;
let lastKnownGoodLon = INITIAL_POSITION.longitude;
let lastAccelMag = 0; 
let lastVectorHeading = -1;

// --- TUNNEL MODE STATE (PHYSICS BASED) ---
let tunnelEntryTime = 0;
let tunnelVelocity = 0;
let tunnelHeading = 0;
let tunnelDistTraveled = 0;

let smoothingWindowSize = 0; 
const MAX_SMOOTHING_WINDOW = 1000; 
let smoothedLat = 0;
let smoothedLon = 0;

let pppConvergence = 0; 
let ambiguityFixedCount = 0;

let staticCounter = 0;
let motionCounter = 0; 
const STATIC_THRESHOLD_MS = 2000; 
const MOTION_THRESHOLD_MS = 300; 

// --- DYNAMIC POOL STATE ---
let poolInitialized = false;
let lastLeoConfigState = false;

const REUSABLE_POSITION: PositionData = {
    ...INITIAL_POSITION,
    altitude: 0, accuracy: 0, speed: 0, bearing: 0, timestamp: 0,
    hdop: 1, vdop: 1, pdop: 1, gdop: 1, satellitesVisible: 0, satellitesUsed: 0,
    satellitesInternal: 0, satellitesExternal: 0, fusionWeight: 0,
    rtkStatus: 'NONE', systemStatus: 'ACTIVE', activity: 'UNKNOWN',
    integrityState: 'TRUSTED', jammingProbability: 0, spoofingProbability: 0,
    scanState: 'LOCKED', rfAnchorsUsed: 0, rfMultipathIndex: 0,
    hpl: 50, vpl: 50, solutionType: 'SINGLE'
};

const DEFAULT_POSITION: PositionData = { ...REUSABLE_POSITION };
const ACTIVE_SATELLITES_BUFFER: Satellite[] = [];
const MAX_POOL_SIZE = 128; 
const satellitePool: Satellite[] = Array(MAX_POOL_SIZE).fill(null).map((_, i) => ({
    prn: 0, constellation: Constellation.GPS, azimuth: 0, elevation: 0, snr: 0, displaySnr: 0,
    usedInFix: false, hasL5: false, isNlos: false, status: 'tracking', source: 'INTERNAL',
    carrierPhase: 0, 
    sbasCorrections: { fast: 0, longTerm: 0, iono: 0, rangeRate: 0, wetDelay: 0 }
}));

const NOISE_BUFFER_SIZE = 4096;
const NOISE_BUFFER = new Float32Array(NOISE_BUFFER_SIZE);
let noiseIdx = 0;
for(let i=0; i<NOISE_BUFFER_SIZE; i++) NOISE_BUFFER[i] = Math.random();
const getNoise = () => NOISE_BUFFER[(noiseIdx = (noiseIdx + 1) & 4095)];

const initCovariance = () => {
    COVARIANCE.fill(0);
    COVARIANCE[0] = 500;   COVARIANCE[7] = 500;   COVARIANCE[14] = 20;   
    COVARIANCE[21] = 20;   COVARIANCE[28] = 100;  COVARIANCE[35] = 10;   
};
initCovariance();

const EPHEMERIS_PARAMS = new Float32Array(MAX_POOL_SIZE * 5);
const EPHEMERIS_MAP = new Map<string, number>(); 
const CALCULATED_ORBITS = new Float32Array(MAX_POOL_SIZE * 2); 
// Orbit States: [RAAN, Inclination, MeanMotion, MeanAnomaly]
const orbitStates = new Float32Array(MAX_POOL_SIZE * 4); 

const calculateTroposphericDelay = (elDeg: number, altitudeM: number): number => {
    const safeAlt = Math.max(MIN_ALTITUDE_M, Math.min(MAX_ALTITUDE_M, altitudeM));
    const P = 1013.25 * Math.pow(1 - (0.0065 * safeAlt) / 288.15, 5.255); 
    const T = 15.0 + 273.15 - (0.0065 * safeAlt); 
    const elRad = Math.max(5, elDeg) * DEG_TO_RAD; 
    const z = PI/2 - elRad; 
    const delay = (0.002277 / Math.cos(z)) * (P + (1255 / T + 0.05) * 0.5);
    return isFinite(delay) ? delay : 0;
};

const performLambdaCheck = (sats: Satellite[], dualBand: boolean): boolean => {
    if (sats.length < 5) return false;
    let qualitySum = 0;
    let l5Count = 0;
    sats.forEach(s => {
        if (!s.usedInFix) return;
        qualitySum += (s.snr / 50.0) * Math.sin(s.elevation * DEG_TO_RAD);
        if (s.hasL5) l5Count++;
    });
    const threshold = dualBand ? 3.5 : 5.0; 
    if (qualitySum > threshold && l5Count >= 2) ambiguityFixedCount++;
    else ambiguityFixedCount = Math.max(0, ambiguityFixedCount - 1);
    return ambiguityFixedCount > 5; 
};

const calculateAllDOPs = (sats: Satellite[]) => {
    let usedCount = 0;
    let minAz = 360, maxAz = 0, minEl = 90, maxEl = 0;
    for (let i = 0; i < sats.length; i++) {
        const s = sats[i];
        if (s.usedInFix) {
            usedCount++;
            if (s.azimuth < minAz) minAz = s.azimuth;
            if (s.azimuth > maxAz) maxAz = s.azimuth;
            if (s.elevation < minEl) minEl = s.elevation;
            if (s.elevation > maxEl) maxEl = s.elevation;
        }
    }
    if (usedCount < 4) return { hdop: 99.9, vdop: 99.9, pdop: 99.9, gdop: 99.9 };
    const azSpread = Math.min(360, maxAz - minAz); 
    const elSpread = maxEl - minEl; 
    const hdopBase = (4.0 / usedCount) + (360 - azSpread) / 100; 
    const vdopBase = (4.0 / usedCount) + (90 - elSpread) / 40;
    const pdopBase = Math.hypot(hdopBase, vdopBase);
    const gdopBase = Math.sqrt(pdopBase * pdopBase + 1.0);
    return { 
        hdop: Math.max(0.5, hdopBase), 
        vdop: Math.max(0.8, vdopBase), 
        pdop: pdopBase,
        gdop: gdopBase
    };
};

// --- MILITARY GRADE STATE VALIDATION ---
const validateStateIntegrity = () => {
    // Check for NaN or Infinity in State Vector
    for(let i=0; i<STATE_SIZE; i++) {
        if (!Number.isFinite(FILTER_STATE[i])) return false;
    }
    // Check Velocity Limits (Mach 6 limit)
    if (Math.abs(FILTER_STATE[2]) > MAX_VELOCITY_MS || Math.abs(FILTER_STATE[3]) > MAX_VELOCITY_MS) return false;
    
    // Check Position drift (Cannot be > 20,000km from center)
    if (Math.abs(FILTER_STATE[0]) > 20000000 || Math.abs(FILTER_STATE[1]) > 20000000) return false;

    // Check Covariance Explosion
    if (COVARIANCE[0] < 0 || !Number.isFinite(COVARIANCE[0]) || COVARIANCE[0] > 1e12) return false;
    if (COVARIANCE[7] < 0 || !Number.isFinite(COVARIANCE[7]) || COVARIANCE[7] > 1e12) return false;
    
    return true;
}

const forceHardReset = (reason: string, logRef?: any) => {
    FILTER_STATE.fill(0);
    FILTER_STATE[4] = 15; 
    initCovariance();
    consecutiveRejections = 0;
    anchorLat = lastKnownGoodLat;
    anchorLon = lastKnownGoodLon;
    smoothingWindowSize = 0; 
    pppConvergence = 0;
    LatFilter.reset();
    LonFilter.reset();
    AltFilter.reset();
    tunnelEntryTime = 0; 
    tunnelVelocity = 0; // Stop runaway velocity
}

export const emergencyShutdown = () => {
    flushEngineBuffers();
    FILTER_STATE.fill(0);
    COVARIANCE.fill(0);
    anchorLat = 0;
    anchorLon = 0;
    isAnchorInitialized = false;
}

export const flushEngineBuffers = () => {
    EPHEMERIS_MAP.clear();
    EPHEMERIS_PARAMS.fill(0);
    initCovariance();
    consecutiveRejections = 0;
    signalLossStartTime = 0;
    smoothingWindowSize = 0;
    pppConvergence = 0;
};

const clampLat = (lat: number) => {
    const val = Number.isFinite(lat) ? lat : lastKnownGoodLat;
    return Math.max(-90, Math.min(90, val));
};
const clampLon = (lon: number) => {
    const val = Number.isFinite(lon) ? lon : lastKnownGoodLon;
    return ((val + 180) % 360 + 360) % 360 - 180;
};
const safeFloat = (val: number) => (!Number.isFinite(val)) ? 0 : val;

export const injectEphemerisData = (data: EphemerisData[]) => {
    EPHEMERIS_MAP.clear();
    EPHEMERIS_PARAMS.fill(0);
    data.forEach((entry, index) => {
        if (index >= MAX_POOL_SIZE) return;
        const key = `${entry.constellation}-${entry.prn}`;
        EPHEMERIS_MAP.set(key, index);
        const offset = index * 5;
        EPHEMERIS_PARAMS[offset] = entry.orbitParams.inclination;
        EPHEMERIS_PARAMS[offset + 1] = entry.orbitParams.raan;
        EPHEMERIS_PARAMS[offset + 2] = entry.orbitParams.meanAnomaly;
        EPHEMERIS_PARAMS[offset + 3] = entry.orbitParams.eccentricity;
        EPHEMERIS_PARAMS[offset + 4] = entry.health;
    });
};

let lastRtcmInjectionTime = 0;
let rtcmCorrectionQuality = 0;

export const injectRtcmData = (data: any) => {
    // Simulate RTCM processing
    lastRtcmInjectionTime = Date.now();
    rtcmCorrectionQuality = Math.min(1.0, rtcmCorrectionQuality + 0.1);
};

export const recalculateOrbits = () => {
    const t = (Date.now() / 1000); 
    EPHEMERIS_MAP.forEach((idx, key) => {
        const offset = idx * 5;
        const incl = EPHEMERIS_PARAMS[offset]; 
        const raan0 = EPHEMERIS_PARAMS[offset + 1]; 
        const M0 = EPHEMERIS_PARAMS[offset + 2]; 
        const e = EPHEMERIS_PARAMS[offset + 3]; 
        const a = 26560; 
        const n = Math.sqrt(MU / Math.pow(a, 3)); 
        const p = a * (1 - e*e);
        const raanDot = -1.5 * n * J2 * Math.pow(EARTH_RADIUS_KM / p, 2) * Math.cos(incl * DEG_TO_RAD);
        const raan = (raan0 + (raanDot * t * RAD_TO_DEG)) % 360;
        const M = (M0 + (n * t * RAD_TO_DEG)) % 360;
        let E = M * DEG_TO_RAD; 
        for(let iter=0; iter<3; iter++) {
            const f = E - e * Math.sin(E) - (M * DEG_TO_RAD);
            const df = 1 - e * Math.cos(E);
            E = E - f/df;
        }
        const sinV = (Math.sqrt(1 - e*e) * Math.sin(E)) / (1 - e * Math.cos(E));
        const cosV = (Math.cos(E) - e) / (1 - e * Math.cos(E));
        const v = Math.atan2(sinV, cosV) * RAD_TO_DEG;
        const u = v;
        const az = (raan + u) % 360;
        const el = Math.abs(Math.sin(u * DEG_TO_RAD) * incl);
        CALCULATED_ORBITS[idx * 2] = az;
        CALCULATED_ORBITS[idx * 2 + 1] = el;
    });
};

const getAutoSearchState = (isLost: boolean, lostDuration: number): SystemScanState => {
    if (!isLost) {
        signalLossStartTime = 0;
        tunnelEntryTime = 0;
        return 'LOCKED';
    }
    if (signalLossStartTime === 0) signalLossStartTime = Date.now();
    
    // SMART TUNNEL DETECTION
    // Require plausible velocity (>10m/s) and integrity to enter tunnel
    if (tunnelEntryTime === 0 && tunnelVelocity > 10 && validateStateIntegrity()) {
        tunnelEntryTime = Date.now();
        return 'TUNNEL_COASTING';
    }
    
    if (tunnelEntryTime > 0) return 'TUNNEL_COASTING';

    if (lostDuration < 5000) return 'DEAD_RECKONING'; 
    const cycle = Math.floor(lostDuration / 3000) % 3;
    if (cycle === 0) return 'SEARCHING_L1';
    if (cycle === 1) return 'SEARCHING_L5';
    return 'SEARCHING_MULTI';
};

export const generateSatellites = (
    count: number, 
    config: GNSSConfig, 
    forceBoost: boolean = false,
    powerSaver: boolean = false, 
    isExternal: boolean = false,
    chipset?: ChipsetProfile,
    isBackground: boolean = false
): { sats: Satellite[], scanState: SystemScanState } => {
    
    ACTIVE_SATELLITES_BUFFER.length = 0;
    
    // Check if configuration changed requiring a physics reset
    // This allows us to re-seed the LEO satellites if enabled/disabled
    if (lastLeoConfigState !== config.leoSatellites) {
        poolInitialized = false;
        lastLeoConfigState = config.leoSatellites;
    }

    // Safety Clamp for satellite count (Prevent array overflow from bad input)
    let effectiveCount = Math.min(64, Math.max(0, count));
    if (!Number.isFinite(effectiveCount)) effectiveCount = 0;

    if (tunnelEntryTime > 0) effectiveCount = 0;

    const isSignalLost = (consecutiveRejections > 5) || (effectiveCount < 1);
    const lostDuration = signalLossStartTime > 0 ? Date.now() - signalLossStartTime : 0;
    const scanState = config.autoSignalRecovery ? getAutoSearchState(isSignalLost, lostDuration) : (isSignalLost ? 'DEAD_RECKONING' : 'LOCKED');
    
    effectiveCount = sanitizeSensorData(effectiveCount);
    const targetCount = forceBoost ? Math.max(effectiveCount, 12) : Math.max(effectiveCount, 5);
    const poolCount = Math.min(targetCount, MAX_POOL_SIZE);
    
    let snrBoost = isExternal ? 8 : 0;
    if (scanState.startsWith('SEARCHING')) snrBoost += 10;

    const now = Date.now();
    
    if (!poolInitialized) {
        for(let i=0; i<MAX_POOL_SIZE; i++) {
            // LEO Logic: If enabled, allocate roughly 25% of pool to LEOs
            const isLeoSlot = config.leoSatellites && (i % 4 === 0);

            orbitStates[i*4] = (i * 30) % 360; // RAAN
            orbitStates[i*4 + 1] = 30 + (i * 5) % 60; // Inclination
            
            // MEAN MOTION (Angular Speed)
            if (isLeoSlot) {
                // LEO moves ~15x faster than GNSS
                // Normal factor is 0.5 + small random. LEO factor is 8.0 + random.
                orbitStates[i*4 + 2] = 8.0 + (i % 3) * 0.5; 
            } else {
                orbitStates[i*4 + 2] = 0.5 + (i % 3) * 0.2; 
            }
            
            orbitStates[i*4 + 3] = Math.random() * 360; // Start Anomaly
        }
        poolInitialized = true;
    }

    // Optimization: In deep sleep (powerSaver), update orbits much less frequently (e.g., every 60s instead of 5s)
    const orbitUpdateInterval = powerSaver ? 60000 : 5000;
    if (now - lastOrbitCalcTime > orbitUpdateInterval) { 
        if (EPHEMERIS_MAP.size > 0) recalculateOrbits();
        lastOrbitCalcTime = now;
    }

    const hasEphemeris = EPHEMERIS_MAP.size > 0;
    const t = now / 10000;
    
    const availableConstellations = Object.values(Constellation); 

    if (scanState === 'TUNNEL_COASTING') {
        return { sats: ACTIVE_SATELLITES_BUFFER, scanState };
    }

    // ENHANCED MULTI-CONSTELLATION DISTRIBUTION
    // Ensure we cycle through ALL available constellations evenly
    const stdConstellations = availableConstellations.filter(c => c !== Constellation.LEO && c !== Constellation.SBAS);
    
    // OPTIMIZATION: Object Reuse from Pool to reduce GC
    for (let i = 0; i < poolCount; i++) {
        const prn = (i * 3) % 32 + 1;
        
        let constellation: Constellation;
        
        // Determine Constellation Type based on Simulation Logic
        const isLeoSlot = config.leoSatellites && (i % 4 === 0);
        
        if (isLeoSlot) {
            constellation = Constellation.LEO;
        } else if (i % 20 === 19) {
            constellation = Constellation.SBAS; 
        } else {
            // Balanced Round-Robin Distribution
            const typeIndex = i % stdConstellations.length;
            constellation = stdConstellations[typeIndex];
        }

        const ephKey = `${constellation}-${prn}`;
        let az = 0, el = 0;

        if (hasEphemeris && EPHEMERIS_MAP.has(ephKey)) {
            const idx = EPHEMERIS_MAP.get(ephKey)!;
            az = CALCULATED_ORBITS[idx * 2];
            el = CALCULATED_ORBITS[idx * 2 + 1];
        } else {
            // Simulation
            const offset = i * 4;
            const meanMotion = orbitStates[offset + 2];
            
            // LEO physics: Calculate position
            const theta = (orbitStates[offset + 3] + t * meanMotion) % 360;
            az = (orbitStates[offset] + theta) % 360;
            el = Math.abs(getFastSin(theta) * orbitStates[offset + 1]);
        }
        
        el = Math.max(0, el);
        let snr = powerSaver ? (30 + getNoise() * 15) : (25 + (el * 0.4));
        snr += snrBoost;
        
        // LEO SNR Fluctuation (Rapid signal variance due to movement)
        if (constellation === Constellation.LEO) {
            snr += 5; // Generally stronger signal (closer)
            snr += Math.sin(now / 500) * 3; // Fast Doppler-like fade
        }

        let weatherStatus: Satellite['status'] = 'tracking';
        if (config.weatherCondition !== 'CLEAR') {
            const weatherNoise = getNoise() * 5;
            let attenuation = 0;
            const pathFactor = 1.0 + (90 - el) / 30;
            
            // Ku-Band (LEO) suffers more from rain fade than L-Band (GNSS)
            const freqMultiplier = constellation === Constellation.LEO ? 2.5 : 1.0;

            if (config.weatherCondition === 'RAIN_HEAVY') attenuation = 8 * pathFactor * freqMultiplier;
            else if (config.weatherCondition === 'SNOW_BLIZZARD') attenuation = 5 * pathFactor * freqMultiplier;
            else if (config.weatherCondition === 'HAIL_STORM') attenuation = 12 * pathFactor * freqMultiplier;
            
            snr -= (attenuation + weatherNoise);
            if (snr < 18) weatherStatus = 'weather_attenuated';
        }

        snr = Math.max(0, Math.min(60, snr));

        // DIRECT MUTATION OF POOL OBJECT (No `new` allocation)
        const sat = satellitePool[i];
        sat.prn = prn;
        sat.constellation = constellation;
        sat.azimuth = az;
        sat.elevation = el;
        sat.snr = snr;
        sat.displaySnr = snr; 
        
        let elevationMask = 5; 
        let minSnr = 15;

        // "Under Expressway" / Signal Recovery Logic
        if (isSignalLost || scanState.startsWith('SEARCHING') || scanState === 'DEAD_RECKONING') {
            elevationMask = -5; 
            minSnr = 8; 
            
            if (el > 60) {
                snr -= 30; 
            } else if (el < 40) {
                snr += 5; 
            }
        } else if (config.operationMode === 'URBAN_CANYON') {
            elevationMask = 25; 
            minSnr = 30; 
        } else if (config.operationMode === 'PRECISE_SURVEY') {
            elevationMask = 15; 
            minSnr = 35; 
        }

        // --- MILITARY GRADE SIGNAL RETENTION ---
        // If a satellite was previously used, lower its drop threshold to prevent flickering (Hysteresis)
        if (sat.usedInFix) {
            minSnr -= 5;
            elevationMask -= 2;
        }

        sat.usedInFix = snr > minSnr && el >= elevationMask;
        sat.status = weatherStatus === 'tracking' ? (sat.usedInFix ? 'tracking' : 'multipath_rejected') : weatherStatus;
        sat.source = isExternal ? 'EXTERNAL_USB' : 'INTERNAL';

        if (!sat.sbasCorrections) {
            sat.sbasCorrections = { fast: 0, longTerm: 0, iono: 0, rangeRate: 0, wetDelay: 0 };
        }

        if (constellation === Constellation.SBAS) {
            sat.sbasCorrections.iono = 1.5;
        } else {
            const tropo = calculateTroposphericDelay(el, 15);
            sat.sbasCorrections.iono = tropo;
        }

        const supportsL5 = (constellation === Constellation.GPS && prn > 10) || 
                           (constellation === Constellation.GALILEO) ||
                           (constellation === Constellation.BEIDOU) ||
                           (constellation === Constellation.QZSS);
        sat.hasL5 = config.dualFrequencyMode && supportsL5 && (i % 3 !== 0); 
        
        // PUSH REFERENCE (Zero Allocation)
        ACTIVE_SATELLITES_BUFFER.push(sat);
    }
    
    // Sort satellites by SNR to prioritize strong signals
    ACTIVE_SATELLITES_BUFFER.sort((a, b) => b.snr - a.snr);

    return { sats: ACTIVE_SATELLITES_BUFFER, scanState };
};

export const calculatePosition = (
  inputPos: PositionData | null, 
  config: GNSSConfig,
  sats: Satellite[],
  deltaTimeMs: number,
  powerSaver: boolean = false,
  isExternalCalculation: boolean = false,
  scanState: SystemScanState = 'LOCKED',
  isBackground: boolean = false,
  batteryLevel: number = 1.0
): { position: PositionData, imu: IMUData, sensorStatus: SensorStatus, log?: { module: string, message: string, level: LogEntry['level'] } } => {
  
  if (!validateStateIntegrity()) forceHardReset('Anomaly Detected: Resetting EKF');

  if (inputPos) {
      if (inputPos.latitude !== 0) {
          inputPos.latitude = LatFilter.filter(inputPos.latitude);
          inputPos.longitude = LonFilter.filter(inputPos.longitude);
          inputPos.altitude = AltFilter.filter(inputPos.altitude);
      }
  }

  if (!isAnchorInitialized && inputPos && inputPos.latitude !== 0) {
      anchorLat = inputPos.latitude;
      anchorLon = inputPos.longitude;
      isAnchorInitialized = true;
      FILTER_STATE.fill(0);
      FILTER_STATE[4] = inputPos.altitude || 15;
  }

  const physicsDt = Math.min(deltaTimeMs, 1500); 
  const fusionResult = getSensorFusionData(inputPos || DEFAULT_POSITION, deltaTimeMs, config.dynamicSimulation);
  const imu = fusionResult.data;
  const dt = physicsDt * 0.001;
  let currentSpeed = Math.hypot(FILTER_STATE[2], FILTER_STATE[3]); 

  // --- ZUPT (Zero Velocity Update) ALGORITHM ---
  if (config.zuptEnabled) {
      // Calculate acceleration magnitude (1g = 9.81m/s^2, normalized to 1.0 here typically)
      const accelMag = Math.sqrt(imu.accelX * imu.accelX + imu.accelY * imu.accelY + imu.accelZ * imu.accelZ);
      const isStationary = Math.abs(accelMag - 1.0) < 0.05 && currentSpeed < 0.5;
      
      if (isStationary) {
          // Clamp velocity to exactly 0 to prevent INS drift
          FILTER_STATE[2] = 0;
          FILTER_STATE[3] = 0;
          currentSpeed = 0;
      }
  }
  
  // --- TUNNEL MODE & INERTIAL DEAD RECKONING (PHYSICS ENGINE) ---
  let isTunnelMode = false;
  if (config.tunnelMode && scanState === 'TUNNEL_COASTING') {
      isTunnelMode = true;
      tunnelDistTraveled += currentSpeed * dt;
      
      // Decay velocity
      const friction = 0.998; 
      tunnelVelocity *= friction; 
      
      if (tunnelVelocity < 0.5) tunnelVelocity = 0;

  } else {
      // Not in tunnel, update reference velocity from GPS
      tunnelVelocity = currentSpeed;
      tunnelHeading = (Math.atan2(FILTER_STATE[2], FILTER_STATE[3]) * RAD_TO_DEG + 360) % 360;
      tunnelDistTraveled = 0;
  }

  // --- EKF PREDICTION STEP ---
  let x = FILTER_STATE[0];
  let y = FILTER_STATE[1];
  let vx = FILTER_STATE[2];
  let vy = FILTER_STATE[3];

  if (isTunnelMode) {
      // KINEMATIC UPDATE
      const gyroTurn = imu.gyroZ * dt * RAD_TO_DEG; 
      tunnelHeading = (tunnelHeading + gyroTurn + 360) % 360;
      
      const rad = tunnelHeading * DEG_TO_RAD;
      const vE = Math.sin(rad) * tunnelVelocity;
      const vN = Math.cos(rad) * tunnelVelocity;
      
      x += vE * dt;
      y += vN * dt;
      vx = vE;
      vy = vN;
      
      COVARIANCE[0] += 5.0 * dt; 
      COVARIANCE[7] += 5.0 * dt;
  } else {
      // STANDARD EKF PREDICTION
      let accScalar = 9.81 * 0.05;
      if (config.operationMode === 'URBAN_CANYON') accScalar = 9.81 * 0.15;

      if (imu.source === 'REAL' && config.sensorFusion) {
          const ax = Math.min(MAX_ACCEL_MS2, Math.max(-MAX_ACCEL_MS2, imu.accelX * accScalar));
          const ay = Math.min(MAX_ACCEL_MS2, Math.max(-MAX_ACCEL_MS2, imu.accelY * accScalar));
          
          const halfDtSq = 0.5 * dt * dt;
          x += vx * dt + ax * halfDtSq;
          y += vy * dt + ay * halfDtSq;
          vx += ax * dt;
          vy += ay * dt;
      } else {
          x += vx * dt;
          y += vy * dt;
      }
      const pNoise = dt * 0.1;
      COVARIANCE[0] += pNoise; 
      COVARIANCE[7] += pNoise; 
      COVARIANCE[14] += pNoise; 
      COVARIANCE[21] += pNoise; 
  }

  FILTER_STATE[0] = x;
  FILTER_STATE[1] = y;
  FILTER_STATE[2] = vx;
  FILTER_STATE[3] = vy;

  const { pdop, hdop, gdop } = calculateAllDOPs(sats);
  const isHardwareFresh = inputPos && (Date.now() - inputPos.timestamp) < 1000;
  let usedSats = 0;
  let logMsg: { module: string, message: string, level: LogEntry['level'] } | undefined;

  // --- EKF UPDATE STEP ---
  if (!isTunnelMode && isHardwareFresh && inputPos) {
      const latToMeters = 111132.92 - 559.82 * getFastCos(2 * anchorLat);
      const lonToMeters = 111412.84 * getFastCos(anchorLat);
      
      const zMeasEast = (inputPos.longitude - anchorLon) * lonToMeters;
      const zMeasNorth = (inputPos.latitude - anchorLat) * latToMeters;
      
      // SANITIZE INPUT MEASUREMENTS
      if (Number.isFinite(zMeasEast) && Number.isFinite(zMeasNorth)) {
          const distFromPred = Math.hypot(zMeasEast - FILTER_STATE[0], zMeasNorth - FILTER_STATE[1]);
          const maxPossibleJump = Math.max(20, currentSpeed * dt * 5); 

          if (distFromPred > maxPossibleJump && staticCounter < STATIC_THRESHOLD_MS) {
              COVARIANCE[0] *= 1.1;
              COVARIANCE[7] *= 1.1;
              logMsg = { module: 'EKF', message: 'Reject: Outlier', level: 'warn' };
          } else {
              // --- MILITARY GRADE MULTI-SATELLITE WEIGHTING ---
              let totalWeight = 0;
              let weightedQuality = 0;
              let validSats = 0;
              
              for (let i = 0; i < sats.length; i++) {
                  const s = sats[i];
                  if (s.usedInFix && s.snr > 10) {
                      // Weight based on SNR and Elevation (higher is better)
                      const weight = (s.snr / 50.0) * Math.sin(s.elevation * DEG_TO_RAD);
                      totalWeight += weight;
                      weightedQuality += (s.snr * weight);
                      validSats++;
                  }
              }
              
              // Base trust on the weighted quality of all visible satellites
              let trustFactor = validSats > 0 ? (10 / (totalWeight + 1)) : 10;
              
              if (config.operationMode === 'URBAN_CANYON') trustFactor *= 1.5; 
              if (config.weatherCondition !== 'CLEAR') trustFactor *= 1.8;

              // Apply RTCM Corrections
              let rtkStatus: PositionData['rtkStatus'] = 'NONE';
              let correctionAge = 0;
              if (Date.now() - lastRtcmInjectionTime < 10000) {
                  correctionAge = (Date.now() - lastRtcmInjectionTime) / 1000;
                  trustFactor *= (1.0 - (rtcmCorrectionQuality * 0.9)); // Massive accuracy boost
                  if (rtcmCorrectionQuality > 0.8) rtkStatus = 'FIXED';
                  else if (rtcmCorrectionQuality > 0.3) rtkStatus = 'FLOAT';
              } else {
                  rtcmCorrectionQuality = Math.max(0, rtcmCorrectionQuality - 0.05); // Decay
              }
              REUSABLE_POSITION.rtkStatus = rtkStatus;
              REUSABLE_POSITION.correctionAge = correctionAge;

              const reportedAcc = Math.max(0.01, inputPos.accuracy); // Allow sub-cm accuracy
              const R = (reportedAcc * trustFactor) ** 2; 
              
              const K_East = COVARIANCE[0] / (COVARIANCE[0] + R);
              const K_North = COVARIANCE[7] / (COVARIANCE[7] + R);

              if (Number.isFinite(K_East) && Number.isFinite(K_North)) {
                  FILTER_STATE[0] += K_East * (zMeasEast - FILTER_STATE[0]);
                  FILTER_STATE[1] += K_North * (zMeasNorth - FILTER_STATE[1]);
                  
                  COVARIANCE[0] *= (1.0 - K_East);
                  COVARIANCE[7] *= (1.0 - K_North);
              }
              
              if (Number.isFinite(inputPos.altitude)) {
                  FILTER_STATE[4] = inputPos.altitude * 0.2 + FILTER_STATE[4] * 0.8;
              }
              
              consecutiveRejections = 0;
              lastValidUpdate = Date.now();
              usedSats = inputPos.satellitesUsed || 12;
          }
      }
  } else if (!isTunnelMode) {
      consecutiveRejections++;
      FILTER_STATE[2] *= 0.99; // Drag
      FILTER_STATE[3] *= 0.99;
      // --- MILITARY GRADE SAFETY ---
      // Prevent velocity from becoming infinitesimally small and causing NaN
      if (Math.abs(FILTER_STATE[2]) < 0.01) FILTER_STATE[2] = 0;
      if (Math.abs(FILTER_STATE[3]) < 0.01) FILTER_STATE[3] = 0;
  }

  // --- RE-ANCHORING ---
  if (Math.abs(FILTER_STATE[0]) > 20000 || Math.abs(FILTER_STATE[1]) > 20000) {
      const latToMeters = 111132.92; 
      const lonToMeters = Math.max(1.0, 111412.84 * getFastCos(anchorLat)); // Prevent div by zero
      anchorLat += FILTER_STATE[1] / latToMeters;
      anchorLon += FILTER_STATE[0] / lonToMeters;
      FILTER_STATE[0] = 0;
      FILTER_STATE[1] = 0;
  }

  const latToMeters = 111132.92 - 559.82 * getFastCos(2 * anchorLat);
  const lonToMeters = Math.max(1.0, 111412.84 * getFastCos(anchorLat)); // Prevent div by zero
  
  let currentLat = clampLat(anchorLat + (FILTER_STATE[1] / latToMeters));
  let currentLng = clampLon(anchorLon + (FILTER_STATE[0] / lonToMeters));
  let bearing = (Math.atan2(FILTER_STATE[2], FILTER_STATE[3]) * RAD_TO_DEG + 360) % 360;
  const speed = Math.hypot(FILTER_STATE[2], FILTER_STATE[3]); 

  // --- VECTOR SNAPPING (ROAD LOCK) ---
  if (config.vectorSnapping && speed > 8) { 
      const snapInterval = 2; 
      const snappedBearing = Math.round(bearing / snapInterval) * snapInterval;
      bearing = bearing * 0.8 + snappedBearing * 0.2;
  }

  REUSABLE_POSITION.latitude = currentLat;
  REUSABLE_POSITION.longitude = currentLng;
  REUSABLE_POSITION.speed = safeFloat(speed);
  REUSABLE_POSITION.bearing = safeFloat(bearing);
  REUSABLE_POSITION.altitude = FILTER_STATE[4];
  REUSABLE_POSITION.accuracy = isTunnelMode ? Math.min(100, 10 + tunnelDistTraveled * 0.1) : Math.sqrt(COVARIANCE[0] + COVARIANCE[7]);
  REUSABLE_POSITION.timestamp = Date.now();
  REUSABLE_POSITION.hdop = parseFloat(hdop.toFixed(1));
  REUSABLE_POSITION.pdop = parseFloat(pdop.toFixed(1));
  REUSABLE_POSITION.gdop = parseFloat(gdop.toFixed(1)); 
  REUSABLE_POSITION.satellitesVisible = sats.length;
  REUSABLE_POSITION.satellitesUsed = usedSats;
  REUSABLE_POSITION.scanState = scanState;
  REUSABLE_POSITION.activity = fusionResult.activity;
  REUSABLE_POSITION.tunnelDistance = isTunnelMode ? parseFloat(tunnelDistTraveled.toFixed(1)) : 0; 

  return {
    position: REUSABLE_POSITION,
    imu: fusionResult.data,
    sensorStatus: fusionResult.status,
    log: logMsg
  };
};

// --- NMEA GENERATORS ---
const computeChecksum = (sentence: string): string => {
    let checksum = 0;
    for (let i = 0; i < sentence.length; i++) {
        checksum ^= sentence.charCodeAt(i);
    }
    return checksum.toString(16).toUpperCase().padStart(2, '0');
};

const formatCoord = (val: number, isLat: boolean): string => {
    const absVal = Math.abs(val);
    const deg = Math.floor(absVal);
    const min = (absVal - deg) * 60;
    const mm = min.toFixed(4).padStart(7, '0');
    const ddd = isLat ? deg.toString().padStart(2, '0') : deg.toString().padStart(3, '0');
    return `${ddd}${mm}`;
};

export const generateNMEASentence = (pos: PositionData): string => {
    const now = new Date(pos.timestamp || Date.now());
    const time = now.getUTCHours().toString().padStart(2, '0') +
                 now.getUTCMinutes().toString().padStart(2, '0') +
                 now.getUTCSeconds().toString().padStart(2, '0');

    const lat = formatCoord(pos.latitude, true);
    const latDir = pos.latitude >= 0 ? 'N' : 'S';
    const lon = formatCoord(pos.longitude, false);
    const lonDir = pos.longitude >= 0 ? 'E' : 'W';
    
    const quality = pos.rtkStatus === 'FIXED' ? 4 : (pos.rtkStatus === 'FLOAT' ? 5 : 1);
    const sats = (pos.satellitesUsed || 0).toString().padStart(2, '0');
    const hdop = (pos.hdop || 1.0).toFixed(1);
    const alt = (pos.altitude || 0).toFixed(1);
    const sep = "0.0"; 

    // GPGGA format: $GPGGA,time,lat,N,lon,E,quality,sats,hdop,alt,M,sep,M,,*checksum
    let gga = `GPGGA,${time},${lat},${latDir},${lon},${lonDir},${quality},${sats},${hdop},${alt},M,${sep},M,,`;
    const checksum = computeChecksum(gga);
    return `$${gga}*${checksum}`;
};

export const generateRMC = (pos: PositionData): string => {
    const now = new Date(pos.timestamp || Date.now());
    const time = now.getUTCHours().toString().padStart(2, '0') +
                 now.getUTCMinutes().toString().padStart(2, '0') +
                 now.getUTCSeconds().toString().padStart(2, '0');
    const date = now.getUTCDate().toString().padStart(2, '0') +
                 (now.getUTCMonth() + 1).toString().padStart(2, '0') +
                 (now.getUTCFullYear() % 100).toString().padStart(2, '0');

    const lat = formatCoord(pos.latitude, true);
    const latDir = pos.latitude >= 0 ? 'N' : 'S';
    const lon = formatCoord(pos.longitude, false);
    const lonDir = pos.longitude >= 0 ? 'E' : 'W';
    const speedKnots = (pos.speed * 1.94384).toFixed(1);
    const track = (pos.bearing || 0).toFixed(1);
    const magVar = "0.0,E";

    let rmc = `GPRMC,${time},A,${lat},${latDir},${lon},${lonDir},${speedKnots},${track},${date},${magVar}`;
    const checksum = computeChecksum(rmc);
    return `$${rmc}*${checksum}`;
};