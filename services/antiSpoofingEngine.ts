import { PositionData, Satellite, LogEntry } from '../types';

/**
 * ANTI-SPOOFING & JAMMING ANALYZER
 * Military-grade heuristic engine to detect GNSS signal interference.
 * Analyzes SNR variance, sudden position jumps, and constellation anomalies.
 */

export interface SecurityAnalysisResult {
    jammingProbability: number; // 0.0 to 1.0
    spoofingProbability: number; // 0.0 to 1.0
    status: 'SECURE' | 'WARNING' | 'CRITICAL';
    message: string;
}

class AntiSpoofingEngineClass {
    private lastPos: PositionData | null = null;
    private lastTime: number = 0;
    
    // Historical buffers for moving averages
    private snrHistory: number[] = [];
    private speedHistory: number[] = [];
    private jumpHistory: number[] = [];

    public analyze(pos: PositionData, sats: Satellite[], onLog?: (mod: string, msg: string, lvl: LogEntry['level']) => void): SecurityAnalysisResult {
        const now = Date.now();
        let jammingProb = 0;
        let spoofingProb = 0;
        let messages: string[] = [];
        
        // 1. ANALYZE SATELLITE SNR (JAMMING DETECTION)
        // Jamming usually causes a massive drop in SNR across ALL satellites simultaneously
        if (sats.length > 0) {
            let totalSnr = 0;
            let maxSnr = 0;
            let minSnr = 99;
            
            sats.forEach(s => {
                totalSnr += s.snr;
                if (s.snr > maxSnr) maxSnr = s.snr;
                if (s.snr < minSnr) minSnr = s.snr;
            });
            
            const avgSnr = totalSnr / sats.length;
            this.snrHistory.push(avgSnr);
            if (this.snrHistory.length > 10) this.snrHistory.shift();
            
            // Check for sudden drop
            const snrMovingAvg = this.snrHistory.reduce((a, b) => a + b, 0) / this.snrHistory.length;
            if (avgSnr < 15 && snrMovingAvg > 25) {
                jammingProb += 0.6;
                messages.push('SUDDEN SNR DROP (BROADBAND NOISE)');
            } else if (avgSnr < 12) {
                jammingProb += 0.4;
                messages.push('HIGH NOISE FLOOR DETECTED');
            }
            
            // 2. ANALYZE SNR VARIANCE (SPOOFING DETECTION)
            // Spoofers often broadcast all satellites at the exact same power level
            const snrVariance = maxSnr - minSnr;
            if (sats.length > 4 && snrVariance < 3.0 && avgSnr > 35) {
                spoofingProb += 0.7;
                messages.push('UNREALISTIC SNR UNIFORMITY (SIMULATOR DETECTED)');
            }
        } else {
            // No satellites visible but we had them recently -> Possible severe jamming
            if (this.snrHistory.length > 0 && this.snrHistory[this.snrHistory.length - 1] > 20) {
                jammingProb += 0.8;
                messages.push('COMPLETE SIGNAL LOSS (SEVERE JAMMING)');
            }
        }

        // 3. ANALYZE KINEMATICS (SPOOFING DETECTION)
        // Sudden jumps in position or impossible speeds
        if (this.lastPos && this.lastTime > 0) {
            const dt = (now - this.lastTime) / 1000; // seconds
            if (dt > 0 && dt < 5) {
                // Calculate distance using Haversine
                const R = 6371e3; // metres
                const φ1 = this.lastPos.latitude * Math.PI/180;
                const φ2 = pos.latitude * Math.PI/180;
                const Δφ = (pos.latitude - this.lastPos.latitude) * Math.PI/180;
                const Δλ = (pos.longitude - this.lastPos.longitude) * Math.PI/180;

                const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                          Math.cos(φ1) * Math.cos(φ2) *
                          Math.sin(Δλ/2) * Math.sin(Δλ/2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                const distance = R * c;
                
                const calculatedSpeed = distance / dt;
                
                // If speed is > 300m/s (Mach 1) and we are not in aviation mode
                if (calculatedSpeed > 300) {
                    spoofingProb += 0.8;
                    messages.push(`IMPOSSIBLE KINEMATICS (${calculatedSpeed.toFixed(0)} m/s)`);
                }
                
                // If position jumped by > 10km in 1 second
                if (distance > 10000 && dt < 2) {
                    spoofingProb += 0.9;
                    messages.push(`TELEPORTATION DETECTED (${(distance/1000).toFixed(1)} km jump)`);
                }
            }
        }

        this.lastPos = { ...pos };
        this.lastTime = now;

        // Cap probabilities
        jammingProb = Math.min(1.0, Math.max(0, jammingProb));
        spoofingProb = Math.min(1.0, Math.max(0, spoofingProb));

        let status: SecurityAnalysisResult['status'] = 'SECURE';
        if (jammingProb > 0.7 || spoofingProb > 0.7) {
            status = 'CRITICAL';
            if (onLog) onLog('SECURITY', `CRITICAL THREAT: ${messages.join(' | ')}`, 'error');
        } else if (jammingProb > 0.4 || spoofingProb > 0.4) {
            status = 'WARNING';
            if (onLog) onLog('SECURITY', `WARNING: ${messages.join(' | ')}`, 'warn');
        }

        return {
            jammingProbability: jammingProb,
            spoofingProbability: spoofingProb,
            status,
            message: messages.length > 0 ? messages[0] : 'RF ENVIRONMENT SECURE'
        };
    }
}

export const AntiSpoofingEngine = new AntiSpoofingEngineClass();
