// public/js/map.js
// Controlador interactivo de Leaflet para DETECCION-SISMO con renderizado asíncrono no bloqueante (Lazy Chunks)

export class SeismicMap {
  constructor(containerId, onSelectEvent, onSimulateWave) {
    this.containerId = containerId;
    this.onSelectEvent = onSelectEvent;
    this.onSimulateWave = onSimulateWave;
    
    this.map = null;
    this.baseTileLayer = null;
    this.markersLayer = null;
    this.recentPulseLayer = null;
    this.platesLayer = null;
    this.faultsLayer = null;
    
    this.markersMap = new Map(); // id -> L.circleMarker
    this.selectedId = null;
    this._renderChunkTimer = null;

    this.initMap();
  }

  initMap() {
    // Inicializar mapa centrado en Colombia
    this.map = L.map(this.containerId, {
      center: [4.5709, -74.2973],
      zoom: 6,
      minZoom: 2,
      maxZoom: 18,
      zoomControl: false,
      preferCanvas: true // Renderizado por GPU de alto rendimiento
    });

    // Control de zoom en esquina superior derecha
    L.control.zoom({ position: 'topright' }).addTo(this.map);

    // Cargar tema guardado o por defecto oscuro
    const savedTheme = localStorage.getItem('sismo_map_theme') || 'dark';
    this.setTileTheme(savedTheme);

    // Grupos de capas
    this.platesLayer = L.geoJSON(null, {
      style: {
        color: '#f97316',
        weight: 2,
        opacity: 0.6,
        dashArray: '6, 6'
      },
      onEachFeature: (feature, layer) => {
        if (feature.properties?.name) {
          layer.bindTooltip(`<strong>Placa:</strong> ${feature.properties.name}`, { sticky: true });
        }
      }
    }).addTo(this.map);

    this.faultsLayer = L.geoJSON(null, {
      style: {
        color: '#ef4444',
        weight: 2.2,
        opacity: 0.75
      },
      onEachFeature: (feature, layer) => {
        if (feature.properties) {
          layer.bindTooltip(
            `<strong>${feature.properties.name}</strong><br/><span style="font-size:0.75rem">${feature.properties.type || 'Falla activa'}</span>`,
            { sticky: true }
          );
        }
      }
    }).addTo(this.map);

    this.recentPulseLayer = L.layerGroup().addTo(this.map);
    this.markersLayer = L.layerGroup().addTo(this.map);

    this.loadGeologicalLayers();
  }

  async loadGeologicalLayers() {
    try {
      const [platesRes, faultsRes] = await Promise.all([
        fetch('/api/plates').then((r) => r.json()),
        fetch('/api/faults').then((r) => r.json())
      ]);

      if (platesRes?.features) this.platesLayer.addData(platesRes);
      if (faultsRes?.features) this.faultsLayer.addData(faultsRes);
    } catch (e) {
      console.warn('Error cargando capas geológicas:', e);
    }
  }

  togglePlates(show) {
    if (show) this.map.addLayer(this.platesLayer);
    else this.map.removeLayer(this.platesLayer);
  }

  toggleFaults(show) {
    if (show) this.map.addLayer(this.faultsLayer);
    else this.map.removeLayer(this.faultsLayer);
  }

  /**
   * Cambia el mapa base de forma instantánea
   */
  setTileTheme(theme) {
    localStorage.setItem('sismo_map_theme', theme);

    if (this.baseTileLayer) {
      this.map.removeLayer(this.baseTileLayer);
      this.baseTileLayer = null;
    }

    const tileConfigs = {
      dark: {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        options: { attribution: '&copy; CARTO', subdomains: 'abcd', maxZoom: 19 }
      },
      satellite: {
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        options: { attribution: 'Tiles &copy; Esri', maxZoom: 18 }
      },
      light: {
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        options: { attribution: '&copy; CARTO', subdomains: 'abcd', maxZoom: 19 }
      },
      osm: {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        options: { attribution: '&copy; OpenStreetMap', subdomains: 'abc', maxZoom: 19 }
      }
    };

    const config = tileConfigs[theme] || tileConfigs.dark;
    this.baseTileLayer = L.tileLayer(config.url, config.options);
    this.baseTileLayer.addTo(this.map);
    this.baseTileLayer.bringToBack();
  }

