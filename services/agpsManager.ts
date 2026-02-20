import { AGPS_SERVERS } from '../constants';
import { EphemerisData, Constellation, LogEntry } from '../types';

// Mock binary data generation (simulating SUPL packet parsing)
const generateMockEphemeris = (server: string, count: number): EphemerisData[] => {
    const data: EphemerisData[] = [];
    const constellations = [Constellation.GPS, Constellation.GLONASS, Constellation.GALILEO, Constellation.BEIDOU];
    
    for (let i = 0; i < count; i++) {
        const prn = (i % 32) + 1;
        const constellation = constellations[Math.floor(Math.random() * constellations.length)];
        
        data.push({
            prn,
            constellation,
            validityTime: Date.now() + (4 * 60 * 60 * 1000), // Valid for 4 hours
            health: 90 + Math.random() * 10,
            orbitParams: {
                inclination: 55 + (Math.random() * 10),
                raan: Math.random() * 360,
                meanAnomaly: Math.random() * 360,
                eccentricity: Math.random() * 0.02
            },
            sourceServer: server
        });
    }
    return data;
};

export const downloadAndMergeAGPS = async (
    onLog: (module: string, message: string, level: LogEntry['level']) => void
): Promise<EphemerisData[]> => {
    onLog('A-GPS', 'Initializing Multi-Source Download Protocol...', 'info');
    
    // 1. Fetch from multiple sources in parallel
    const fetchPromises = AGPS_SERVERS.map(async (server) => {
        // Simulate network latency variance
        const latency = 300 + Math.random() * 1500;
        await new Promise(resolve => setTimeout(resolve, latency));
        
        // Simulate packet loss or connection failure
        if (Math.random() > 0.9) {
            onLog('A-GPS', `Connection timed out: ${server.host}`, 'warn');
            return [];
        }

        const count = 15 + Math.floor(Math.random() * 20);
        onLog('A-GPS', `Fetched ${count}kb Ephemeris block from ${server.host}`, 'success');
        return generateMockEphemeris(server.host, count);
    });

    const results = await Promise.all(fetchPromises);
    const flatData = results.flat();

    // 2. SMART DEDUPLICATION & MERGE LOGIC
    onLog('A-GPS', `Aggregating ${flatData.length} orbital segments...`, 'info');
    
    const uniqueMap = new Map<string, EphemerisData>();
    let duplicatesRemoved = 0;
    let updatesApplied = 0;

    flatData.forEach(entry => {
        const key = `${entry.constellation}-${entry.prn}`;
        
        if (uniqueMap.has(key)) {
            const existing = uniqueMap.get(key)!;
            
            // Conflict Resolution Strategy:
            // 1. Prioritize Health (Higher is better)
            // 2. If Health equal, prioritize Validity Time (Newer is better)
            if (entry.health > existing.health) {
                uniqueMap.set(key, entry);
                updatesApplied++;
            } else if (Math.abs(entry.health - existing.health) < 1 && entry.validityTime > existing.validityTime) {
                uniqueMap.set(key, entry);
                updatesApplied++;
            }
            duplicatesRemoved++;
        } else {
            uniqueMap.set(key, entry);
        }
    });

    const mergedList = Array.from(uniqueMap.values());
    
    onLog('A-GPS', `Fusion Result: ${mergedList.length} Unique Orbits.`, 'info');
    onLog('A-GPS', `Pruned ${duplicatesRemoved} duplicates. Updated ${updatesApplied} existing records.`, 'success');
    
    return mergedList;
};