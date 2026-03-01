import React, { memo } from 'react';
import { View, StyleSheet, Text, ScrollView, Platform } from 'react-native';
import { Satellite } from '../types';
import { CONSTELLATION_COLORS } from '../constants';

interface Props {
  satellites: Satellite[];
}

const SignalChart: React.FC<Props> = memo(({ satellites }) => {
  // Sort and filter invalid data
  const data = satellites
    .filter(s => s.status !== 'ephemeris_missing' && !Number.isNaN(s.snr) && Number.isFinite(s.snr))
    .sort((a, b) => {
        const aVal = a.displaySnr || a.snr;
        const bVal = b.displaySnr || b.snr;
        return (bVal || 0) - (aVal || 0);
    })
    .slice(0, 30);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>SIGNAL STRENGTH (C/N0)</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartArea}>
        {data.map((item, idx) => {
            // Use smoothed SNR if available, guard against NaN
            let snrVal = item.displaySnr || item.snr;
            if (Number.isNaN(snrVal) || !Number.isFinite(snrVal)) snrVal = 0;
            
            // Limit height to 100%
            const heightPct = Math.min(100, Math.max(5, (snrVal / 60) * 100));

            return (
                <View key={idx} style={styles.barContainer}>
                    <View style={styles.barTrack}>
                        <View 
                            style={[
                                styles.bar, 
                                { 
                                    height: `${heightPct}%`,
                                    backgroundColor: CONSTELLATION_COLORS[item.constellation] || '#fff',
                                    opacity: item.usedInFix ? 1 : 0.4
                                }
                            ]} 
                        />
                    </View>
                    <Text style={styles.label}>{item.constellation[0]}{item.prn}</Text>
                </View>
            );
        })}
        {data.length === 0 && <Text style={styles.noData}>NO SATELLITE DATA</Text>}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#334155',
    height: 180,
  },
  header: {
    marginBottom: 10,
  },
  title: {
    color: '#06b6d4',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  chartArea: {
    alignItems: 'flex-end',
    height: 120,
    paddingRight: 20,
  },
  barContainer: {
    alignItems: 'center',
    marginRight: 6,
    width: 14,
  },
  barTrack: {
    height: 100,
    width: 6,
    backgroundColor: '#0f172a',
    borderRadius: 3,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  bar: {
    width: '100%',
    borderRadius: 3,
  },
  label: {
    color: '#64748b',
    fontSize: 8,
    marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    transform: [{ rotate: '-90deg' }],
    width: 24,
    textAlign: 'center',
    height: 20,
  },
  noData: {
      color: '#475569',
      fontSize: 12,
      alignSelf: 'center',
      marginTop: 40,
      width: '100%',
      textAlign: 'center'
  }
});

export default SignalChart;