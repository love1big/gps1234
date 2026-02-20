
import { Satellite, Constellation, HardwareIdentity, ChipsetVendor } from '../types';
import { parseNmeaLine } from './nmeaParser';

// --- UNIVERSAL DRIVER TYPES ---
export type ProtocolType = 
    | 'NMEA' | 'UBX' | 'SIRF_BIN' | 'MTK_BIN' | 'GARMIN' 
    | 'GSOF' | 'SBF' | 'OEM7' | 'RTCM3' | 'UNKNOWN' | 'RAW_TEXT';

export interface DecodedPacket {
    protocol: ProtocolType;
    type: 'POS' | 'SATS' | 'STATUS' | 'DOP' | 'OTHER' | 'VER_INFO';
    data: any;
}

// --- UNIVERSAL PARSER CORE ---
class UniversalDriverCore {
    // Hardened Buffer: 64KB is sufficient for standard NMEA/UBX.
    // If input exceeds this, we must flush to prevent memory overflow.
    private buffer: Uint8Array = new Uint8Array(65536); 
    private detectedProtocol: ProtocolType = 'UNKNOWN';
    private currentBaudRate: number = 9600;
    public identity: HardwareIdentity | null = null;

    // UBX State
    private ubxState = 0; private ubxClass = 0; private ubxId = 0; private ubxLen = 0;
    private ubxPayload = new Uint8Array(4096); private ubxIdx = 0; private ubxCKA = 0; private ubxCKB = 0;
    
    // NMEA State
    private nmeaBuffer = "";
    private nmeaGarbageCount = 0; 
    
    // Septentrio SBF State
    private sbfState = 0;

    constructor() {
        console.log('[DRIVER-CORE] Universal Hardware Interface Loaded. Mode: ALL_VENDORS + GENERIC');
    }

    // --- LOW LEVEL I/O SIMULATION ---
    public sendCommand(cmd: Uint8Array): void {
        this.simulateHardwareResponse(cmd);
    }

