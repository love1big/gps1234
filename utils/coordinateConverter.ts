export function latLonToUtm(lat: number, lon: number): string {
  // A simplified UTM conversion for demonstration purposes.
  // In a real military application, use a robust library like proj4js or mgrs.
  const zone = Math.floor((lon + 180) / 6) + 1;
  let latBand = '';
  if (lat >= 84) latBand = 'Y'; // North of 84 is UPS, but handling roughly here
  else if (lat <= -80) latBand = 'C'; // South of -80 is UPS
  else {
    const bands = 'CDEFGHJKLMNPQRSTUVWX';
    const index = Math.floor((lat + 80) / 8);
    latBand = bands.charAt(index);
  }

  // Very rough approximation for Easting/Northing
  const easting = Math.floor(500000 + (lon - ((zone - 1) * 6 - 180 + 3)) * 111320 * Math.cos(lat * Math.PI / 180));
  let northing = Math.floor(lat * 111320);
  if (lat < 0) northing += 10000000;

  return `${zone}${latBand} ${easting.toString().padStart(6, '0')} ${northing.toString().padStart(7, '0')}`;
}

export function latLonToMgrs(lat: number, lon: number): string {
  // A highly simplified MGRS conversion for demonstration.
  // Real MGRS requires complex grid zone designator calculations.
  const utm = latLonToUtm(lat, lon);
  const parts = utm.split(' ');
  if (parts.length !== 3) return 'INVALID';
  
  const zoneBand = parts[0];
  const easting = parts[1];
  const northing = parts[2];

  // Mock 100km square identifier (e.g., "AB")
  const sq1 = String.fromCharCode(65 + (parseInt(easting, 10) % 24));
  const sq2 = String.fromCharCode(65 + (parseInt(northing, 10) % 20));

  // 10-digit precision (1 meter)
  const eStr = easting.slice(-5);
  const nStr = northing.slice(-5);

  return `${zoneBand} ${sq1}${sq2} ${eStr} ${nStr}`;
}
