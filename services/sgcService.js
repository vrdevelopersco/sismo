// services/sgcService.js
// Ingestor oficial del Servicio Geológico Colombiano (SGC)

import axios from 'axios';

export class SGCService {
  constructor(correlator, onNewEvent, onUpdatedEvent) {
    this.correlator = correlator;
    this.onNewEvent = onNewEvent;
    this.onUpdatedEvent = onUpdatedEvent;
    this.pollInterval = 30 * 1000; // Cada 30 segundos por defecto
    this.timer = null;
    this.isPolling = false;
    this.lastSuccessTime = null;
    this.status = 'initializing';
    this.API_URL = 'https://apicatalogador.sgc.gov.co/api/events/search/';
  }

  setIntervalMs(ms) {
    this.pollInterval = Math.max(5000, Number(ms) || 30000);
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = setInterval(() => this.fetchLatest(), this.pollInterval);
    }
    console.log(`⏱️ [SGC Service] Nuevo intervalo de polling: ${this.pollInterval / 1000}s`);
  }

  async start() {
    this.status = 'running';
    console.log('📡 [SGC Service] Iniciando ingestor de Servicio Geológico Colombiano...');
    await this.fetchLatest();
    this.timer = setInterval(() => this.fetchLatest(), this.pollInterval);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.status = 'stopped';
  }

  async fetchLatest() {
    if (this.isPolling) return;
    this.isPolling = true;

    try {
      const response = await axios.post(
        this.API_URL,
        {},
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/plain, */*'
          },
          timeout: 15000
        }
      );

      const data = response.data;
      const rawEvents = data?.results?.results || [];

      let newCount = 0;
      for (const item of rawEvents) {
        item.source = 'SGC';
        const result = this.correlator.ingest(item);
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
      if (newCount > 0) {
        console.log(`🇨🇴 [SGC] ${newCount} nuevos sismos procesados de Colombia.`);
      }
    } catch (err) {
      this.status = 'error';
      console.error(`⚠️ [SGC Service] Error consultando SGC: ${err.message}`);
    } finally {
      this.isPolling = false;
    }
  }
}
