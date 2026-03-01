import { CellularModem, LogEntry } from '../types';

class CellularModemManager {
    private modem: CellularModem | null = null;
    private isConnecting = false;

    public getStatus(): CellularModem | null {
        return this.modem;
    }

    public async initializeModem(onLog: (msg: string, level: LogEntry['level']) => void): Promise<CellularModem | null> {
        if (this.isConnecting) return null;
        this.isConnecting = true;
        onLog('Initializing Cellular Modem (AT Commands)...', 'info');

        await new Promise(r => setTimeout(r, 1000));
        onLog('AT+CGMI -> SIMCOM_Ltd', 'info');
        await new Promise(r => setTimeout(r, 500));
        onLog('AT+CREG? -> +CREG: 0,1 (Registered)', 'success');

        this.modem = {
            id: 'modem_' + Date.now(),
            model: 'SIM800L GPRS/GSM',
            imei: '86' + Math.floor(Math.random() * 10000000000000).toString().padStart(13, '0'),
            operator: 'TRUE-H',
            signalStrength: -75,
            networkType: 'GPRS',
            status: 'REGISTERED'
        };

        this.isConnecting = false;
        return this.modem;
    }

    public async connectGprs(onLog: (msg: string, level: LogEntry['level']) => void): Promise<boolean> {
        if (!this.modem || this.isConnecting) return false;
        if (this.modem.status === 'CONNECTED') return true;
        
        this.isConnecting = true;
        onLog('Attaching to GPRS Network (AT+CGATT=1)...', 'info');
        await new Promise(r => setTimeout(r, 1500));
        onLog('PDP Context Activated. IP: 10.112.45.8', 'success');
        
        this.modem.status = 'CONNECTED';
        this.modem.ipAddress = '10.112.45.8';
        this.isConnecting = false;
        return true;
    }
    
    public disconnectGprs(onLog: (msg: string, level: LogEntry['level']) => void) {
        if (this.modem && this.modem.status === 'CONNECTED') {
            onLog('Deactivating PDP Context (AT+CGACT=0,1)...', 'warn');
            this.modem.status = 'REGISTERED';
            this.modem.ipAddress = undefined;
        }
    }
}

export const CellularManager = new CellularModemManager();
