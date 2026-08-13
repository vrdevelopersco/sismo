// services/usgsService.js
// Ingestor oficial de USGS (United States Geological Survey)

import axios from 'axios';

export class USGSService {
  constructor(correlator, onNewEvent, onUpdatedEvent) {
    this.correlator = correlator;
    this.onNewEvent = onNewEvent;
    this.onUpdatedEvent = onUpdatedEvent;
    this.pollIntervalFast = 30 * 1000; // Cada 30 seg (última hora)
    this.pollIntervalDaily = 10 * 60 * 1000; // Cada 10 min (todo el día)
    this.timerFast = null;
    this.timerDaily = null;
    this.lastSuccessTime = null;
    this.status = 'initializing';
    this.URL_HOUR = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson';
    this.URL_DAY = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
  }

  setIntervalMs(ms) {
    this.pollIntervalFast = Math.max(5000, Number(ms) || 30000);
    if (this.timerFast) {
      clearInterval(this.timerFast);
      this.timerFast = setInterval(() => this.fetchFeed(this.URL_HOUR, 'USGS_HOUR'), this.pollIntervalFast);
    }
    console.log(`⏱️ [USGS Service] Nuevo intervalo de polling: ${this.pollIntervalFast / 1000}s`);
  }

  async start() {
    this.status = 'running';
    console.log('📡 [USGS Service] Iniciando ingestor de USGS...');
    // Carga inicial completa del día
    await this.fetchFeed(this.URL_DAY, 'USGS_DAY');
    // Polling rápido de la última hora
    this.timerFast = setInterval(() => this.fetchFeed(this.URL_HOUR, 'USGS_HOUR'), this.pollIntervalFast);
    this.timerDaily = setInterval(() => this.fetchFeed(this.URL_DAY, 'USGS_DAY'), this.pollIntervalDaily);
  }

  stop() {
    if (this.timerFast) clearInterval(this.timerFast);
    if (this.timerDaily) clearInterval(this.timerDaily);
    this.status = 'stopped';
  }

  async fetchFeed(url, label) {
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'DeteccionSismo/1.0'
        },
        timeout: 15000
      });

      const features = response.data?.features || [];
      let newCount = 0;

      for (const feat of features) {
        feat.source = 'USGS';
        const result = this.correlator.ingest(feat);
        if (result) {
          if (result.isNew) {
            newCount++;
            if (this.onNewEvent) this.onNewEvent(result.event);
          } else {
            if (this.onUpdatedEvent) this.onUpdatedEvent(result.event);
          }
        }
      }

      this.lastSuccessTime = new Date().toISOString();
      this.status = 'connected';
      if (newCount > 0 && label === 'USGS_HOUR') {
        console.log(`🌐 [USGS] ${newCount} nuevos sismos detectados.`);
      }
    } catch (err) {
      this.status = 'error';
      console.error(`⚠️ [USGS Service] Error en ${label}: ${err.message}`);
    }
  }
}
