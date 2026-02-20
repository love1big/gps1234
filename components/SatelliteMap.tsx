
import React, { memo } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText, Path } from 'react-native-svg';
import { Satellite, ResourceState } from '../types';
import { CONSTELLATION_COLORS } from '../constants';

interface Props {
  satellites: Satellite[];
  heading: number; 
  limitCount?: number; 
  renderTrigger: number;
  complexity: ResourceState['renderComplexity']; 
}

// Static Background
const SkyplotBackground = memo(({ size, simple }: { size: number, simple: boolean }) => {
    const radius = size / 2 - 10;
    const center = size / 2;
    const getR = (el: number) => radius * (1 - el / 90);

    return (
        <G>
            <Circle cx={center} cy={center} r={radius} stroke="#334155" strokeWidth="2" fill="#0f172a" />
            {!simple && (
                <>
                    <Circle cx={center} cy={center} r={getR(30)} stroke="#334155" strokeDasharray="4, 4" fill="none" />
                    <Circle cx={center} cy={center} r={getR(60)} stroke="#334155" strokeDasharray="4, 4" fill="none" />
                </>
            )}
            <Line x1={center - radius} y1={center} x2={center + radius} y2={center} stroke="#334155" />
            <Line x1={center} y1={center - radius} x2={center} y2={center + radius} stroke="#334155" />
        </G>
    );
});

const SatelliteMap: React.FC<Props> = memo(({ satellites, heading, limitCount = 48, complexity = 'FULL' }) => {
  const size = 300;
  const radius = size / 2 - 10;
  const center = size / 2;
  
  if (complexity === 'TEXT_ONLY') {
      return (
          <View style={[styles.container, { height: 330, justifyContent: 'center' }]}>
              <Text style={styles.survivalText}>⚠️ GRAPHICS DISABLED</Text>
              <Text style={styles.survivalText}>SURVIVAL MODE ACTIVE</Text>
              <Text style={styles.survivalSubText}>CORE EKF RUNNING...</Text>
          </View>
      );
  }

  const renderList = satellites
    .sort((a, b) => (b.usedInFix ? 1 : 0) - (a.usedInFix ? 1 : 0) || (b.displaySnr || b.snr) - (a.displaySnr || a.snr))
    .slice(0, limitCount);

  const getR = (el: number) => radius * (1 - el / 90);
  const isSimple = complexity === 'MINIMAL';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SKYPLOT {heading ? `(HEAD: ${heading.toFixed(0)}°)` : '(NORTH UP)'}</Text>
      <View style={styles.mapContainer}>
        <Svg height={size} width={size}>
          <G origin={`${center}, ${center}`} rotation={isNaN(heading) ? 0 : -heading}>
             <SkyplotBackground size={size} simple={isSimple} />
             {renderList.map((sat, i) => {
                const theta = (sat.azimuth - 90) * (Math.PI / 180);
                const r = getR(sat.elevation);
                let x = center + r * Math.cos(theta);
                let y = center + r * Math.sin(theta);
                
                if (isNaN(x) || isNaN(y) || !isFinite(x) || !isFinite(y)) {
                    x = center;
                    y = center;
                }

                const color = CONSTELLATION_COLORS[sat.constellation] || '#fff';
                const isLocked = sat.usedInFix;
                
                if (complexity === 'MINIMAL') {
                    return <Circle key={i} cx={x} cy={y} r="3" fill={isLocked ? color : '#334155'} />;
                }

                const strokeColor = isLocked ? '#fff' : color;
                
                return (
                  <G key={`${sat.constellation}-${sat.prn}`}>
                    {isLocked && complexity === 'FULL' && <Circle cx={x} cy={y} r="10" fill={color} opacity="0.15" />}
                    
                    <Circle 
                        cx={x} cy={y} 
                        r={isLocked ? "5" : "3.5"} 
                        fill={isLocked ? color : '#1e293b'} 
                        stroke={strokeColor} 
                        strokeWidth={isLocked ? 1.5 : 1} 
                    />
                    
                    {(complexity === 'FULL' || (complexity === 'REDUCED' && isLocked)) && (
                        <G x={x} y={y} origin={`${x}, ${y}`} rotation={heading}>
                            <SvgText 
                                x={x + 7} y={y + 4} 
                                fill={isLocked ? "#e2e8f0" : "#64748b"} 
                                fontSize={isLocked ? "10" : "8"} 
                                fontWeight="bold"
                            >
                            {sat.constellation === 'GPS' ? '' : sat.constellation[0]}{sat.prn}
                            </SvgText>
                        </G>
                    )}
                  </G>
                );
             })}
          </G>
          <Path 
            d={`M${center} ${center-15} L${center-4} ${center-5} L${center+4} ${center-5} Z`} 
            fill="#ef4444" 
          />
          {complexity === 'FULL' && (
              <>
                <Line x1={center} y1={center-5} x2={center} y2={center+5} stroke="#06b6d4" strokeWidth="2" />
                <Line x1={center-5} y1={center} x2={center+5} y2={center} stroke="#06b6d4" strokeWidth="2" />
              </>
          )}
        </Svg>
      </View>
    </View>
  );
}, (prev, next) => {
    // MIL-SPEC RENDER GUARD:
    // Only re-render if the timestamp changes OR LOD changes.
    // The App.tsx now controls the `renderTrigger` exactly when data is ready.
    // We also ignore heading changes smaller than 2 degrees to prevent jitter-rendering.
    const headingChange = Math.abs(prev.heading - next.heading);
    const significantHeading = headingChange > 2;
    
    // If trigger hasn't fired and heading is stable, DO NOT RENDER.
    if (prev.renderTrigger === next.renderTrigger && !significantHeading && prev.complexity === next.complexity) {
        return true; 
    }
    return false;
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  title: {
    color: '#06b6d4',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 12,
    letterSpacing: 1,
  },
  mapContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  survivalText: {
      color: '#ef4444',
      fontWeight: 'bold',
      fontSize: 16,
      marginBottom: 8
  },
  survivalSubText: {
      color: '#94a3b8',
      fontSize: 10
  }
});

export default SatelliteMap;
