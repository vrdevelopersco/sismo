// services/correlator.js
// Motor de correlación espacio-temporal, deduplicación y cálculo de intensidad sísmica

/**
 * Distancia Haversine en kilómetros entre dos coordenadas
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radio de la Tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calcula la Intensidad Estimada de Mercalli Modificada (MMI)
 * a partir de la magnitud y profundidad hipocentral
 */
export function calculateMMI(magnitude, depth) {
  const d = Math.max(depth || 10, 5);
  // Fórmula empírica de atenuación aproximada (Wald et al. / Atkinson & Boore)
  const hypDistance = Math.sqrt(d * d + 10 * 10);
  const rawMMI = 1.5 * magnitude - 1.2 * Math.log10(hypDistance) + 0.5;
  const clamped = Math.max(1, Math.min(10, Math.round(rawMMI * 10) / 10));

  let label = 'I - No sentido';
  let color = '#94a3b8';

  if (clamped >= 8.0) {
    label = 'VIII+ - Destructivo / Severo';
    color = '#7f1d1d';
  } else if (clamped >= 7.0) {
    label = 'VII - Muy Fuerte';
    color = '#dc2626';
  } else if (clamped >= 6.0) {
    label = 'VI - Fuerte';
    color = '#ea580c';
  } else if (clamped >= 5.0) {
    label = 'V - Moderado';
    color = '#eab308';
  } else if (clamped >= 4.0) {
    label = 'IV - Ligero';
    color = '#10b981';
  } else if (clamped >= 3.0) {
    label = 'III - Débil';
    color = '#06b6d4';
  } else if (clamped >= 2.0) {
    label = 'II - Muy Débil';
    color = '#38bdf8';
  }

  return { value: clamped, label, color };
}

/**
 * Calcula los radios físicos de impacto y áreas de daño estimado (en km y km²)
 * a partir de la magnitud y profundidad hipocentral
 */
export function calculateDamageRadii(magnitude, depth) {
  const m = Number(magnitude) || 3.0;
  const h = Math.max(Number(depth) || 10, 1);

  // 1. Radio de Daño Estructural Potencial (MMI >= VII / PGA > 12%g)
  // Requiere magnitud relevante (M >= 4.5) y profundidad no excesiva (h < 60km)
  let damageRadiusKm = 0;
  if (m >= 4.5 && h < 60) {
    const rawHypSq = Math.pow(10, 0.52 * m - 1.1);
    const epiSq = rawHypSq - h * h;
    damageRadiusKm = epiSq > 0 ? Math.round(Math.sqrt(epiSq)) : 0;
  }
  const damageAreaKm2 = Math.round(Math.PI * damageRadiusKm * damageRadiusKm);

  // 2. Radio de Sacudida Fuerte / Alarma (MMI >= V / Objetos caen / PGA > 4%g)
  let strongShakingRadiusKm = 0;
  if (m >= 3.5) {
    const rawHypSq = Math.pow(10, 0.48 * m - 0.45);
    const epiSq = rawHypSq - h * h;
    strongShakingRadiusKm = epiSq > 0 ? Math.round(Math.sqrt(epiSq)) : Math.round(Math.max(0, m * 4 - h * 0.2));
  }
  const strongShakingAreaKm2 = Math.round(Math.PI * strongShakingRadiusKm * strongShakingRadiusKm);

  // 3. Radio de Perceptibilidad Total (MMI >= II / Sentido por la población)
  const rawHypPercepSq = Math.pow(10, 0.42 * m + 0.35);
  const epiPercepSq = rawHypPercepSq - h * h;
  const feltRadiusKm = Math.max(5, epiPercepSq > 0 ? Math.round(Math.sqrt(epiPercepSq)) : Math.round(m * 15));
  const feltAreaKm2 = Math.round(Math.PI * feltRadiusKm * feltRadiusKm);

  // 4. Aceleración Pico Estimada en Epicentro (PGA %g)
  const hypDist = Math.sqrt(h * h + 10 * 10);
  const pgaG = Math.max(0.001, Math.min(1.5, Math.exp(0.85 * m - 1.15 * Math.log(hypDist) - 0.0025 * h - 1.5) / 9.81));
  const pgaPercent = (pgaG * 100).toFixed(1);

  return {
    damage: {
      radiusKm: damageRadiusKm,
      areaKm2: damageAreaKm2,
      hasDamageRisk: damageRadiusKm > 0,
      description: damageRadiusKm > 0 
        ? `${damageRadiusKm} km de radio (${damageAreaKm2.toLocaleString('es-CO')} km²)`
        : 'Nulo (Magnitud moderada o foco profundo)'
    },
    strong: {
      radiusKm: strongShakingRadiusKm,
      areaKm2: strongShakingAreaKm2,
      description: `${strongShakingRadiusKm} km de radio (${strongShakingAreaKm2.toLocaleString('es-CO')} km²)`
    },
    felt: {
      radiusKm: feltRadiusKm,
      areaKm2: feltAreaKm2,
      description: `${feltRadiusKm} km de radio (${feltAreaKm2.toLocaleString('es-CO')} km²)`
    },
    pgaPercent: Number(pgaPercent)
  };
}

