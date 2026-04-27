const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

admin.initializeApp();
const db = admin.firestore();

// Haversine formula for deduplication
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

exports.getFuelStations = functions.https.onCall(async (data, context) => {
  // 1. Validate request
  const { lat, lng, radius = 5000 } = data;
  if (!lat || !lng) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing lat or lng');
  }

  // 2. Generate cache key (2 decimal rounding)
  const cacheLat = Math.round(lat * 100) / 100;
  const cacheLng = Math.round(lng * 100) / 100;
  const cacheKey = `grid_${cacheLat}_${cacheLng}`;
  const cacheRef = db.collection('global_stations_cache').doc(cacheKey);

  // 3. Try reading from Firestore cache
  const doc = await cacheRef.get();
  if (doc.exists) {
    const cachedData = doc.data();
    const ageMs = Date.now() - cachedData.timestamp;
    // If cache is less than 24 hours old, return it
    if (ageMs < 24 * 60 * 60 * 1000) {
      return {
        source: 'firestore_cache',
        stations: cachedData.stations
      };
    }
  }

  // 4. Cache miss or expired: Fetch from Overpass API
  const query = `[out:json][timeout:10];node["amenity"="fuel"](around:${radius},${cacheLat},${cacheLng});out body 25;`;
  const encodedQuery = encodeURIComponent(query);

  // Try endpoints sequentially for reliability
  const endpoints = [
    `https://overpass-api.de/api/interpreter?data=${encodedQuery}`,
    `https://lz4.overpass-api.de/api/interpreter?data=${encodedQuery}`,
    `https://overpass.kumi.systems/api/interpreter?data=${encodedQuery}`
  ];

  let osmData = null;
  let lastError = null;

  for (const url of endpoints) {
    try {
      const response = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (response.ok) {
        osmData = await response.json();
        break;
      } else {
        lastError = new Error(`HTTP ${response.status}`);
      }
    } catch (e) {
      lastError = e;
    }
  }

  if (!osmData) {
    console.error("Overpass API failed:", lastError);
    // If Overpass fails but we have stale cache, return it rather than erroring out
    if (doc.exists) {
      return {
        source: 'stale_firestore_cache',
        stations: doc.data().stations
      };
    }
    throw new functions.https.HttpsError('internal', 'Unable to fetch fuel stations: ' + (lastError ? lastError.message : 'Unknown'));
  }

  // 5. Parse and deduplicate
  const elements = osmData.elements || [];
  const stationMap = new Map();

  elements.forEach((el, idx) => {
    const id = el.id || idx;

    // Deduplicate by proximity (if multiple nodes very close together are the same station)
    let isDuplicate = false;
    for (const existing of stationMap.values()) {
      const dist = haversineDistance(el.lat, el.lon, existing.lat, existing.lng);
      if (dist < 0.05) { // within 50 meters, consider duplicate
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      stationMap.set(id, {
        id: id,
        name: el.tags?.name || el.tags?.brand || 'Fuel Station',
        brand: el.tags?.brand || '',
        lat: el.lat,
        lng: el.lon,
        fuelTypes: el.tags?.['fuel:diesel'] === 'yes' ? 'Diesel' :
          el.tags?.['fuel:octane_95'] === 'yes' ? 'Petrol 95' : 'Petrol',
      });
    }
  });

  const finalStations = Array.from(stationMap.values());

  // 6. Save to Firestore
  const newCacheData = {
    stations: finalStations,
    timestamp: Date.now(),
    center: { lat: cacheLat, lng: cacheLng },
    radius: radius,
    version: 1
  };

  await cacheRef.set(newCacheData);

  return {
    source: 'overpass_api',
    stations: finalStations
  };
});
