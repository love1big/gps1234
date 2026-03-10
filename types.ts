
export enum Constellation {
  GPS = 'GPS',
  GLONASS = 'GLONASS',
  GALILEO = 'GALILEO',
  BEIDOU = 'BEIDOU',
  QZSS = 'QZSS',
  NAVIC = 'NAVIC',
  SBAS = 'SBAS', // Added Augmentation Systems (WAAS/EGNOS/etc)
  LEO = 'LEO_SAT' 
}

export enum SignalBand {
  L1CA = 'L1C/A',
  L1C = 'L1C',
  L1 = 'L1',
  L2 = 'L2',
  L5 = 'L5',
  L6 = 'L6',
  E1 = 'E1',
  E5a = 'E5a',
  E5b = 'E5b',
  E6 = 'E6',
  B1I = 'B1I',
  B2I = 'B2I',
  B3I = 'B3I',
  B1C = 'B1C',
  B2a = 'B2a',
  B2b = 'B2b',
  G1 = 'G1',
  G2 = 'G2',
  L_BAND = 'L-band',
  Ku = 'Ku' 
}

export type OperationMode = 'STANDARD' | 'URBAN_CANYON' | 'PRECISE_SURVEY' | 'BACKGROUND_ECO';
export type WeatherCondition = 'CLEAR' | 'RAIN_HEAVY' | 'SNOW_BLIZZARD' | 'HAIL_STORM'; 

export type EnvironmentProfile = 'open_sky' | 'suburban' | 'dense_urban';
export type ActivityState = 'STILL' | 'WALKING' | 'RUNNING' | 'DRIVING' | 'UNKNOWN';
export type SystemHealthStatus = 'OPTIMAL' | 'STABLE' | 'DEGRADED' | 'CRITICAL';
export type IntegrityState = 'TRUSTED' | 'SUSPICIOUS' | 'COMPROMISED'; 
export type SystemScanState = 'LOCKED' | 'SEARCHING_L1' | 'SEARCHING_L5' | 'SEARCHING_MULTI' | 'DEAD_RECKONING';

export interface RfEmitter {
    id: string; 
    type: 'WIFI' | 'BLE' | 'CELL_TOWER';
    frequency: number; 
    rssi: number; 
    variance: number; 
    meanRssi: number; 
    sampleCount: number; 
    multipathProb: number; 
    isLos: boolean; 
    distanceEst: number; 
    lat?: number; 
    lon?: number;
    lastSeen: number;
}

export interface RfEnvironmentState {
    emitters: RfEmitter[];
    densityScore: number; 
    reflectionIndex: number; 
    dominantSignal: string; 
    pulseRoundTripStats?: string; 
}

export interface SystemDiagnostic {
    status: SystemHealthStatus;
    integrity: number; 
    message: string;
    actionRequired: 'RESTART_GPS' | 'SWITCH_NTRIP' | 'CHECK_NET' | 'NONE' | 'PURGE_MEM' | 'CHECK_WIFI_DRIVER' | 'CHECK_BLUETOOTH';
}

export interface ResourceState {
    loadLevel: number; 
    quality: 'ULTRA' | 'HIGH' | 'BALANCED' | 'ECO' | 'SURVIVAL' | 'DEEP_SLEEP'; // Added DEEP_SLEEP
    memoryPressure: 'NORMAL' | 'HIGH' | 'CRITICAL';
    renderComplexity: 'FULL' | 'REDUCED' | 'MINIMAL' | 'TEXT_ONLY'; 
    thermalThrottling: boolean; 
    lastPurgeTime: number;
    fpsEstimate: number;
}

export interface Satellite {
  prn: number; 
  constellation: Constellation;
  azimuth: number; 
  elevation: number; 
  snr: number; 
  displaySnr?: number; 
  usedInFix: boolean;
  hasL5: boolean; 
  signals?: string[];
  isNlos: boolean; 
  carrierPhase?: number; 
  status: 'locking' | 'tracking' | 'ephemeris_missing' | 'multipath_rejected' | 'spoofing_suspect' | 'weather_attenuated'; 
  source?: 'INTERNAL' | 'EXTERNAL_USB' | 'BLUETOOTH_EXT'; 
  sbasCorrections?: {
      fast: number; 
      longTerm: number; 
      iono: number; 
      rangeRate: number; 
      wetDelay?: number; 
  };
}

