import { Satellite, Constellation } from '../types';

interface NmeaState {
    fixQuality: number;
    hdop: number;
    vdop: number;
    pdop: number;
    altitude: number;
    geoidSep: number;
    satellites: Satellite[];
    // Buffer logic
    gsvBuffer: Map<string, Satellite>; 
    lastGsvTime: number;
    expectedGsvCount: number;
}

const state: NmeaState = {
    fixQuality: 0,
    hdop: 1,
    vdop: 1,
    pdop: 1,
    altitude: 0,
    geoidSep: 0,
    satellites: [],
    gsvBuffer: new Map(),
    lastGsvTime: 0,
    expectedGsvCount: 0
};

// --- VALIDATION UTILS ---

const calculateChecksum = (sentence: string): string => {
    // Checksum is XOR of bytes between $ and *
    let checksum = 0;
    for (let i = 0; i < sentence.length; i++) {
        checksum ^= sentence.charCodeAt(i);
    }
    return checksum.toString(16).toUpperCase().padStart(2, '0');
};

const validateNmea = (line: string): boolean => {
    if (!line.startsWith('$')) return false;
    const parts = line.trim().split('*');
    if (parts.length !== 2) return false;
    
    const content = parts[0].substring(1); // Remove $
    const receivedSum = parts[1];
    const calcSum = calculateChecksum(content);
    
    return receivedSum === calcSum;
};

// --- PARSING UTILS ---

const parseCoord = (val: string, dir: string): number => {
    if (!val || !dir) return 0;
    const dotIndex = val.indexOf('.');
    if (dotIndex === -1) return 0;
    
    const degLen = dotIndex - 2;
    if (degLen < 0) return 0;

    const degStr = val.substring(0, degLen);
    const minStr = val.substring(degLen);
    
    let deg = parseFloat(degStr) + parseFloat(minStr) / 60;
    if (isNaN(deg)) return 0;
    if (dir === 'S' || dir === 'W') deg *= -1;
    return deg;
};

const safeInt = (val: string): number => {
    const res = parseInt(val, 10);
    return isNaN(res) ? 0 : res;
};

const safeFloat = (val: string): number => {
    const res = parseFloat(val);
    return isNaN(res) ? 0 : res;
};

const getConstellationFromTalker = (talker: string): Constellation => {
    switch(talker) {
        case 'GP': return Constellation.GPS;
        case 'GL': return Constellation.GLONASS;
        case 'GA': return Constellation.GALILEO;
        case 'BD': case 'GB': return Constellation.BEIDOU;
        case 'QZ': return Constellation.QZSS;
        case 'GI': return Constellation.NAVIC;
        default: return Constellation.GPS;
    }
};

// --- MAIN PARSER ---

export const parseNmeaLine = (line: string): { type: string, data: any } | null => {
    // 1. Integrity Check
    if (!line || !validateNmea(line)) {
        return null; // Silent reject invalid packets
    }

    const cleanLine = line.trim().split('*')[0];
    const parts = cleanLine.split(',');
    const talker = parts[0].substring(1, 3);
    const type = parts[0].substring(3);

    // --- GGA: Global Positioning System Fix Data ---
    if (type === 'GGA') {
        const lat = parseCoord(parts[2], parts[3]);
        const lon = parseCoord(parts[4], parts[5]);
        const fix = safeInt(parts[6]);
        const sats = safeInt(parts[7]);
        const hdop = safeFloat(parts[8]);
        const alt = safeFloat(parts[9]);
        const sep = safeFloat(parts[11]);
        
        state.fixQuality = fix;
        state.hdop = hdop;
        state.altitude = alt;
        state.geoidSep = sep;

        return { type: 'POS', data: { lat, lon, fix, sats, hdop, alt } };
    }
    
    // --- GSA: GNSS DOP and Active Satellites ---
    if (type === 'GSA') {
        // Mode: M=Manual, A=Automatic
        // Fix: 1=NoFix, 2=2D, 3=3D
        const pdop = safeFloat(parts[15]);
        const hdop = safeFloat(parts[16]);
        const vdop = safeFloat(parts[17]);
        
        state.pdop = pdop || state.pdop;
        state.hdop = hdop || state.hdop;
        state.vdop = vdop || state.vdop;
        
        // Note: We could track used PRNs here, but GSV gives more info
        return { type: 'DOP', data: { pdop, hdop, vdop } };
    }

    // --- RMC: Recommended Minimum Specific GNSS Data ---
    if (type === 'RMC') {
        // Status: A=Active, V=Void
        if (parts[2] === 'V') return { type: 'STATUS', data: { valid: false } };

        const lat = parseCoord(parts[3], parts[4]);
        const lon = parseCoord(parts[5], parts[6]);
        const speedKnots = safeFloat(parts[7]);
        const speed = speedKnots * 0.514444; 
        const track = safeFloat(parts[8]);
        // Date: ddmmyy
        
        return { type: 'RMC', data: { lat, lon, speed, track, valid: true } };
    }

    // --- GSV: GNSS Satellites in View ---
    if (type === 'GSV') {
        const numMsgs = safeInt(parts[1]);
        const msgNum = safeInt(parts[2]);
        // const totalSats = safeInt(parts[3]);
        const now = Date.now();

        // Buffer Management:
        // If this is msg 1, or if the buffer is stale (> 2 seconds), clear it.
        if (msgNum === 1 || (now - state.lastGsvTime > 2000)) {
            state.gsvBuffer.clear();
            state.expectedGsvCount = numMsgs;
        }
        
        state.lastGsvTime = now;

        // Iterate satellites (up to 4 per sentence)
        // Offset starts at index 4. Each block is 4 fields: PRN, EL, AZ, SNR
        for (let i = 4; i < parts.length - 3; i += 4) {
            const prn = safeInt(parts[i]);
            if (prn === 0) continue; // Skip empty slots

            const el = safeInt(parts[i+1]);
            const az = safeInt(parts[i+2]);
            const snr = safeInt(parts[i+3]);
            
            const constellation = getConstellationFromTalker(talker);
            const key = `${constellation}-${prn}`;
            
            state.gsvBuffer.set(key, {
                prn,
                constellation,
                elevation: el,
                azimuth: az,
                snr: snr,
                displaySnr: snr,
                usedInFix: false, // Will be updated by GSA or Logic
                hasL5: false, // Standard NMEA doesn't explicitly state this easily
                isNlos: false,
                status: snr > 0 ? 'tracking' : 'locking',
                source: 'EXTERNAL_USB'
            });
        }

        // If we have received the last message in the sequence
        if (msgNum === numMsgs) {
            const sats = Array.from(state.gsvBuffer.values());
            // Mark satellites with good SNR as likely used (simple heuristic if GSA missing)
            sats.forEach(s => {
                if (s.snr > 15) s.usedInFix = true;
            });
            return { type: 'SATS', data: sats };
        }
    }

    return null;
};