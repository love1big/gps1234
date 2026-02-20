
import { Linking, Platform } from 'react-native';
import { NavAppProfile, PositionData, LogEntry } from '../types';

// --- UNIVERSAL NAVIGATION DATABASE ---
// Covers Global, Regional, Specialized, and Generic apps
const NAV_APPS: NavAppProfile[] = [
    // 1. GLOBAL GIANTS
    { 
        id: 'google_maps', name: 'Google Maps', category: 'GLOBAL',
        scheme: 'comgooglemaps://', 
        universalLink: 'https://www.google.com/maps/dir/?api=1&destination=',
        paramTemplate: '?q={lat},{lon}', 
        platform: 'BOTH'
    },
    { 
        id: 'apple_maps', name: 'Apple Maps', category: 'GLOBAL',
        scheme: 'maps://', 
        paramTemplate: '?daddr={lat},{lon}&dirflg=d', 
        platform: 'IOS'
    },
    { 
        id: 'waze', name: 'Waze', category: 'GLOBAL',
        scheme: 'waze://', 
        paramTemplate: '?ll={lat},{lon}&navigate=yes', 
        platform: 'BOTH'
    },
    { 
        id: 'here_wego', name: 'HERE WeGo', category: 'GLOBAL',
        scheme: 'here-route://', 
        paramTemplate: '{lat},{lon}', 
        platform: 'BOTH'
    },
    { 
        id: 'tomtom_go', name: 'TomTom GO', category: 'GLOBAL',
        scheme: 'tomtomhome:', 
        paramTemplate: 'geo:action=nav&lat={lat}&long={lon}', 
        platform: 'ANDROID'
    },
    { 
        id: 'maps_me', name: 'Maps.me', category: 'GLOBAL',
        scheme: 'mapsme://', 
        paramTemplate: 'route?dll={lat},{lon}&dname=Target', 
        platform: 'BOTH'
    },
    { 
        id: 'organic_maps', name: 'Organic Maps', category: 'GLOBAL',
        scheme: 'om://', 
        paramTemplate: 'build_route?dlat={lat}&dlon={lon}', 
        platform: 'BOTH'
    },
    { 
        id: 'magic_earth', name: 'Magic Earth', category: 'GLOBAL',
        scheme: 'magicearth://', 
        paramTemplate: 'dest?lat={lat}&lon={lon}', 
        platform: 'BOTH'
    },
    
    // 2. REGIONAL (ASIA / RUSSIA)
    { 
        id: 'baidu_maps', name: 'Baidu Maps', category: 'ASIA',
        scheme: 'baidumap://', 
        paramTemplate: 'map/direction?destination={lat},{lon}&coord_type=gcj02&mode=driving', 
        platform: 'BOTH'
    },
    { 
        id: 'gaode_maps', name: 'Gaode (Amap)', category: 'ASIA',
        scheme: 'androidamap://', 
        paramTemplate: 'navi?sourceApplication=OmniGNSS&lat={lat}&lon={lon}&dev=0&style=2', 
        platform: 'ANDROID'
    },
    { 
        id: 'tencent_maps', name: 'Tencent Maps', category: 'ASIA',
        scheme: 'qqmap://', 
        paramTemplate: 'map/routeplan?type=drive&to=End&tocoord={lat},{lon}', 
        platform: 'BOTH'
    },
    { 
        id: 'naver_map', name: 'Naver Map', category: 'ASIA',
        scheme: 'nmap://', 
        paramTemplate: 'route/car?dlat={lat}&dlng={lon}&dname=Dest', 
        platform: 'BOTH'
    },
    { 
        id: 'kakao_map', name: 'KakaoMap', category: 'ASIA',
        scheme: 'kakaomap://', 
        paramTemplate: 'route?ep={lat},{lon}&by=CAR', 
        platform: 'BOTH'
    },
    { 
        id: 'yandex_navi', name: 'Yandex Navigator', category: 'RUSSIA',
        scheme: 'yandexnavi://', 
        paramTemplate: 'build_route_on_map?lat_to={lat}&lon_to={lon}', 
        platform: 'BOTH'
    },
    { 
        id: 'yandex_maps', name: 'Yandex Maps', category: 'RUSSIA',
        scheme: 'yandexmaps://', 
        paramTemplate: 'build_route_on_map?lat_to={lat}&lon_to={lon}', 
        platform: 'BOTH'
    },
    { 
        id: '2gis', name: '2GIS', category: 'RUSSIA',
        scheme: 'dgis://', 
        paramTemplate: '2gis.ru/routeSearch/rsType/car/to/{lon},{lat}', 
        platform: 'BOTH'
    },

    // 3. OUTDOOR / HIKING / MARINE / AVIATION
    { 
        id: 'osmand', name: 'OsmAnd', category: 'OUTDOOR',
        scheme: 'osmand.api://', 
        paramTemplate: 'navigate?lat={lat}&lon={lon}&z=15', 
        platform: 'ANDROID'
    },
    { 
        id: 'komoot', name: 'Komoot', category: 'OUTDOOR',
        scheme: 'komoot://', 
        paramTemplate: 'tour?lat={lat}&lon={lon}', 
        platform: 'BOTH'
    },
    { 
        id: 'gaia_gps', name: 'Gaia GPS', category: 'OUTDOOR',
        scheme: 'gaiagps://', 
        paramTemplate: 'map?lat={lat}&lon={lon}', 
        platform: 'BOTH'
    },
    { 
        id: 'navionics', name: 'Navionics Boating', category: 'MARINE',
        scheme: 'navionics://', 
        paramTemplate: 'chart?lat={lat}&lon={lon}', 
        platform: 'BOTH'
    },
    { 
        id: 'foreflight', name: 'ForeFlight', category: 'AVIATION',
        scheme: 'foreflightmobile://', 
        paramTemplate: 'maps/search?q={lat},{lon}', 
        platform: 'IOS'
    },

    // 4. TRUCKING / PROFESSIONAL
    { 
        id: 'sygic_truck', name: 'Sygic Truck', category: 'TRUCK',
        scheme: 'com.sygic.truck://', 
        paramTemplate: 'coordinate|{lon}|{lat}|drive', 
        platform: 'ANDROID'
    },
    { 
        id: 'copilot', name: 'CoPilot GPS', category: 'TRUCK',
        scheme: 'copilot://', 
        paramTemplate: 'goto?lat={lat}&lon={lon}', 
        platform: 'BOTH'
    },

    // 5. GENERIC / NO-BRAND / FUTURE PROOF
    {
        id: 'generic_geo', name: 'System Default (Geo URI)', category: 'GLOBAL',
        scheme: 'geo:',
        paramTemplate: '{lat},{lon}?q={lat},{lon}(Destination)',
        platform: 'BOTH',
        isGeneric: true
    }
];