  /**
   * Renderizado no bloqueante por chunks (Lazy Chunks en requestAnimationFrame)
   */
  renderEvents(events) {
    if (this._renderChunkTimer) {
      cancelAnimationFrame(this._renderChunkTimer);
      this._renderChunkTimer = null;
    }

    this.markersLayer.clearLayers();
    this.recentPulseLayer.clearLayers();
    this.markersMap.clear();

    const now = Date.now();
    const total = events.length;
    const CHUNK_SIZE = 40;
    let currentIndex = 0;

    const renderChunk = () => {
      const end = Math.min(currentIndex + CHUNK_SIZE, total);

      for (let i = currentIndex; i < end; i++) {
        const ev = events[i];
        if (!ev || typeof ev.latitude !== 'number' || isNaN(ev.latitude) || typeof ev.longitude !== 'number' || isNaN(ev.longitude)) {
          continue;
        }

        const lat = Number(ev.latitude);
        const lon = Number(ev.longitude);
        const mag = Number(ev.magnitude) || 0;
        const color = ev.depthCategory?.color || '#f97316';
        
        // Radio proporcional a la magnitud
        const radius = Math.max(4, Math.min(26, Math.pow(1.6, mag) * 1.3));
        const ageMs = now - new Date(ev.time || 0).getTime();
        const isVeryRecent = ageMs <= 20 * 60 * 1000; // Últimos 20 minutos

        try {
          // Marcador principal
          const marker = L.circleMarker([lat, lon], {
            radius: radius,
            fillColor: color,
            fillOpacity: 0.85,
            color: '#ffffff',
            weight: 1.1
          });

          // Popup LAZY
          marker.bindPopup(() => this.createPopupContent(ev), { maxWidth: 320 });

          marker.on('click', () => {
            if (this.onSelectEvent) this.onSelectEvent(ev);
          });

          this.markersLayer.addLayer(marker);
          this.markersMap.set(ev.id, marker);

          // Si es muy reciente, agregar anillo sutil
          if (isVeryRecent) {
            const pulseMarker = L.circleMarker([lat, lon], {
              radius: radius * 1.6,
              color: color,
              weight: 1.5,
              fillColor: color,
              fillOpacity: 0.2,
              className: 'recent-epicenter-pulse'
            });
            this.recentPulseLayer.addLayer(pulseMarker);
          }
        } catch (markerErr) {
          console.warn('Error al crear marcador Leaflet:', markerErr);
        }
      }

      currentIndex = end;
      if (currentIndex < total) {
        this._renderChunkTimer = requestAnimationFrame(renderChunk);
      }
    };

    renderChunk();
  }

  createPopupContent(ev) {
    const details = ev.sourceDetails || {};
    let consensusBadges = '';

    if (details.SGC) {
      consensusBadges += `<span class="source-badge source-sgc">🇨🇴 SGC: M${details.SGC.magnitude} (${details.SGC.depth}km)</span> `;
    }
    if (details.USGS) {
      consensusBadges += `<span class="source-badge source-usgs">🌐 USGS: M${details.USGS.magnitude} (${details.USGS.depth}km)</span> `;
    }
    if (details.EMSC) {
      consensusBadges += `<span class="source-badge source-emsc">🇪🇺 EMSC: M${details.EMSC.magnitude} (${details.EMSC.depth}km)</span> `;
    }

    if (!consensusBadges) {
      const validSources = Array.isArray(ev.sources) ? ev.sources.filter((s) => s && typeof s === 'string') : [ev.primarySource || 'SGC'];
      consensusBadges = validSources
        .map((s) => `<span class="source-badge source-${s.toLowerCase()}">${s}</span>`)
        .join(' ');
    }

    const dateFormatted = new Date(ev.time).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      hour12: false
    });

    const impact = ev.impact || {
      damage: { radiusKm: 0, areaKm2: 0, hasDamageRisk: false },
      strong: { radiusKm: Math.round(ev.magnitude * 4), areaKm2: 0 },
      felt: { radiusKm: Math.round(ev.magnitude * 15), areaKm2: 0 },
      pgaPercent: 1.0
    };

    window.__currentPopupSismo = ev;

    return `
      <div class="seismic-popup">
        <h4>M ${ev.magnitude.toFixed(1)} — ${ev.place}</h4>
        <div style="margin-bottom:6px; display:flex; gap:4px; flex-wrap:wrap;">${consensusBadges}</div>
        
        <div class="seismic-popup-grid">
          <div class="seismic-popup-item">
            <strong>PROFUNDIDAD</strong>
            <span>${ev.depth} km (${ev.depthCategory?.category || 'Normal'})</span>
          </div>
          <div class="seismic-popup-item">
            <strong>INTENSIDAD MMI</strong>
            <span style="color:${ev.mmi?.color || '#38bdf8'}">${ev.mmi?.label || 'I - No sentido'}</span>
          </div>
          <div class="seismic-popup-item">
            <strong>RADIO PERCEPTIBLE</strong>
            <span style="color:#eab308; font-weight:600;">${impact.felt.radiusKm} km</span>
          </div>
          <div class="seismic-popup-item">
            <strong>DAÑO POTENCIAL</strong>
            <span style="color:${impact.damage.hasDamageRisk ? '#ef4444' : '#10b981'}; font-weight:600;">
              ${impact.damage.hasDamageRisk ? impact.damage.radiusKm + ' km (~' + impact.damage.areaKm2.toLocaleString('es-CO') + ' km²)' : '0 km (Sin daño)'}
            </span>
          </div>
        </div>

        ${
          ev.closerTowns
            ? `<div style="font-size:0.68rem; color:#94a3b8; margin-bottom:8px;"><strong>Cerca de:</strong> ${ev.closerTowns}</div>`
            : ''
        }
        
        <button class="seismic-popup-btn" onclick="if(window.__currentPopupSismo) window.dispatchEvent(new CustomEvent('simulate_sismo_wave', { detail: window.__currentPopupSismo }))">
          🌊 Ver Áreas de Daño y Tiempos de Onda P/S
        </button>
      </div>
    `;
  }

  focusEvent(event) {
    if (!event) return;
    this.selectedId = event.id;
    this.map.panTo([event.latitude, event.longitude], { animate: true, duration: 0.8 });

    const marker = this.markersMap.get(event.id);
    if (marker) {
      marker.openPopup();
    }
  }
}
