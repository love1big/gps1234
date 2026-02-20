
import { BluetoothDevice, LogEntry, HardwareIdentity, ChipsetVendor } from '../types';
import { UsbDriver } from './usbDrivers';

// --- BLUETOOTH DEVICE DATABASE ---
// Simulates signatures of popular GNSS receivers
const BT_SIGNATURES = [
    { prefix: 'Garmin GLO', brand: 'Garmin', type: 'SPP_CLASSIC', model: 'GLO 2', vendor: 'GARMIN' },
    { prefix: 'XGPS', brand: 'Dual', type: 'SPP_CLASSIC', model: 'XGPS160', vendor: 'GENERIC_NMEA' },
    { prefix: 'Bad Elf', brand: 'Bad Elf', type: 'SPP_CLASSIC', model: 'GNSS Surveyor', vendor: 'GENERIC_NMEA' },
    { prefix: 'Trimble', brand: 'Trimble', type: 'SPP_CLASSIC', model: 'R12', vendor: 'TRIMBLE' },
    { prefix: 'Leica', brand: 'Leica', type: 'BLE_GATT', model: 'GS18', vendor: 'NOVATEL' }, 
    { prefix: 'Reach', brand: 'Emlid', type: 'BLE_GATT', model: 'RS2+', vendor: 'U_BLOX' },
    { prefix: 'Topcon', brand: 'Topcon', type: 'SPP_CLASSIC', model: 'HiPer VR', vendor: 'NO_BRAND_CLONE' },
    { prefix: 'GNSS', brand: 'Generic', type: 'SPP_CLASSIC', model: 'NMEA Device', vendor: 'GENERIC_NMEA' },
    { prefix: 'CHCNAV', brand: 'CHCNAV', type: 'BLE_GATT', model: 'i90', vendor: 'TRIMBLE' },
    { prefix: 'Spectra', brand: 'Spectra', type: 'SPP_CLASSIC', model: 'SP85', vendor: 'TRIMBLE' },
    { prefix: 'Stonex', brand: 'Stonex', type: 'BLE_GATT', model: 'S900', vendor: 'HEMISPHERE' },
    { prefix: 'Foif', brand: 'Foif', type: 'SPP_CLASSIC', model: 'A90', vendor: 'UNICORE' },
    { prefix: 'South', brand: 'South', type: 'BLE_GATT', model: 'Galaxy G1', vendor: 'TRIMBLE' }
];

class BluetoothGnssManager {
    private connectedDevice: BluetoothDevice | null = null;
    private isScanning = false;
    private scanTimeout: any = null;

    public getStatus(): BluetoothDevice | null {
        return this.connectedDevice;
    }

    /**
     * Simulates scanning for Bluetooth devices (SPP & BLE)
     */
    public async scanForDevices(
        onFound: (device: BluetoothDevice) => void,
        onLog: (msg: string, level: LogEntry['level']) => void
    ): Promise<void> {
        if (this.isScanning) return;
        this.isScanning = true;
        onLog('Scanning Bluetooth Spectrum (SPP/BLE)...', 'info');

        // Simulate discovery delay
        await new Promise(r => setTimeout(r, 1500));

        // Randomly "discover" 2-4 devices from the database
        const count = 2 + Math.floor(Math.random() * 3);
        const candidates = [...BT_SIGNATURES].sort(() => 0.5 - Math.random()).slice(0, count);

        candidates.forEach((sig, index) => {
            setTimeout(() => {
                const mac = Array.from({length: 6}, () => Math.floor(Math.random()*256).toString(16).padStart(2,'0').toUpperCase()).join(':');
                const device: BluetoothDevice = {
                    id: `bt_${index}_${Date.now()}`,
                    name: `${sig.prefix} ${Math.floor(Math.random() * 999)}`,
                    address: mac,
                    type: sig.type as any,
                    brand: sig.brand,
                    connected: false,
                    isGnssCapable: true
                };
                onFound(device);
            }, index * 800);
        });

        this.scanTimeout = setTimeout(() => {
            this.isScanning = false;
            onLog('Bluetooth Scan Complete.', 'success');
        }, count * 1000 + 500);
    }

    /**
     * Simulates connecting to a selected device and binding the NMEA stream
     */
    public async connectDevice(
        device: BluetoothDevice,
        onLog: (msg: string, level: LogEntry['level']) => void
    ): Promise<boolean> {
        onLog(`Initiating pairing with ${device.name}...`, 'info');
        
        await new Promise(r => setTimeout(r, 1200)); // Pairing delay

        if (Math.random() > 0.95) {
            onLog(`Connection failed: socket closed by peer.`, 'error');
            return false;
        }

        this.connectedDevice = { ...device, connected: true };
        
        // Find chip info to inject into UsbDriver
        const sig = BT_SIGNATURES.find(s => device.name.includes(s.prefix)) || BT_SIGNATURES[7]; // Default to Generic
        
        onLog(`Socket Open: RFCOMM Channel 1 [${device.address}]`, 'success');
        
        // Inject Identity into the Universal Driver Core
        // This makes the rest of the app "think" we have real hardware attached
        UsbDriver.identity = {
            vendor: sig.vendor as ChipsetVendor,
            modelName: sig.model,
            hardwareId: `BT_${device.address.replace(/:/g,'')}`,
            currentFirmware: 'BT_BRIDGE_1.0',
            capabilities: { 
                dualBand: sig.brand === 'Emlid' || sig.brand === 'Trimble' || sig.brand === 'Leica', 
                rtk: sig.brand !== 'Generic', 
                rawMeas: true, 
                imuIntegrated: false, 
                ppp: false, 
                lband: false 
            },
            connectionInterface: 'BLUETOOTH_SPP'
        };

        // Start Data Stream Simulation
        onLog(`Stream Bound: NMEA 0183 @ 115200 baud`, 'info');
        
        return true;
    }

    public disconnect() {
        this.connectedDevice = null;
        UsbDriver.identity = null; // Clear driver identity
    }
}

export const BluetoothManager = new BluetoothGnssManager();
