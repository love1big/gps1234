
import React from 'react';
import { View, Text, StyleSheet, Platform, DimensionValue } from 'react-native';
import { PositionData, IMUData, NetworkStats, SensorStatus, UsbDeviceStatus } from '../types';

interface Props {
  position: PositionData;
  imu: IMUData;
  network?: NetworkStats;
  isMocking?: boolean; 
  sensorStatus?: SensorStatus;
  baselineSats?: number | null;
  usbStatus?: UsbDeviceStatus; 
}

const StatBox = ({ label, value, unit, color = '#e2e8f0', width = '23%' }: { label: string, value: React.ReactNode, unit?: string, color?: string, width?: DimensionValue }) => (
  <View style={[styles.statBox, { width }]}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={[styles.statValue, { color }]}>
      {value}<Text style={styles.statUnit}>{unit}</Text>
    </Text>
  </View>
);

const SensorBadge = ({ name, status }: { name: string, status: string }) => {
    let bg = '#334155';
    let color = '#94a3b8';
    let text = 'INIT';
    
    if (status === 'REAL') {
        bg = '#064e3b'; // green-900
        color = '#4ade80'; // green-400
        text = 'REAL';
    } else if (status === 'VIRTUAL') {
        bg = '#451a03'; // yellow-900
        color = '#facc15'; // yellow-400
        text = 'SIM';
    }
    
    return (
        <View style={[styles.badge, { backgroundColor: bg }]}>
            <Text style={[styles.badgeTitle, { color }]}>{name}</Text>
            <Text style={[styles.badgeStatus, { color }]}>{text}</Text>
        </View>
    );
};

const InfoPanel: React.FC<Props> = ({ position, imu, network, sensorStatus }) => {
  const safeFixed = (val: number | undefined | null, digits: number) => {
      if (typeof val !== 'number') return '-';
      return val.toFixed(digits);
  }

  // Determine RTK Color & Text
  let rtkColor = '#94a3b8';
  let rtkText = position.rtkStatus;
  
  if (position.rtkStatus === 'FIXED') {
      rtkColor = '#4ade80';
  } else if (position.rtkStatus === 'FLOAT') {
      rtkColor = '#facc15';
  } else if (position.rtkStatus === 'SBAS_DIFF') {
      rtkColor = '#a3e635'; // Lime green
      rtkText = 'SBAS';
  } else if (position.rtkStatus === 'PPP_FIXED') {
      rtkColor = '#22d3ee'; // Cyan for PPP
      rtkText = 'PPP-FIX';
  } else if (position.rtkStatus === 'PPP_CONVERGING') {
      rtkColor = '#f472b6'; // Pink
      rtkText = `PPP ${position.convergenceProgress?.toFixed(0)}%`;
  }

  return (
    <View style={styles.container}>
      {/* SENSORS */}
      <View style={styles.row}>
         {sensorStatus && (
             <View style={styles.sensorRow}>
                 <SensorBadge name="ACCEL" status={sensorStatus.accel} />
                 <SensorBadge name="GYRO" status={sensorStatus.gyro} />
                 <SensorBadge name="MAG" status={sensorStatus.mag} />
                 <SensorBadge name="BARO" status={sensorStatus.baro} />
             </View>
          )}
          {position.activity && (
              <View style={styles.activityBadge}>
                  <Text style={styles.activityText}>{position.activity}</Text>
              </View>
          )}
      </View>

      {/* GPS STATS */}
      <View style={styles.grid}>
        <StatBox label="Lat" value={safeFixed(position.latitude, 8)} unit="°" width="48%" color="#06b6d4" />
        <StatBox label="Lon" value={safeFixed(position.longitude, 8)} unit="°" width="48%" color="#06b6d4" />
        
        <StatBox label="Alt" value={safeFixed(position.altitude, 2)} unit="m" />
        <StatBox label="GDOP" value={safeFixed(position.gdop, 1)} unit="" color={(position.gdop || 5) < 2 ? '#4ade80' : '#fbbf24'} />
        
        {/* Dynamic State Box */}
        {position.scanState === 'LOCKED' ? (
           <StatBox label="SOL TYPE" value={rtkText} unit="" color={rtkColor} width="48%" />
        ) : (
           <StatBox label="MODE" value={position.scanState === 'DEAD_RECKONING' ? 'D.R.' : 'SCAN'} unit="" color="#f472b6" width="48%" />
        )}
        
        {/* Advanced Precision Metrics */}
        {(position.rtkStatus !== 'NONE' && position.rtkStatus !== 'SBAS_DIFF') ? (
             <>
                <StatBox label="HPL/VPL" value={`${(position.hpl||0).toFixed(1)}/${(position.vpl||0).toFixed(1)}`} unit="m" width="23%" color="#fca5a5" />
                <StatBox label="Convergence" value={position.convergenceProgress?.toFixed(0) || 100} unit="%" width="23%" color="#22d3ee" />
                <StatBox label="Carrier Age" value={position.carrierSmoothingTime || 0} unit="s" width="48%" color="#a3e635" />
             </>
        ) : (
             <>
                <StatBox label="Smoothing" value={position.carrierSmoothingTime || 0} unit="s" width="23%" color="#a3e635" />
                <StatBox label="Iono (IPP)" value={position.sbasIonoIndex || 0} unit="m" width="23%" />
                <StatBox label="HPL / VPL" value={`${(position.hpl||0).toFixed(0)}/${(position.vpl||0).toFixed(0)}`} unit="m" width="48%" color="#fca5a5" />
             </>
        )}
      </View>

      {/* RF LANDSCAPE STATS */}
      <View style={[styles.grid, { borderTopWidth: 1, borderTopColor: '#334155', paddingTop: 8 }]}>
          <StatBox label="RF Anchors" value={position.rfAnchorsUsed || 0} unit="" color="#c084fc" width="30%" />
          <StatBox label="Reflect Idx" value={(position.rfMultipathIndex || 0).toFixed(2)} unit="" color={(position.rfMultipathIndex || 0) > 0.5 ? '#f87171' : '#4ade80'} width="30%" />
          <StatBox label="H.A.R.P." value={(position.rfAnchorsUsed || 0) > 0 ? "ON" : "OFF"} unit="" color="#c084fc" width="30%" />
      </View>

      {/* NETWORK */}
      {network && (
         <View style={styles.networkGrid}>
            <StatBox label="NET" value={network.connectionType} unit="" width="30%" color="#93c5fd" />
            <StatBox label="Ping" value={safeFixed(network.latency, 0)} unit="ms" width="30%" color={(network.latency || 999) < 50 ? '#4ade80' : '#fbbf24'} />
            <StatBox label="Down" value={safeFixed((network.downloadRate || 0)/1000, 1)} unit="Mbps" width="30%" />
         </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sensorRow: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap'
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignItems: 'center',
    marginRight: 4,
    marginBottom: 4,
  },
  badgeTitle: {
    fontSize: 9,
    fontWeight: 'bold',
  },
  badgeStatus: {
    fontSize: 8,
    opacity: 0.8,
  },
  activityBadge: {
    backgroundColor: '#1e3a8a',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    justifyContent: 'center',
    height: 24,
  },
  activityText: {
    color: '#93c5fd',
    fontSize: 10,
    fontWeight: 'bold',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  statBox: {
    backgroundColor: '#334155',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#475569',
  },
  statLabel: {
    color: '#94a3b8',
    fontSize: 9,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  statUnit: {
    fontSize: 10,
    color: '#64748b',
    marginLeft: 2,
  },
  networkGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#334155',
    paddingTop: 8,
  }
});

export default InfoPanel;
