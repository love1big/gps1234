
import { Constellation, NtripCaster } from './types';

export const MAX_SATELLITES_DISPLAY = 48; 

export const CONSTELLATION_COLORS: Record<Constellation, string> = {
  [Constellation.GPS]: '#10b981',     // Emerald
  [Constellation.GLONASS]: '#ef4444', // Red
  [Constellation.GALILEO]: '#06b6d4', // Cyan
  [Constellation.BEIDOU]: '#f59e0b',  // Amber
  [Constellation.QZSS]: '#8b5cf6',    // Violet
  [Constellation.NAVIC]: '#ec4899',   // Pink
  [Constellation.SBAS]: '#a3e635',    // Lime
  [Constellation.LEO]: '#fff',        // White (Future Tech)
};

export const INITIAL_POSITION = {
  latitude: 13.7563, // Bangkok (Strategic HQ)
  longitude: 100.5018,
  altitude: 15,
  accuracy: 10,
  speed: 0,
  bearing: 0,
  timestamp: 0,
  hdop: 1.0,
  vdop: 1.0,
  pdop: 1.0,
  gdop: 1.0,
  satellitesVisible: 0,
  satellitesUsed: 0,
  satellitesInternal: 0,
  satellitesExternal: 0,
  scanState: 'SEARCHING' as any,
  integrityState: 'TRUSTED' as any,
  jammingProbability: 0,
  spoofingProbability: 0,
  fusionWeight: 0.5,
  rtkStatus: 'NONE' as any,
  systemStatus: 'ACTIVE' as any,
  activity: 'STATIONARY' as any,
  rfAnchorsUsed: 0
};

// --- PERFORMANCE TUNING (OVERCLOCKED) ---
export const UPDATE_INTERVAL_MS = 200; // 5Hz Default Physics Loop
export const POWER_SAVER_INTERVAL_MS = 2000; 
export const BACKGROUND_INTERVAL_MS = 5000; 
export const BATTERY_THRESHOLD = 0.30; 
export const LOG_LIMIT = 30; 

// --- AGPS GLOBAL MIRRORS (High Availability) ---
export const AGPS_SERVERS = [
  { region: 'Global (Google Primary)', host: 'supl.google.com', port: 7276 },
  { region: 'Global (Vodafone)', host: 'supl.vodafone.com', port: 7275 },
  { region: 'Asia (Sony Ericsson)', host: 'supl.sonyericsson.com', port: 7275 },
  { region: 'China (Qianxun)', host: 'agnss.qxwz.com', port: 7275 },
  { region: 'Europe (Nokia)', host: 'supl.nokia.com', port: 7275 },
  { region: 'North America (T-Mobile)', host: 'supl.t-mobile.com', port: 7276 },
];

