
import { ExternalWifiAdapter, LogEntry, WifiChipset } from '../types';

// --- CHIPSET DATABASE ---
// Simulates the internal kernel module mapping
const DRIVER_DATABASE: Record<string, { driver: string, desc: string }> = {
    'REALTEK_8812': { driver: '8812au.ko', desc: 'Realtek RTL8812AU 802.11ac' },
    'REALTEK_8187': { driver: 'rtl8187.ko', desc: 'Realtek RTL8187L High Power' },
    'RALINK_3070': { driver: 'rt2800usb.ko', desc: 'Ralink RT3070 802.11n' },
    'MEDIATEK_7601': { driver: 'mt7601u.ko', desc: 'MediaTek MT7601U' },
    'ATHEROS_9271': { driver: 'ath9k_htc.ko', desc: 'Atheros AR9271 (Kali Mode)' },
    'INTEL_AX200': { driver: 'iwlwifi.ko', desc: 'Intel Wi-Fi 6 AX200' },
    'INTEL_BE200': { driver: 'iwlwifi_be.ko', desc: 'Intel Wi-Fi 7 BE200' },
    'BROADCOM_4360': { driver: 'wl.ko', desc: 'Broadcom BCM4360 802.11ac' },
    'GENERIC_WIFI': { driver: 'wext_generic.ko', desc: 'Universal WEXT Wrapper' }
};

class UniversalWifiManager {
    private adapter: ExternalWifiAdapter | null = null;
    private isInjecting = false;

    constructor() {
        console.log('[WIFI-CORE] Universal Wireless Interface initialized.');
    }

    public getAdapterStatus(): ExternalWifiAdapter | null {
        return this.adapter;
    }

    /**
     * Simulates scanning the USB/PCI bus for network controllers.
     * In a real React Native app, this might talk to a native module reading /sys/class/net or lsusb
     */
    public async scanForHardware(onLog: (msg: string, level: LogEntry['level']) => void): Promise<ExternalWifiAdapter | null> {
        if (this.adapter && this.adapter.status === 'CONNECTED') return this.adapter;

        onLog('Scanning USB/PCI Bus for Network Controllers...', 'info');
        await new Promise(r => setTimeout(r, 800));

        // Randomly "find" a device for simulation purposes if none exists
        // In "No-Brand" mode, we might find a generic dongle
        const found = Math.random() > 0.3; 
        
        if (found) {
            const seed = Math.random();
            let chipset: WifiChipset = 'GENERIC_USB';
            let model = 'Unknown 802.11n Adapter';
            let id = 'GENERIC_WIFI';

            if (seed > 0.9) { chipset = 'REALTEK'; model = 'TP-Link T3U (RTL8812)'; id = 'REALTEK_8812'; }
            else if (seed > 0.8) { chipset = 'RALINK'; model = 'Alfa AWUS036NH'; id = 'RALINK_3070'; }
            else if (seed > 0.7) { chipset = 'ATHEROS'; model = 'TP-Link TL-WN722N'; id = 'ATHEROS_9271'; }
            else if (seed > 0.6) { chipset = 'MEDIATEK'; model = 'Xiaomi Wifi Mini'; id = 'MEDIATEK_7601'; }
            else if (seed > 0.5) { chipset = 'INTEL'; model = 'Intel Wi-Fi 7 BE200'; id = 'INTEL_BE200'; }
            else if (seed > 0.4) { chipset = 'BROADCOM_EXT'; model = 'ASUS PCE-AC68'; id = 'BROADCOM_4360'; }

            this.adapter = {
                id,
                chipset,
                model,
                interfaceType: 'USB_DONGLE',
                driverLoaded: false,
                driverVersion: 'N/A',
                macAddress: '00:00:00:00:00:00',
                status: 'DRIVER_MISSING'
            };

            onLog(`Hardware Detected: ${model} [${chipset}]`, 'success');
            return this.adapter;
        } else {
            onLog('No external network adapters found on bus.', 'warn');
            return null;
        }
    }

    /**
     * Simulates `insmod` or `modprobe` to load kernel modules
     */
    public async injectDriver(onLog: (msg: string, level: LogEntry['level']) => void): Promise<boolean> {
        if (!this.adapter) {
            onLog('No hardware to inject driver for.', 'error');
            return false;
        }

        if (this.isInjecting) return false;
        this.isInjecting = true;

        const drvInfo = DRIVER_DATABASE[this.adapter.id] || DRIVER_DATABASE['GENERIC_WIFI'];
        
        onLog(`Kernel: Loading module ${drvInfo.driver}...`, 'info');
        await new Promise(r => setTimeout(r, 1200)); // Simulate load time

        // Simulate random driver conflict failure (realistic!)
        if (Math.random() > 0.95) {
            onLog(`Kernel Panic: Symbol mismatch in ${drvInfo.driver}`, 'error');
            this.isInjecting = false;
            return false;
        }

        this.adapter.driverLoaded = true;
        this.adapter.driverVersion = 'v4.2.0-stable';
        this.adapter.macAddress = 'AA:BB:CC:DD:EE:FF'; // Randomized in real usage
        this.adapter.status = 'DISCONNECTED';
        
        onLog(`Driver Loaded: ${drvInfo.desc}`, 'success');
        onLog(`Interface wlan1 is UP. MAC: ${this.adapter.macAddress}`, 'info');
        
        this.isInjecting = false;
        return true;
    }

    /**
     * Simulates scanning for SSIDs using the external adapter
     */
    public async connectToBestNetwork(onLog: (msg: string, level: LogEntry['level']) => void) {
        if (!this.adapter || !this.adapter.driverLoaded) return;

        this.adapter.status = 'SCANNING';
        onLog('wlan1: Scanning for Access Points...', 'info');
        await new Promise(r => setTimeout(r, 1500));

        this.adapter.status = 'ASSOCIATING';
        onLog('wlan1: Associating with "Free_Public_WiFi"...', 'info');
        await new Promise(r => setTimeout(r, 1000));

        this.adapter.status = 'CONNECTED';
        this.adapter.ssid = 'Free_Public_WiFi';
        this.adapter.ipAddress = '192.168.1.105';
        this.adapter.signalStrength = -55;

        onLog('wlan1: DHCP Lease Obtained (192.168.1.105)', 'success');
    }
}

export const ExternalWifiManager = new UniversalWifiManager();
