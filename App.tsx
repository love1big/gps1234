import React, { Component, useState, useEffect, useCallback, useRef } from 'react';
import { StyleSheet, View, Text, ScrollView, SafeAreaView, StatusBar, Platform, Linking, AppState, Share, TouchableOpacity, Alert } from 'react-native';
import { Satellite, PositionData, GNSSConfig, LogEntry, IMUData, NetworkStats, SensorStatus, UsbDeviceStatus, ResourceState, InjectionStatus } from './types';
import { generateSatellites, calculatePosition, injectEphemerisData, recalculateOrbits, flushEngineBuffers, emergencyShutdown } from './services/gnssEngine';
import { calculateNetworkStats } from './services/networkOptimizer';
import { initSensorListeners, triggerSensorPulse, stopSensorListeners, setSensorPowerProfile } from './services/sensorManager';
import { downloadAndMergeAGPS } from './services/agpsManager';
import { runSecurityScan, triggerSelfDestruct } from './services/securityGuard';
import { monitorPerformance, shouldPurgeMemory, updateMotionState } from './services/resourceGovernor';
import { SystemInjector } from './services/mockLocationService';
import { simulateUsbIngest, UsbDriver } from './services/usbDrivers';
import { ExternalWifiManager } from './services/wifiDrivers'; // NEW
import { BluetoothManager } from './services/bluetoothGnss'; // NEW
import { INITIAL_POSITION } from './constants';
import * as Location from 'expo-location';
import * as Battery from 'expo-battery';

import SatelliteMap from './components/SatelliteMap';
import SignalChart from './components/SignalChart';
import InfoPanel from './components/InfoPanel';
import SettingsPanel from './components/SettingsPanel';
import TerminalLog from './components/TerminalLog';

// --- ROBUST ERROR BOUNDARY (ANTI-WSOD) ---
interface ErrorBoundaryProps {
    children?: React.ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: string;
    errorInfo: string;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = {
        hasError: false,
        error: '',
        errorInfo: ''
    };

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error: error.message, errorInfo: '' };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error("CRITICAL KERNEL PANIC:", error, errorInfo);
        this.setState({ errorInfo: errorInfo.componentStack || '' });
        emergencyShutdown(); 
        stopSensorListeners();
    }

    handleRestart = () => {
        emergencyShutdown();
        this.setState({ hasError: false, error: '', errorInfo: '' });
    }

    render() {
        if (this.state.hasError) {
            return (
                <View style={styles.errorContainer}>
                    <StatusBar barStyle="light-content" backgroundColor="#7f1d1d" />
                    <View style={styles.errorBox}>
                        <Text style={styles.errorTitle}>SYSTEM HALTED</Text>
                        <Text style={styles.errorSub}>KERNEL PANIC DETECTED</Text>
                        <View style={styles.consoleBox}>
                            <Text style={styles.consoleText}>ERROR: {this.state.error}</Text>
                        </View>
                        <TouchableOpacity onPress={this.handleRestart} style={styles.rebootBtn}>
                            <Text style={styles.rebootText}>FORCE RESTART</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            );
        }
        return this.props.children;
    }
}