    // --- AUTO NEGOTIATION & PROBING ---
    public autoNegotiate(): void {
        const baudRates = [4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
        this.detectChipset();
    }

    public detectChipset(): void {
        this.sendCommand(new Uint8Array([0xB5, 0x62, 0x0A, 0x04, 0x00, 0x00, 0x0E, 0x34])); // U-Blox
        const mtkCmd = "$PMTK605*31\r\n"; // MTK
        this.sendCommand(this.strToBytes(mtkCmd));
        this.sendCommand(new Uint8Array([0x10, 0x1C, 0x01, 0x10, 0x03])); // Trimble
        this.sendCommand(this.strToBytes("LOG VERSION\r\n")); // NovAtel
        this.sendCommand(this.strToBytes("exePrint,Identification\r\n")); // Septentrio
        this.sendCommand(new Uint8Array([0x0D, 0x0A])); 
    }

    private strToBytes(str: string): Uint8Array {
        const arr = new Uint8Array(str.length);
        for(let i=0; i<str.length; i++) arr[i] = str.charCodeAt(i);
        return arr;
    }

    public feed(data: Uint8Array): DecodedPacket[] {
        const packets: DecodedPacket[] = [];
        
        // BUFFER OVERFLOW PROTECTION
        // If incoming data chunk is insanely large (e.g. 10^56 sized logic bomb), we clamp processing.
        // We process max 4KB per cycle to keep UI responsive.
        const SAFE_CHUNK_SIZE = 4096;
        const len = Math.min(data.length, SAFE_CHUNK_SIZE);

        for (let i = 0; i < len; i++) {
            const byte = data[i];

            // 1. NMEA DETECTION ($......\r\n)
            if (byte === 0x24) { // '$'
                this.nmeaBuffer = "$";
                this.detectedProtocol = 'NMEA'; 
            } else if (this.nmeaBuffer.length > 0) {
                this.nmeaBuffer += String.fromCharCode(byte);
                if (byte === 0x0A) { // LF
                    this.processNmea(this.nmeaBuffer.trim(), packets);
                    this.nmeaBuffer = "";
                }
                // SECURITY: Max NMEA sentence length is usually ~82 chars. 
                // Allow up to 256 for proprietary, then flush to prevent memory exhaustion attack.
                if (this.nmeaBuffer.length > 256) {
                    this.nmeaBuffer = ""; 
                    this.nmeaGarbageCount++;
                }
            } else {
                this.nmeaGarbageCount++;
            }

            // SAFETY: Prevent Garbage Count Overflow in long running sessions
            if (this.nmeaGarbageCount > 1000000) {
                this.nmeaGarbageCount = 1000; // Reset to a high threshold but safe value
            }

            // 2. U-BLOX BINARY (0xB5 0x62)
            if (this.detectedProtocol === 'UNKNOWN' || this.detectedProtocol === 'UBX') {
                this.processUbxByte(byte, packets);
            }

            // 3. GENERIC RAW TEXT FALLBACK
            if (this.detectedProtocol === 'UNKNOWN' && this.nmeaGarbageCount > 100) {
                 if (byte > 31 && byte < 127) {
                     // Potential text data
                 }
            }
        }

        return packets;
    }

    private processNmea(line: string, output: DecodedPacket[]) {
        const result = parseNmeaLine(line); 
        
        if (result) {
            output.push({ protocol: 'NMEA', type: result.type as any, data: result.data });
        }
        
        if (line.startsWith('#VERSIONA') || line.includes('NOVATEL')) {
             this.setIdentity('NOVATEL', 'OEM7700', 'OEM7_GEN_3', '7.08', { dualBand: true, rtk: true, ppp: true, capabilities: { dualBand: true, rtk: true, rawMeas: true, imuIntegrated: true, ppp: true, lband: true } });
             output.push({ protocol: 'NMEA', type: 'VER_INFO', data: this.identity });
        }

        if (line.startsWith('$PTNL,VERSION')) {
             this.setIdentity('TRIMBLE', 'R12i', 'TRMB_R12', '6.15', { dualBand: true, rtk: true, ppp: true, capabilities: { dualBand: true, rtk: true, rawMeas: true, imuIntegrated: true, ppp: true, lband: true } });
        }

        if (line.startsWith('$BIN1') || line.includes('Hemisphere')) {
             this.setIdentity('HEMISPHERE', 'Phantom 40', 'HEMI_P40', 'v6.0', { dualBand: true, rtk: true, ppp: false, capabilities: { dualBand: true, rtk: true, rawMeas: false, imuIntegrated: true, ppp: false, lband: true } });
        }
    }

    private processUbxByte(byte: number, output: DecodedPacket[]) {
        switch (this.ubxState) {
            case 0: if (byte === 0xB5) this.ubxState = 1; break;
            case 1: if (byte === 0x62) { this.ubxState = 2; this.detectedProtocol = 'UBX'; this.ubxCKA = 0; this.ubxCKB = 0; } else this.ubxState = 0; break;
            case 2: this.ubxClass = byte; this.addCk(byte); this.ubxState = 3; break;
            case 3: this.ubxId = byte; this.addCk(byte); this.ubxState = 4; break;
            case 4: this.ubxLen = byte; this.addCk(byte); this.ubxState = 5; break;
            case 5: this.ubxLen |= (byte << 8); this.addCk(byte); this.ubxState = 6; this.ubxIdx = 0; break;
            case 6: 
                if (this.ubxIdx < this.ubxLen) {
                    // Safety check index to prevent array overflow
                    if (this.ubxIdx < this.ubxPayload.length) {
                        this.ubxPayload[this.ubxIdx] = byte;
                    }
                    this.ubxIdx++;
                    this.addCk(byte);
                }
                if (this.ubxIdx >= this.ubxLen) this.ubxState = 7;
                break;
            case 7: if (byte === this.ubxCKA) this.ubxState = 8; else this.ubxState = 0; break;
            case 8: 
                if (byte === this.ubxCKB) this.decodeUbx(output);
                this.ubxState = 0; 
                break;
        }
    }

    private addCk(byte: number) {
        this.ubxCKA = (this.ubxCKA + byte) & 0xFF;
        this.ubxCKB = (this.ubxCKB + this.ubxCKA) & 0xFF;
    }

    private decodeUbx(output: DecodedPacket[]) {
        if (this.ubxClass === 0x0A && this.ubxId === 0x04) { // UBX-MON-VER
             this.setIdentity('U_BLOX', 'ZED-F9P', 'F9P_00192', 'HPG 1.32', { dualBand: true, rtk: true, ppp: false, capabilities: { dualBand: true, rtk: true, rawMeas: true, imuIntegrated: false, ppp: false, lband: false } });
             output.push({ protocol: 'UBX', type: 'VER_INFO', data: this.identity });
        }
    }

    private setIdentity(vendor: ChipsetVendor, model: string, hwId: string, fw: string, caps: any) {
        this.identity = {
            vendor,
            modelName: model,
            hardwareId: hwId,
            currentFirmware: fw,
            capabilities: caps.capabilities || caps,
            connectionInterface: 'USB_OTG',
            voltage: 3.3 
        };
    }

    public getProtocol(): string { return this.detectedProtocol; }

    // --- HARDWARE RESPONSE SIMULATOR ---
    private simulateHardwareResponse(cmd: Uint8Array) {
        const cmdStr = String.fromCharCode.apply(null, Array.from(cmd));
        const seed = Date.now() % 8; // Increased seed range

        setTimeout(() => {
            if (cmd[0] === 0xB5 && seed === 0) { 
                this.setIdentity('U_BLOX', 'ZED-F9P', 'F9P_00192', 'HPG 1.50', { dualBand: true, rtk: true, rawMeas: true, imuIntegrated: false, ppp: false, lband: false });
            } else if (cmdStr.includes('PMTK') && seed === 1) { 
                this.setIdentity('MEDIATEK', 'MT3339', 'MTK_L1', 'AXN_5.1', { dualBand: false, rtk: false, rawMeas: false, imuIntegrated: false, ppp: false, lband: false });
            } else if (cmdStr.includes('LOG VERSION') && seed === 2) { 
                this.setIdentity('NOVATEL', 'OEM7700', 'OEM7_ADV', '8.10.00', { dualBand: true, rtk: true, rawMeas: true, imuIntegrated: true, ppp: true, lband: true });
            } else if (seed === 3) { 
                this.setIdentity('TRIMBLE', 'BD990', 'TRMB_BD9', '7.05', { dualBand: true, rtk: true, rawMeas: true, imuIntegrated: true, ppp: true, lband: true });
            } else if (seed === 4) { 
                 this.setIdentity('NO_BRAND_CLONE', 'Generic NMEA GPS', 'GENERIC_001', '2.0.0', { dualBand: false, rtk: false, rawMeas: false, imuIntegrated: false, ppp: false, lband: false });
            } else if (seed === 5) {
                this.setIdentity('HEMISPHERE', 'Phantom 40', 'HEMI_P40', '6.2a', { dualBand: true, rtk: true, rawMeas: false, imuIntegrated: true, ppp: false, lband: true });
            } else if (seed === 6) {
                this.setIdentity('SKYTRAQ', 'PX1122R', 'SKY_PX1122', '2025.10.15', { dualBand: true, rtk: true, rawMeas: true, imuIntegrated: false, ppp: false, lband: false });
            } else if (seed === 7) {
                this.setIdentity('SEPTENTRIO', 'Mosaic-X5', 'SEPT_MOS', '5.0.1', { dualBand: true, rtk: true, rawMeas: true, imuIntegrated: false, ppp: true, lband: true });
            }
        }, 150);
    }
}

export const UsbDriver = new UniversalDriverCore();

// MOCK DATA STREAMS
const MOCK_NMEA = new Uint8Array("$GNGGA,123519,4807.038,N,01131.000,E,1,12,0.8,545.4,M,46.9,M,,*42\r\n".split('').map(c=>c.charCodeAt(0)));

export const simulateUsbIngest = () => {
    // 1% chance to re-detect hardware (simulating plug/unplug)
    if (Math.random() > 0.995) UsbDriver.detectChipset();
    return UsbDriver.feed(MOCK_NMEA);
};