export class UniversalNavBridge {
    
    public getSupportedApps(): NavAppProfile[] {
        return NAV_APPS.filter(app => 
            app.platform === 'BOTH' || 
            (Platform.OS === 'ios' && app.platform === 'IOS') ||
            (Platform.OS === 'android' && app.platform === 'ANDROID')
        );
    }

    /**
     * Launches a specific navigation app with the target coordinates.
     */
    public async launchApp(
        appId: string, 
        targetLat: number, 
        targetLon: number, 
        onLog?: (msg: string, level: LogEntry['level']) => void
    ): Promise<boolean> {
        const app = NAV_APPS.find(a => a.id === appId);
        if (!app) {
            onLog?.(`App ID ${appId} not found in database.`, 'error');
            return false;
        }

        const params = app.paramTemplate
            .replace('{lat}', targetLat.toString())
            .replace('{lon}', targetLon.toString());

        let url = '';

        if (app.id === 'google_maps' && Platform.OS === 'android') {
            url = `https://www.google.com/maps/dir/?api=1&destination=${targetLat},${targetLon}`;
        } else if (app.isGeneric) {
            url = `geo:${targetLat},${targetLon}?q=${targetLat},${targetLon}`;
            if (Platform.OS === 'ios') {
                url = `http://maps.apple.com/?ll=${targetLat},${targetLon}&q=Destination`;
            }
        } else {
            url = `${app.scheme}${params}`;
        }

        onLog?.(`Bridging to ${app.name}...`, 'info');
        
        try {
            const supported = await Linking.canOpenURL(url);
            if (supported || app.isGeneric || url.startsWith('http')) {
                await Linking.openURL(url);
                onLog?.(`Launched ${app.name} successfully.`, 'success');
                return true;
            } else {
                onLog?.(`Cannot open ${app.name}. Is it installed?`, 'warn');
                
                if (app.id === 'google_maps' && app.universalLink) {
                    const fallbackUrl = `${app.universalLink}${targetLat},${targetLon}`;
                    await Linking.openURL(fallbackUrl);
                    return true;
                }
                return false;
            }
        } catch (err) {
            onLog?.(`Launch Error: ${err}`, 'error');
            return false;
        }
    }

    public async broadcastLocationIntent(
        pos: PositionData,
        onLog?: (msg: string, level: LogEntry['level']) => void
    ) {
        if (Platform.OS === 'android') {
            const url = `geo:${pos.latitude},${pos.longitude}?z=15`;
            try {
                await Linking.openURL(url);
                onLog?.('Broadcasted GEO Intent to System.', 'success');
            } catch (e) {
                onLog?.('No Map App registered to handle geo: protocol.', 'warn');
            }
        } else {
            const url = `http://maps.apple.com/?ll=${pos.latitude},${pos.longitude}`;
            await Linking.openURL(url);
        }
    }
}

export const NavBridge = new UniversalNavBridge();
