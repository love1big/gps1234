import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { BenchmarkResult } from '../types';

/**
 * Analyses the device hardware to calculate a performance score.
 * Optimized for React Native (Mobile) using expo-device.
 */
export const runDeviceBenchmark = (): BenchmarkResult => {
  let score = 0;

  // 1. CPU / Device Class Estimation
  const yearClass = Device.deviceYearClass || 2016; // Assume older if unknown
  
  if (yearClass >= 2023) score += 60;
  else if (yearClass >= 2021) score += 40;
  else if (yearClass >= 2018) score += 20;
  else score += 5; // Penalty for < 2018 devices

  // 2. RAM Check
  // Device.totalMemory returns bytes. Convert to GB.
  // Fallback to 2GB if unknown (safe assumption for legacy).
  const totalMemory = Device.totalMemory ? Device.totalMemory : 2147483648; 
  const ramGb = totalMemory / (1024 * 1024 * 1024);
  const ramScore = Math.min(ramGb * 5, 30); // Max 30 points for RAM
  score += ramScore;

  // 3. Brand/OS Optimization Check
  let gpuName = "Mobile GPU";
  
  if (Platform.OS === 'ios') {
      score += 20; 
      gpuName = "Apple Metal Graphics";
  } else {
      gpuName = "Adreno/Mali (Android)";
      const brand = Device.brand?.toLowerCase() || '';
      // Flagships handle GPS better even when old
      if (brand === 'samsung' || brand === 'google' || brand === 'xiaomi') {
          score += 10;
      }
      // Low-end devices often report generic manufacturers
      if (brand === 'generic' || brand === 'unknown') {
          score -= 10;
      }
  }

  // 4. Determine Tier & Limits for Stability
  let tierLabel = 'Standard';
  let minSats = 4;
  let maxSats = 12;

  if (score >= 90) {
      tierLabel = 'Ultra High-End';
      minSats = 45; 
      maxSats = 110; 
  } else if (score >= 65) {
      tierLabel = 'High Performance';
      minSats = 32;
      maxSats = 75;
  } else if (score >= 45) {
      tierLabel = 'Mid-Range';
      minSats = 24;
      maxSats = 50;
  } else if (score >= 30) {
      tierLabel = 'Entry Level';
      minSats = 12;
      maxSats = 24;
  } else {
      tierLabel = 'Legacy / Budget';
      minSats = 4;
      maxSats = 12; // Strictly limit objects for rendering on old phones
  }

  return {
    score: Math.round(score),
    tierLabel,
    minSatellites: minSats,
    maxSatellites: maxSats,
    cpuCores: Platform.OS === 'ios' ? 6 : 4,
    ramGb: Math.round(ramGb * 10) / 10,
    gpuName
  };
};