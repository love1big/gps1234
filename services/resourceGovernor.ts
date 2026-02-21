
import { ResourceState } from '../types';

// Target Loop Durations (Setpoints)
const TARGET_MS_HIGH = 16.0; // 60 FPS
const TARGET_MS_BALANCED = 33.0; // 30 FPS
const TARGET_MS_SLEEP = 1000.0; // 1 FPS (Background/Static)
const TARGET_MS_DEEP_SLEEP = 10000.0; // 0.1 FPS (Hibernate) - MAX BATTERY SAVE

// PID Constants (Tuned for Mobile JS Engine)
const Kp = 0.6; 
const Ki = 0.02; 
const Kd = 0.3; 

// State tracking
let integral = 0;
let prevError = 0;
let lastPurge = Date.now();
let thermalScore = 0; 

// History for Thermal Analysis
const LOAD_HISTORY_SIZE = 60; 
const loadHistory = new Float32Array(LOAD_HISTORY_SIZE);
let historyHead = 0;

// Silent Watch State
let staticDuration = 0;
let isSilentWatch = false;
let isDeepSleep = false; // New: Ultra Power Saving

// Current State
let currentQuality: ResourceState['quality'] = 'HIGH';
let currentLOD: ResourceState['renderComplexity'] = 'FULL';

export const updateMotionState = (isMoving: boolean, dt: number) => {
    if (!isMoving) {
        staticDuration += dt;
        if (staticDuration > 30000) { // 30 seconds of stillness -> Deep Sleep
            isDeepSleep = true;
            isSilentWatch = true;
        } else if (staticDuration > 5000) { // 5 seconds -> Silent Watch
            isSilentWatch = true;
        }
    } else {
        // INSTANT WAKE PROTOCOL
        if (isDeepSleep) {
            // Log wake event in real system
        }
        staticDuration = 0;
        isSilentWatch = false;
        isDeepSleep = false;
    }
};

export const monitorPerformance = (loopDurationMs: number): ResourceState => {
    // MIL-SPEC: Sanitize Input
    const safeDuration = Number.isFinite(loopDurationMs) ? loopDurationMs : 16.0;

    // 1. Determine Target based on Motion State
    let target = TARGET_MS_BALANCED;
    
    if (isDeepSleep) {
        target = TARGET_MS_DEEP_SLEEP;
        currentQuality = 'DEEP_SLEEP';
        currentLOD = 'TEXT_ONLY';
    } else if (isSilentWatch) {
        target = TARGET_MS_SLEEP;
        currentQuality = 'ECO';
        currentLOD = 'TEXT_ONLY'; // Turn off graphics when static to save GPU
    } else if (currentQuality === 'ULTRA' || currentQuality === 'HIGH') {
        target = TARGET_MS_HIGH;
        currentLOD = 'FULL';
    }

    const error = safeDuration - target;
    
    integral += error;
    integral = Math.max(-200, Math.min(200, integral));
    
    const derivative = error - prevError;
    prevError = error;
    
    const pidOutput = (Kp * error) + (Ki * integral) + (Kd * derivative);

    // 2. Thermal Throttling
    loadHistory[historyHead] = safeDuration;
    historyHead = (historyHead + 1) % LOAD_HISTORY_SIZE;
    
    if (historyHead % 20 === 0) { 
        const avgRecent = loadHistory.slice(0, 20).reduce((a,b) => a+b, 0) / 20;
        if (avgRecent > target * 1.5) { 
             thermalScore = Math.min(100, thermalScore + 5);
        } else if (avgRecent < target) {
             thermalScore = Math.max(0, thermalScore - 2);
        }
    }

    const effectivePressure = pidOutput + (thermalScore * 3);

    // 3. STATE MACHINE
    if (isDeepSleep) {
        currentQuality = 'DEEP_SLEEP';
        currentLOD = 'TEXT_ONLY';
        integral = 0;
    } else if (isSilentWatch) {
        currentQuality = 'ECO';
        currentLOD = 'MINIMAL';
    } else if (effectivePressure > 80) {
        currentQuality = 'SURVIVAL'; 
        currentLOD = 'TEXT_ONLY';
        integral = 0;
    } else if (effectivePressure > 40) {
        currentQuality = 'ECO';
        currentLOD = 'MINIMAL';
    } else if (effectivePressure < -20 && thermalScore < 10) {
        currentQuality = 'HIGH';
        currentLOD = 'FULL';
    }
    
    let memStatus: 'NORMAL' | 'HIGH' | 'CRITICAL' = 'NORMAL';
    if (safeDuration > 150) memStatus = 'CRITICAL'; 
    else if (safeDuration > 50) memStatus = 'HIGH';

    const fps = Math.min(60, 1000 / Math.max(16.67, safeDuration));

    return {
        loadLevel: Math.max(0, Math.min(100, 50 + effectivePressure)), 
        quality: currentQuality,
        renderComplexity: currentLOD,
        memoryPressure: memStatus,
        thermalThrottling: thermalScore > 40,
        lastPurgeTime: lastPurge,
        fpsEstimate: isDeepSleep ? 0.1 : (isSilentWatch ? 1 : Math.floor(fps)) 
    };
};

export const shouldPurgeMemory = (state: ResourceState): boolean => {
    const now = Date.now();
    
    if (state.memoryPressure === 'CRITICAL') {
        if (now - lastPurge > 2000) {
            lastPurge = now;
            return true;
        }
    }
    
    // In Silent Watch, purge aggressively to keep background footprint tiny
    if ((isSilentWatch || isDeepSleep) && now - lastPurge > 5000) {
        lastPurge = now;
        return true;
    }
    
    if (state.memoryPressure === 'HIGH' && now - lastPurge > 10000) {
        lastPurge = now;
        return true;
    }
    
    return false;
};
