// Thin client for the LTA DataMall proxy at /api/lta. Every function throws
// on failure so callers can fall back to illustrative data — see
// src/lib/withFallback.js.

async function callLta(endpoint, params = {}) {
  const search = new URLSearchParams({ endpoint, ...params });
  const res = await fetch(`/api/lta?${search.toString()}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `LTA DataMall ${endpoint} failed`);
  return data.value ?? data;
}

export function getBusArrivals(busStopCode, serviceNo) {
  const params = { BusStopCode: busStopCode };
  if (serviceNo) params.ServiceNo = serviceNo;
  return callLta("v3/BusArrival", params);
}

export function getTrainServiceAlerts() {
  return callLta("TrainServiceAlerts");
}

export function getPlatformCrowdDensity(trainLine) {
  return callLta("PlatformCrowdDensityRealTime", { TrainLine: trainLine });
}

export function getPlatformCrowdForecast(trainLine) {
  return callLta("PlatformCrowdDensityForecast", { TrainLine: trainLine });
}