export interface EphemerisData {
    prn: number;
    constellation: Constellation;
    validityTime: number; 
    health: number; 
    orbitParams: {
        inclination: number;
        raan: number; 
        meanAnomaly: number;
        eccentricity: number;
    };
    sourceServer: string;
}

export type WifiChipset = 'REALTEK' | 'MEDIATEK' | 'RALINK' | 'ATHEROS' | 'INTEL' | 'BROADCOM_EXT' | 'GENERIC_USB';
export type WifiInterfaceType = 'USB_DONGLE' | 'PCI_EXPRESS' | 'UART_MODULE' | 'SDIO';

export interface ExternalWifiAdapter {
    id: string;
    chipset: WifiChipset;
    model: string;
    interfaceType: WifiInterfaceType;
    driverLoaded: boolean;
    driverVersion: string;
    macAddress: string;
    status: 'DISCONNECTED' | 'SCANNING' | 'ASSOCIATING' | 'CONNECTED' | 'DRIVER_MISSING';
    ssid?: string;
    signalStrength?: number;
    ipAddress?: string;
}

export interface CellularModem {
    id: string;
    model: string;
    imei: string;
    operator: string;
    signalStrength: number;
    networkType: 'GPRS' | 'EDGE' | '3G' | '4G' | '5G';
    status: 'DISCONNECTED' | 'SEARCHING' | 'REGISTERED' | 'CONNECTED';
    ipAddress?: string;
}

export interface BluetoothDevice {
    id: string;
    name: string;
    address: string; 
    type: 'SPP_CLASSIC' | 'BLE_GATT';
    brand: string; 
    connected: boolean;
    batteryLevel?: number;
    isGnssCapable: boolean;
}

export type NavAppCategory = 'GLOBAL' | 'ASIA' | 'RUSSIA' | 'OUTDOOR' | 'MARINE' | 'AVIATION' | 'TRUCK';

export interface NavAppProfile {
    id: string;
    name: string;
    scheme: string; 
    universalLink?: string; 
    paramTemplate: string; 
    platform: 'BOTH' | 'IOS' | 'ANDROID';
    isGeneric?: boolean; 
    category: NavAppCategory;
}

export type ChipsetVendor = 
  | 'U_BLOX' | 'BROADCOM' | 'QUALCOMM' | 'MEDIATEK' | 'STMICRO' 
  | 'TRIMBLE' | 'NOVATEL' | 'SEPTENTRIO' | 'HEMISPHERE' | 'GARMIN' 
  | 'SKYTRAQ' | 'FURUNO' | 'TECTONIC' | 'GENERIC_NMEA' | 'NO_BRAND_CLONE';

export interface FirmwareMetadata {
    version: string;
    buildDate: number;
    sizeBytes: number;
    checksumCrc32: string;
    downloadUrl: string;
    criticality: 'OPTIONAL' | 'RECOMMENDED' | 'CRITICAL';
    releaseNotes: string;
    targetHwId: string;
    minBatteryLevel: number; 
    restartRequired: boolean;
}

export interface HardwareIdentity {
    vendor: ChipsetVendor;
    modelName: string;
    hardwareId: string; 
    currentFirmware: string;
    bootloaderVersion?: string;
    manufactureDate?: string;
    voltage?: number;
    capabilities: {
        dualBand: boolean;
        rtk: boolean;
        rawMeas: boolean;
        imuIntegrated: boolean;
        ppp: boolean; 
        lband: boolean; 
    };
    connectionInterface: 'INTERNAL_BUS' | 'USB_OTG' | 'BLUETOOTH_SPP' | 'UART' | 'WIFI_P2P';
}

export type FlashStatus = 
  | 'IDLE' | 'CHECKING' | 'PRE_FLIGHT_CHECKS' | 'DOWNLOADING' 
  | 'VERIFYING_BIN' | 'BACKING_UP' | 'ERASING_BANK' 
  | 'FLASHING_BOOTLOADER' | 'FLASHING_APP' | 'VALIDATING_FLASH' 
  | 'SUCCESS' | 'FAILED' | 'ROLLBACK' | 'REBOOTING';