/**
 * Determina la clasificación de profundidad
 */
export function getDepthCategory(depth) {
  const d = Number(depth) || 10;
  if (d < 30) {
    return { category: 'Superficial', code: 'shallow', color: '#ef4444', desc: '< 30 km' };
  } else if (d <= 70) {
    return { category: 'Intermedio', code: 'intermediate', color: '#f97316', desc: '30 - 70 km' };
  } else {
    return { category: 'Profundo', code: 'deep', color: '#10b981', desc: '> 70 km' };
  }
}

export class SeismicCorrelator {
  constructor(database = null) {
    this.database = database;
    // Mapa en memoria de sismos normalizados: ID -> Evento
    this.events = new Map();
    // Umbrales de correlación
    this.TIME_WINDOW_MS = 120 * 1000; // 120 segundos
    this.DISTANCE_KM = 90; // 90 km de radio de epicentro
    this.MAX_EVENTS_STORED = 2000;
  }

  /**
   * Procesa e ingresa un evento crudo de cualquier fuente (SGC, USGS, EMSC)
   * Retorna { isNew: boolean, event: object }
   */
  ingest(rawEvent) {
    const norm = this.normalize(rawEvent);
    if (!norm || isNaN(norm.latitude) || isNaN(norm.longitude) || isNaN(norm.magnitude)) {
      return null;
    }

    // Buscar si ya existe un evento correlacionado en la ventana espacio-temporal
    let matchedEvent = null;

    for (const [id, existing] of this.events.entries()) {
      const timeDiff = Math.abs(new Date(existing.time).getTime() - new Date(norm.time).getTime());
      if (timeDiff <= this.TIME_WINDOW_MS) {
        const dist = haversineDistance(existing.latitude, existing.longitude, norm.latitude, norm.longitude);
        if (dist <= this.DISTANCE_KM) {
          matchedEvent = existing;
          break;
        }
      }
    }

    if (matchedEvent) {
      // Actualizar y enriquecer evento existente
      const validSource = norm.source || norm.primarySource || 'USGS';
      if (!matchedEvent.sources.includes(validSource)) {
        matchedEvent.sources.push(validSource);
      }
      matchedEvent.sources = Array.from(new Set(matchedEvent.sources.filter(Boolean)));
      
      if (!matchedEvent.sourceIds) matchedEvent.sourceIds = {};
      if (!matchedEvent.sourceIds[validSource]) {
        matchedEvent.sourceIds[validSource] = norm.originalId;
      }
      if (!matchedEvent.sourceMagnitudes) matchedEvent.sourceMagnitudes = {};
      matchedEvent.sourceMagnitudes[validSource] = norm.magnitude;

      if (!matchedEvent.sourceDetails) matchedEvent.sourceDetails = {};
      matchedEvent.sourceDetails[validSource] = {
        magnitude: norm.magnitude,
        depth: norm.depth,
        magType: norm.magType,
        time: norm.time,
        id: norm.originalId
      };

      // Si la nueva fuente es SGC y el evento está en Colombia, priorizar SGC para lugar y profundidad
      if (norm.source === 'SGC') {
        matchedEvent.primarySource = 'SGC';
        matchedEvent.place = norm.place;
        matchedEvent.closerTowns = norm.closerTowns || matchedEvent.closerTowns;
        matchedEvent.depth = norm.depth;
        matchedEvent.magnitude = norm.magnitude;
        matchedEvent.latitude = norm.latitude;
        matchedEvent.longitude = norm.longitude;
      }

      matchedEvent.updatedAt = new Date().toISOString();
      matchedEvent.mmi = calculateMMI(matchedEvent.magnitude, matchedEvent.depth);
      matchedEvent.depthCategory = getDepthCategory(matchedEvent.depth);
      matchedEvent.impact = calculateDamageRadii(matchedEvent.magnitude, matchedEvent.depth);

      this.events.set(matchedEvent.id, matchedEvent);
      if (this.database) this.database.saveSismo(matchedEvent);
      return { isNew: false, event: matchedEvent };
    }

    // Es un evento nuevo
    norm.mmi = calculateMMI(norm.magnitude, norm.depth);
    norm.depthCategory = getDepthCategory(norm.depth);
    norm.impact = calculateDamageRadii(norm.magnitude, norm.depth);
    norm.sourceDetails = {
      [norm.source]: {
        magnitude: norm.magnitude,
        depth: norm.depth,
        magType: norm.magType,
        time: norm.time,
        id: norm.originalId
      }
    };
    norm.createdAt = new Date().toISOString();
    norm.updatedAt = norm.createdAt;

    this.events.set(norm.id, norm);
    if (this.database) this.database.saveSismo(norm);

    // Limpieza de memoria si supera el máximo
    if (this.events.size > this.MAX_EVENTS_STORED) {
      const oldestKey = this.events.keys().next().value;
      this.events.delete(oldestKey);
    }

    return { isNew: true, event: norm };
  }

