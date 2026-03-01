
import { PositionData, MockConfig, InjectionStatus, LogEntry } from '../types';
import { generateNMEASentence, generateRMC } from './gnssEngine';
import { NativeModules, Platform, Alert, Linking } from 'react-native';

const { MockLocationModule } = NativeModules;

/**
 * MOCK LOCATION KERNEL DRIVER
 * This service mimics the behavior of a native Android Location Provider.
 * In a fully native build, this would interface with LocationManager.addTestProvider.
 * In the Expo environment, it manages the "Logical" injection and interacts with available hooks.
 */

// Configuration
const DEFAULT_CONFIG: MockConfig = {
    enabled: false,
    providerName: 'gps',
    updateInterval: 50, // 20Hz Target
    jitterAmount: 0.000002, // ~20cm jitter to look organic
    altitudeSmoothing: true
};

class SystemInjectorClass {
    private config: MockConfig = { ...DEFAULT_CONFIG };
    private status: InjectionStatus = 'IDLE';
    private lastInjectTime = 0;
    private packetCount = 0;
    
    // Smoothing Buffers
    private altBuffer: number[] = [];
    private lastValidLat = 0;
    private lastValidLon = 0;

    // --- ORGANIC DRIFT STATE (Random Walk) ---
    // Simulates the natural wandering of GPS receivers
    private driftLat = 0;
    private driftLon = 0;
    private driftAlt = 0;
    
    // Boot Time Sync
    // Changed from BigInt to Number for legacy device compatibility (Android 5/Old WebViews)
    // Precision loss > 104 days is acceptable for mock driver simulation.
    private bootTimeOffsetNs: number;

    constructor() {
        this.status = 'IDLE';
        // Calculate offset in nanoseconds: (Date.now() - performance.now()) * 1,000,000
        // Using standard Number to prevent crash on engines lacking BigInt support
        const nowMs = Date.now();
        const perfMs = Math.floor(performance.now());
        this.bootTimeOffsetNs = (nowMs - perfMs) * 1000000;
    }

    public getStatus(): InjectionStatus {
        return this.status;
    }

    public mountSystem(enabled: boolean): void {
        this.config.enabled = enabled;
        this.status = enabled ? 'MOUNTED' : 'IDLE';
        
        if (enabled) {
            console.log('[SystemInjector] DRIVER MOUNTED. INTERCEPTING GPS HAL.');
            if (Platform.OS === 'android') {
                if (!MockLocationModule) {
                    Alert.alert(
                        "ต้องติดตั้งเป็นแอปพลิเคชัน (APK)",
                        "ฟีเจอร์นี้ต้องใช้ Native Module กรุณา Build แอปพลิเคชันเป็น APK (npx expo run:android) เพื่อใช้งาน",
                        [{ text: "ตกลง" }]
                    );
                } else {
                    Alert.alert(
                        "เปิดใช้งาน Mock Location",
                        "เพื่อให้ใช้งานกับ Google Maps และแอปนำทางอื่นๆ ได้ 100% กรุณาไปที่ Developer Options > Select mock location app แล้วเลือกแอปนี้",
                        [
                            { text: "ยกเลิก", style: "cancel" },
                            { 
                                text: "เปิดการตั้งค่า", 
                                onPress: () => {
                                    Linking.sendIntent('android.settings.APPLICATION_DEVELOPMENT_SETTINGS').catch(() => {
                                        Linking.openSettings();
                                    });
                                }
                            }
                        ]
                    );
                }
            } else if (Platform.OS === 'web') {
                Alert.alert(
                    "ไม่รองรับบน Web Browser",
                    "การจำลองตำแหน่งระดับระบบปฏิบัติการ (Mock Location) ไม่สามารถทำได้ผ่าน Web Browser กรุณาติดตั้งเป็นแอปพลิเคชัน Android (APK)",
                    [{ text: "ตกลง" }]
                );
            }
        } else {
            console.log('[SystemInjector] DRIVER UNMOUNTED. RESTORING HW PASS-THROUGH.');
        }
    }

