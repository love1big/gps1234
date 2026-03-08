import React, { useEffect, useRef, useState, memo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import Svg, { Polyline, Line, G, Text as SvgText } from 'react-native-svg';
import { IMUData } from '../types';

interface Props {
  imu: IMUData;
}

const MAX_POINTS = 50;

const TelemetryPlot: React.FC<Props> = memo(({ imu }) => {
  const [history, setHistory] = useState<{x: number, y: number, z: number}[]>([]);
  const historyRef = useRef<{x: number, y: number, z: number}[]>([]);

  useEffect(() => {
    const newPoint = { x: imu.accelX || 0, y: imu.accelY || 0, z: imu.accelZ || 0 };
    historyRef.current.push(newPoint);
    if (historyRef.current.length > MAX_POINTS) {
      historyRef.current.shift();
    }
    setHistory([...historyRef.current]);
  }, [imu]);

  const width = 300;
  const height = 100;
  const padding = 10;

  const pointsX = history.map((p, i) => `${(i / (MAX_POINTS - 1)) * width},${height / 2 - p.x * 20}`).join(' ');
  const pointsY = history.map((p, i) => `${(i / (MAX_POINTS - 1)) * width},${height / 2 - p.y * 20}`).join(' ');
  const pointsZ = history.map((p, i) => `${(i / (MAX_POINTS - 1)) * width},${height / 2 - p.z * 20}`).join(' ');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>IMU TELEMETRY (ACCEL)</Text>
        <View style={styles.legend}>
          <Text style={[styles.legendText, { color: '#ef4444' }]}>X</Text>
          <Text style={[styles.legendText, { color: '#22c55e' }]}>Y</Text>
          <Text style={[styles.legendText, { color: '#3b82f6' }]}>Z</Text>
        </View>
      </View>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <G>
          {/* Grid */}
          <Line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="#334155" strokeWidth="1" strokeDasharray="4 4" />
          
          {/* Plots */}
          {history.length > 1 && (
            <>
              <Polyline points={pointsX} fill="none" stroke="#ef4444" strokeWidth="1.5" />
              <Polyline points={pointsY} fill="none" stroke="#22c55e" strokeWidth="1.5" />
              <Polyline points={pointsZ} fill="none" stroke="#3b82f6" strokeWidth="1.5" />
            </>
          )}
        </G>
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  legend: {
    flexDirection: 'row',
    gap: 8,
  },
  legendText: {
    fontSize: 10,
    fontWeight: 'bold',
  }
});

export default TelemetryPlot;
