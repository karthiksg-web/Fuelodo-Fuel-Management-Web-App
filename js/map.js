// ============================================
// FuelOdo - Nearby Fuel Stations Map Module
// ============================================
// Modules:
//   1. MapCore       → Map initialization & controls
//   2. MapLocation   → User geolocation + manual search
//   3. MapAPI        → Overpass API fetch
//   4. MapMarkers    → Station markers & clustering
//   5. MapUI         → Top card & floating UI
//   6. MapSearch     → Manual location search (Nominatim)
// ============================================

const FuelMap = (function () {
  'use strict';

  // ── State ──
  const state = {
    map: null,
    userLatLng: null,
    userMarker: null,
    markerCluster: null,
    radiusCircle: null,
    stations: [],
    stationMarkers: new Map(), // id → marker
    activeChipId: null,
    searchRadius: 5000, // meters
    fetchTimeout: null,
    searchDebounce: null,
    isInitialized: false,
    isLoading: false,
    controlsReady: false,
  };

  // ── Constants ──
  const DEBOUNCE_MS = 800;
  const SEARCH_DEBOUNCE_MS = 400;
  const MAX_STATIONS = 15;
  const BASE_FUEL_PRICE = 102.85; // Current average for Petrol
  const PRICE_VARIANCE = 2.50;    // Max +/- variance
  const DEFAULT_ZOOM = 14;
  const CLUSTER_ZOOM = 16;
  const DEFAULT_LOCATION = { lat: 15.3647, lng: 75.1240, name: 'Dharwad, India' }; // Fallback

  // ============================================
  // MODULE 1: MapCore — Init & Controls
  // ============================================
  const MapCore = {
    /**
     * Initialize Leaflet map
     */
    init() {
      const container = document.getElementById('fuelMap');
      if (!container || state.isInitialized) return;

      // Set a temporary view so Leaflet doesn't throw errors
      state.map = L.map('fuelMap', {
        zoomControl: false,  // We use custom zoom buttons
        attributionControl: true,
        preferCanvas: true,
        center: [DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng],
        zoom: DEFAULT_ZOOM,
      });

      // Tile layer — CartoDB tiles work from file:// protocol (no referer check)
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const tileStyle = isDark ? 'dark_all' : 'light_all';
      state.tileLayer = L.tileLayer(
        `https://{s}.basemaps.cartocdn.com/${tileStyle}/{z}/{x}/{y}{r}.png`, {
        attribution: '&copy; <a href="https://openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
      }).addTo(state.map);

      // Marker cluster group
      state.markerCluster = L.markerClusterGroup({
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,
        iconCreateFunction: function (cluster) {
          const count = cluster.getChildCount();
          let sizeClass = 'small';
          if (count >= 10) sizeClass = 'large';
          else if (count >= 5) sizeClass = 'medium';
          return L.divIcon({
            html: `<div>${count}</div>`,
            className: `marker-cluster marker-cluster-${sizeClass}`,
            iconSize: L.point(46, 46),
          });
        },
      });
      state.map.addLayer(state.markerCluster);

      // Re-fetch on move (debounced)
      state.map.on('moveend', () => {
        if (state.userLatLng && !state.isLoading) {
          clearTimeout(state.fetchTimeout);
          state.fetchTimeout = setTimeout(() => {
            const center = state.map.getCenter();
            MapAPI.fetchStations(center.lat, center.lng);
          }, DEBOUNCE_MS);
        }
      });

      // Tap/Click to drop pin and search that area
      state.map.on('click', (e) => {
        const { lat, lng } = e.latlng;
        
        // Update state and place pin
        state.userLatLng = [lat, lng];
        MapLocation.placeUserMarker(lat, lng);
        
        // Clear search input if there is any
        const searchInput = document.getElementById('mapSearchInput');
        if (searchInput) searchInput.value = '';
        
        // Pan to location and fetch immediately for snappier UX
        MapCore.flyTo(lat, lng, state.map.getZoom());
        MapUI.showLoading('Searching area...', 'Finding nearby stations');
        
        clearTimeout(state.fetchTimeout); // Cancel any pending moveend fetch
        MapAPI.fetchStations(lat, lng);
      });

      state.isInitialized = true;

      // Leaflet reads container size at init time, but the container may not
      // have been painted yet (SPA page transition). Wait for the next paint.
      requestAnimationFrame(() => {
        if (state.map) state.map.invalidateSize();
      });
    },

    /**
     * Center map on coordinates
     */
    flyTo(lat, lng, zoom) {
      if (!state.map) return;
      state.map.flyTo([lat, lng], zoom || DEFAULT_ZOOM, {
        duration: 1.2,
        easeLinearity: 0.25,
      });
    },

    /**
     * Set view instantly (no animation)
     */
    setView(lat, lng, zoom) {
      if (!state.map) return;
      state.map.setView([lat, lng], zoom || DEFAULT_ZOOM);
    },

    /**
     * Invalidate map size (for when container is resized)
     */
    refresh() {
      if (state.map) {
        // Call invalidateSize with a short delay to let CSS transitions settle,
        // then again at a longer delay as a safety net for SPA page transitions
        setTimeout(() => state.map.invalidateSize(), 100);
        setTimeout(() => state.map.invalidateSize(), 400);
      }
    },
  };

  // ============================================
  // MODULE 2: MapLocation — User Geolocation
  // ============================================
  const MapLocation = {
    /**
     * Get user's current position via browser Geolocation API
     * Returns [lat, lng] or null if fails
     */
    async getUserLocation() {
      return new Promise((resolve) => {
        if (!navigator.geolocation) {
          console.warn('Geolocation not supported');
          resolve(null);
          return;
        }

        // file:// protocol often blocks geolocation
        const isFileProtocol = window.location.protocol === 'file:';

        navigator.geolocation.getCurrentPosition(
          (position) => {
            const { latitude, longitude } = position.coords;
            state.userLatLng = [latitude, longitude];
            resolve([latitude, longitude]);
          },
          (error) => {
            console.warn('Geolocation error:', error.message);
            resolve(null); // Don't reject — we'll show the search instead
          },
          {
            enableHighAccuracy: !isFileProtocol, // lower accuracy on file:// for speed
            timeout: isFileProtocol ? 5000 : 12000,
            maximumAge: 60000,
          }
        );
      });
    },

    /**
     * Place a pulsing blue dot at user's position
     */
    placeUserMarker(lat, lng) {
      if (state.userMarker) {
        state.map.removeLayer(state.userMarker);
      }

      const icon = L.divIcon({
        className: 'user-location-marker',
        html: `
          <div class="user-location-pulse"></div>
          <div class="user-location-dot"></div>
        `,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });

      state.userMarker = L.marker([lat, lng], {
        icon: icon,
        zIndexOffset: 1000,
        interactive: false,
      }).addTo(state.map);

      // Radius circle
      if (state.radiusCircle) state.map.removeLayer(state.radiusCircle);
      state.radiusCircle = L.circle([lat, lng], {
        radius: state.searchRadius,
        color: 'rgba(99, 102, 241, 0.3)',
        fillColor: 'rgba(99, 102, 241, 0.06)',
        fillOpacity: 1,
        weight: 1.5,
        dashArray: '6, 6',
      }).addTo(state.map);
    },
  };

  // ============================================
  // MODULE 6: MapSearch — Manual Location Search
  // ============================================
  const MapSearch = {
    /**
     * Search for a place using Nominatim (OSM Geocoding)
     */
    async searchPlace(query) {
      if (!query || query.trim().length < 2) return [];

      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`;
        const response = await fetch(url, {
          headers: { 'Accept-Language': 'en' },
        });

        if (!response.ok) return [];
        const results = await response.json();

        return results.map((r) => ({
          displayName: r.display_name,
          shortName: this._buildShortName(r),
          lat: parseFloat(r.lat),
          lng: parseFloat(r.lon),
          type: r.type,
        }));
      } catch (err) {
        console.error('Nominatim search error:', err);
        return [];
      }
    },

    /**
     * Build a concise place name from Nominatim result
     */
    _buildShortName(result) {
      const parts = [];
      const addr = result.address || {};
      if (addr.city || addr.town || addr.village) {
        parts.push(addr.city || addr.town || addr.village);
      }
      if (addr.state) parts.push(addr.state);
      if (addr.country) parts.push(addr.country);
      return parts.length > 0 ? parts.join(', ') : result.display_name.split(',').slice(0, 2).join(',');
    },

    /**
     * Apply a search result — move map, place marker, fetch stations
     */
    async applyResult(lat, lng) {
      state.userLatLng = [lat, lng];

      // Place marker & center
      MapLocation.placeUserMarker(lat, lng);
      MapCore.flyTo(lat, lng, DEFAULT_ZOOM);

      // Fetch stations
      MapUI.showLoading('Searching fuel stations...', 'Querying OpenStreetMap');
      await MapAPI.fetchStations(lat, lng);
    },
  };

  // ============================================
  // MODULE 3: MapAPI — Cached Stations Fetch
  // ============================================
  const MapAPI = {
    localCache: new Map(), // In-memory client cache

    /**
     * Fetch fuel stations using multi-layer caching
     */
    async fetchStations(lat, lng) {
      if (state.isLoading) return;
      state.isLoading = true;

      try {
        // 1. Generate grid key (1.1km resolution)
        const cacheLat = Math.round(lat * 100) / 100;
        const cacheLng = Math.round(lng * 100) / 100;
        const cacheKey = `grid_${cacheLat}_${cacheLng}`;

        let rawStations = null;

        // 2. Check local memory cache first
        if (this.localCache.has(cacheKey)) {
          console.log('[MapAPI] Using fast in-memory cache');
          rawStations = this.localCache.get(cacheKey);
        }

        // 3. Check Firestore Cache
        if (!rawStations) {
          const cacheRef = db.collection('global_stations_cache').doc(cacheKey);
          const doc = await cacheRef.get();
          
          if (doc.exists) {
            const cachedData = doc.data();
            const ageMs = Date.now() - cachedData.timestamp;
            // 24 hour TTL
            if (ageMs < 24 * 60 * 60 * 1000) {
              console.log('[MapAPI] Using Firestore cache');
              rawStations = cachedData.stations;
              this.localCache.set(cacheKey, rawStations); // Save to memory
            }
          }
        }

        // 4. Cache Miss: Fetch from Overpass API directly
        if (!rawStations) {
          console.log('[MapAPI] Cache miss. Calling Overpass API...');
          
          const query = `[out:json][timeout:10];node["amenity"="fuel"](around:${state.searchRadius},${cacheLat},${cacheLng});out body 25;`;
          const encodedQuery = encodeURIComponent(query);
          
          const endpoints = [
            `https://overpass-api.de/api/interpreter?data=${encodedQuery}`,
            `https://lz4.overpass-api.de/api/interpreter?data=${encodedQuery}`,
            `https://overpass.kumi.systems/api/interpreter?data=${encodedQuery}`
          ];

          let data = null;
          for (const url of endpoints) {
            try {
              const response = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' } });
              if (response.ok) {
                data = await response.json();
                break;
              }
            } catch (e) {
              console.warn(`[MapAPI] Endpoint failed, trying next...`);
            }
          }

          if (!data) throw new Error('All Overpass API endpoints failed');

          const elements = data.elements || [];
          const stationMap = new Map();

          // Deduplicate based on ID or extreme proximity
          elements.forEach((el, idx) => {
            const id = el.id || idx;
            stationMap.set(id, {
              id: id,
              name: el.tags?.name || el.tags?.brand || 'Fuel Station',
              brand: el.tags?.brand || '',
              lat: el.lat,
              lng: el.lon,
              fuelTypes: el.tags?.['fuel:diesel'] === 'yes' ? 'Diesel' :
                         el.tags?.['fuel:octane_95'] === 'yes' ? 'Petrol 95' : 'Petrol',
            });
          });

          rawStations = Array.from(stationMap.values());
          this.localCache.set(cacheKey, rawStations); // Save to memory

          // Save to Firestore so other users can benefit!
          try {
            await db.collection('global_stations_cache').doc(cacheKey).set({
              stations: rawStations,
              timestamp: Date.now(),
              center: { lat: cacheLat, lng: cacheLng },
              radius: state.searchRadius,
              version: 1
            });
            console.log('[MapAPI] Saved new data to Firestore cache.');
          } catch (err) {
            console.warn('[MapAPI] Failed to write to Firestore cache:', err);
          }
        }

        // 5. Process distances based on user's EXACT location
        state.stations = rawStations.map(station => ({
          ...station,
          distance: MapUtils.haversineDistance(lat, lng, station.lat, station.lng)
        }));

        // Sort by actual distance from current user position
        state.stations.sort((a, b) => a.distance - b.distance);

        // Limit
        state.stations = state.stations.slice(0, MAX_STATIONS);

        // Render
        MapMarkers.renderStations(state.stations);
        MapUI.renderStationCards(state.stations);
        MapUI.hideLoading();

      } catch (error) {
        console.error('Fuel stations fetch error:', error);
        MapUI.hideLoading();
        if (state.stations.length === 0) {
          MapUI.renderStationCards([]);
        }
        if (typeof showToast === 'function') {
          showToast('Could not fetch stations. Try again.', 'error');
        }
      } finally {
        state.isLoading = false;
      }
    },
  };

  // ============================================
  // MODULE 4: MapMarkers — Markers & Clustering
  // ============================================
  const MapMarkers = {
    /**
     * Clear all existing station markers
     */
    clearMarkers() {
      state.markerCluster.clearLayers();
      state.stationMarkers.clear();
    },

    /**
     * Create a custom fuel icon for station markers
     */
    createFuelIcon() {
      return L.divIcon({
        className: '',
        html: `
          <div class="fuel-marker-icon">
            <span class="fuel-marker-inner">⛽</span>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
        popupAnchor: [0, -42],
      });
    },

    /**
     * Create popup content for a station
     */
    createPopupContent(station) {
      const distText = station.distance < 1
        ? `${Math.round(station.distance * 1000)} m`
        : `${station.distance.toFixed(1)} km`;

      return `
        <div class="station-popup">
          ${station.brand ? `<div class="station-popup-brand">${MapUtils.escapeHtml(station.brand)}</div>` : ''}
          <div class="station-popup-name">
            <span class="popup-icon">⛽</span>
            ${MapUtils.escapeHtml(station.name)}
          </div>
          <div class="station-popup-distance">
            📍 ${distText} away
          </div>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}"
             target="_blank"
             rel="noopener noreferrer"
             class="popup-nav-btn">
            🧭 Navigate
          </a>
        </div>
      `;
    },

    /**
     * Render station markers on the map
     */
    renderStations(stations) {
      this.clearMarkers();

      const icon = this.createFuelIcon();

      stations.forEach((station) => {
        const marker = L.marker([station.lat, station.lng], { icon })
          .bindPopup(this.createPopupContent(station), {
            maxWidth: 280,
            closeButton: true,
            autoClose: true,
          });

        // Track marker
        state.stationMarkers.set(station.id, marker);
        state.markerCluster.addLayer(marker);
      });
    },

    /**
     * Zoom to a specific station and open its popup
     */
    focusStation(stationId) {
      const marker = state.stationMarkers.get(stationId);
      if (!marker) return;

      // Zoom & center
      state.map.flyTo(marker.getLatLng(), CLUSTER_ZOOM, {
        duration: 0.8,
      });

      // Open popup after fly animation
      setTimeout(() => {
        state.markerCluster.zoomToShowLayer(marker, () => {
          marker.openPopup();
        });
      }, 900);
    },
  };

  // ============================================
  // MODULE 5: MapUI — Floating Cards & UI
  // ============================================
  const MapUI = {
    /**
     * Render the search bar UI
     */
    renderSearchBar() {
      const searchContainer = document.getElementById('mapSearchContainer');
      if (!searchContainer) return;

      searchContainer.innerHTML = `
        <div class="map-search-card">
          <div class="map-search-input-wrap">
            <span class="map-search-icon">🔍</span>
            <input type="text" 
                   id="mapSearchInput" 
                   class="map-search-input"
                   placeholder="Search city, area, or place..." 
                   autocomplete="off"
                   spellcheck="false" />
            <button class="map-search-gps-btn" id="mapGpsBtn" title="Use my GPS location">
              <span class="gps-icon">📍</span>
            </button>
          </div>
          <div class="map-search-results" id="mapSearchResults"></div>
        </div>
      `;

      this._setupSearchListeners();
    },

    /**
     * Bind search input listeners
     */
    _setupSearchListeners() {
      const input = document.getElementById('mapSearchInput');
      const resultsBox = document.getElementById('mapSearchResults');
      const gpsBtn = document.getElementById('mapGpsBtn');

      if (!input) return;

      // Live search on typing
      input.addEventListener('input', () => {
        clearTimeout(state.searchDebounce);
        const query = input.value.trim();

        if (query.length < 2) {
          resultsBox.innerHTML = '';
          resultsBox.classList.remove('visible');
          return;
        }

        state.searchDebounce = setTimeout(async () => {
          const results = await MapSearch.searchPlace(query);
          this._renderSearchResults(results, resultsBox, input);
        }, SEARCH_DEBOUNCE_MS);
      });

      // Search on Enter
      input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const query = input.value.trim();
          if (query.length < 2) return;

          resultsBox.innerHTML = '<div class="search-result-item search-loading">Searching...</div>';
          resultsBox.classList.add('visible');

          const results = await MapSearch.searchPlace(query);
          if (results.length > 0) {
            // Auto-select first result
            input.value = results[0].shortName;
            resultsBox.innerHTML = '';
            resultsBox.classList.remove('visible');
            await MapSearch.applyResult(results[0].lat, results[0].lng);
          } else {
            resultsBox.innerHTML = '<div class="search-result-item search-empty">No places found</div>';
          }
        }
      });

      // Close results on outside click
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.map-search-card')) {
          resultsBox.innerHTML = '';
          resultsBox.classList.remove('visible');
        }
      });

      // GPS button — retry geolocation
      if (gpsBtn) {
        gpsBtn.addEventListener('click', async () => {
          gpsBtn.classList.add('loading');
          gpsBtn.innerHTML = '<span class="gps-icon">⏳</span>';

          const loc = await MapLocation.getUserLocation();
          if (loc) {
            input.value = '';
            resultsBox.innerHTML = '';
            resultsBox.classList.remove('visible');
            await MapSearch.applyResult(loc[0], loc[1]);
            if (typeof showToast === 'function') showToast('GPS location found!', 'success');
          } else {
            if (typeof showToast === 'function') showToast('GPS unavailable. Use search instead.', 'error');
          }

          gpsBtn.classList.remove('loading');
          gpsBtn.innerHTML = '<span class="gps-icon">📍</span>';
        });
      }
    },

    /**
     * Render search autocomplete results
     */
    _renderSearchResults(results, container, input) {
      if (!results.length) {
        container.innerHTML = '<div class="search-result-item search-empty">No places found</div>';
        container.classList.add('visible');
        return;
      }

      container.innerHTML = results.map((r, i) => `
        <div class="search-result-item" data-idx="${i}">
          <span class="search-result-icon">📍</span>
          <div class="search-result-text">
            <div class="search-result-name">${MapUtils.escapeHtml(r.shortName)}</div>
            <div class="search-result-detail">${MapUtils.escapeHtml(r.displayName).substring(0, 80)}</div>
          </div>
        </div>
      `).join('');

      container.classList.add('visible');

      // Click on result
      container.querySelectorAll('.search-result-item[data-idx]').forEach((item) => {
        item.addEventListener('click', async () => {
          const idx = parseInt(item.dataset.idx);
          const selected = results[idx];
          input.value = selected.shortName;
          container.innerHTML = '';
          container.classList.remove('visible');
          await MapSearch.applyResult(selected.lat, selected.lng);
        });
      });
    },

    /**
     * Render the top floating station card list
     */
    renderStationCards(stations) {
      const panel = document.getElementById('mapTopPanel');
      if (!panel) return;

      if (stations.length === 0) {
        panel.innerHTML = `
          <div class="map-stations-card">
            <div class="map-card-header">
              <div class="map-card-title">
                <span class="title-icon">⛽</span> Nearby Fuel Stations
              </div>
            </div>
            <div class="map-empty-stations">
              <span class="empty-icon">🔍</span>
              <span>No fuel stations found nearby. Try searching a different location.</span>
            </div>
          </div>
        `;
        return;
      }

      const chipsHtml = stations.map((s) => {
        const distText = s.distance < 1
          ? `${Math.round(s.distance * 1000)}m`
          : `${s.distance.toFixed(1)}km`;

        const truncName = s.name.length > 22
          ? s.name.substring(0, 20) + '…'
          : s.name;

        return `
          <div class="map-station-chip" data-station-id="${s.id}" id="chip-${s.id}">
            <div class="chip-icon">⛽</div>
            <div class="chip-info">
              <div class="chip-name" title="${MapUtils.escapeHtml(s.name)}">${MapUtils.escapeHtml(truncName)}</div>
              <div class="chip-meta">
                <span class="chip-distance">${distText}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');

      panel.innerHTML = `
        <div class="map-stations-card">
          <div class="map-card-header">
            <div class="map-card-title">
              <span class="title-icon">⛽</span> Nearby Fuel Stations
            </div>
            <span class="map-card-badge">${stations.length} found</span>
          </div>
          <div class="map-stations-scroll" id="stationsScroll">
            ${chipsHtml}
          </div>
        </div>
      `;

      // Chip click → focus station
      panel.querySelectorAll('.map-station-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          const id = Number(chip.dataset.stationId);

          // Active state
          panel.querySelectorAll('.map-station-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          state.activeChipId = id;

          MapMarkers.focusStation(id);
        });
      });
    },

    /**
     * Show loading overlay
     */
    showLoading(text, subtext) {
      const container = document.getElementById('mapLoadingState');
      if (!container) return;
      container.style.display = 'flex';
      container.innerHTML = `
        <div class="map-loading-spinner"></div>
        <div class="map-loading-text">${text || 'Loading map...'}</div>
        ${subtext ? `<div class="map-loading-subtext">${subtext}</div>` : ''}
      `;
    },

    /**
     * Hide loading overlay
     */
    hideLoading() {
      const container = document.getElementById('mapLoadingState');
      if (container) container.style.display = 'none';
    },

    /**
     * Setup floating controls
     */
    setupControls() {
      if (state.controlsReady) return;

      const zoomInBtn = document.getElementById('mapZoomInBtn');
      const zoomOutBtn = document.getElementById('mapZoomOutBtn');
      const recenterBtn = document.getElementById('mapRecenterBtn');
      const refreshBtn = document.getElementById('mapRefreshBtn');

      // Zoom controls
      if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
          if (state.map) state.map.zoomIn();
        });
      }
      if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
          if (state.map) state.map.zoomOut();
        });
      }

      if (recenterBtn) {
        recenterBtn.addEventListener('click', () => {
          if (state.userLatLng) {
            MapCore.flyTo(state.userLatLng[0], state.userLatLng[1], DEFAULT_ZOOM);
          } else {
            if (typeof showToast === 'function') showToast('No location set. Use search bar.', 'info');
          }
        });
      }

      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
          if (state.userLatLng) {
            refreshBtn.style.animation = 'spin 0.6s ease-in-out';
            setTimeout(() => refreshBtn.style.animation = '', 600);
            MapAPI.fetchStations(state.userLatLng[0], state.userLatLng[1]);
          } else {
            if (typeof showToast === 'function') showToast('Search a location first.', 'info');
          }
        });
      }

      state.controlsReady = true;
    },

    /**
     * Update radius label
     */
    updateRadiusLabel() {
      const label = document.getElementById('mapRadiusLabel');
      if (label) {
        const km = (state.searchRadius / 1000).toFixed(0);
        label.innerHTML = `
          <span class="radius-dot"></span>
          Searching within ${km} km
        `;
      }
    },
  };

  // ============================================
  // UTILITIES
  // ============================================
  const MapUtils = {
    /**
     * Haversine formula — distance between two lat/lng in km
     */
    haversineDistance(lat1, lon1, lat2, lon2) {
      const R = 6371; // km
      const dLat = this.toRad(lat2 - lat1);
      const dLon = this.toRad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    },

    toRad(deg) {
      return deg * (Math.PI / 180);
    },

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
    },

    /**
     * Generate a consistent but unique price for a station
     */
    getStationPrice(id) {
      // Use the ID as a seed for a "random" but consistent price
      const seed = (id % 100) / 100; 
      const price = BASE_FUEL_PRICE + (seed * PRICE_VARIANCE * 2) - PRICE_VARIANCE;
      return `₹${price.toFixed(2)}`;
    }
  };

  // ============================================
  // PUBLIC API
  // ============================================
  return {
    /**
     * Initialize and start the map experience
     */
    async start() {
      // Init map
      MapCore.init();
      MapUI.setupControls();
      MapUI.updateRadiusLabel();
      MapUI.renderSearchBar();

      // Hide loading initially — map tiles are already visible
      MapUI.hideLoading();

      // Try GPS in the background
      MapUI.showLoading('Finding your location...', 'Trying GPS...');
      const loc = await MapLocation.getUserLocation();

      if (loc) {
        // GPS worked — center and fetch
        MapUI.showLoading('Searching fuel stations...', 'Querying OpenStreetMap');
        MapCore.flyTo(loc[0], loc[1], DEFAULT_ZOOM);
        MapLocation.placeUserMarker(loc[0], loc[1]);
        await MapAPI.fetchStations(loc[0], loc[1]);
      } else {
        // GPS failed — show the search bar prominently, use default location
        MapUI.hideLoading();
        MapCore.setView(DEFAULT_LOCATION.lat, DEFAULT_LOCATION.lng, 5); // Zoomed out to show India
        if (typeof showToast === 'function') {
          showToast('GPS unavailable. Search a city to find stations.', 'info');
        }
        // Focus the search input
        setTimeout(() => {
          const input = document.getElementById('mapSearchInput');
          if (input) input.focus();
        }, 500);
      }
    },

    /**
     * Refresh map size (call when page becomes visible)
     */
    refresh() {
      MapCore.refresh();
      if (!state.isInitialized) {
        this.start();
      }
    },

    /**
     * Check if map is initialized
     */
    isReady() {
      return state.isInitialized;
    },
  };
})();

// ============================================
// Auto-init: when map page becomes visible
// ============================================
function initMapPage() {
  // Add class for full-screen map layout
  document.body.classList.add('map-page-active');

  if (!FuelMap.isReady()) {
    FuelMap.start();
  } else {
    FuelMap.refresh();
  }
}

// Cleanup when leaving map page
function cleanupMapPage() {
  document.body.classList.remove('map-page-active');
}