const SecurityLockout = ({ reason }: { reason: string }) => (
    <View style={styles.lockoutContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <Text style={styles.lockoutIcon}>🔒</Text>
        <Text style={styles.lockoutTitle}>SECURITY VIOLATION</Text>
        <Text style={styles.lockoutTitle}>SECURITY VIOLATION</Text>
        <Text style={styles.lockoutReason}>CODE: {reason}</Text>
    </View>
);

const MAX_LOG_BUFFER = 50;
const logBuffer: LogEntry[] = [];
const pushLog = (entry: LogEntry) => {
    if (logBuffer.length >= MAX_LOG_BUFFER) logBuffer.shift();
    logBuffer.push(entry);
};

// --- OPTIMIZATION: Consolidated State ---
// Reduces 5 separate re-renders into 1 atomic update
interface DashboardState {
    position: PositionData;
    imu: IMUData;
    network: NetworkStats;
    sensorStatus: SensorStatus;
    usbStatus: UsbDeviceStatus;
    sats: Satellite[];
    renderTrigger: number;
}

const INITIAL_DASHBOARD: DashboardState = {
    position: { ...INITIAL_POSITION } as PositionData,
    imu: { accelX: 0, accelY: 0, accelZ: 0, gyroX: 0, gyroY: 0, gyroZ: 0, magX:0, magY:0, magZ:0, pressure: 1013, stepCount: 0, source: 'VIRTUAL' },
    network: { latency: 0, jitter: 0, downloadRate: 0, uploadRate: 0, packetLoss: 0, stabilityScore: 100, signalStrength: -90, connectionType: '4G', isOptimized: false },
    sensorStatus: { accel: 'DETECTING', gyro: 'DETECTING', mag: 'DETECTING', baro: 'DETECTING' },
    usbStatus: { connected: false, isRealHardware: false, deviceName: '', protocol: 'UNKNOWN', baudRate: 0, mountPoint: '', hardwareId: '', driver: '' },
    sats: [],
    renderTrigger: 0
};

export default function App() {
  const hardwarePosRef = useRef<PositionData | null>(null);
  const lastHardwareTimeRef = useRef<number>(0);
  const positionRef = useRef<PositionData>({ ...INITIAL_POSITION } as PositionData);
  const currentHwMode = useRef<'HIGH' | 'ECO'>('HIGH');
  
  const configRef = useRef<GNSSConfig>({
    operationMode: 'STANDARD', 
    weatherCondition: 'CLEAR', // Default Weather
    dualFrequencyMode: false, multipathMitigation: true, sensorFusion: true, externalSource: false,
    autoUsbDetection: true, usbAutoConfigured: true, agpsEnabled: true, rtkEnabled: false,
    lastAgpsUpdate: null, totalEphemerisCount: 0, mockLocationOutput: false, errorFilterLevel: 'medium',
    agpsServer: 'supl.google.com:7276', signalWatchdog: true, boostInternal: false, boostExternal: false, 
    powerSaverMode: false, environment: 'suburban', dynamicSimulation: true, autoSignalRecovery: true, 
    wifiPositioning: true, bluetoothPositioning: false, rfMultipathRejection: true, scheduledWakeUp: false, 
    activeRfPulse: true, antennaHeight: 0, antennaOffsetX: 0, antennaOffsetY: 0, leoSatellites: false, quantumIns: false,
    networkBoost: true, keepAliveMode: true, dataCompression: true, multiPathTcp: false, 
    congestionControl: true, lowLatencyMode: true, dnsTurbo: true, autoNtrip: true,
    lastNtripUpdate: null, nmeaOutput: false, autoResourceMgmt: true,
    hardwareReplacementMode: false, systemOverride: false, autoNavigationMode: false, autoNavThreshold: 20, 
    predictiveGuidance: false, vectorSnapping: true, injectionThreshold: 15, predictiveLookahead: 0.8,
    externalWifiEnabled: true, forceDriverInjection: true,
    smartStandby: true, // Enabled by default for power saving
    tunnelMode: true // Enabled by default for better UX
  });

  // BATCHED STATE
  const [dashboard, setDashboard] = useState<DashboardState>(INITIAL_DASHBOARD);
  
  const [driverStatus, setDriverStatus] = useState<InjectionStatus>('IDLE');
  const [securityState, setSecurityState] = useState<{locked: boolean, reason: string}>({ locked: false, reason: '' });
  const [config, setConfigState] = useState<GNSSConfig>(configRef.current);
  const [batteryLevel, setBatteryLevel] = useState(1.0); 
  const [logs, setLogs] = useState<LogEntry[]>([]); 
  const [baselineSats, setBaselineSats] = useState<number | null>(null); 
  const [resourceState, setResourceState] = useState<ResourceState>({ 
      loadLevel: 0, quality: 'HIGH', memoryPressure: 'NORMAL', lastPurgeTime: 0, fpsEstimate: 60,
      renderComplexity: 'FULL', thermalThrottling: false
  });

  const locationSubscription = useRef<Location.LocationSubscription | null>(null);
  const isSubscribingRef = useRef(false); 
  const isProcessingRef = useRef(false); 
  const lastUiUpdateRef = useRef(0);
  const lastUsbCheckRef = useRef(0);
  const appState = useRef(AppState.currentState);
  const engineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hardwareWatchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const updateConfig = (newConfig: Partial<GNSSConfig>) => {
      const merged = { ...config, ...newConfig };
      if (newConfig.hardwareReplacementMode !== undefined) {
          SystemInjector.mountSystem(newConfig.hardwareReplacementMode);
          setDriverStatus(newConfig.hardwareReplacementMode ? 'MOUNTED' : 'IDLE');
          addLog('KERNEL', newConfig.hardwareReplacementMode ? 'Driver MOUNTED.' : 'Driver UNMOUNTED.', 'warn');
      }
      if (newConfig.systemOverride !== undefined) {
         merged.hardwareReplacementMode = newConfig.systemOverride;
         SystemInjector.mountSystem(newConfig.systemOverride);
         setDriverStatus(newConfig.systemOverride ? 'MOUNTED' : 'IDLE');
      }
      if (newConfig.operationMode !== undefined) {
          addLog('SYS', `Switched to Mode: ${newConfig.operationMode}`, 'success');
      }
      if (newConfig.weatherCondition !== undefined) {
          addLog('ATMOSPHERE', `Physics Updated: ${newConfig.weatherCondition}`, 'info');
      }
      setConfigState(merged);
      configRef.current = merged; 
  };

  const addLog = useCallback((module: string, message: string, level: LogEntry['level'] = 'info') => {
    const newLog: LogEntry = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        timestamp: Date.now(),
        module,
        message,
        level
    };
    pushLog(newLog);
    if (appState.current.match(/inactive|background/)) return;
    setLogs([...logBuffer]); 
  }, []);

  useEffect(() => {
      // HANDLE APP STATE CHANGES (BACKGROUND/FOREGROUND)
      const subscription = AppState.addEventListener('change', nextAppState => {
        appState.current = nextAppState;
        if (nextAppState === 'active') {
             // WAKE UP PROTOCOL
             lastUiUpdateRef.current = 0; // Force immediate update
             startEngine();
        } else {
             // SLEEP PROTOCOL: The engine handles throttling via `runEngineCycle`
        }
      });

      const initSystem = async () => {
          const sec = await runSecurityScan();
          if (sec.isCompromised) {
              triggerSelfDestruct();
              setSecurityState({ locked: true, reason: sec.reason });
              return;
          }
          try {
              const level = await Battery.getBatteryLevelAsync();
              setBatteryLevel(level);
          } catch (e) {}
          
          // Initial External Hardware Scan
          await ExternalWifiManager.scanForHardware((msg, lvl) => addLog('EXT-WIFI', msg, lvl));

          startEngine();
      };
      initSystem();
      return () => {
          subscription.remove();
          if (engineTimerRef.current) clearTimeout(engineTimerRef.current);
          if (hardwareWatchdogRef.current) clearInterval(hardwareWatchdogRef.current);
          stopSensorListeners();
          if (locationSubscription.current) locationSubscription.current.remove();
      };
  }, []);

  const startEngine = () => {
      if (engineTimerRef.current) clearTimeout(engineTimerRef.current);
      
      engineTimerRef.current = setTimeout(runEngineCycle, 100);
      subscribeToHardware('HIGH'); // Default to HIGH
      initSensorListeners();
      
      hardwareWatchdogRef.current = setInterval(() => {
        const now = Date.now();
        const watchdogThreshold = currentHwMode.current === 'ECO' ? 30000 : 5000;
        
        if (lastHardwareTimeRef.current > 0 && (now - lastHardwareTimeRef.current > watchdogThreshold)) {
            addLog('WATCHDOG', `GNSS Stalled. Restarting Driver...`, 'warn');
            subscribeToHardware(currentHwMode.current);
            lastHardwareTimeRef.current = now; 
        }
      }, 5000);
  };

  const runEngineCycle = async () => {
      if (isProcessingRef.current || securityState.locked) return;
      isProcessingRef.current = true;

      const startTime = Date.now();
      const inputPos = hardwarePosRef.current ? hardwarePosRef.current : positionRef.current;
      const isBackground = !!appState.current.match(/inactive|background/);
      
      // MOTION SENSING for Wake-on-Motion
      const isMoving = inputPos.speed > 0.1 || Math.abs((dashboard.imu.accelX || 0) + (dashboard.imu.accelY || 0) + (dashboard.imu.accelZ || 0) - 1.0) > 0.1;
      updateMotionState(isMoving, 100);

      // --- ADVANCED TIMING CONTROL (SMART STANDBY) ---
      let nextDelay = 50; // Default 20Hz
      let powerProfile: 'HIGH_PERF' | 'BALANCED' | 'LOW_POWER' | 'ULTRA_LOW' = 'HIGH_PERF';
      
      if (isBackground) {
          // BACKGROUND LOGIC
          // If we are injecting mock location, we must stay somewhat awake to feed Google Maps
          if (configRef.current.systemOverride) {
              nextDelay = 1000; // 1Hz injection (Sufficient for Maps)
              powerProfile = 'BALANCED';
          } else {
              nextDelay = 5000; // 5s deep sleep if just passive
              powerProfile = 'ULTRA_LOW';
          }
      } else {
          // FOREGROUND LOGIC
          if (configRef.current.smartStandby && resourceState.quality === 'DEEP_SLEEP' && !isMoving) {
              nextDelay = 5000; // 5s deep sleep while parked/static
              powerProfile = 'ULTRA_LOW';
          } else if (configRef.current.operationMode === 'BACKGROUND_ECO') {
              nextDelay = 1000; 
              powerProfile = 'LOW_POWER';
          } else if (batteryLevel < 0.15) {
              nextDelay = 2000;
              powerProfile = 'LOW_POWER';
          }
      }
      
      // Enforce the calculated hardware profile (Sensors)
      setSensorPowerProfile(powerProfile);
      
      // Enforce GPS Hardware Profile (Dynamic Throttling)
      const targetHwMode = (powerProfile === 'ULTRA_LOW' || powerProfile === 'LOW_POWER') ? 'ECO' : 'HIGH';
      if (currentHwMode.current !== targetHwMode) {
          subscribeToHardware(targetHwMode);
      }

      try {
          const targetSats = isBackground ? 8 : 24;
          const genResult = generateSatellites(targetSats + 4, configRef.current, configRef.current.boostInternal, powerProfile === 'LOW_POWER' || powerProfile === 'ULTRA_LOW', false, undefined, isBackground);
          
          if (baselineSats === null && genResult.sats.length >= 4) setBaselineSats(genResult.sats.length);

          const internalResult = calculatePosition(
              inputPos,
              configRef.current,
              genResult.sats,
              nextDelay,
              powerProfile === 'LOW_POWER' || powerProfile === 'ULTRA_LOW',
              false,
              genResult.scanState,
              isBackground,
              batteryLevel
          );

          positionRef.current = { ...internalResult.position };

          if (configRef.current.hardwareReplacementMode) {
             SystemInjector.push(positionRef.current, addLog);
          }

          if (!isBackground) {
              const now = Date.now();
              const timeSinceLastUi = now - lastUiUpdateRef.current;
              
              // Dynamic UI Throttling based on Resource Governor
              let uiThreshold = 32; // ~30fps
              if (resourceState.quality === 'DEEP_SLEEP') uiThreshold = 2000;
              else if (resourceState.quality === 'ECO') uiThreshold = 1000;

              if (timeSinceLastUi > uiThreshold) {
                  // USB DRIVER CHECK
                  let currentUsbStatus = dashboard.usbStatus;
                  if (configRef.current.autoUsbDetection && (now - lastUsbCheckRef.current > 5000)) {
                      lastUsbCheckRef.current = now;
                      const usbPackets = simulateUsbIngest();
                      if (usbPackets.length > 0) {
                          currentUsbStatus = { 
                              ...currentUsbStatus, 
                              connected: true, 
                              protocol: UsbDriver.getProtocol(), 
                              deviceName: UsbDriver.identity?.modelName || 'Generic OTG GPS',
                              identity: UsbDriver.identity || undefined 
                          };
                      }
                  }

                  // OPTIMIZATION: BATCHED UPDATE
                  setDashboard({
                      position: { ...positionRef.current },
                      imu: internalResult.imu,
                      sensorStatus: internalResult.sensorStatus,
                      network: calculateNetworkStats(configRef.current),
                      usbStatus: currentUsbStatus,
                      sats: genResult.sats, // ZERO-COPY reference pass
                      renderTrigger: now // Force sub-components to know time changed
                  });
                  
                  if (internalResult.log) addLog(internalResult.log.module, internalResult.log.message, internalResult.log.level);
                  
                  lastUiUpdateRef.current = now;
              }

              if (configRef.current.autoResourceMgmt && timeSinceLastUi > 500) {
                 const loopDuration = now - startTime;
                 const rStats = monitorPerformance(loopDuration);
                 setResourceState(rStats);
                 if (shouldPurgeMemory(rStats)) { 
                     flushEngineBuffers(); 
                     setLogs([]); 
                     addLog('SYS', 'RAM PURGED (STANDBY)', 'warn');
                 }
              }
          } 

      } catch (err) { 
          flushEngineBuffers(); 
      } finally {
          isProcessingRef.current = false;
          engineTimerRef.current = setTimeout(runEngineCycle, nextDelay);
      }
  };

  const subscribeToHardware = async (mode: 'HIGH' | 'ECO' = 'HIGH') => {
      // Debounce & Mode Check
      if (isSubscribingRef.current) return;
      // Only skip if already subscribed AND mode matches
      if (locationSubscription.current && currentHwMode.current === mode) return;

      isSubscribingRef.current = true;
      currentHwMode.current = mode;

      if (locationSubscription.current) {
          locationSubscription.current.remove();
          locationSubscription.current = null;
      }
      
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
             addLog('HW-DRIVER', 'Permission Denied', 'error');
             isSubscribingRef.current = false;
             return;
        }
        
        await Location.requestBackgroundPermissionsAsync();
        
        // Dynamic Parameters based on Mode
        let options = { 
            accuracy: Location.Accuracy.BestForNavigation, 
            timeInterval: 100,
            distanceInterval: 0, 
            // @ts-ignore
            activityType: Location.ActivityType.AutomotiveNavigation,
            pausesLocationUpdatesAutomatically: false 
        };

        if (mode === 'ECO') {
            options = {
                accuracy: Location.Accuracy.Balanced, // Lower power (Cell/WiFi preference)
                timeInterval: 10000, // 10s updates
                distanceInterval: 50, // 50m movement required
                // @ts-ignore
                activityType: Location.ActivityType.Fitness, // Less aggressive
                pausesLocationUpdatesAutomatically: false
            };
            addLog('HW-DRIVER', 'Switched to ECO Mode (10s interval)', 'info');
        } else {
            addLog('HW-DRIVER', 'Switched to HIGH PERF Mode', 'info');
        }
        
        locationSubscription.current = await Location.watchPositionAsync(
          options,
          (loc) => { 
             const now = Date.now();
             lastHardwareTimeRef.current = now;
             
             hardwarePosRef.current = {
                 ...positionRef.current, 
                 latitude: loc.coords.latitude,
                 longitude: loc.coords.longitude,
                 altitude: loc.coords.altitude || 0,
                 accuracy: loc.coords.accuracy || 10,
                 speed: loc.coords.speed || 0,
                 bearing: loc.coords.heading || 0,
                 timestamp: now
             };
          }
        );
      } catch (err) { 
          addLog('HW-DRIVER', `Driver Fault: ${err}`, 'error'); 
      } finally {
          isSubscribingRef.current = false;
      }
  };

  if (securityState.locked) {
      return <SecurityLockout reason={securityState.reason} />;
  }

  const getHeaderColor = () => {
      if (dashboard.position.integrityState === 'COMPROMISED') return '#ef4444';
      if (resourceState.quality === 'DEEP_SLEEP') return '#64748b'; // Gray for sleep
      if (dashboard.position.scanState === 'TUNNEL_COASTING') return '#facc15'; // Yellow for Tunnel
      if (config.operationMode === 'URBAN_CANYON') return '#f97316'; 
      if (config.operationMode === 'PRECISE_SURVEY') return '#a855f7'; 
      if (config.operationMode === 'BACKGROUND_ECO') return '#0ea5e9'; 
      return '#10b981'; 
  };

  return (
    <ErrorBoundary>
        <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#0f172a" translucent={true} />
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>OMNI<Text style={styles.titleAccent}>GNSS</Text> <Text style={styles.titlePro}>ENHANCER</Text></Text>
                    <Text style={styles.subtitle}>
                        {resourceState.quality === 'DEEP_SLEEP' ? 'SLEEPING (WAKE-ON-MOTION)' : 
                         dashboard.position.scanState === 'TUNNEL_COASTING' ? 'DEAD RECKONING (TUNNEL)' :
                         `${config.operationMode} • ${driverStatus === 'MOUNTED' ? 'ROOT MODE' : 'PASSTHROUGH'}`}
                    </Text>
                </View>
                <View style={styles.statusBadge}>
                    <Text style={[styles.statusText, { color: getHeaderColor() }]}>● {resourceState.quality === 'DEEP_SLEEP' ? 'STANDBY' : 'ACTIVE'}</Text>
                    {config.smartStandby && <Text style={[styles.ecoBadge, {borderColor: '#06b6d4', color: '#06b6d4'}]}>SMART_PWR</Text>}
                    {dashboard.usbStatus.connected && <Text style={[styles.ecoBadge, {borderColor: '#ec4899', color: '#ec4899'}]}>USB DRIVER</Text>}
                </View>
            </View>

            {dashboard.position.integrityState === 'COMPROMISED' && (
                <View style={[styles.alertBox, { borderColor: '#ef4444', backgroundColor: '#450a0a' }]}>
                    <Text style={[styles.alertText, { color: '#ef4444' }]}>⚠ SIGNAL INTERFERENCE DETECTED</Text>
                </View>
            )}

            <View style={styles.section}>
                {resourceState.quality !== 'SURVIVAL' && resourceState.quality !== 'DEEP_SLEEP' && (
                    <SatelliteMap 
                        satellites={dashboard.sats} 
                        limitCount={resourceState.quality === 'ECO' ? 12 : 48} 
                        renderTrigger={dashboard.renderTrigger} 
                        heading={dashboard.position.bearing} 
                        complexity={resourceState.renderComplexity} 
                    />
                )}
                {resourceState.quality === 'DEEP_SLEEP' && (
                    <View style={[styles.survivalBox, { borderColor: '#334155', backgroundColor: '#0f172a' }]}>
                        <Text style={[styles.survivalText, { color: '#94a3b8' }]}>SYSTEM STANDBY</Text>
                        <Text style={styles.survivalSub}>Waiting for motion...</Text>
                    </View>
                )}
                {resourceState.quality === 'SURVIVAL' && (
                    <View style={styles.survivalBox}>
                        <Text style={styles.survivalText}>TACTICAL MODE ACTIVE</Text>
                        <Text style={styles.survivalSub}>DISPLAY OFF • GNSS ENGINE ON</Text>
                    </View>
                )}
                {resourceState.quality !== 'ECO' && resourceState.quality !== 'SURVIVAL' && resourceState.quality !== 'DEEP_SLEEP' && <SignalChart satellites={dashboard.sats} />}
            </View>

            <View style={styles.panel}>
                <InfoPanel 
                    position={dashboard.position} 
                    imu={dashboard.imu} 
                    network={dashboard.network} 
                    sensorStatus={dashboard.sensorStatus} 
                    baselineSats={baselineSats} 
                    usbStatus={dashboard.usbStatus} 
                />
            </View>

            <TerminalLog logs={logs} />

            <SettingsPanel 
                config={config} 
                onUpdateConfig={updateConfig} 
                onManualAgpsUpdate={() => downloadAndMergeAGPS(addLog).then(d => { injectEphemerisData(d); recalculateOrbits(); })}
                onSensorPulse={triggerSensorPulse}
                onOpenMaps={() => {
                    const url = Platform.select({ 
                        ios: `maps:0,0?q=${dashboard.position.latitude},${dashboard.position.longitude}`, 
                        android: `google.navigation:q=${dashboard.position.latitude},${dashboard.position.longitude}` 
                    });
                    if(url) Linking.openURL(url);
                }}
                onShareLocation={() => Share.share({ message: `Lat: ${dashboard.position.latitude}\nLon: ${dashboard.position.longitude}` })}
                position={dashboard.position}
                usbConnected={dashboard.usbStatus.connected} 
                usbStatus={dashboard.usbStatus} 
            />
            
            <View style={{height: 40}} />
        </ScrollView>
        </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  scrollView: { flex: 1 },
  scrollContent: { padding: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#1e293b', paddingBottom: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  titleAccent: { color: '#06b6d4' },
  titlePro: { color: '#8b5cf6', fontSize: 16, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' },
  subtitle: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  statusBadge: { alignItems: 'flex-end' },
  statusText: { fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontWeight: 'bold' },
  ecoBadge: { fontSize: 9, color: '#eab308', borderWidth: 1, borderColor: '#a16207', paddingHorizontal: 4, borderRadius: 3, marginTop: 4 },
  section: { marginBottom: 20 },
  panel: { backgroundColor: '#1e293b', borderRadius: 12, borderWidth: 1, borderColor: '#334155', padding: 16, marginBottom: 20 },
  alertBox: { marginBottom: 16, padding: 8, borderWidth: 1, borderRadius: 8, backgroundColor: '#1e1b4b', alignItems: 'center' },
  alertText: { fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
  survivalBox: { backgroundColor: '#3f0c0c', padding: 30, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#ef4444' },
  survivalText: { color: '#ef4444', fontWeight: 'bold', fontSize: 18, letterSpacing: 2 },
  survivalSub: { color: '#fca5a5', marginTop: 8, fontSize: 12 },
  errorContainer: { flex: 1, backgroundColor: '#450a0a', justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorBox: { width: '100%', alignItems: 'center' },
  errorTitle: { color: '#ef4444', fontSize: 28, fontWeight: 'bold', letterSpacing: 2 },
  errorSub: { color: '#f87171', fontSize: 14, marginBottom: 20, letterSpacing: 1 },
  consoleBox: { backgroundColor: '#1e0505', width: '100%', padding: 12, borderRadius: 8, marginBottom: 20, borderWidth: 1, borderColor: '#7f1d1d' },
  consoleText: { color: '#fecaca', fontFamily: 'monospace', fontSize: 10, marginBottom: 8 },
  rebootBtn: { backgroundColor: '#dc2626', paddingVertical: 14, paddingHorizontal: 32, borderRadius: 8, width: '100%', alignItems: 'center' },
  rebootText: { color: '#fff', fontWeight: 'bold', fontSize: 14, letterSpacing: 1 },
  lockoutContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', padding: 32 },
  lockoutIcon: { fontSize: 64, marginBottom: 16 },
  lockoutTitle: { color: '#ef4444', fontSize: 24, fontWeight: 'bold', marginBottom: 8, letterSpacing: 2 },
  lockoutReason: { color: '#f87171', fontSize: 16, fontFamily: 'monospace', marginBottom: 24 },
});