export interface ChipsetProfile {
    model: string;
    manufacturer: string;
    supportedConstellations: Constellation[];
    dualBand: boolean;
    rtkCapable: boolean;
    maxBaud: number;
    protocol: 'NMEA' | 'UBX' | 'RTCM' | 'SIRF_BIN' | 'MTK_BIN' | 'GARMIN' | 'GSOF' | 'SBF' | 'NOVATEL_ASCII' | 'GENERIC_TEXT';
}

export interface UsbDeviceStatus {
    connected: boolean;
    isRealHardware: boolean; 
    deviceName: string; 
    hardwareId: string; 
    driver: string; 
    protocol: string;
    baudRate: number;
    mountPoint: string;
    chipset?: ChipsetProfile; 
    identity?: HardwareIdentity; 
}

export interface NtripCaster {
    id: string;
    host: string;
    port: number;
    mountpoint: string;
    region: 'ASIA' | 'EU' | 'NA' | 'SA' | 'AF' | 'OC' | 'GLOBAL' | 'LOCAL'; 
    country: string;
    lat: number;
    lon: number;
    distance?: number; 
    active: boolean; 
    lastUpdated?: number; 
    operator?: string; 
}

export interface PositionData {
  latitude: number;
  longitude: number;
  altitude: number;
  accuracy: number; 
  speed: number; 
  bearing: number; 
  timestamp: number;
  hdop: number;
  vdop: number;
  pdop: number;
  gdop: number; 
  satellitesVisible: number;
  satellitesUsed: number;
  satellitesInternal: number; 
  satellitesExternal: number; 
  fusionWeight: number; 
  rtkStatus: 'NONE' | 'FLOAT' | 'FIXED' | 'SBAS_DIFF' | 'PPP_CONVERGING' | 'PPP_FIXED'; 
  rtkRatio?: number; 
  systemStatus: 'ACTIVE' | 'DENIED' | 'UNAVAILABLE'; 
  activity: ActivityState; 
  integrityState: IntegrityState;
  jammingProbability: number; 
  spoofingProbability: number; 
  scanState: SystemScanState; 
  rfAnchorsUsed: number; 
  rfMultipathIndex: number; 
  ntripServer?: string;
  ntripLatency?: number;
  correctionAge?: number;
  lastNmeaSentence?: string;
  hpl?: number; 
  vpl?: number; 
  sbasIonoIndex?: number; 
  carrierSmoothingTime?: number; 
  convergenceProgress?: number; 
  solutionType?: 'SINGLE' | 'DGPS' | 'RTK_INT' | 'RTK_FLOAT' | 'PPP' | 'DR';
  wetDelayIndex?: number; 
  tunnelDistance?: number; // NEW: Distance traveled in tunnel
  activeSignals?: string[]; // Array of unique active signals
  constellationBreakdown?: Record<string, number>; // Count of used satellites per constellation
  raimStatus?: 'NONE' | 'FD' | 'FDE';
  excludedSatellites?: number;
}

export interface NetworkStats {
  latency: number; 
  jitter: number; 
  downloadRate: number; 
  uploadRate: number; 
  packetLoss: number; 
  stabilityScore: number; 
  signalStrength: number; 
  connectionType: 'GPRS' | '4G' | '5G' | 'WIFI' | 'SAT' | 'MPTCP' | '6G-LEO' | 'QUIC' | 'EXT-WIFI';
  isOptimized: boolean;
  externalAdapter?: ExternalWifiAdapter; 
  cellularModem?: CellularModem;
}

