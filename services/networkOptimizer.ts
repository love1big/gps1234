
import { NetworkStats, GNSSConfig } from '../types';
import * as Network from 'expo-network';
import { CellularManager } from './cellularModem';

// Simulation constants
const BASE_LATENCY_4G = 45;
const BASE_LATENCY_5G = 12;
const BASE_LATENCY_WIFI = 15;
const BASE_LATENCY_QUIC = 8; // Ultra Low
const BASE_JITTER = 15;

let currentPhase = 0;
let packetLossAccumulator = 0;

let currentNetworkState: Network.NetworkState | null = null;
let networkStateInterval: NodeJS.Timeout | null = null;

const updateNetworkState = async () => {
    try {
        currentNetworkState = await Network.getNetworkStateAsync();
    } catch (e) {
        // ignore
    }
};

// Start polling
updateNetworkState();
if (!networkStateInterval) {
    networkStateInterval = setInterval(updateNetworkState, 5000);
}

// --- MULTIPATH CONTROLLER ---
// Simulates a "Bonded" interface where WiFi and Cellular are active simultaneously
// to ensure zero downtime during switching.
export const MultipathController = {
    primaryInterface: 'WIFI',
    backupInterface: 'CELL',
    handoffState: 'IDLE', // IDLE, PREPARING, SWITCHING
    lastSwitch: 0,
    
    evaluate: (wifiStrength: number, cellStrength: number) => {
        // Pre-emptive switching logic
        if (wifiStrength < -80 && cellStrength > -90) {
            return 'CELL';
        }
        if (wifiStrength > -75) {
            return 'WIFI';
        }
        return MultipathController.primaryInterface; // Stick to current
    }
};

