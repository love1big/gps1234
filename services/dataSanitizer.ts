/**
 * MIL-SPEC DATA SANITIZER
 * 
 * This service acts as a firewall between the raw sensor/GNSS engine and the UI layer.
 * It recursively sanitizes objects to ensure no NaN, Infinity, or undefined values reach the renderer.
 * This prevents "White Screen of Death" crashes in React Native SVG and other sensitive components.
 */

export const sanitizeValue = (val: any, fallback: any = 0): any => {
    if (typeof val === 'number') {
        return Number.isFinite(val) ? val : fallback;
    }
    return val;
};

export const sanitizeObject = <T>(obj: T): T => {
    if (obj === null || obj === undefined) return obj;
    
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item)) as unknown as T;
    }
    
    if (typeof obj === 'object') {
        const result: any = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const val = (obj as any)[key];
                if (typeof val === 'number') {
                    result[key] = Number.isFinite(val) ? val : 0;
                } else if (typeof val === 'object') {
                    result[key] = sanitizeObject(val);
                } else {
                    result[key] = val;
                }
            }
        }
        return result as T;
    }
    
    return obj;
};

export const sanitizePosition = (pos: any): any => {
    if (!pos) return pos;
    return {
        ...pos,
        latitude: sanitizeValue(pos.latitude, 0),
        longitude: sanitizeValue(pos.longitude, 0),
        altitude: sanitizeValue(pos.altitude, 0),
        speed: sanitizeValue(pos.speed, 0),
        bearing: sanitizeValue(pos.bearing, 0),
        accuracy: sanitizeValue(pos.accuracy, 100),
        hdop: sanitizeValue(pos.hdop, 1),
        vdop: sanitizeValue(pos.vdop, 1),
        pdop: sanitizeValue(pos.pdop, 1),
    };
};
