// public/js/waves.js
// Simulador de propagación de ondas sísmicas, cálculo de áreas de daño físico y tiempos de llegada (ETA)

const MAJOR_CITIES = [
  { name: 'Bogotá', lat: 4.7110, lon: -74.0721 },
  { name: 'Medellín', lat: 6.2442, lon: -75.5812 },
  { name: 'Cali', lat: 3.4516, lon: -76.5320 },
  { name: 'Bucaramanga', lat: 7.1254, lon: -73.1198 },
  { name: 'Barranquilla', lat: 10.9685, lon: -74.7813 },
  { name: 'Cúcuta', lat: 7.8939, lon: -72.5078 },
  { name: 'Pereira', lat: 4.8133, lon: -75.6961 },
  { name: 'Manizales', lat: 5.0689, lon: -75.5174 },
  { name: 'Pasto', lat: 1.2136, lon: -77.2811 },
  { name: 'Ibagué', lat: 4.4389, lon: -75.2322 },
  { name: 'Villavicencio', lat: 4.1420, lon: -73.6266 },
  { name: 'Montería', lat: 8.7479, lon: -75.8814 }
];

export class SeismicWaveSimulator {
  constructor(map) {
    this.map = map;
    this.activeEvent = null;
    this.startTime = null;
    this.animId = null;
    
    // Capas dinámicas de frentes de onda
    this.pWaveCircle = null;
    this.sWaveCircle = null;

    // Capas estáticas de zonas de daño e impacto físico
    this.damageZoneCircle = null;
    this.strongZoneCircle = null;
    this.feltZoneCircle = null;

    // Velocidades teóricas en corteza terrestre (km/s)
    this.V_P = 6.0; // Onda Primaria (P-wave)
    this.V_S = 3.5; // Onda Secundaria (S-wave)
  }

  start(event) {
    this.stop();
    this.activeEvent = event;
    this.startTime = Date.now();

    const lat = event.latitude;
    const lon = event.longitude;
    const impact = event.impact || {
      damage: { radiusKm: 0, areaKm2: 0, hasDamageRisk: false, description: 'Nulo' },
      strong: { radiusKm: Math.round(event.magnitude * 4), areaKm2: 0, description: '' },
      felt: { radiusKm: Math.round(event.magnitude * 15), areaKm2: 0, description: '' },
      pgaPercent: 1.0
    };

    // 1. Dibujar Zonas Físicas de Daño e Impacto (Círculos Georreferenciados)
    // Zona Sentida (Perceptible)
    if (impact.felt.radiusKm > 0) {
      this.feltZoneCircle = L.circle([lat, lon], {
        radius: impact.felt.radiusKm * 1000,
        color: '#eab308',
        weight: 1.5,
        dashArray: '5, 5',
        fillColor: '#eab308',
        fillOpacity: 0.05
      }).addTo(this.map);
      this.feltZoneCircle.bindTooltip(
        `<strong>Radio Perceptible (MMI ≥ II)</strong>: ${impact.felt.radiusKm} km (~${impact.felt.areaKm2.toLocaleString('es-CO')} km²)`,
        { sticky: true }
      );
    }

    // Zona de Sacudida Fuerte
    if (impact.strong.radiusKm > 0) {
      this.strongZoneCircle = L.circle([lat, lon], {
        radius: impact.strong.radiusKm * 1000,
        color: '#f97316',
        weight: 2,
        fillColor: '#f97316',
        fillOpacity: 0.12
      }).addTo(this.map);
      this.strongZoneCircle.bindTooltip(
        `<strong>Zona de Sacudida Fuerte (MMI ≥ V)</strong>: ${impact.strong.radiusKm} km (~${impact.strong.areaKm2.toLocaleString('es-CO')} km²)`,
        { sticky: true }
      );
    }

    // Zona de Daño Estructural Potencial (si existe)
    if (impact.damage.hasDamageRisk && impact.damage.radiusKm > 0) {
      this.damageZoneCircle = L.circle([lat, lon], {
        radius: impact.damage.radiusKm * 1000,
        color: '#ef4444',
        weight: 2.5,
        fillColor: '#ef4444',
        fillOpacity: 0.25
      }).addTo(this.map);
      this.damageZoneCircle.bindTooltip(
        `⚠️ <strong>Zona de Daño Estructural (MMI ≥ VII / PGA > 12%g)</strong>: ${impact.damage.radiusKm} km (~${impact.damage.areaKm2.toLocaleString('es-CO')} km²)`,
        { sticky: true }
      );
    }

    // 2. Crear frentes dinámicos de ondas expansivas P y S
    this.pWaveCircle = L.circle([lat, lon], {
      radius: 1000,
      color: '#38bdf8',
      weight: 2,
      fillColor: '#38bdf8',
      fillOpacity: 0.08,
      dashArray: '4, 4'
    }).addTo(this.map);

    this.sWaveCircle = L.circle([lat, lon], {
      radius: 500,
      color: '#ef4444',
      weight: 3,
      fillColor: '#ef4444',
      fillOpacity: 0.18
    }).addTo(this.map);

    // Centrar mapa suavemente en el evento
    if (this.map) {
      this.map.panTo([lat, lon], { animate: true, duration: 0.8 });
    }

    // Actualizar Panel UI con métricas detalladas y consenso
    this.updateUIPanel(event, impact);

    // Loop de animación
    this.animate();
  }