  /**
   * Normaliza los datos provenientes de cada fuente a un esquema estándar
   */
  normalize(raw) {
    const source = raw.source;
    let id, magnitude, depth, latitude, longitude, place, time, closerTowns, magType;

    if (source === 'SGC') {
      id = 'sgc_' + (raw.id || `${raw.utc_time}_${raw.latitude}_${raw.longitude}`);
      magnitude = Number(raw.magnitude) || 0;
      depth = Number(raw.depth) || 0;
      latitude = Number(raw.latitude);
      longitude = Number(raw.longitude);
      place = raw.place || 'Colombia';
      time = new Date(raw.utc_time + 'Z').toISOString();
      closerTowns = raw.closer_towns || '';
      magType = raw.mag_type || 'ML';
    } else if (source === 'USGS') {
      const props = raw.properties || {};
      const coords = raw.geometry?.coordinates || [0, 0, 0];
      id = 'usgs_' + (raw.id || props.code);
      magnitude = Number(props.mag) || 0;
      longitude = Number(coords[0]);
      latitude = Number(coords[1]);
      depth = Number(coords[2]) || 10;
      place = props.place || 'Ubicación desconocida';
      time = new Date(props.time).toISOString();
      closerTowns = '';
      magType = props.magType || 'M';
    } else if (source === 'EMSC') {
      const props = raw.properties || raw;
      const coords = raw.geometry?.coordinates || [props.lon, props.lat, props.depth];
      id = 'emsc_' + (props.source_id || props.unid || `${props.time}_${props.lat}`);
      magnitude = Number(props.mag) || 0;
      longitude = Number(coords[0] ?? props.lon);
      latitude = Number(coords[1] ?? props.lat);
      depth = Number(coords[2] ?? props.depth) || 10;
      place = props.flynn_region || props.place || 'Global';
      time = new Date(props.time).toISOString();
      closerTowns = '';
      magType = props.magtype || 'M';
    } else if (source === 'SIMULADO') {
      id = 'sim_' + Date.now();
      magnitude = Number(raw.magnitude) || 5.0;
      depth = Number(raw.depth) || 15;
      latitude = Number(raw.latitude);
      longitude = Number(raw.longitude);
      place = raw.place || 'Sismo de Prueba Simulado';
      time = new Date().toISOString();
      closerTowns = raw.closerTowns || 'Ciudades simuladas cercanas';
      magType = 'Mw';
    } else {
      return null;
    }

    // Región estimada / País
    let region = 'Global';
    if (
      latitude >= -4.5 &&
      latitude <= 13.5 &&
      longitude >= -82.0 &&
      longitude <= -66.0
    ) {
      region = 'Colombia / Región Andina';
    } else if (latitude >= -56.0 && latitude <= 32.0 && longitude >= -120.0 && longitude <= -34.0) {
      region = 'Latinoamérica';
    }

    return {
      id,
      originalId: raw.id || id,
      source,
      sources: [source],
      primarySource: source,
      sourceIds: { [source]: raw.id || id },
      sourceMagnitudes: { [source]: magnitude },
      magnitude: Math.round(magnitude * 10) / 10,
      magType,
      depth: Math.round(depth * 10) / 10,
      latitude,
      longitude,
      place,
      region,
      closerTowns,
      time,
      isColombia: region.includes('Colombia')
    };
  }