// --- MASSIVE NTRIP NETWORK DATABASE (PLANETARY COVERAGE) ---
// Factory-installed secure endpoints covering all 7 Continents
export const GLOBAL_NTRIP_SERVERS: NtripCaster[] = [
    // --- GLOBAL (GENERIC / OPEN) ---
    { id: 'RTK2GO_GLOBAL', host: 'rtk2go.com', port: 2101, mountpoint: 'GLOBAL_VRS', region: 'GLOBAL', country: 'XX', lat: 0.00, lon: 0.00, active: true, operator: 'Community Network' },
    { id: 'IGS_REALTIME', host: 'products.igs-ip.net', port: 2101, mountpoint: 'IGS01', region: 'GLOBAL', country: 'XX', lat: 0.00, lon: 0.00, active: true, operator: 'International GNSS Service' },
    { id: 'GENERIC_CAST', host: '192.168.1.100', port: 2101, mountpoint: 'BASE_STATION', region: 'LOCAL', country: 'XX', lat: 0.00, lon: 0.00, active: true, operator: 'Local Base' },

    // --- ASIA (High Density) ---
    { id: 'TH_DPT', host: 'rtk.dpt.go.th', port: 2101, mountpoint: 'VRS_RTCM3', region: 'ASIA', country: 'TH', lat: 13.75, lon: 100.50, active: true, operator: 'Department of Public Works' },
    { id: 'TH_RTS', host: 'gnss-rts.com', port: 2101, mountpoint: 'BKK_VRS', region: 'ASIA', country: 'TH', lat: 13.72, lon: 100.53, active: true, operator: 'RTS GNSS Network' },
    { id: 'JP_GSI', host: 'ntrip.gsi.go.jp', port: 2101, mountpoint: 'GSI_RTCM3', region: 'ASIA', country: 'JP', lat: 36.20, lon: 138.25, active: true },
    { id: 'CN_QX', host: 'rtk.qianxun.com', port: 8001, mountpoint: 'RTCM32_GB', region: 'ASIA', country: 'CN', lat: 31.23, lon: 121.47, active: true },
    { id: 'SG_SLA', host: 'sismonet.sla.gov.sg', port: 2101, mountpoint: 'SLA_VRS', region: 'ASIA', country: 'SG', lat: 1.35, lon: 103.82, active: true },
    { id: 'IN_CORS', host: 'cors.surveyofindia.gov.in', port: 2101, mountpoint: 'DELHI', region: 'ASIA', country: 'IN', lat: 28.61, lon: 77.20, active: true },
    { id: 'KR_NGII', host: 'gnss.ngii.go.kr', port: 2101, mountpoint: 'VRS-RTCM31', region: 'ASIA', country: 'KR', lat: 37.56, lon: 126.97, active: true },
    { id: 'ID_BIG', host: 'nrtk.big.go.id', port: 2101, mountpoint: 'JAKARTA', region: 'ASIA', country: 'ID', lat: -6.20, lon: 106.81, active: true },
    { id: 'AE_GSD', host: 'gnss.abudhabi.ae', port: 2101, mountpoint: 'AD_VRS', region: 'ASIA', country: 'AE', lat: 24.45, lon: 54.37, active: true },
    { id: 'VN_MONRE', host: 'vngeometrics.com', port: 2101, mountpoint: 'HANOI', region: 'ASIA', country: 'VN', lat: 21.02, lon: 105.83, active: true },

    // --- EUROPE (EUREF & National) ---
    { id: 'EU_EUREF', host: 'euref-ip.net', port: 2101, mountpoint: 'BOGO00POL0', region: 'EU', country: 'PL', lat: 52.00, lon: 21.00, active: true },
    { id: 'UK_OS', host: 'www.ordnancesurvey.co.uk', port: 2101, mountpoint: 'OS_NET_VRS', region: 'EU', country: 'UK', lat: 51.50, lon: -0.12, active: true },
    { id: 'DE_SAPOS', host: 'sapos.de', port: 2101, mountpoint: 'VRS_3_2G', region: 'EU', country: 'DE', lat: 51.16, lon: 10.45, active: true },
    { id: 'FR_TERIA', host: 'reseau-teria.com', port: 2101, mountpoint: 'RGP_RTCM3', region: 'EU', country: 'FR', lat: 48.85, lon: 2.35, active: true },
    { id: 'IT_SPIN', host: 'spingnss.it', port: 2101, mountpoint: 'IMAX_RTCM3', region: 'EU', country: 'IT', lat: 41.90, lon: 12.49, active: true },
    { id: 'RU_GTP', host: 'ntrip.geospider.ru', port: 2101, mountpoint: 'MSK_RTCM3', region: 'EU', country: 'RU', lat: 55.75, lon: 37.61, active: true },
    { id: 'ES_IGN', host: 'ergnss-ip.ign.es', port: 2101, mountpoint: 'VRS3', region: 'EU', country: 'ES', lat: 40.41, lon: -3.70, active: true },
    { id: 'NO_CPOS', host: 'cpos.statkart.no', port: 2101, mountpoint: 'CPOS_RTCM3', region: 'EU', country: 'NO', lat: 59.91, lon: 10.75, active: true },

    // --- NORTH AMERICA ---
    { id: 'US_RTK2GO', host: 'rtk2go.com', port: 2101, mountpoint: 'USA_NE_01', region: 'NA', country: 'US', lat: 40.71, lon: -74.00, active: true },
    { id: 'US_UNAVCO', host: 'pbo.unavco.org', port: 2101, mountpoint: 'P041_RTCM3', region: 'NA', country: 'US', lat: 39.99, lon: -105.27, active: true },
    { id: 'US_CORS', host: 'cors.ngs.noaa.gov', port: 2101, mountpoint: 'NY_VRS', region: 'NA', country: 'US', lat: 42.65, lon: -73.75, active: true },
    { id: 'CA_NRCAN', host: 'rtk.nrcan.gc.ca', port: 2101, mountpoint: 'OTTAWA', region: 'NA', country: 'CA', lat: 45.42, lon: -75.69, active: true },
    { id: 'MX_INEGI', host: 'ntrip.inegi.org.mx', port: 2101, mountpoint: 'MX_CDMX', region: 'NA', country: 'MX', lat: 19.43, lon: -99.13, active: true },

    // --- SOUTH AMERICA ---
    { id: 'BR_IBGE', host: 'navgeorio.ibge.gov.br', port: 2101, mountpoint: 'RBMC_RTCM3', region: 'SA', country: 'BR', lat: -15.79, lon: -47.88, active: true },
    { id: 'AR_RAMSAC', host: 'ramsac.ign.gob.ar', port: 2101, mountpoint: 'BA_RTCM3', region: 'SA', country: 'AR', lat: -34.60, lon: -58.38, active: true },
    { id: 'CL_IGM', host: 'ntrip.igm.cl', port: 2101, mountpoint: 'SANTIAGO', region: 'SA', country: 'CL', lat: -33.44, lon: -70.66, active: true },
    { id: 'CO_IGAC', host: 'magna-sirgas.igac.gov.co', port: 2101, mountpoint: 'BOGOTA', region: 'SA', country: 'CO', lat: 4.71, lon: -74.07, active: true },

    // --- AFRICA ---
    { id: 'ZA_TRIGNET', host: 'trignet.co.za', port: 2101, mountpoint: 'VRS_CT', region: 'AF', country: 'ZA', lat: -33.92, lon: 18.42, active: true },
    { id: 'EG_ESA', host: 'esa.gov.eg', port: 2101, mountpoint: 'CAIRO', region: 'AF', country: 'EG', lat: 30.04, lon: 31.23, active: true },
    { id: 'NG_NIGNET', host: 'nignet.gov.ng', port: 2101, mountpoint: 'ABUJA_VRS', region: 'AF', country: 'NG', lat: 9.07, lon: 7.39, active: true },
    { id: 'KE_RCMRD', host: 'cors.rcmrd.org', port: 2101, mountpoint: 'NAIROBI', region: 'AF', country: 'KE', lat: -1.29, lon: 36.82, active: true },

    // --- OCEANIA ---
    { id: 'AU_AUSCORS', host: 'auscors.ga.gov.au', port: 2101, mountpoint: 'SYDN', region: 'OC', country: 'AU', lat: -33.86, lon: 151.20, active: true },
    { id: 'NZ_LINZ', host: 'www.geodetic.linz.govt.nz', port: 2101, mountpoint: 'AKL_VRS', region: 'OC', country: 'NZ', lat: -36.84, lon: 174.76, active: true },
    { id: 'FJ_SPC', host: 'gnss.spc.int', port: 2101, mountpoint: 'SUVA', region: 'OC', country: 'FJ', lat: -18.14, lon: 178.42, active: true },

    // --- ANTARCTICA (Research Stations) ---
    { id: 'AQ_MCMURDO', host: 'unavco.org', port: 2101, mountpoint: 'MCM4_RTCM3', region: 'GLOBAL', country: 'AQ', lat: -77.84, lon: 166.66, active: true, operator: 'USAP' },
    { id: 'AQ_CASEY', host: 'auscors.ga.gov.au', port: 2101, mountpoint: 'CASEY', region: 'GLOBAL', country: 'AQ', lat: -66.28, lon: 110.52, active: true, operator: 'GA' },
];