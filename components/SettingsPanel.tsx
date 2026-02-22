
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as Battery from 'expo-battery';
import { GNSSConfig, PositionData, UsbDeviceStatus, FirmwareMetadata, ExternalWifiAdapter, NavAppProfile, BluetoothDevice, OperationMode, WeatherCondition } from '../types';
import { FirmwareManager } from '../services/firmwareEngine';
import { ExternalWifiManager } from '../services/wifiDrivers';
import { NavBridge } from '../services/universalNavBridge';
import { BluetoothManager } from '../services/bluetoothGnss';
import { NtripClient } from '../services/ntripClient'; // NEW

interface Props {
  config: GNSSConfig;
  onUpdateConfig: (newConfig: Partial<GNSSConfig>) => void;
  onManualAgpsUpdate: () => void;
  onSensorPulse: () => void;
  onOpenMaps: () => void;
  onShareLocation: () => void; 
  position: PositionData;
  usbConnected?: boolean;
  usbStatus?: UsbDeviceStatus; 
  onNtripData?: (data: any) => void;
}

const safeHaptics = {
    impactAsync: async (style: Haptics.ImpactFeedbackStyle) => {
        try {
            if (Platform.OS !== 'web') await Haptics.impactAsync(style);
        } catch (e) {}
    },
    notificationAsync: async (type: Haptics.NotificationFeedbackType) => {
        try {
            if (Platform.OS !== 'web') await Haptics.notificationAsync(type);
        } catch (e) {}
    },
    selectionAsync: async () => {
        try {
            if (Platform.OS !== 'web') await Haptics.selectionAsync();
        } catch (e) {}
    }
};

const Toggle = ({ label, active, onClick, description }: { label: string, active: boolean, onClick: () => void, description?: string }) => (
  <TouchableOpacity 
    style={[styles.toggle, active ? styles.activeToggle : null]} 
    onPress={() => {
        safeHaptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onClick();
    }}
    activeOpacity={0.8}
  >
    <View style={{ flex: 1 }}>
      <Text style={[styles.toggleLabel, active ? styles.activeLabel : null]}>{label}</Text>
      {description && <Text style={styles.toggleDesc}>{description}</Text>}
    </View>
    <View style={[styles.switchTrack, active ? styles.activeTrack : null]}>
      <View style={[styles.switchThumb, active ? styles.activeThumb : null]} />
    </View>
  </TouchableOpacity>
);