  stop() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.pWaveCircle) {
      this.map.removeLayer(this.pWaveCircle);
      this.pWaveCircle = null;
    }
    if (this.sWaveCircle) {
      this.map.removeLayer(this.sWaveCircle);
      this.sWaveCircle = null;
    }
    if (this.damageZoneCircle) {
      this.map.removeLayer(this.damageZoneCircle);
      this.damageZoneCircle = null;
    }
    if (this.strongZoneCircle) {
      this.map.removeLayer(this.strongZoneCircle);
      this.strongZoneCircle = null;
    }
    if (this.feltZoneCircle) {
      this.map.removeLayer(this.feltZoneCircle);
      this.feltZoneCircle = null;
    }
    this.activeEvent = null;
  }

  updateUIPanel(event, impact) {
    const panel = document.getElementById('wave-eta-panel');
    if (!panel) return;
    panel.style.display = 'block';

    const titleElem = document.getElementById('wave-epicenter-title');
    if (titleElem) {
      titleElem.innerHTML = `<strong>M ${event.magnitude.toFixed(1)}</strong> — ${event.place}`;
    }

    // 1. Consenso de Redes Sismológicas
    const consensusContainer = document.getElementById('wave-consensus-badges');
    if (consensusContainer) {
      const details = event.sourceDetails || {};
      let badgesHtml = '';

      if (details.SGC) {
        badgesHtml += `<span class="source-badge source-sgc" title="SGC Colombia">🇨🇴 SGC: ${details.SGC.magnitude} ${details.SGC.magType || 'ML'} (${details.SGC.depth}km)</span>`;
      }
      if (details.USGS) {
        badgesHtml += `<span class="source-badge source-usgs" title="USGS EE.UU.">🌐 USGS: ${details.USGS.magnitude} ${details.USGS.magType || 'M'} (${details.USGS.depth}km)</span>`;
      }
      if (details.EMSC) {
        badgesHtml += `<span class="source-badge source-emsc" title="EMSC Europa">🇪🇺 EMSC: ${details.EMSC.magnitude} ${details.EMSC.magType || 'Mw'} (${details.EMSC.depth}km)</span>`;
      }

      if (!badgesHtml) {
        badgesHtml = event.sources
          .map((s) => `<span class="source-badge source-${s.toLowerCase()}">${s}</span>`)
          .join(' ');
      }

      consensusContainer.innerHTML = badgesHtml;
    }

    // 2. Métricas Numéricas de Daño e Impacto
    const damageVal = document.getElementById('impact-damage-val');
    const strongVal = document.getElementById('impact-strong-val');
    const feltVal = document.getElementById('impact-felt-val');
    const pgaVal = document.getElementById('impact-pga-val');

    if (damageVal) {
      if (impact.damage.hasDamageRisk) {
        damageVal.innerHTML = `<span style="color:#ef4444; font-weight:800;">${impact.damage.radiusKm} km</span> <span style="font-size:0.65rem; color:#94a3b8;">(~${impact.damage.areaKm2.toLocaleString('es-CO')} km²)</span>`;
      } else {
        damageVal.innerHTML = `<span style="color:#10b981;">0 km</span> <span style="font-size:0.65rem; color:#64748b;">(Sin riesgo estructural)</span>`;
      }
    }

    if (strongVal) {
      strongVal.innerHTML = `<span style="color:#f97316; font-weight:700;">${impact.strong.radiusKm} km</span> <span style="font-size:0.65rem; color:#94a3b8;">(~${impact.strong.areaKm2.toLocaleString('es-CO')} km²)</span>`;
    }

    if (feltVal) {
      feltVal.innerHTML = `<span style="color:#eab308; font-weight:700;">${impact.felt.radiusKm} km</span> <span style="font-size:0.65rem; color:#94a3b8;">(~${impact.felt.areaKm2.toLocaleString('es-CO')} km²)</span>`;
    }

    if (pgaVal) {
      pgaVal.textContent = `${impact.pgaPercent}% g`;
    }
  }

  animate() {
    if (!this.activeEvent || !this.startTime) return;

    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    
    // Radios en metros para el frente de onda que viaja
    const pRadiusMeters = elapsedSeconds * this.V_P * 1000;
    const sRadiusMeters = elapsedSeconds * this.V_S * 1000;

    if (this.pWaveCircle) this.pWaveCircle.setRadius(pRadiusMeters);
    if (this.sWaveCircle) this.sWaveCircle.setRadius(sRadiusMeters);

    // Actualizar caja de estadísticas de propagación
    const pDistBox = document.getElementById('wave-p-dist');
    const sDistBox = document.getElementById('wave-s-dist');
    if (pDistBox) pDistBox.textContent = `${Math.round(elapsedSeconds * this.V_P)} km`;
    if (sDistBox) sDistBox.textContent = `${Math.round(elapsedSeconds * this.V_S)} km`;

    // Actualizar tabla de tiempos de llegada (ETA)
    this.updateETATable(elapsedSeconds);

    // Detener después de 240 segundos
    if (elapsedSeconds < 240) {
      this.animId = requestAnimationFrame(() => this.animate());
    }
  }

  updateETATable(elapsedSeconds) {
    const tbody = document.getElementById('wave-cities-tbody');
    if (!tbody || !this.activeEvent) return;

    const evLat = this.activeEvent.latitude;
    const evLon = this.activeEvent.longitude;

    // Calcular distancias a ciudades
    const sorted = MAJOR_CITIES.map(c => {
      const dist = this.haversine(evLat, evLon, c.lat, c.lon);
      const etaP = dist / this.V_P - elapsedSeconds;
      const etaS = dist / this.V_S - elapsedSeconds;
      return { ...c, dist: Math.round(dist), etaP, etaS };
    }).sort((a, b) => a.dist - b.dist).slice(0, 5);

    let html = '';
    for (const c of sorted) {
      let etaText = '';
      if (c.etaS <= 0) {
        etaText = `<span class="wave-arrived">Arribó (hace ${Math.abs(Math.round(c.etaS))}s)</span>`;
      } else {
        etaText = `<span class="wave-approaching">~${Math.round(c.etaS)}s</span>`;
      }

      html += `
        <tr>
          <td><strong>${c.name}</strong></td>
          <td style="color:#94a3b8">${c.dist} km</td>
          <td>${etaText}</td>
        </tr>
      `;
    }

    tbody.innerHTML = html;
  }

  haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }
}
