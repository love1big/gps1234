import { NtripCaster, PositionData, LogEntry } from '../types';

// GLOBAL NTRIP CASTER REGISTRY (SIMULATED)
// In a real app, this would fetch from a dynamic API like rtk2go.com or unavco.org
const GLOBAL_CASTER_REGISTRY: NtripCaster[] = [
    // --- ASIA ---
    { id: 'TH_BKK_01', host: 'rtk.rtsd.mi.th', port: 2101, mountpoint: 'BKK_VRS', region: 'ASIA', country: 'Thailand', lat: 13.7563, lon: 100.5018, active: true, operator: 'RTSD' },
    { id: 'JP_TOK_01', host: 'ntrip.gsi.go.jp', port: 2101, mountpoint: 'TOKYO_RTK', region: 'ASIA', country: 'Japan', lat: 35.6762, lon: 139.6503, active: true, operator: 'GSI' },
    { id: 'CN_BEI_01', host: 'rtk.qxwz.com', port: 8002, mountpoint: 'BJ_CORS', region: 'ASIA', country: 'China', lat: 39.9042, lon: 116.4074, active: true, operator: 'QXWZ' },
    { id: 'IN_DEL_01', host: 'ntrip.cors.surveyofindia.gov.in', port: 2101, mountpoint: 'DELHI_NET', region: 'ASIA', country: 'India', lat: 28.6139, lon: 77.2090, active: true, operator: 'SOI' },

    // --- EUROPE ---
    { id: 'DE_BER_01', host: 'sapos.berlin.de', port: 2101, mountpoint: 'VRS_3_2G', region: 'EU', country: 'Germany', lat: 52.5200, lon: 13.4050, active: true, operator: 'SAPOS' },
    { id: 'UK_LON_01', host: 'www.leica-smartnet.co.uk', port: 2101, mountpoint: 'LONDON_MSM', region: 'EU', country: 'UK', lat: 51.5074, lon: -0.1278, active: true, operator: 'SmartNet' },
    { id: 'FR_PAR_01', host: 'reseau-teria.com', port: 2101, mountpoint: 'PARIS_RTK', region: 'EU', country: 'France', lat: 48.8566, lon: 2.3522, active: true, operator: 'TERIA' },

    // --- NORTH AMERICA ---
    { id: 'US_NYC_01', host: 'cors.ngs.noaa.gov', port: 2101, mountpoint: 'NY_RTK', region: 'NA', country: 'USA', lat: 40.7128, lon: -74.0060, active: true, operator: 'NOAA' },
    { id: 'US_LAX_01', host: 'crtn.ucsd.edu', port: 2101, mountpoint: 'CRTN_VRS', region: 'NA', country: 'USA', lat: 34.0522, lon: -118.2437, active: true, operator: 'CRTN' },
    { id: 'CA_TOR_01', host: 'smartnet.leica-geosystems.us', port: 2101, mountpoint: 'ON_TORONTO', region: 'NA', country: 'Canada', lat: 43.65107, lon: -79.347015, active: true, operator: 'SmartNet' },

    // --- SOUTH AMERICA ---
    { id: 'BR_SAO_01', host: 'rbmc-ip.ibge.gov.br', port: 2101, mountpoint: 'SP_RTK', region: 'SA', country: 'Brazil', lat: -23.5505, lon: -46.6333, active: true, operator: 'IBGE' },

    // --- OCEANIA ---
    { id: 'AU_SYD_01', host: 'auscors.ga.gov.au', port: 2101, mountpoint: 'SYD_NET', region: 'OC', country: 'Australia', lat: -33.8688, lon: 151.2093, active: true, operator: 'AusCORS' },

    // --- AFRICA ---
    { id: 'ZA_CPT_01', host: 'trignet.co.za', port: 2101, mountpoint: 'CPT_RTK', region: 'AF', country: 'South Africa', lat: -33.9249, lon: 18.4241, active: true, operator: 'TrigNet' },
    
    // --- GLOBAL FREE ---
    { id: 'RTK2GO_01', host: 'rtk2go.com', port: 2101, mountpoint: 'STR01', region: 'GLOBAL', country: 'Global', lat: 0, lon: 0, active: true, operator: 'SNIP' }
];

export class NtripManager {
    private connectedCaster: NtripCaster | null = null;
    private isConnecting: boolean = false;
    private socket: any = null; // Simulated Socket
    private bytesReceived: number = 0;

    public getStatus() {
        return {
            connected: !!this.connectedCaster,
            caster: this.connectedCaster,
            bytes: this.bytesReceived
        };
    }

    public async findNearestCaster(
        lat: number, 
        lon: number, 
        onLog: (msg: string) => void
    ): Promise<NtripCaster | null> {
        onLog('Scanning Global NTRIP Registry...');
        
        // Simulate Network Latency
        await new Promise(r => setTimeout(r, 800));

        let bestCaster: NtripCaster | null = null;
        let minDistance = Infinity;

        // Haversine Formula for Distance
        const R = 6371; // km
        const toRad = (v: number) => v * Math.PI / 180;

        GLOBAL_CASTER_REGISTRY.forEach(caster => {
            if (caster.region === 'GLOBAL') return; // Skip global generic for now

            const dLat = toRad(caster.lat - lat);
            const dLon = toRad(caster.lon - lon);
            const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                      Math.cos(toRad(lat)) * Math.cos(toRad(caster.lat)) * 
                      Math.sin(dLon/2) * Math.sin(dLon/2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
            const d = R * c;

            if (d < minDistance) {
                minDistance = d;
                bestCaster = caster;
            }
        });

        // Fallback to Global if nearest is too far (> 2000km)
        if (minDistance > 2000 || !bestCaster) {
            onLog('No local caster found within 2000km. Switching to Global Network.');
            return GLOBAL_CASTER_REGISTRY.find(c => c.region === 'GLOBAL') || null;
        }

        onLog(`Nearest Base Station: ${bestCaster.id} (${minDistance.toFixed(1)}km)`);
        return bestCaster;
    }

    public async connect(
        caster: NtripCaster, 
        onLog: (msg: string) => void,
        onData: (data: any) => void
    ) {
        if (this.isConnecting) return;
        this.isConnecting = true;
        
        onLog(`Connecting to NTRIP Caster: ${caster.host}:${caster.port}/${caster.mountpoint}...`);
        
        // Simulate TCP Handshake
        await new Promise(r => setTimeout(r, 1000));
        
        // Simulate Auth
        onLog('Authenticating (NTRIP v2.0)...');
        await new Promise(r => setTimeout(r, 500));
        
        this.connectedCaster = caster;
        this.isConnecting = false;
        onLog(`CONNECTED: Receiving RTCM 3.3 corrections from ${caster.operator}`);

        // Simulate Data Stream
        this.socket = setInterval(() => {
            if (this.connectedCaster) {
                this.bytesReceived += Math.floor(Math.random() * 500) + 200;
                // Emit dummy RTCM packet
                onData({ type: 'RTCM', msgId: 1077, len: 256 });
            }
        }, 1000);
    }

    public disconnect(onLog: (msg: string) => void) {
        if (this.socket) {
            clearInterval(this.socket);
            this.socket = null;
        }
        if (this.connectedCaster) {
            onLog(`Disconnected from ${this.connectedCaster.mountpoint}`);
            this.connectedCaster = null;
        }
        this.bytesReceived = 0;
    }
}

export const NtripClient = new NtripManager();
