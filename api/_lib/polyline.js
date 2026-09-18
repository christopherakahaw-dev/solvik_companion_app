// Standard Google/OTP encoded-polyline decoder (precision 5), used to turn
// OneMap routing legGeometry.points into [lat, lng] pairs for the map.
export function decodePolyline(str, precision = 5) {
  const factor = Math.pow(10, precision);
  let index = 0, lat = 0, lng = 0;
  const coords = [];
  while (index < str.length) {
    let result = 1, shift = 0, b;
    do {
      b = str.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lat += result & 1 ? ~(result >> 1) : result >> 1;

    result = 1;
    shift = 0;
    do {
      b = str.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lng += result & 1 ? ~(result >> 1) : result >> 1;

    coords.push([lat / factor, lng / factor]);
  }
  return coords;
}
