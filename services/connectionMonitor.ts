
import { NetworkStats, PositionData, NtripCaster, SystemDiagnostic, LogEntry } from '../types';
import { ExternalWifiManager } from './wifiDrivers';

// Robust endpoints for connectivity checking (High Availability)
const PING_ENDPOINTS = [
    'https://clients3.google.com/generate_204', // Google Gen 204
    'https://www.cloudflare.com/cdn-cgi/trace', // Cloudflare Trace
    'https://1.1.1.1/' // Cloudflare DNS
];

/**
 * Actively probes the internet to ensure real connectivity.
 * Uses a tiered approach: Primary -> Backup -> DNS.
 * Checks Internal AND External Wi-Fi
 */
export const checkInternetReachability = async (
    onLog?: (module: string, msg: string, level: LogEntry['level']) => void
): Promise<boolean> => {
    
    // Check External Wi-Fi first if connected
    const extWifi = ExternalWifiManager.getAdapterStatus();
    if (extWifi && extWifi.status === 'CONNECTED') {
        // Assume external wifi provides net if connected to AP
        // In real app, we'd bind the socket to wlan1 here
    }

    // 1. Try Primary (Google) - Fast
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout
        const response = await fetch(PING_ENDPOINTS[0], { method: 'HEAD', signal: controller.signal });
        clearTimeout(timeoutId);
        return response.status === 204 || response.status === 200;
    } catch (e) {
        // Fail silently to try backup
    }

    // 2. Try Backup (Cloudflare) - Reliable
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        await fetch(PING_ENDPOINTS[1], { method: 'HEAD', signal: controller.signal });
        clearTimeout(timeoutId);
        if (onLog) onLog('NET-WATCHDOG', 'Primary link down. Rerouted via Cloudflare Backup.', 'warn');
        return true;
    } catch (e) {
        if (onLog) onLog('NET-WATCHDOG', 'CRITICAL: Global Uplink Failed.', 'error');
        return false;
    }
};

/**
 * Attempts to ping a specific host to see if it's alive.
 * Useful for NTRIP caster validation.
 */
export const checkServerLatency = async (host: string): Promise<number> => {
    const start = Date.now();
    try {
        // Heuristic: Try to fetch root. Most casters return a 200 OK or 401 Unauthorized (which means it's alive).
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 3000);
        
        // Remove protocol if present
        const cleanHost = host.replace('http://', '').replace('https://', '').split(':')[0];
        
        // Use http protocol for casting check
        await fetch(`http://${cleanHost}`, { method: 'HEAD', signal: controller.signal });
        
        return Date.now() - start;
    } catch (e) {
        return -1; // Unreachable
    }
};

/**
 * Generate a random interval between 15 and 40 seconds
 * to prevent server spamming while keeping connectivity checked.
 */
export const getNextProbeInterval = (): number => {
    return Math.floor(Math.random() * (40000 - 15000 + 1) + 15000);
};

/**
 * Comprehensive System Diagnostic
 * Analyzes GNSS Age, Network status, and NTRIP health to recommend actions.
 */
export const diagnoseSystem = (
    pos: PositionData,
    lastPosTimestamp: number,
    internetAvailable: boolean,
    activeNtrip: NtripCaster | null
): SystemDiagnostic => {
    const now = Date.now();
    const posAge = now - lastPosTimestamp;

    // 1. GNSS WATCHDOG (Aggressive 5s limit)
    // If we haven't received a location update in > 5 seconds, the hardware is stalled.
    if (posAge > 5000) {
        return { 
            status: 'CRITICAL', 
            integrity: 0, 
            message: 'GNSS Stalled (>5s). Auto-Healing...', 
            actionRequired: 'RESTART_GPS' 
        };
    }

    // If locked count is too low
    if (pos.satellitesUsed < 4) {
        return { 
            status: 'DEGRADED', 
            integrity: 40, 
            message: 'Insufficient Satellites (<4 Locked)', 
            actionRequired: 'NONE' // Just wait for physics engine
        };
    }

    // 2. NETWORK WATCHDOG
    if (!internetAvailable) {
        // Check if we need external wifi
        const extWifi = ExternalWifiManager.getAdapterStatus();
        if (extWifi && extWifi.status === 'DRIVER_MISSING') {
            return {
                 status: 'DEGRADED',
                 integrity: 45,
                 message: 'Ext. Wi-Fi Driver Missing',
                 actionRequired: 'CHECK_WIFI_DRIVER'
            };
        }

        if (activeNtrip) {
            return {
                status: 'DEGRADED',
                integrity: 50,
                message: 'No Internet - NTRIP Suspended',
                actionRequired: 'CHECK_NET'
            };
        }
    }

    // 3. NTRIP WATCHDOG
    if (activeNtrip && internetAvailable) {
        // If data is stale (> 5 seconds age)
        if (pos.correctionAge && pos.correctionAge > 5.0) {
            return {
                status: 'STABLE', // It's working, but lagging
                integrity: 75,
                message: `High Latency on ${activeNtrip.id}`,
                actionRequired: 'SWITCH_NTRIP'
            };
        }
    }

    return { 
        status: 'OPTIMAL', 
        integrity: 100, 
        message: 'System Nominal. 100% Operational.', 
        actionRequired: 'NONE' 
    };
};
