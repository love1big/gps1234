
import React, { useRef, useEffect, memo } from 'react';
import { View, Text, StyleSheet, ScrollView, Platform, TouchableOpacity, Alert, Clipboard } from 'react-native';
import { LogEntry } from '../types';

interface Props {
  logs: LogEntry[];
}

const LogRow = memo(({ log }: { log: LogEntry }) => {
    const getLevelColor = (level: LogEntry['level']) => {
        switch (level) {
          case 'error': return '#ef4444';
          case 'warn': return '#f59e0b';
          case 'success': return '#22c55e';
          default: return '#cbd5e1';
        }
    };

    return (
        <View style={styles.logRow}>
            <Text style={styles.timestamp}>[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}]</Text>
            <Text style={styles.module}>{log.module}</Text>
            <Text style={[styles.message, { color: getLevelColor(log.level) }]}>
              {log.level === 'success' || log.level === 'error' ? '> ' : ''}{log.message}
            </Text>
        </View>
    );
});

const TerminalLog: React.FC<Props> = ({ logs }) => {
  const scrollRef = useRef<ScrollView>(null);

  // Performance: Only render last 50 logs max to save memory in UI
  const visibleLogs = logs.slice(-50);

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollToEnd({ animated: true });
    }
  }, [logs]); // Scroll on new logs

  const handleCopyLogs = () => {
      const text = logs.map(l => `[${new Date(l.timestamp).toISOString()}] [${l.module}] ${l.message}`).join('\n');
      Clipboard.setString(text);
      Alert.alert('System Dump', 'Kernel logs copied to clipboard.');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
            <Text style={styles.title}>SYSTEM KERNEL LOG</Text>
            <Text style={styles.path}>/var/log/gnss_core</Text>
        </View>
        <TouchableOpacity onPress={handleCopyLogs} style={styles.copyBtn}>
            <Text style={styles.copyText}>CP</Text>
        </TouchableOpacity>
      </View>
      <ScrollView 
        ref={scrollRef}
        style={styles.logArea} 
        contentContainerStyle={styles.logContent}
        nestedScrollEnabled={true}
        removeClippedSubviews={true} // Optimization for long lists
      >
        {visibleLogs.map((log) => (
          <LogRow key={log.id} log={log} />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    height: 200,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    backgroundColor: '#0f172a',
  },
  title: {
    color: '#64748b',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  path: {
    color: '#475569',
    fontSize: 10,
  },
  copyBtn: {
      backgroundColor: '#1e293b',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
      borderWidth: 1,
      borderColor: '#334155'
  },
  copyText: {
      color: '#94a3b8',
      fontSize: 10,
      fontWeight: 'bold'
  },
  logArea: {
    flex: 1,
    backgroundColor: '#020617',
  },
  logContent: {
    padding: 8,
  },
  logRow: {
    flexDirection: 'row',
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  timestamp: {
    color: '#475569',
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginRight: 6,
  },
  module: {
    color: '#0e7490', // Cyan-700
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    width: 60,
    fontWeight: 'bold',
  },
  message: {
    flex: 1,
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  }
});

export default TerminalLog;
