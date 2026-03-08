
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
const SkyplotBackground = memo(({ size, simple, heading }: { size: number, simple: boolean, heading: number }) => {
    const radius = size / 2 - 10;
    const center = size / 2;
    const getR = (el: number) => radius * (1 - el / 90);
    const textRot = Number.isNaN(heading) ? 0 : heading;

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
            
            {/* Cardinal Directions */}
            <G x={center} y={center - radius - 2} origin={`${center}, ${center - radius - 2}`} rotation={textRot}>
                <SvgText fill="#64748b" fontSize="10" fontWeight="bold" textAnchor="middle">N</SvgText>
            </G>
            <G x={center} y={center + radius + 10} origin={`${center}, ${center + radius + 10}`} rotation={textRot}>
                <SvgText fill="#64748b" fontSize="10" fontWeight="bold" textAnchor="middle">S</SvgText>
            </G>
            <G x={center + radius + 4} y={center + 4} origin={`${center + radius + 4}, ${center + 4}`} rotation={textRot}>
                <SvgText fill="#64748b" fontSize="10" fontWeight="bold" textAnchor="start">E</SvgText>
            </G>
            <G x={center - radius - 4} y={center + 4} origin={`${center - radius - 4}, ${center + 4}`} rotation={textRot}>
                <SvgText fill="#64748b" fontSize="10" fontWeight="bold" textAnchor="end">W</SvgText>
            </G>
        </G>
    );
});

const getSatPrefix = (c: string) => {
    switch (c) {
        case 'GPS': return 'G';
        case 'GLONASS': return 'R';
        case 'GALILEO': return 'E';
        case 'BEIDOU': return 'B';
        case 'QZSS': return 'Q';
        case 'NAVIC': return 'I';
        case 'SBAS': return 'S';
        case 'LEO_SAT': return 'L';
        default: return c.charAt(0);
    }
};

const SatelliteMap: React.FC<Props> = memo(({ satellites, heading, limitCount = 48, complexity = 'FULL', renderTrigger }) => {
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

  // OPTIMIZATION: Memoize the sorted list to prevent re-sorting on every heading update
  const renderList = React.useMemo(() => {
      return satellites
        .filter(s => !Number.isNaN(s.azimuth) && !Number.isNaN(s.elevation) && Number.isFinite(s.azimuth) && Number.isFinite(s.elevation))
        .sort((a, b) => (b.usedInFix ? 1 : 0) - (a.usedInFix ? 1 : 0) || (b.displaySnr || b.snr) - (a.displaySnr || a.snr))
        .slice(0, limitCount);
  }, [satellites, limitCount, renderTrigger]); // Only re-sort when data actually changes

  const getR = (el: number) => radius * (1 - el / 90);
  const isSimple = complexity === 'MINIMAL';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SKYPLOT {heading ? `(HEAD: ${heading.toFixed(0)}°)` : '(NORTH UP)'}</Text>
      <View style={styles.mapContainer}>
        <Svg height={size} width={size}>
          <G origin={`${center}, ${center}`} rotation={Number.isNaN(heading) ? 0 : -heading}>
             <SkyplotBackground size={size} simple={isSimple} heading={heading} />
             {renderList.map((sat) => {
                // OPTIMIZATION: Pre-calculate coordinates
                const theta = (sat.azimuth - 90) * (Math.PI / 180);
                const r = getR(sat.elevation);
                let x = center + r * Math.cos(theta);
                let y = center + r * Math.sin(theta);
                
                // Safety clamp
                if (Number.isNaN(x) || Number.isNaN(y)) { x = center; y = center; }

                const color = CONSTELLATION_COLORS[sat.constellation] || '#fff';
                const isLocked = sat.usedInFix;
                const strokeColor = isLocked ? '#fff' : color;
                
                return (
                  <G key={`${sat.constellation}-${sat.prn}`}>
                    {/* Glow effect REMOVED for performance unless ULTRA mode (not implemented yet) */}
                    
                    <Circle 
                        cx={x} cy={y} 
                        r={isLocked ? "5" : "3.5"} 
                        fill={isLocked ? color : '#1e293b'} 
                        stroke={strokeColor} 
                        strokeWidth={isLocked ? 1.5 : 1} 
                    />
                    
                    {/* Text rendering is expensive. Only show for locked sats or if list is small */}
                    {(isLocked || renderList.length < 20) && (
                        <G x={x} y={y} origin={`${x}, ${y}`} rotation={heading}>
                            <SvgText 
                                x={x + 7} y={y + 4} 
                                fill={isLocked ? "#ffffff" : "#cbd5e1"} 
                                fontSize={isLocked ? "11" : "9"} 
                                fontWeight="bold"
                                stroke="#0f172a"
                                strokeWidth="3"
                            >
                            {getSatPrefix(sat.constellation)}{sat.prn}
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
    const headingChange = Math.abs(prev.heading - next.heading);
    const significantHeading = headingChange > 5; // Increased threshold to 5 degrees for stability
    
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