const ModeSelector = ({ current, onSelect }: { current: OperationMode, onSelect: (m: OperationMode) => void }) => {
    const modes: { id: OperationMode, label: string, color: string }[] = [
        { id: 'STANDARD', label: 'STD', color: '#10b981' },
        { id: 'URBAN_CANYON', label: 'URBAN', color: '#f97316' },
        { id: 'PRECISE_SURVEY', label: 'SURVEY', color: '#a855f7' },
        { id: 'BACKGROUND_ECO', label: 'ECO', color: '#0ea5e9' }
    ];

    return (
        <View style={styles.modeContainer}>
            <Text style={styles.modeTitle}>OPERATION MODE</Text>
            <View style={styles.modeRow}>
                {modes.map(m => (
                    <TouchableOpacity 
                        key={m.id} 
                        style={[
                            styles.modeBtn, 
                            { borderColor: m.color }, 
                            current === m.id ? { backgroundColor: m.color } : null
                        ]}
                        onPress={() => {
                            safeHaptics.selectionAsync();
                            onSelect(m.id);
                        }}
                    >
                        <Text style={[
                            styles.modeText, 
                            current === m.id ? { color: '#000' } : { color: m.color }
                        ]}>{m.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
};

const WeatherSelector = ({ current, onSelect }: { current: WeatherCondition, onSelect: (w: WeatherCondition) => void }) => {
    const weathers: { id: WeatherCondition, label: string, color: string, icon: string }[] = [
        { id: 'CLEAR', label: 'CLEAR', color: '#facc15', icon: '☀' },
        { id: 'RAIN_HEAVY', label: 'RAIN', color: '#3b82f6', icon: '🌧' },
        { id: 'SNOW_BLIZZARD', label: 'SNOW', color: '#e2e8f0', icon: '❄' },
        { id: 'HAIL_STORM', label: 'HAIL', color: '#a5b4fc', icon: '☄' }
    ];

    return (
        <View style={styles.modeContainer}>
            <Text style={styles.modeTitle}>ATMOSPHERIC CONDITION</Text>
            <View style={styles.modeRow}>
                {weathers.map(w => (
                    <TouchableOpacity 
                        key={w.id} 
                        style={[
                            styles.modeBtn, 
                            { borderColor: w.color }, 
                            current === w.id ? { backgroundColor: w.color } : null
                        ]}
                        onPress={() => {
                            safeHaptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            onSelect(w.id);
                        }}
                    >
                        <Text style={[
                            styles.modeText, 
                            current === w.id ? { color: '#000' } : { color: w.color }
                        ]}>{w.icon} {w.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
};

const SettingsPanel: React.FC<Props> = ({ config, onUpdateConfig, onManualAgpsUpdate, onSensorPulse, onOpenMaps, onShareLocation, usbStatus, position, onNtripData }) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [fwUpdateAvailable, setFwUpdateAvailable] = useState<FirmwareMetadata | null>(null);
  const [flashProgress, setFlashProgress] = useState(0);
  const [flashStatus, setFlashStatus] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [batteryLevel, setBatteryLevel] = useState(1.0);
  
  const [wifiAdapter, setWifiAdapter] = useState<ExternalWifiAdapter | null>(null);
  const [isInjectingDriver, setIsInjectingDriver] = useState(false);
  const [btScanning, setBtScanning] = useState(false);
  const [btDevices, setBtDevices] = useState<BluetoothDevice[]>([]);
  const [connectedBt, setConnectedBt] = useState<BluetoothDevice | null>(null);
  const [availableNavApps, setAvailableNavApps] = useState<NavAppProfile[]>([]);
  const [ntripStatus, setNtripStatus] = useState<{ connected: boolean, caster: any, bytes: number }>({ connected: false, caster: null, bytes: 0 });

  useEffect(() => {
      Battery.getBatteryLevelAsync().then(setBatteryLevel);
      const wifiTimer = setInterval(() => {
          setWifiAdapter(ExternalWifiManager.getAdapterStatus());
          setNtripStatus(NtripClient.getStatus());
      }, 2000);
      setAvailableNavApps(NavBridge.getSupportedApps());
      return () => clearInterval(wifiTimer);
  }, []);

  // Internal Logic for Firmware UI
  const handleCheckFirmware = async () => {
      const bat = await Battery.getBatteryLevelAsync();
      setBatteryLevel(bat);
      const targetIdentity = usbStatus?.identity || { 
          vendor: 'QUALCOMM' as any, 
          modelName: 'Snapdragon Modem', 
          hardwareId: 'INTERNAL', 
          currentFirmware: 'QC_GNSS_5.0.0', 
          capabilities: { dualBand: true, rtk: false, rawMeas: true, imuIntegrated: true, ppp: false, lband: false }, 
          connectionInterface: 'INTERNAL_BUS' as any
      };
      const update = await FirmwareManager.checkForUpdates(targetIdentity, (msg) => setLogs(p => [...p.slice(-2), msg]));
      setFwUpdateAvailable(update);
      if(!update) Alert.alert('Device Manager', 'Firmware is up to date.');
  };

  const handleFlash = () => {
      if (!fwUpdateAvailable) return;
      const battPerc = (batteryLevel * 100).toFixed(0);
      Alert.alert(
          'CRITICAL: FIRMWARE FLASH', 
          `Battery: ${battPerc}%. Do not disconnect power.\n\nRisk: ${fwUpdateAvailable.criticality}\nSize: ${(fwUpdateAvailable.sizeBytes/1024).toFixed(0)}KB`,
          [
              { text: 'ABORT', style: 'cancel' },
              { text: 'CONFIRM FLASH', style: 'destructive', onPress: startFlashing }
          ]
      );
  };

  const startFlashing = async () => {
      setIsUpdating(true);
      const timer = setInterval(() => {
          const s = FirmwareManager.getStatus();
          setFlashProgress(s.progress);
          setFlashStatus(s.task);
      }, 100);
      const bat = await Battery.getBatteryLevelAsync();
      await FirmwareManager.flashFirmware(
          fwUpdateAvailable!,
          bat,
          (msg) => setLogs(p => [...p.slice(-3), msg]),
          (success) => {
              clearInterval(timer);
              setIsUpdating(false);
              setFwUpdateAvailable(null);
              setLogs(p => [...p, success ? 'REBOOTING SYSTEM...' : 'SAFE ROLLBACK COMPLETED']);
              if(success) {
                  safeHaptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  // --- MILITARY GRADE SENSOR RESTART ---
                  onSensorPulse(); // Trigger a pulse to reset sensor states
                  setLogs(p => [...p, 'SENSORS REINITIALIZED']);
              }
              else safeHaptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          }
      );
  };

  const handleWifiScan = async () => {
      setIsInjectingDriver(true);
      await ExternalWifiManager.scanForHardware((msg) => setLogs(p => [...p.slice(-2), msg]));
      const adapter = ExternalWifiManager.getAdapterStatus();
      setWifiAdapter(adapter);
      if (adapter && !adapter.driverLoaded) {
          await ExternalWifiManager.injectDriver((msg) => setLogs(p => [...p.slice(-2), msg]));
          await ExternalWifiManager.connectToBestNetwork((msg) => setLogs(p => [...p.slice(-2), msg]));
      }
      setIsInjectingDriver(false);
  };

  const handleBtScan = async () => {
      setBtScanning(true);
      setBtDevices([]);
      await BluetoothManager.scanForDevices((device) => {
          setBtDevices(prev => [...prev, device]);
      }, (msg, lvl) => setLogs(p => [...p.slice(-2), msg]));
      setBtScanning(false);
  };

  const handleBtConnect = async (device: BluetoothDevice) => {
      const success = await BluetoothManager.connectDevice(device, (msg, lvl) => setLogs(p => [...p.slice(-2), msg]));
      if (success) {
          setConnectedBt(device);
          setBtDevices([]); 
      }
  };

  const handleNavLaunch = async (appId: string) => {
      safeHaptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await NavBridge.launchApp(appId, position.latitude, position.longitude, (msg) => setLogs(p => [...p.slice(-2), msg]));
  };

  const handleNtripConnect = async () => {
      if (ntripStatus.connected) {
          NtripClient.disconnect((msg) => setLogs(p => [...p.slice(-2), msg]));
          return;
      }
      
      const caster = await NtripClient.findNearestCaster(position.latitude, position.longitude, (msg) => setLogs(p => [...p.slice(-2), msg]));
      if (caster) {
          await NtripClient.connect(caster, (msg) => setLogs(p => [...p.slice(-2), msg]), (data) => {
              if (onNtripData) onNtripData(data);
          });
      }
  };

  return (
    <View style={styles.container}>
      
      <ModeSelector 
        current={config.operationMode} 
        onSelect={(m) => onUpdateConfig({ operationMode: m })} 
      />

      <WeatherSelector 
        current={config.weatherCondition} 
        onSelect={(w) => onUpdateConfig({ weatherCondition: w })} 
      />

      <Text style={styles.header}>INTELLIGENT SYSTEM CORE</Text>
      <View style={styles.group}>
           <Toggle 
              label="Smart Standby (Wake-on-Motion)" 
              description="ประหยัดแบตเตอรี่สูงสุดขณะจอด (Deep Sleep) และตื่นทันทีเมื่อรถเคลื่อนที่"
              active={config.smartStandby} 
              onClick={() => onUpdateConfig({ smartStandby: !config.smartStandby })} 
          />
           <Toggle 
              label="LEO Satellite Layer" 
              description="Track Starlink/OneWeb fast-moving constellations (Beta)"
              active={config.leoSatellites} 
              onClick={() => onUpdateConfig({ leoSatellites: !config.leoSatellites })} 
          />
           <Toggle 
              label="Inertial Dead Reckoning (Physics)" 
              description="ใช้เซ็นเซอร์คำนวณตำแหน่งเมื่อเข้าอุโมงค์ (Offline/No Cost)"
              active={config.tunnelMode} 
              onClick={() => onUpdateConfig({ tunnelMode: !config.tunnelMode })} 
          />
           <Toggle 
              label="Vector Snapping (Virtual Road Lock)" 
              description="ดูดพิกัดเข้าหาเวกเตอร์ถนน เพื่อการนำทางที่นิ่งสนิท"
              active={config.vectorSnapping} 
              onClick={() => onUpdateConfig({ vectorSnapping: !config.vectorSnapping })} 
          />
           <Toggle 
              label="Mock Location Injection" 
              description="ส่งค่าพิกัดไปยังระบบ Android (ต้องเปิด Developer Options)"
              active={config.systemOverride} 
              onClick={() => onUpdateConfig({ systemOverride: !config.systemOverride })} 
          />
      </View>

      <Text style={[styles.header, { marginTop: 20 }]}>HARDWARE BRIDGE</Text>
      
      {/* GLOBAL NAVIGATION BRIDGE CARD */}
      <View style={[styles.deviceCard, { borderColor: '#ec4899', backgroundColor: '#3f0c23' }]}>
          <Text style={[styles.deviceLabel, { color: '#fbcfe8', marginBottom: 8 }]}>GLOBAL NAVIGATION BRIDGE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{marginBottom: 8}}>
              <View style={styles.navGrid}>
                  {availableNavApps.map(app => (
                      <TouchableOpacity 
                        key={app.id} 
                        style={styles.navIconBtn} 
                        onPress={() => handleNavLaunch(app.id)}
                      >
                          <Text style={styles.navIconText}>{app.name}</Text>
                          <Text style={styles.navCatText}>{app.category}</Text>
                      </TouchableOpacity>
                  ))}
              </View>
          </ScrollView>
          <TouchableOpacity 
            style={[styles.flashBtn, { backgroundColor: '#be185d' }]} 
            onPress={() => NavBridge.broadcastLocationIntent(position)}
          >
              <Text style={styles.flashText}>BROADCAST GEO INTENT (ALL APPS)</Text>
          </TouchableOpacity>
      </View>

      {/* NTRIP CORRECTION CLIENT CARD */}
      <View style={[styles.deviceCard, { borderColor: '#22c55e' }]}>
          <Text style={[styles.deviceLabel, { color: '#86efac', marginBottom: 8 }]}>NTRIP RTK CORRECTIONS</Text>
          {ntripStatus.connected ? (
               <>
                <View style={styles.deviceRow}>
                    <Text style={styles.deviceLabel}>CASTER:</Text>
                    <Text style={styles.deviceValue}>{ntripStatus.caster?.mountpoint}</Text>
                </View>
                <View style={styles.deviceRow}>
                    <Text style={styles.deviceLabel}>HOST:</Text>
                    <Text style={styles.deviceValue}>{ntripStatus.caster?.host}</Text>
                </View>
                <View style={styles.deviceRow}>
                    <Text style={styles.deviceLabel}>DATA:</Text>
                    <Text style={styles.deviceValue}>{(ntripStatus.bytes / 1024).toFixed(1)} KB</Text>
                </View>
                <TouchableOpacity style={[styles.flashBtn, { backgroundColor: '#dc2626' }]} onPress={handleNtripConnect}>
                    <Text style={styles.flashText}>DISCONNECT STREAM</Text>
                </TouchableOpacity>
               </>
          ) : (
             <TouchableOpacity style={[styles.checkBtn, { borderColor: '#22c55e' }]} onPress={handleNtripConnect}>
                <Text style={[styles.checkText, { color: '#4ade80' }]}>AUTO-CONNECT NEAREST BASE</Text>
             </TouchableOpacity>
          )}
      </View>

      {/* EXTERNAL WI-FI CARD */}
      <View style={[styles.deviceCard, { borderColor: '#8b5cf6' }]}>
          <Text style={[styles.deviceLabel, { color: '#a78bfa', marginBottom: 8 }]}>EXTERNAL CONNECTIVITY (USB/PCI)</Text>
          {wifiAdapter ? (
               <>
                <View style={styles.deviceRow}>
                    <Text style={styles.deviceLabel}>ADAPTER:</Text>
                    <Text style={styles.deviceValue}>{wifiAdapter.model}</Text>
                </View>
                <View style={styles.deviceRow}>
                    <Text style={styles.deviceLabel}>STATUS:</Text>
                    <Text style={[styles.deviceValue, { color: wifiAdapter.status === 'CONNECTED' ? '#4ade80' : '#facc15' }]}>
                        {wifiAdapter.status}
                    </Text>
                </View>
                {wifiAdapter.driverLoaded ? (
                     <View style={styles.deviceRow}>
                        <Text style={styles.deviceLabel}>IP ADDR:</Text>
                        <Text style={styles.deviceValue}>{wifiAdapter.ipAddress || 'Obtaining...'}</Text>
                     </View>
                ) : (
                    <TouchableOpacity style={styles.flashBtn} onPress={handleWifiScan} disabled={isInjectingDriver}>
                        <Text style={styles.flashText}>{isInjectingDriver ? 'LOADING KERNEL MOD...' : 'INJECT DRIVER'}</Text>
                    </TouchableOpacity>
                )}
               </>
          ) : (
             <TouchableOpacity style={styles.checkBtn} onPress={handleWifiScan} disabled={isInjectingDriver}>
                <Text style={styles.checkText}>{isInjectingDriver ? 'SCANNING BUS...' : 'SCAN FOR EXT. WI-FI'}</Text>
             </TouchableOpacity>
          )}
      </View>

      {/* DEVICE IDENTITY CARD */}
      <View style={styles.deviceCard}>
          <View style={styles.deviceRow}>
              <Text style={styles.deviceLabel}>GNSS VENDOR:</Text>
              <Text style={styles.deviceValue}>
                  {usbStatus?.identity ? usbStatus.identity.vendor : 'INTERNAL (OEM)'}
              </Text>
          </View>
          
          {logs.length > 0 && (
              <View style={styles.miniLog}>
                  {logs.map((l, i) => <Text key={i} style={styles.logText}>{l}</Text>)}
              </View>
          )}

          {fwUpdateAvailable && !isUpdating && (
              <View style={styles.releaseNotesBox}>
                  <Text style={styles.releaseNotesTitle}>NEW VERSION AVAILABLE</Text>
                  <Text style={styles.releaseNotesText}>{fwUpdateAvailable.releaseNotes}</Text>
                  <Text style={styles.releaseNotesMeta}>
                      Ver: {fwUpdateAvailable.version} • Size: {(fwUpdateAvailable.sizeBytes / 1024).toFixed(0)}KB
                  </Text>
              </View>
          )}

          {isUpdating ? (
              <View style={styles.progressContainer}>
                  <Text style={styles.progressText}>{flashStatus} ({flashProgress.toFixed(0)}%)</Text>
                  <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${flashProgress}%` }]} />
                  </View>
              </View>
          ) : (
              <View style={styles.updateActions}>
                  {fwUpdateAvailable ? (
                      <TouchableOpacity style={styles.flashBtn} onPress={handleFlash}>
                          <Text style={styles.flashText}>INSTALL {fwUpdateAvailable.version}</Text>
                      </TouchableOpacity>
                  ) : (
                      <TouchableOpacity style={styles.checkBtn} onPress={handleCheckFirmware}>
                          <Text style={styles.checkText}>CHECK UPDATES</Text>
                      </TouchableOpacity>
                  )}
              </View>
          )}
      </View>

      <View style={styles.actions}>
          <TouchableOpacity 
            style={[styles.button, styles.pulseButton]}
            onPress={() => { safeHaptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onSensorPulse(); }}
          >
              <Text style={styles.buttonText}>⚡ กระตุ้นเซ็นเซอร์</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.button, styles.agpsButton]}
            onPress={() => { safeHaptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onManualAgpsUpdate(); }}
          >
              <Text style={[styles.buttonText, { color: '#06b6d4' }]}>
                  อัปเดต A-GPS
              </Text>
          </TouchableOpacity>
      </View>
      
      {/* NAVIGATION & SHARE INTERFACE */}
      <View style={styles.navContainer}>
          <View style={styles.navRow}>
            <TouchableOpacity 
                style={[styles.navButton, { flex: 2, marginRight: 8 }]}
                onPress={() => { safeHaptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); onOpenMaps(); }}
            >
                <Text style={styles.navButtonText}>เปิด GOOGLE MAPS</Text>
                <Text style={styles.navSubText}>ใช้พิกัดความละเอียดสูง</Text>
            </TouchableOpacity>

            <TouchableOpacity 
                style={[styles.navButton, { flex: 1, backgroundColor: '#059669', borderColor: '#10b981' }]}
                onPress={() => { safeHaptics.notificationAsync(Haptics.NotificationFeedbackType.Success); onShareLocation(); }}
            >
                <Text style={styles.navButtonText}>แชร์</Text>
                <Text style={styles.navSubText}>Line / Social</Text>
            </TouchableOpacity>
          </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 16,
    marginTop: 20,
  },
  header: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 12,
    letterSpacing: 1,
  },
  // MODE SELECTOR STYLES
  modeContainer: {
      marginBottom: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: '#334155'
  },
  modeTitle: {
      color: '#e2e8f0',
      fontSize: 11,
      fontWeight: 'bold',
      marginBottom: 10,
      textAlign: 'center',
      letterSpacing: 1
  },
  modeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8
  },
  modeBtn: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 6,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center'
  },
  modeText: {
      fontSize: 10,
      fontWeight: 'bold'
  },
  deviceCard: {
      backgroundColor: '#0f172a',
      padding: 12,
      borderRadius: 8,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: '#334155'
  },
  deviceRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 6
  },
  deviceLabel: {
      color: '#64748b',
      fontSize: 10,
      fontWeight: 'bold'
  },
  deviceValue: {
      color: '#e2e8f0',
      fontSize: 10,
      fontFamily: 'monospace'
  },
  miniLog: {
      marginTop: 8,
      padding: 6,
      backgroundColor: '#000',
      borderRadius: 4
  },
  logText: {
      color: '#22c55e',
      fontSize: 9,
      fontFamily: 'monospace'
  },
  releaseNotesBox: {
      marginTop: 10,
      backgroundColor: '#1e293b',
      padding: 10,
      borderRadius: 6,
      borderWidth: 1,
      borderColor: '#475569'
  },
  releaseNotesTitle: {
      color: '#fbbf24',
      fontSize: 10,
      fontWeight: 'bold',
      marginBottom: 4
  },
  releaseNotesText: {
      color: '#e2e8f0',
      fontSize: 10,
      marginBottom: 6
  },
  releaseNotesMeta: {
      color: '#94a3b8',
      fontSize: 9,
      fontFamily: 'monospace'
  },
  updateActions: {
      marginTop: 10,
      flexDirection: 'row',
      justifyContent: 'flex-end'
  },
  checkBtn: {
      backgroundColor: '#334155',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: '#475569',
      alignItems: 'center'
  },
  checkText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  flashBtn: {
      backgroundColor: '#be123c',
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 4,
      alignItems: 'center'
  },
  flashText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  progressContainer: { marginTop: 10 },
  progressText: { color: '#fbbf24', fontSize: 10, marginBottom: 4, textAlign: 'center' },
  progressBar: { height: 4, backgroundColor: '#334155', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#fbbf24' },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#334155',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  activeToggle: {
    backgroundColor: '#164e63', 
    borderColor: '#0e7490',
  },
  toggleLabel: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },
  activeLabel: {
    color: '#67e8f9',
  },
  toggleDesc: {
    color: '#94a3b8',
    fontSize: 10,
    marginTop: 2,
  },
  switchTrack: {
    width: 40,
    height: 22,
    backgroundColor: '#475569',
    borderRadius: 11,
    padding: 2,
  },
  activeTrack: {
    backgroundColor: '#06b6d4',
  },
  switchThumb: {
    width: 18,
    height: 18,
    backgroundColor: '#fff',
    borderRadius: 9,
  },
  activeThumb: {
    transform: [{ translateX: 18 }],
  },
  group: {
    marginTop: 12,
  },
  groupTitle: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 6,
    marginLeft: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pulseButton: {
    backgroundColor: '#451a03',
    borderColor: '#ea580c',
  },
  agpsButton: {
    backgroundColor: 'transparent',
    borderColor: '#06b6d4',
  },
  buttonText: {
    color: '#ea580c',
    fontSize: 12,
    fontWeight: 'bold',
  },
  navContainer: {
      marginTop: 16,
  },
  navRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
  },
  navButton: {
      backgroundColor: '#1d4ed8', 
      paddingVertical: 14,
      borderRadius: 8,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#3b82f6',
      justifyContent: 'center'
  },
  navButtonText: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 14,
  },
  navSubText: {
      color: '#bfdbfe',
      fontSize: 10,
  },
  navGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginVertical: 8
  },
  navIconBtn: {
      backgroundColor: '#831843',
      paddingVertical: 6,
      paddingHorizontal: 8,
      borderRadius: 4,
      marginBottom: 4,
      marginRight: 4
  },
  navIconText: {
      color: '#fbcfe8',
      fontSize: 10,
      fontWeight: 'bold'
  },
  navCatText: {
      color: '#f9a8d4',
      fontSize: 8
  },
  btItem: {
      backgroundColor: '#172554',
      padding: 8,
      borderRadius: 6,
      marginBottom: 6,
      borderWidth: 1,
      borderColor: '#1e40af'
  },
  btName: {
      color: '#93c5fd',
      fontWeight: 'bold',
      fontSize: 12
  },
  btType: {
      color: '#60a5fa',
      fontSize: 10
  }
});

export default SettingsPanel;
