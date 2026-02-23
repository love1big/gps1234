import { PositionData, LogEntry } from '../types';

/**
 * MAVLINK / UDP BROADCASTER SERVICE
 * Formats GNSS data into MAVLink v1/v2 packets (GLOBAL_POSITION_INT - Msg #33)
 * and broadcasts it over UDP to external devices (Drones, ArduPilot, PX4).
 * 
 * Note: In a full native build, this uses `react-native-udp`.
 * For this environment, it simulates the socket connection and packet generation.
 */

class MavlinkBroadcasterClass {
    private isBroadcasting = false;
    private packetCount = 0;
    private sequence = 0;
    private socket: any = null; // Placeholder for UDP Socket

    public start(ip: string, port: number, onLog: (mod: string, msg: string, lvl: LogEntry['level']) => void) {
        if (this.isBroadcasting) return;
        this.isBroadcasting = true;
        this.packetCount = 0;
        this.sequence = 0;
        
        // Simulate Socket Binding
        onLog('MAVLINK', `UDP Socket bound. Broadcasting to ${ip}:${port}`, 'success');
    }

    public stop(onLog: (mod: string, msg: string, lvl: LogEntry['level']) => void) {
        if (!this.isBroadcasting) return;
        this.isBroadcasting = false;
        onLog('MAVLINK', 'UDP Broadcast stopped.', 'warn');
    }

    public broadcast(pos: PositionData, ip: string, port: number, onLog?: (mod: string, msg: string, lvl: LogEntry['level']) => void) {
        if (!this.isBroadcasting) return;

        // MAVLink GLOBAL_POSITION_INT (Message ID 33)
        // time_boot_ms (uint32), lat (int32), lon (int32), alt (int32), relative_alt (int32), vx (int16), vy (int16), vz (int16), hdg (uint16)
        
        const latInt = Math.round(pos.latitude * 1e7);
        const lonInt = Math.round(pos.longitude * 1e7);
        const altInt = Math.round(pos.altitude * 1000); // mm
        
        // Velocity components (simplified)
        const speedCmS = pos.speed * 100;
        const hdgRad = pos.bearing * (Math.PI / 180);
        const vx = Math.round(speedCmS * Math.cos(hdgRad));
        const vy = Math.round(speedCmS * Math.sin(hdgRad));
        const vz = 0;
        const hdg = Math.round(pos.bearing * 100); // cdeg

        // Simulate Packet Construction (Header + Payload + CRC)
        const payloadSize = 28;
        const msgId = 33;
        const sysId = 255; // GCS
        const compId = 0;
        
        // In a real implementation, we would pack this into a Buffer/Uint8Array
        // and send via dgram.createSocket('udp4').send()
        
        this.sequence = (this.sequence + 1) % 256;
        this.packetCount++;

        // SAFE INTEGER RESET
        if (this.packetCount > Number.MAX_SAFE_INTEGER - 1000) {
            this.packetCount = 0;
            if (onLog) onLog('MAVLINK', 'Packet counter reset (Safe Integer Limit)', 'warn');
        }

        // Log occasionally to avoid spamming the UI
        if (this.packetCount % 50 === 0 && onLog) {
            onLog('MAVLINK', `Tx Msg #33 (GLOBAL_POS_INT) Seq:${this.sequence} -> ${ip}:${port}`, 'info');
        }
    }

    public getStatus() {
        return {
            active: this.isBroadcasting,
            packetsSent: this.packetCount
        };
    }
}

export const MavlinkBroadcaster = new MavlinkBroadcasterClass();