export interface GNSSConfig {
  operationMode: OperationMode; 
  weatherCondition: WeatherCondition;
  dualFrequencyMode: boolean; 
  multipathMitigation: boolean; 
  sensorFusion: boolean; 
  externalSource: boolean; 
  autoUsbDetection: boolean; 
  usbAutoConfigured: boolean; 
  agpsEnabled: boolean;
  rtkEnabled: boolean; 
  lastAgpsUpdate: number | null;
  totalEphemerisCount: number; 
  mockLocationOutput: boolean;
  errorFilterLevel: 'low' | 'medium' | 'high' | 'aggressive';
  agpsServer: string; 
  signalWatchdog: boolean; 
  boostInternal: boolean; 
  boostExternal: boolean; 
  powerSaverMode: boolean; 
  environment: EnvironmentProfile; 
  dynamicSimulation: boolean; 
  autoSignalRecovery: boolean; 
  wifiPositioning: boolean; 
  bluetoothPositioning: boolean; 
  rfMultipathRejection: boolean; 
  activeRfPulse: boolean; 
  scheduledWakeUp: boolean; 
  antennaHeight: number; 
  antennaOffsetX: number; 
  antennaOffsetY: number; 
  leoSatellites: boolean; 
  quantumIns: boolean; 
  networkBoost: boolean; 
  keepAliveMode: boolean; 
  dataCompression: boolean; 
  multiPathTcp: boolean; 
  congestionControl: boolean; 
  lowLatencyMode: boolean; 
  dnsTurbo: boolean; 
  autoNtrip: boolean;
  lastNtripUpdate: number | null; 
  nmeaOutput: boolean; 
  autoResourceMgmt: boolean;
  
  hardwareReplacementMode: boolean; 
  systemOverride: boolean; 
  autoNavigationMode: boolean; 
  autoNavThreshold: number; 
  predictiveGuidance: boolean; 
  
  vectorSnapping: boolean; 
  injectionThreshold: number; 
  predictiveLookahead: number; 
  
  externalWifiEnabled: boolean;
  forceDriverInjection: boolean;
  smartStandby: boolean; // NEW: Intelligent Wake-on-Motion
  tunnelMode: boolean; // NEW: AI Dead Reckoning
  mavlinkBroadcast: boolean; // NEW: Broadcast to drones
  udpTargetIp: string; // NEW: Target IP for UDP
  udpPort: number; // NEW: Target Port for UDP
  antiSpoofing: boolean; // NEW: Anti-Spoofing & Jamming Analyzer
  legacyOsMode: boolean; // NEW: Support for Android 5 / iOS 7 / Win XP
  zuptEnabled: boolean; // NEW: Zero Velocity Update for INS
  syncClockWithGps: boolean; // NEW: Sync application clock with GPS time
  
  // RTK / PPK Simulation Controls
  rtkMode: 'OFF' | 'RTK' | 'PPK';
  baseStationLat: number;
  baseStationLon: number;
  baseStationAlt: number;
  correctionDataQuality: number; // 0.0 to 1.0
  
  // NMEA and UBX Output Controls
  nmeaGgaEnabled: boolean;
  nmeaRmcEnabled: boolean;
  nmeaGsvEnabled: boolean;
  ubxNavPvtEnabled: boolean;
  outputFrequency: number; // Hz (e.g., 1, 5, 10)
  logOutputToTerminal: boolean;
}

export type InjectionStatus = 'MOUNTED' | 'IDLE' | 'FAILED' | 'DENIED';

export interface MockConfig {
    enabled: boolean;
    providerName: string; 
    updateInterval: number;
    jitterAmount: number; 
    altitudeSmoothing: boolean;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  module: string;
  message: string;
  level: 'info' | 'warn' | 'error' | 'success';
}

export interface SensorStatus {
  accel: 'DETECTING' | 'REAL' | 'VIRTUAL';
  gyro: 'DETECTING' | 'REAL' | 'VIRTUAL';
  mag: 'DETECTING' | 'REAL' | 'VIRTUAL';
  baro: 'DETECTING' | 'REAL' | 'VIRTUAL';
}

export interface IMUData {
  accelX: number;
  accelY: number;
  accelZ: number;
  gyroX: number;
  gyroY: number;
  gyroZ: number;
  magX: number; 
  magY: number; 
  magZ: number; 
  pressure: number; 
  stepCount: number;
  source: 'REAL' | 'VIRTUAL'; 
}

export interface BenchmarkResult {
  score: number;
  tierLabel: string;
  minSatellites: number;
  maxSatellites: number;
  cpuCores: number;
  ramGb: number;
  gpuName: string;
}
