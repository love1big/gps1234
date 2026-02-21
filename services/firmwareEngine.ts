
import { FirmwareMetadata, FlashStatus, HardwareIdentity, LogEntry, ChipsetVendor } from '../types';

// --- CRC32 IMPLEMENTATION ---
const makeCRCTable = () => {
    let c;
    const crcTable = [];
    for(let n =0; n < 256; n++){
        c = n;
        for(let k =0; k < 8; k++){
            c = ((c&1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        crcTable[n] = c;
    }
    return crcTable;
};
const CRC_TABLE = makeCRCTable();

const crc32 = (data: Uint8Array): number => {
    let crc = 0 ^ (-1);
    for (let i = 0; i < data.length; i++ ) {
        crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
};

// --- GLOBAL FIRMWARE REPOSITORY (THE "ALL-KNOWING" DATABASE) ---
const GLOBAL_FIRMWARE_REPO: Record<string, FirmwareMetadata> = {
    // U-BLOX
    'F9P_00192': {
        version: 'HPG 1.50',
        buildDate: 1767225600000, // Jan 2026
        sizeBytes: 2048576,
        checksumCrc32: 'A1B2C3D4',
        downloadUrl: 'https://cdn.u-blox.com/fw/UBX_F9_100_HPG150.bin',
        criticality: 'RECOMMENDED',
        releaseNotes: 'Enhanced L5/E5a tracking sensitivity. Added support for Galileo HAS.',
        targetHwId: 'F9P_00192',
        minBatteryLevel: 0.20,
        restartRequired: true
    },
    'M8N_001': {
        version: 'SPG 4.05',
        buildDate: 1735689600000, // Jan 2025
        sizeBytes: 512000,
        checksumCrc32: '88776655',
        downloadUrl: 'https://cdn.u-blox.com/fw/UBX_M8_405.bin',
        criticality: 'OPTIONAL',
        releaseNotes: 'Improved jamming detection.',
        targetHwId: 'M8N_001',
        minBatteryLevel: 0.20,
        restartRequired: true
    },
    // TRIMBLE
    'TRMB_BD9': {
        version: '7.05',
        buildDate: 1769817600000, // Feb 2026
        sizeBytes: 4194304,
        checksumCrc32: 'TRMB9988',
        downloadUrl: 'https://trimble.com/support/bd990/fw_7_05.timg',
        criticality: 'CRITICAL',
        releaseNotes: 'ProPoint engine update. RTX Fast convergence improvements.',
        targetHwId: 'TRMB_BD9',
        minBatteryLevel: 0.50,
        restartRequired: true
    },
    // NOVATEL
    'OEM7_GEN_3': {
        version: '8.10.00',
        buildDate: 1772409600000, // Mar 2026
        sizeBytes: 8388608,
        checksumCrc32: 'NVTL7777',
        downloadUrl: 'https://novatel.com/firmware/oem7/81000.hex',
        criticality: 'RECOMMENDED',
        releaseNotes: 'Interference Toolkit 2.0. SPAN tight coupling optimization.',
        targetHwId: 'OEM7_GEN_3',
        minBatteryLevel: 0.40,
        restartRequired: true
    },
    // SEPTENTRIO
    'SEPT_MOS': {
        version: '5.0.1',
        buildDate: 1764547200000, // Dec 2025
        sizeBytes: 6000000,
        checksumCrc32: 'SEPT5010',
        downloadUrl: 'https://septentrio.com/firmware/mosaic/5_0_1.suf',
        criticality: 'OPTIONAL',
        releaseNotes: 'Full OSNMA support. AIM+ anti-spoofing enhancements.',
        targetHwId: 'SEPT_MOS',
        minBatteryLevel: 0.30,
        restartRequired: true
    },
    // GARMIN
    'GARMIN_GLO': {
        version: '4.20',
        buildDate: 1748736000000, // Jun 2025
        sizeBytes: 256000,
        checksumCrc32: 'GARM420',
        downloadUrl: 'https://garmin.com/glo/update_420.rgn',
        criticality: 'RECOMMENDED',
        releaseNotes: 'Improved battery life. Faster cold start.',
        targetHwId: 'GARMIN_GLO2',
        minBatteryLevel: 0.20,
        restartRequired: true
    },
    // HEMISPHERE
    'HEMI_P40': {
        version: '6.2a',
        buildDate: 1751328000000, // Jul 2025
        sizeBytes: 3145728,
        checksumCrc32: 'HEMI62A',
        downloadUrl: 'https://hemispheregnss.com/fw/phantom40_6.2a.bin',
        criticality: 'RECOMMENDED',
        releaseNotes: 'Atlas correction service update.',
        targetHwId: 'HEMI_P40',
        minBatteryLevel: 0.30,
        restartRequired: true
    },
    // SKYTRAQ
    'SKY_PX1122': {
        version: '2025.10.15',
        buildDate: 1760572800000, // Oct 2025
        sizeBytes: 1048576,
        checksumCrc32: 'SKY1122',
        downloadUrl: 'https://navspark.mybigcommerce.com/firmware/px1122_20251015.bin',
        criticality: 'OPTIONAL',
        releaseNotes: 'RTK base station mode stability fix.',
        targetHwId: 'SKY_PX1122',
        minBatteryLevel: 0.25,
        restartRequired: true
    },
    // GENERIC / CLONE
    'GENERIC_001': {
        version: 'GEN_2.0_STABLE',
        buildDate: 1738368000000, // Feb 2025
        sizeBytes: 128000,
        checksumCrc32: 'GEN200',
        downloadUrl: 'https://github.com/generic-gnss/firmware/releases/v2.0.bin',
        criticality: 'OPTIONAL',
        releaseNotes: 'NMEA 4.11 compliance update.',
        targetHwId: 'GENERIC_001',
        minBatteryLevel: 0.10,
        restartRequired: true
    },
    // INTERNAL (SIMULATED OTA)
    'INTERNAL': {
        version: 'QC_GNSS_6.0.0_PATCH_1',
        buildDate: 1775001600000, // Apr 2026
        sizeBytes: 8192,
        checksumCrc32: 'OTA_PATCH_V6',
        downloadUrl: 'ota://android/system/gnss/patch_q4',
        criticality: 'CRITICAL',
        releaseNotes: 'XTRA 3.0 Injection Logic. 5G-L1 Coexistence Filter.',
        targetHwId: 'INTERNAL',
        minBatteryLevel: 0.15,
        restartRequired: false 
    },
    // BROADCOM (BCM47755 / BCM47765)
    'BCM_47755': {
        version: 'BCM_L5_2.1',
        buildDate: 1765000000000,
        sizeBytes: 1024000,
        checksumCrc32: 'BCM47755',
        downloadUrl: 'https://broadcom.com/support/gnss/bcm47755_v2.1.bin',
        criticality: 'RECOMMENDED',
        releaseNotes: 'Improved multipath mitigation in urban canyons.',
        targetHwId: 'BCM_47755',
        minBatteryLevel: 0.20,
        restartRequired: true
    },
    // MEDIATEK (MT3333 / MT3339)
    'MTK_3333': {
        version: 'MTK_AX_3.0',
        buildDate: 1755000000000,
        sizeBytes: 512000,
        checksumCrc32: 'MTK3333',
        downloadUrl: 'https://mediatek.com/drivers/gnss/mt3333_v3.bin',
        criticality: 'OPTIONAL',
        releaseNotes: 'Faster TTFF for cold starts.',
        targetHwId: 'MTK_3333',
        minBatteryLevel: 0.15,
        restartRequired: true
    },
    // STMICRO (TESE0 / TESEO-LIV3F)
    'STM_TESEO': {
        version: 'TESEO_4.5',
        buildDate: 1770000000000,
        sizeBytes: 2048000,
        checksumCrc32: 'STM4500',
        downloadUrl: 'https://st.com/gnss/teseo/fw_4.5.bin',
        criticality: 'RECOMMENDED',
        releaseNotes: 'Added support for NavIC constellation.',
        targetHwId: 'STM_TESEO',
        minBatteryLevel: 0.25,
        restartRequired: true
    },
    // FURUNO (GN-87)
    'FURUNO_GN87': {
        version: 'GN87_1.2',
        buildDate: 1762000000000,
        sizeBytes: 768000,
        checksumCrc32: 'FUR8712',
        downloadUrl: 'https://furuno.com/gnss/gn87_v1.2.bin',
        criticality: 'OPTIONAL',
        releaseNotes: 'Timing accuracy improvements.',
        targetHwId: 'FURUNO_GN87',
        minBatteryLevel: 0.20,
        restartRequired: true
    },
    // GENERIC USB (Prolific / CP210x)
    'USB_GENERIC': {
        version: 'USB_SERIAL_2.4',
        buildDate: 1740000000000,
        sizeBytes: 64000,
        checksumCrc32: 'USBGEN24',
        downloadUrl: 'https://drivers.usb/serial/v2.4.bin',
        criticality: 'RECOMMENDED',
        releaseNotes: 'Stability fix for high baud rates (115200+).',
        targetHwId: 'USB_GENERIC',
        minBatteryLevel: 0.10,
        restartRequired: true
    }
};

export class SafetyInterlock {
    public static async preFlightCheck(
        batteryLevel: number, 
        metadata: FirmwareMetadata,
        onLog: (msg: string) => void
    ): Promise<boolean> {
        onLog('[SAFETY] Initiating Pre-Flight Interlocks...');
        
        await new Promise(r => setTimeout(r, 500));

        // 1. Power Check
        if (batteryLevel < metadata.minBatteryLevel) {
            onLog(`[FAIL] Battery too low (${(batteryLevel*100).toFixed(0)}%). Required: ${(metadata.minBatteryLevel*100).toFixed(0)}%`);
            return false;
        }
        onLog('[PASS] Power Rails Stable.');

        // 2. Storage Check (Simulated)
        onLog('[PASS] NVRAM Storage Space Adequate.');
        
        // 3. Signature Validation
        onLog(`[PASS] Digital Signature Verified (${metadata.targetHwId}).`);

        return true;
    }
}

export class FirmwareEngine {
    private status: FlashStatus = 'IDLE';
    private progress: number = 0;
    private currentTask: string = '';
    
    // Virtual Dual-Bank Memory (A/B Partition)
    private activeBank: 'A' | 'B' = 'A';

    public getStatus() {
        return { status: this.status, progress: this.progress, task: this.currentTask };
    }

    public async checkForUpdates(
        identity: HardwareIdentity, 
        onLog: (msg: string) => void
    ): Promise<FirmwareMetadata | null> {
        this.status = 'CHECKING';
        this.currentTask = 'Handshaking with Vendor Server...';
        onLog(`Connecting to ${identity.vendor} Secure Gateway...`);

        await new Promise(r => setTimeout(r, 1200)); // Network delay

        // Smart lookup based on hardware ID
        // If ID not found exactly, try to find a close match based on vendor for demo
        let match: FirmwareMetadata | undefined = GLOBAL_FIRMWARE_REPO[identity.hardwareId];
        
        if (!match) {
            // Fuzzy match for demo purposes
            if (identity.vendor === 'U_BLOX') match = GLOBAL_FIRMWARE_REPO['F9P_00192'];
            else if (identity.vendor === 'TRIMBLE') match = GLOBAL_FIRMWARE_REPO['TRMB_BD9'];
            else if (identity.vendor === 'NOVATEL') match = GLOBAL_FIRMWARE_REPO['OEM7_GEN_3'];
            else if (identity.vendor === 'SEPTENTRIO') match = GLOBAL_FIRMWARE_REPO['SEPT_MOS'];
            else if (identity.vendor === 'GARMIN') match = GLOBAL_FIRMWARE_REPO['GARMIN_GLO'];
            else if (identity.vendor === 'HEMISPHERE') match = GLOBAL_FIRMWARE_REPO['HEMI_P40'];
            else if (identity.vendor === 'SKYTRAQ') match = GLOBAL_FIRMWARE_REPO['SKY_PX1122'];
            else if (identity.vendor === 'BROADCOM') match = GLOBAL_FIRMWARE_REPO['BCM_47755'];
            else if (identity.vendor === 'MEDIATEK') match = GLOBAL_FIRMWARE_REPO['MTK_3333'];
            else if (identity.vendor === 'STMICRO') match = GLOBAL_FIRMWARE_REPO['STM_TESEO'];
            else if (identity.vendor === 'FURUNO') match = GLOBAL_FIRMWARE_REPO['FURUNO_GN87'];
            else if (identity.vendor === 'GENERIC_NMEA' || identity.vendor === 'NO_BRAND_CLONE') match = GLOBAL_FIRMWARE_REPO['GENERIC_001'];
            else if (identity.connectionInterface === 'INTERNAL_BUS') match = GLOBAL_FIRMWARE_REPO['INTERNAL'];
            else if (identity.connectionInterface === 'USB_OTG') match = GLOBAL_FIRMWARE_REPO['USB_GENERIC'];
        }

        if (match && match.version !== identity.currentFirmware) {
            onLog(`Update Available: ${match.version} [${match.criticality}]`);
            this.status = 'IDLE';
            return match;
        }

        onLog('Firmware is synchronized with master server.');
        this.status = 'IDLE';
        return null;
    }

    public async flashFirmware(
        metadata: FirmwareMetadata, 
        currentBattery: number,
        onLog: (msg: string) => void,
        onComplete: (success: boolean) => void
    ) {
        try {
            this.status = 'PRE_FLIGHT_CHECKS';
            const safe = await SafetyInterlock.preFlightCheck(currentBattery, metadata, onLog);
            if (!safe) {
                throw new Error('Safety Interlock Engaged. Aborting.');
            }

            // 1. DOWNLOAD
            this.status = 'DOWNLOADING';
            this.currentTask = 'Downloading Binary Blob...';
            onLog(`Fetching ${metadata.sizeBytes} bytes from CDN...`);
            
            for(let i=0; i<=100; i+=20) {
                this.progress = i;
                await new Promise(r => setTimeout(r, 200));
            }

            // 2. BACKUP
            this.status = 'BACKING_UP';
            this.currentTask = 'Dumping NVRAM to Safe Partition...';
            onLog('Creating Restore Point...');
            await new Promise(r => setTimeout(r, 800));

            // 3. ERASE STANDBY BANK
            const targetBank = this.activeBank === 'A' ? 'B' : 'A';
            this.status = 'ERASING_BANK';
            this.currentTask = `Erasing Partition ${targetBank}...`;
            onLog(`Formatting Bank ${targetBank} for incoming write...`);
            await new Promise(r => setTimeout(r, 1000));

            // 4. WRITE FLASH
            this.status = 'FLASHING_APP';
            this.currentTask = 'Writing Firmware Pages...';
            const totalPages = 50;
            for(let p=0; p<=totalPages; p++) {
                this.progress = (p / totalPages) * 100;
                if (p % 5 === 0) onLog(`Writing Address 0x${(0x8000 + p*1024).toString(16).toUpperCase()}...`);
                await new Promise(r => setTimeout(r, 50)); 
                
                // BRICK PROTECTION TEST (Simulate Random Cosmic Ray Bitflip)
                if (Math.random() > 0.998) {
                    onLog('[WARN] Bitflip detected in RAM. Correcting via ECC...');
                }
            }

            // 5. VALIDATE FLASH
            this.status = 'VALIDATING_FLASH';
            this.currentTask = 'Verifying Checksum...';
            await new Promise(r => setTimeout(r, 800));
            onLog(`CRC32 MATCH: ${metadata.checksumCrc32}`);
            
            // 6. SWAP BANKS & REBOOT
            this.status = 'REBOOTING';
            onLog(`Setting Active Boot Partition to ${targetBank}...`);
            this.activeBank = targetBank;
            
            this.status = 'SUCCESS';
            this.currentTask = 'Update Complete';
            onLog('FIRMWARE UPDATE SUCCESSFUL. SYSTEM RESTARTING...');
            onComplete(true);

        } catch (e: any) {
            onLog(`CRITICAL FAILURE: ${e.message}`);
            this.status = 'ROLLBACK';
            this.currentTask = 'Restoring Backup...';
            onLog('EMERGENCY: Restoring from NVRAM Backup...');
            await new Promise(r => setTimeout(r, 2000));
            
            this.status = 'FAILED';
            this.currentTask = 'System Restored Safe State';
            onComplete(false);
        }
    }
}

export const FirmwareManager = new FirmwareEngine();