export const calculateNetworkStats = (config: GNSSConfig): NetworkStats => {
  // Fix: Modulo to prevent infinity growth
  currentPhase = (currentPhase + 0.1) % (Math.PI * 2000);
  
  const isBoosted = config.networkBoost;
  
  // --- 1. LATENCY ENGINE (QUIC vs TCP) ---
  let baseLatency = BASE_LATENCY_4G;
  let connectionType: NetworkStats['connectionType'] = '4G';

  // Determine base connection type and latency from actual device state if available
  if (currentNetworkState) {
      if (currentNetworkState.type === Network.NetworkStateType.WIFI) {
          connectionType = 'WIFI';
          baseLatency = BASE_LATENCY_WIFI;
      } else if (currentNetworkState.type === Network.NetworkStateType.CELLULAR) {
          connectionType = isBoosted ? '5G' : '4G';
          baseLatency = isBoosted ? BASE_LATENCY_5G : BASE_LATENCY_4G;
      } else if (currentNetworkState.type === Network.NetworkStateType.NONE || currentNetworkState.type === Network.NetworkStateType.UNKNOWN) {
          // Offline or unknown
          baseLatency = 999;
      }
  } else {
      connectionType = isBoosted ? '5G' : '4G';
      baseLatency = isBoosted ? BASE_LATENCY_5G : BASE_LATENCY_4G;
  }

  // If Low Latency Mode (QUIC) is on, we skip the TCP Handshake overhead
  if (config.lowLatencyMode && baseLatency < 999) {
      baseLatency = BASE_LATENCY_QUIC;
      connectionType = 'QUIC';
  }
  
  // DNS Turbo: Reduces the "Lookup" phase of latency
  if (config.dnsTurbo && baseLatency < 999) {
      baseLatency = Math.max(2, baseLatency - 3); // Simulated faster lookup
  }
  
  // Advanced: BBR Congestion Control
  // Keeps the pipe full but prevents bufferbloat (latency spikes)
  let congestionFactor = 1.0;
  if (config.congestionControl) {
      congestionFactor = 0.8; // 20% latency reduction
  }
  
  let jitter = isBoosted ? 3 : BASE_JITTER;
  if (config.lowLatencyMode) jitter = 1.5; // QUIC is very stable
  if (connectionType === 'WIFI') jitter = 5;

  // LEO Override
  if (config.leoSatellites) {
      baseLatency = 5;
      jitter = 0.5;
      connectionType = '6G-LEO';
  }

  // Multi-Path TCP Redundancy
  if (config.multiPathTcp && baseLatency < 999) {
      connectionType = 'MPTCP';
  }

  // --- 2. PACKET LOSS & STABILITY ---
  const noise = Math.sin(currentPhase) * 5 + (Math.random() * 5);
  
  // Calculate raw latency with noise
  let finalLatency = baseLatency >= 999 ? 999 : Math.max(4, (baseLatency + noise) * congestionFactor);

  // Packet Loss Logic
  let packetLoss = 0;
  
  if (baseLatency >= 999 || (currentNetworkState && !currentNetworkState.isConnected)) {
      packetLoss = 100; // Complete loss if offline
  } else if (config.keepAliveMode) {
      packetLoss = 0; 
  } else {
      // Standard fluctuation based on connection type
      const lossProbability = connectionType === 'WIFI' ? 0.98 : 0.95;
      if (Math.random() > lossProbability) {
          packetLoss = Math.random() * (connectionType === 'WIFI' ? 1.0 : 2.0);
      }
  }
  
  // Multi-Path TCP Redundancy
  // If one link fails, the other picks up -> 0% Loss
  if (config.multiPathTcp && packetLoss < 100) {
      packetLoss = 0;
      // Bonus: If bonded, jitter is reduced because we pick the fastest packet
      jitter *= 0.5; 
  }
  
  // Accumulated loss for stability score
  if (packetLoss > 0) packetLossAccumulator += packetLoss;
  else packetLossAccumulator *= 0.9; // Decay

  // --- 3. THROUGHPUT (BANDWIDTH) ---
  let downloadBase = isBoosted ? 35000 : 5000; // kbps
  let uploadBase = isBoosted ? 12000 : 1500; // kbps
  
  if (connectionType === 'WIFI') {
      downloadBase = 80000; // 80Mbps
      uploadBase = 40000;
  }

  // MPTCP: Aggregates WiFi + Cell
  if (config.multiPathTcp) {
      downloadBase *= 2.2; // Double speed
      uploadBase *= 2.2;
  }
  
  // Data Compression (Brotli/Gzip simulation)
  if (config.dataCompression) {
      // Effective throughput increases because we send less data
      downloadBase *= 1.3;
  }

  // LEO Bandwidth
  if (config.leoSatellites) {
      downloadBase = 250000; // 250Mbps
      uploadBase = 50000;
  }

  if (baseLatency >= 999) {
      downloadBase = 0;
      uploadBase = 0;
  }

  // --- 4. SIGNAL STRENGTH (dBm) ---
  let signalStrength = -95;
  if (baseLatency >= 999) {
      signalStrength = -120; // Dead zone
  } else if (isBoosted || config.leoSatellites || connectionType === 'WIFI') {
      signalStrength = -55 + (Math.random() * 3); // Full bars
  } else {
      signalStrength = -95 + (Math.random() * 10);
  }

  // --- 5. STABILITY SCORE CALCULATION ---
  // 100% requires: No Loss, Low Jitter, High Signal
  let stabilityPenalty = (packetLossAccumulator * 5) + (jitter * 0.8);
  
  // DNS Turbo helps stability by preventing resolution failures
  if (config.dnsTurbo) stabilityPenalty *= 0.5;
  
  let stabilityScore = Math.max(0, Math.min(100, 100 - stabilityPenalty));
  
  if (baseLatency >= 999) {
      stabilityScore = 0;
  }

  const cellularModem = CellularManager.getStatus();
  if (cellularModem && cellularModem.status === 'CONNECTED') {
      connectionType = 'GPRS';
      baseLatency = 120; // GPRS is slow
      jitter = 30;
      downloadBase = 80; // 80 kbps
      uploadBase = 40; // 40 kbps
      signalStrength = cellularModem.signalStrength;
  }

  return {
    latency: Number(finalLatency.toFixed(0)),
    jitter: Number(jitter.toFixed(1)),
    downloadRate: Number((downloadBase > 0 ? downloadBase + Math.random() * 800 : 0).toFixed(0)),
    uploadRate: Number((uploadBase > 0 ? uploadBase + Math.random() * 300 : 0).toFixed(0)),
    packetLoss: Number(packetLoss.toFixed(2)),
    stabilityScore: Number(stabilityScore.toFixed(1)),
    signalStrength: Number(signalStrength.toFixed(0)),
    connectionType,
    isOptimized: isBoosted || config.lowLatencyMode || config.multiPathTcp,
    cellularModem: cellularModem || undefined
  };
};

export const getNetworkLog = (stats: NetworkStats): string | null => {
  if (stats.stabilityScore === 0) return `Network Offline: Connection lost.`;
  if (stats.connectionType === 'QUIC' && Math.random() > 0.98) return `QUIC/UDP Stream: 0-RTT Handshake verified. Latency: ${stats.latency}ms`;
  if (stats.connectionType === 'MPTCP' && Math.random() > 0.98) return `Link Aggregation Active: Bandwidth ${(stats.downloadRate/1000).toFixed(1)} Mbps`;
  if (stats.stabilityScore >= 99 && Math.random() > 0.99) return `Link Status: PERFECT SYNC (Heartbeat Active)`;
  if (stats.packetLoss > 0.5) return `Packet Loss detected (${stats.packetLoss}%). Re-routing...`;
  return null;
};