    /**
     * CORE INJECTION LOOP
     * High-speed, low-latency function called by the Physics Engine.
     */
    public push(pos: PositionData, onLog?: (mod: string, msg: string, lvl: LogEntry['level']) => void): void {
        if (!this.config.enabled) return;

        const now = Date.now();
        // Rate Limiter (Safety Valve)
        if (now - this.lastInjectTime < 40) return; // Cap at 25Hz max to prevent OS flooding

        // --- 1. ORGANIC DRIFT (RANDOM WALK) ---
        const DRIFT_DECAY = 0.95;
        const DRIFT_NOISE = 0.0000005; // ~5cm step
        
        this.driftLat = (this.driftLat * DRIFT_DECAY) + ((Math.random() - 0.5) * DRIFT_NOISE);
        this.driftLon = (this.driftLon * DRIFT_DECAY) + ((Math.random() - 0.5) * DRIFT_NOISE);
        this.driftAlt = (this.driftAlt * DRIFT_DECAY) + ((Math.random() - 0.5) * 0.05);

        let finalLat = pos.latitude + this.driftLat;
        let finalLon = pos.longitude + this.driftLon;
        let finalAlt = pos.altitude + this.driftAlt;
        
        // Add micro-jitter for "noise floor" (Thermal noise simulation)
        finalLat += (Math.random() - 0.5) * 0.0000002;
        finalLon += (Math.random() - 0.5) * 0.0000002;

        // 2. ALTITUDE SMOOTHING (Barometer emulation)
        if (this.config.altitudeSmoothing) {
            const validAlt = Number.isFinite(pos.altitude) ? pos.altitude : 0;
            this.altBuffer.push(validAlt);
            if (this.altBuffer.length > 5) this.altBuffer.shift();
            finalAlt = (this.altBuffer.reduce((a, b) => a + b, 0) / this.altBuffer.length) + this.driftAlt;
        }

        // --- 3. ELAPSED REALTIME NANOS (MILITARY GRADE PRECISION) ---
        // Critical for Android OS: Matches SystemClock.elapsedRealtimeNanos()
        // Using Number safe integer math instead of BigInt for compatibility
        const perfNs = Math.floor(performance.now() * 1000000);
        const elapsedRealtimeNanos = perfNs + this.bootTimeOffsetNs;

        // --- 4. EXTRAS & NMEA INJECTION ---
        const satellites = pos.satellitesUsed || 8; 
        
        const nmeaGGA = generateNMEASentence(pos);
        const nmeaRMC = generateRMC(pos);
        
        const organicAccuracy = Math.max(0.65, pos.accuracy + (Math.random() * 0.25));

        // 5. CONSTRUCT SYSTEM PACKET
        const locationPacket = {
            provider: this.config.providerName, 
            latitude: finalLat,
            longitude: finalLon,
            altitude: finalAlt,
            speed: Math.max(0, pos.speed),
            bearing: pos.bearing,
            accuracy: organicAccuracy, 
            verticalAccuracy: Math.max(1.0, organicAccuracy * 1.5), 
            speedAccuracy: 0.5,
            bearingAccuracy: 2.0,
            time: now, // UTC Time
            elapsedRealtimeNanos: elapsedRealtimeNanos, 
            extras: {
                satellites: satellites,
                meanSnr: 28,
                maxSnr: 45,
                nmea: `${nmeaGGA}\n${nmeaRMC}` 
            }
        };

        // 6. INJECTION 
        this.lastInjectTime = now;
        
        if (MockLocationModule) {
            MockLocationModule.setMockLocation(locationPacket);
        }
        
        // Secure Counter Increment
        if (this.packetCount < Number.MAX_SAFE_INTEGER) {
            this.packetCount++;
        } else {
            this.packetCount = 0; // Rollover safely
        }

        // Log occasionally 
        if (this.packetCount % 50 === 0 && onLog) {
            onLog('SYS-DRIVER', `Injected 50 packets. Drift: ${(this.driftLat*111000).toFixed(2)}m. NMEA OK.`, 'success');
        }
        
        this.lastValidLat = finalLat;
        this.lastValidLon = finalLon;
    }

    public async verifyIntegrity(): Promise<boolean> {
        return this.config.enabled;
    }
}

export const SystemInjector = new SystemInjectorClass();
