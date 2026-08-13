// services/emscService.js
// Ingestor oficial de EMSC (Euro-Mediterranean Seismological Centre / SeismicPortal)

import axios from 'axios';
import WebSocket from 'ws';

export class EMSCService {
  constructor(correlator, onNewEvent, onUpdatedEvent) {
    this.correlator = correlator;
    this.onNewEvent = onNewEvent;
    this.onUpdatedEvent = onUpdatedEvent;
    this.pollInterval = 40 * 1000; // Polling REST cada 40s
    this.timer = null;
    this.ws = null;
    this.wsReconnectTimer = null;
    this.lastSuccessTime = null;
    this.status = 'initializing';
    this.REST_URL = 'https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=100';
    this.WS_URL = 'wss://www.seismicportal.eu/standing_order';
  }

  async start() {
    this.status = 'running';
    console.log('📡 [EMSC Service] Iniciando ingestor de EMSC / SeismicPortal...');
    // Carga inicial vía REST
    await this.fetchRest();
    this.timer = setInterval(() => this.fetchRest(), this.pollInterval);

    // Conectar WebSocket en vivo
    this.connectWebSocket();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.wsReconnectTimer) clearTimeout(this.wsReconnectTimer);
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {}
    }
    this.status = 'stopped';
  }

  async fetchRest() {
    try {
      const response = await axios.get(this.REST_URL, {
        headers: { 'User-Agent': 'DeteccionSismo/1.0' },
        timeout: 15000
      });

      const features = response.data?.features || [];
      let newCount = 0;

      for (const feat of features) {
        feat.source = 'EMSC';
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
      if (newCount > 0) {
        console.log(`🇪🇺 [EMSC REST] ${newCount} nuevos sismos globales.`);
      }
    } catch (err) {
      console.error(`⚠️ [EMSC Service] Error en REST: ${err.message}`);
    }
  }

  connectWebSocket() {
    try {
      this.ws = new WebSocket(this.WS_URL);

      this.ws.on('open', () => {
        console.log('⚡ [EMSC WebSocket] Conectado al flujo push en vivo.');
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg && msg.data) {
            const rawEvent = {
              source: 'EMSC',
              properties: msg.data.properties || msg.data,
              geometry: msg.data.geometry || {
                coordinates: [msg.data.properties?.lon, msg.data.properties?.lat, msg.data.properties?.depth]
              }
            };
            const result = this.correlator.ingest(rawEvent);
            if (result) {
              if (result.isNew) {
                console.log(`⚡ [EMSC WS PUSH] ¡Nuevo sismo en vivo! M${result.event.magnitude} - ${result.event.place}`);
                if (this.onNewEvent) this.onNewEvent(result.event);
              } else {
                if (this.onUpdatedEvent) this.onUpdatedEvent(result.event);
              }
            }
          }
        } catch (parseErr) {
          // Ignorar pings u otros mensajes
        }
      });

      this.ws.on('error', (err) => {
        // Fallback silencioso a REST
      });

      this.ws.on('close', () => {
        // Reintentar conexión en 30 segundos
        this.wsReconnectTimer = setTimeout(() => this.connectWebSocket(), 30000);
      });
    } catch (e) {
      this.wsReconnectTimer = setTimeout(() => this.connectWebSocket(), 30000);
    }
  }
}