  /**
   * Obtiene todos los eventos ordenados por fecha descendente
   */
  getAllEvents(options = {}) {
    let list = Array.from(this.events.values());

    if (options.minMag) {
      const min = Number(options.minMag);
      list = list.filter((e) => e.magnitude >= min);
    }
    if (options.maxDepth) {
      const maxD = Number(options.maxDepth);
      list = list.filter((e) => e.depth <= maxD);
    }
    if (options.country === 'colombia') {
      list = list.filter((e) => e.isColombia);
    }
    if (options.source && options.source !== 'all') {
      list = list.filter((e) => e.sources.includes(options.source.toUpperCase()));
    }
    if (options.hours) {
      const cutoff = Date.now() - Number(options.hours) * 3600 * 1000;
      list = list.filter((e) => new Date(e.time).getTime() >= cutoff);
    }

    // Ordenar de más reciente a más antiguo
    list.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    if (options.limit) {
      list = list.slice(0, Number(options.limit));
    }

    return list;
  }

  /**
   * Obtiene estadísticas agregadas en tiempo real
   */
  getStats() {
    const list = Array.from(this.events.values());
    const now = Date.now();
    const last24h = list.filter((e) => now - new Date(e.time).getTime() <= 24 * 3600 * 1000);
    const lastHour = list.filter((e) => now - new Date(e.time).getTime() <= 3600 * 1000);

    const colombia24h = last24h.filter((e) => e.isColombia);

    let maxMagEvent = null;
    let totalMag = 0;
    let totalDepth = 0;

    for (const e of last24h) {
      totalMag += e.magnitude;
      totalDepth += e.depth;
      if (!maxMagEvent || e.magnitude > maxMagEvent.magnitude) {
        maxMagEvent = e;
      }
    }

    const multiSourceCount = last24h.filter((e) => e.sources.length > 1).length;

    return {
      totalLast24h: last24h.length,
      totalLastHour: lastHour.length,
      totalColombia24h: colombia24h.length,
      multiSourceCount,
      strongest24h: maxMagEvent,
      avgMagnitude: last24h.length > 0 ? (totalMag / last24h.length).toFixed(1) : 0,
      avgDepth: last24h.length > 0 ? Math.round(totalDepth / last24h.length) : 0,
      sourcesBreakdown: {
        SGC: last24h.filter((e) => e.sources.includes('SGC')).length,
        USGS: last24h.filter((e) => e.sources.includes('USGS')).length,
        EMSC: last24h.filter((e) => e.sources.includes('EMSC')).length
      }
    };
  }
}
