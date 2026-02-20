
import { RfEmitter, PositionData, RfEnvironmentState, GNSSConfig } from '../types';

// --- CONSTANTS ---
const WIFI_FREQ_24 = 2412;
const WIFI_FREQ_50 = 5180;
const BLE_FREQ = 2402;

const PLE_LOS = 2.0; 
const PLE_INDOOR = 3.5; 

// --- MEMORY OPTIMIZATION: STATIC RING BUFFER ---
// Zero-Allocation Strategy: We allocate once at startup. Never again.
const MAX_RF_NODES = 200; 
const EMITTER_POOL: RfEmitter[] = new Array(MAX_RF_NODES).fill(null).map(() => ({
    id: '', type: 'WIFI', frequency: 0, rssi: -100, variance: 0, meanRssi: -100,
    sampleCount: 0, multipathProb: 0, isLos: false, distanceEst: 0, lat: 0, lon: 0, lastSeen: 0
}));

let poolHead = 0; // Cursor for Ring Buffer

// Fast Pseudo-Random (LCG) - Deterministic & Low CPU
const LCG_M = 4294967296;
const LCG_A = 1664525;
const LCG_C = 1013904223;
let _seed = 123456789;

const fastRand = () => {
    _seed = (LCG_A * _seed + LCG_C) % LCG_M;
    return _seed / LCG_M;
}

const getDistanceSq = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    // Equirectangular approximation for speed (Valid for small distances < 100km)
    const x = (lon2 - lon1) * Math.cos((lat1 + lat2) / 2 * (Math.PI / 180));
    const y = (lat2 - lat1);
    // Returns degrees squared, roughly proportional to meters squared
    return (x * x + y * y) * 1.239e10; // Scaled to meters squared approx
};

export const scanRfEnvironment = (
    currentPos: PositionData, 
    dt: number,
    config: GNSSConfig
): RfEnvironmentState => {
    
    // 1. GENERATION PHASE (Simulation of finding new APs)
    // Only generate if we moved significantly to save CPU
    const motionFactor = currentPos.speed * dt;
    if (fastRand() < 0.1 * motionFactor) {
        // Recycle the oldest node in the pool (Ring Buffer overwrite)
        const emitter = EMITTER_POOL[poolHead];
        poolHead = (poolHead + 1) % MAX_RF_NODES;

        // Reset Emitter Data
        const uid = Math.floor(fastRand() * 0xFFFFFF).toString(16).toUpperCase();
        emitter.id = uid;
        emitter.type = fastRand() > 0.3 ? 'WIFI' : 'BLE';
        emitter.frequency = emitter.type === 'WIFI' ? (fastRand() > 0.7 ? WIFI_FREQ_50 : WIFI_FREQ_24) : BLE_FREQ;
        
        // Scatter around current position (+- 50m)
        const range = 0.0005; 
        emitter.lat = currentPos.latitude + (fastRand() - 0.5) * range;
        emitter.lon = currentPos.longitude + (fastRand() - 0.5) * range;
        emitter.meanRssi = -90;
        emitter.sampleCount = 0;
    }

    // 2. MEASUREMENT PHASE
    const visibleEmitters: RfEmitter[] = [];
    const now = Date.now();
    let avgMp = 0;
    let validCount = 0;

    // Unrolled loop for performance - check all in pool
    for(let i=0; i<MAX_RF_NODES; i++) {
        const e = EMITTER_POOL[i];
        if (e.lat === undefined || e.lon === undefined || e.lat === 0) continue; // Uninitialized slot

        // Use Squared Distance to avoid Math.sqrt() -> Huge CPU saving
        const distSq = getDistanceSq(currentPos.latitude, currentPos.longitude, e.lat, e.lon);
        
        // 14400 = 120 meters squared
        if (distSq > 14400) continue; 

        // Approx sqrt for signal model only when needed
        const dist = Math.sqrt(distSq);

        const isLos = dist < 10 || (config.environment === 'open_sky' && fastRand() > 0.1);
        const pathLossExp = isLos ? PLE_LOS : PLE_INDOOR;
        
        // Log Distance Path Loss Model
        let rssi = (e.type === 'WIFI' ? 20 : 4) - (10 * pathLossExp * Math.log10(Math.max(1, dist)));
        
        // Fast Fading (Rayleigh) simulation
        rssi += (fastRand() * 6) - 3;
        rssi = Math.max(-100, Math.min(-30, rssi));

        e.rssi = rssi;
        e.isLos = isLos;
        e.lastSeen = now;
        e.distanceEst = dist;
        e.multipathProb = isLos ? 0.1 : 0.8;

        // Running Average for Stability
        // SAFETY CAP: Prevent integer overflow in long-running processes
        if (e.sampleCount < 10000) e.sampleCount++;
        
        const alpha = 1 / Math.min(e.sampleCount, 20); // Adaptive learning rate
        e.meanRssi = (e.meanRssi * (1 - alpha)) + (rssi * alpha);

        visibleEmitters.push(e);
        avgMp += e.multipathProb;
        validCount++;
    }
    
    // Sort top 5 strongest only for UI to save sort time
    if (visibleEmitters.length > 5) {
        visibleEmitters.sort((a, b) => b.rssi - a.rssi);
        visibleEmitters.length = 5; // Truncate
    }

    return {
        emitters: visibleEmitters,
        densityScore: Math.min(100, validCount * 2),
        reflectionIndex: validCount > 0 ? parseFloat((avgMp / validCount).toFixed(2)) : 0,
        dominantSignal: visibleEmitters.length > 0 ? visibleEmitters[0].id : 'NONE',
        pulseRoundTripStats: config.activeRfPulse ? `PING: ${validCount} NODES` : 'PASSIVE'
    };
};
