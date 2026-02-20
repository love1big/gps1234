
import { NetworkStats, GNSSConfig } from '../types';

// Simulation constants
const BASE_LATENCY_4G = 45;
const BASE_LATENCY_5G = 12;
const BASE_LATENCY_QUIC = 8; // Ultra Low
const BASE_JITTER = 15;

let currentPhase = 0;
let packetLossAccumulator = 0;

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
  // If Low Latency Mode (QUIC) is on, we skip the TCP Handshake overhead
  let baseLatency = config.lowLatencyMode ? BASE_LATENCY_QUIC : (isBoosted ? BASE_LATENCY_5G : BASE_LATENCY_4G);
  
  // DNS Turbo: Reduces the "Lookup" phase of latency
  if (config.dnsTurbo) {
      baseLatency -= 3; // Simulated faster lookup
  }
  
  // Advanced: BBR Congestion Control
  // Keeps the pipe full but prevents bufferbloat (latency spikes)
  let congestionFactor = 1.0;
  if (config.congestionControl) {
      congestionFactor = 0.8; // 20% latency reduction
  }
  
  let jitter = isBoosted ? 3 : BASE_JITTER;
  if (config.lowLatencyMode) jitter = 1.5; // QUIC is very stable

  // LEO Override
  if (config.leoSatellites) {
      baseLatency = 5;
      jitter = 0.5;
  }

  // --- 2. PACKET LOSS & STABILITY ---
  const noise = Math.sin(currentPhase) * 5 + (Math.random() * 5);
  
  // Calculate raw latency with noise
  let finalLatency = Math.max(4, (baseLatency + noise) * congestionFactor);

  // Packet Loss Logic
  let packetLoss = 0;
  
  // Heartbeat / Keep-Alive Logic
  // If active, we prevent the modem from sleeping, killing packet loss
  if (config.keepAliveMode) {
     packetLoss = 0; 
  } else {
     // Standard fluctuation
     if (Math.random() > 0.95) packetLoss = Math.random() * 2.0;
  }
  
  // Multi-Path TCP Redundancy
  // If one link fails, the other picks up -> 0% Loss
  if (config.multiPathTcp) {
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

  // --- 4. SIGNAL STRENGTH (dBm) ---
  let signalStrength = -95;
  if (isBoosted || config.leoSatellites) {
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

  // Protocol Label
  let connectionType: NetworkStats['connectionType'] = '4G';
  if (config.leoSatellites) connectionType = '6G-LEO';
  else if (config.lowLatencyMode) connectionType = 'QUIC';
  else if (config.multiPathTcp) connectionType = 'MPTCP';
  else if (isBoosted) connectionType = '5G';

  return {
    latency: Number(finalLatency.toFixed(0)),
    jitter: Number(jitter.toFixed(1)),
    downloadRate: Number((downloadBase + Math.random() * 800).toFixed(0)),
    uploadRate: Number((uploadBase + Math.random() * 300).toFixed(0)),
    packetLoss: Number(packetLoss.toFixed(2)),
    stabilityScore: stabilityScore,
    signalStrength: Number(signalStrength.toFixed(0)),
    connectionType,
    isOptimized: isBoosted || config.lowLatencyMode || config.multiPathTcp
  };
};

export const getNetworkLog = (stats: NetworkStats): string | null => {
  if (stats.connectionType === 'QUIC' && Math.random() > 0.98) return `QUIC/UDP Stream: 0-RTT Handshake verified. Latency: ${stats.latency}ms`;
  if (stats.connectionType === 'MPTCP' && Math.random() > 0.98) return `Link Aggregation Active: Bandwidth ${(stats.downloadRate/1000).toFixed(1)} Mbps`;
  if (stats.stabilityScore === 100 && Math.random() > 0.99) return `Link Status: PERFECT SYNC (Heartbeat Active)`;
  if (stats.packetLoss > 0.5) return `Packet Loss detected (${stats.packetLoss}%). Re-routing...`;
  return null;
};
