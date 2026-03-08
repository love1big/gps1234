import { PositionData, Satellite, Constellation } from '../types';

// Helper to format numbers with leading zeros
const pad = (num: number, size: number) => {
    let s = num + "";
    while (s.length < size) s = "0" + s;
    return s;
};

// Calculate NMEA checksum
const calculateChecksum = (sentence: string): string => {
    let checksum = 0;
    for (let i = 0; i < sentence.length; i++) {
        checksum ^= sentence.charCodeAt(i);
    }
    return checksum.toString(16).toUpperCase().padStart(2, '0');
};

// Format latitude and longitude for NMEA
const formatCoordinate = (coord: number, isLat: boolean): string => {
    const absCoord = Math.abs(coord);
    const degrees = Math.floor(absCoord);
    const minutes = (absCoord - degrees) * 60;
    
    const degStr = pad(degrees, isLat ? 2 : 3);
    const minStr = pad(Math.floor(minutes), 2) + '.' + pad(Math.floor((minutes % 1) * 10000), 4);
    
    return `${degStr}${minStr}`;
};

const getDirection = (coord: number, isLat: boolean): string => {
    if (isLat) return coord >= 0 ? 'N' : 'S';
    return coord >= 0 ? 'E' : 'W';
};

// Generate $GPGGA
export const generateGGA = (pos: PositionData, time: Date): string => {
    const hhmmss = `${pad(time.getUTCHours(), 2)}${pad(time.getUTCMinutes(), 2)}${pad(time.getUTCSeconds(), 2)}.${pad(Math.floor(time.getUTCMilliseconds() / 10), 2)}`;
    
    const latStr = formatCoordinate(pos.latitude, true);
    const latDir = getDirection(pos.latitude, true);
    const lonStr = formatCoordinate(pos.longitude, false);
    const lonDir = getDirection(pos.longitude, false);
    
    // Fix quality: 0=invalid, 1=GPS fix, 2=DGPS, 4=RTK fixed, 5=RTK float
    let fixQuality = 1;
    if (pos.rtkStatus === 'FIXED') fixQuality = 4;
    else if (pos.rtkStatus === 'FLOAT') fixQuality = 5;
    else if (pos.rtkStatus === 'SBAS_DIFF') fixQuality = 2;
    else if (pos.scanState !== 'LOCKED') fixQuality = 0;

    const numSats = pad(pos.satellitesUsed, 2);
    const hdop = pos.hdop.toFixed(1);
    const alt = pos.altitude.toFixed(1);
    const geoidSep = "0.0"; // Placeholder
    
    const sentence = `GPGGA,${hhmmss},${latStr},${latDir},${lonStr},${lonDir},${fixQuality},${numSats},${hdop},${alt},M,${geoidSep},M,,`;
    return `$${sentence}*${calculateChecksum(sentence)}`;
};

// Generate $GPRMC
export const generateRMC = (pos: PositionData, time: Date): string => {
    const hhmmss = `${pad(time.getUTCHours(), 2)}${pad(time.getUTCMinutes(), 2)}${pad(time.getUTCSeconds(), 2)}.${pad(Math.floor(time.getUTCMilliseconds() / 10), 2)}`;
    const ddmmyy = `${pad(time.getUTCDate(), 2)}${pad(time.getUTCMonth() + 1, 2)}${pad(time.getUTCFullYear() % 100, 2)}`;
    
    const status = pos.scanState === 'LOCKED' ? 'A' : 'V'; // A=Active, V=Void
    
    const latStr = formatCoordinate(pos.latitude, true);
    const latDir = getDirection(pos.latitude, true);
    const lonStr = formatCoordinate(pos.longitude, false);
    const lonDir = getDirection(pos.longitude, false);
    
    const speedKnots = (pos.speed * 1.94384).toFixed(1); // m/s to knots
    const course = pos.bearing.toFixed(1);
    
    const sentence = `GPRMC,${hhmmss},${status},${latStr},${latDir},${lonStr},${lonDir},${speedKnots},${course},${ddmmyy},,,A`;
    return `$${sentence}*${calculateChecksum(sentence)}`;
};

// Generate $GPGSV (simplified, max 4 sats per sentence)
export const generateGSV = (sats: Satellite[]): string[] => {
    const sentences: string[] = [];
    const gpsSats = sats.filter(s => s.constellation === Constellation.GPS);
    const totalSats = gpsSats.length;
    const numMsgs = Math.ceil(totalSats / 4) || 1;

    for (let i = 0; i < numMsgs; i++) {
        let sentence = `GPGSV,${numMsgs},${i + 1},${pad(totalSats, 2)}`;
        
        for (let j = 0; j < 4; j++) {
            const satIndex = i * 4 + j;
            if (satIndex < totalSats) {
                const sat = gpsSats[satIndex];
                sentence += `,${pad(sat.prn, 2)},${pad(Math.floor(sat.elevation), 2)},${pad(Math.floor(sat.azimuth), 3)},${pad(Math.floor(sat.snr), 2)}`;
            } else {
                sentence += `,,,,`; // Empty slots
            }
        }
        
        sentences.push(`$${sentence}*${calculateChecksum(sentence)}`);
    }
    return sentences;
};

// Generate Mock UBX-NAV-PVT (Hex String representation)
export const generateUbxNavPvt = (pos: PositionData, time: Date): string => {
    // This is a highly simplified mock of a UBX packet structure
    // Header: B5 62
    // Class: 01 (NAV), ID: 07 (PVT)
    // Length: 5C 00 (92 bytes)
    // Payload: ...
    // Checksum: CK_A CK_B
    
    // We will just generate a pseudo-random hex string that looks like a packet for demonstration
    const header = "B56201075C00";
    
    // Convert time to iTOW (GPS time of week in ms) - mock calculation
    const iTOW = Math.floor((time.getTime() % 604800000)).toString(16).padStart(8, '0');
    
    // Convert lat/lon to 1e-7 deg
    const latHex = Math.floor(pos.latitude * 1e7).toString(16).padStart(8, '0');
    const lonHex = Math.floor(pos.longitude * 1e7).toString(16).padStart(8, '0');
    
    // Mock payload (not accurate to spec, just for visual representation)
    const payload = `${iTOW}00000000${lonHex}${latHex}000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000`;
    
    // Mock checksum
    const checksum = "A1B2";
    
    return `${header}${payload}${checksum}`.toUpperCase();
};
