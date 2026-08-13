// server.js
// Servidor central DETECCION-SISMO con Express, Socket.io, Ingestores 24/7 y SQLite Persistente

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import { SeismicDatabase } from './services/db.js';
import { SeismicCorrelator } from './services/correlator.js';
import { SGCService } from './services/sgcService.js';
import { USGSService } from './services/usgsService.js';
import { EMSCService } from './services/emscService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inicializar base de datos SQLite y correlador
const db = new SeismicDatabase();
const correlator = new SeismicCorrelator(db);

// Cargar historial previo desde SQLite a memoria
const existingDbEvents = db.getRecentEvents(500);
for (const ev of existingDbEvents) {
  correlator.events.set(ev.id, ev);
}
console.log(`📦 [SQLite] Cargados ${existingDbEvents.length} eventos históricos desde base de datos.`);

// Callbacks para eventos en tiempo real
const handleNewEvent = (event) => {
  io.emit('sismo_nuevo', event);
};

const handleUpdatedEvent = (event) => {
  io.emit('sismo_actualizado', event);
};

// Inicializar servicios de ingestión continua
const sgcService = new SGCService(correlator, handleNewEvent, handleUpdatedEvent);
const usgsService = new USGSService(correlator, handleNewEvent, handleUpdatedEvent);
const emscService = new EMSCService(correlator, handleNewEvent, handleUpdatedEvent);

// Iniciar recolección continua de datos en segundo plano
sgcService.start();
usgsService.start();
emscService.start();

// Rutas API REST
app.get('/api/sismos', (req, res) => {
  const { minMag, maxDepth, country, source, hours, limit } = req.query;
  const list = correlator.getAllEvents({ minMag, maxDepth, country, source, hours, limit });
  res.json({
    total: list.length,
    events: list
  });
});

app.get('/api/stats', (req, res) => {
  const stats = correlator.getStats();
  const dbStats = db.getDbStats();
  const serviceStatus = {
    sgc: { status: sgcService.status, lastSuccess: sgcService.lastSuccessTime },
    usgs: { status: usgsService.status, lastSuccess: usgsService.lastSuccessTime },
    emsc: { status: emscService.status, lastSuccess: emscService.lastSuccessTime }
  };
  res.json({
    ...stats,
    database: dbStats,
    services: serviceStatus
  });
});

app.get('/api/db/stats', (req, res) => {
  res.json(db.getDbStats());
});

// Descargar dataset completo en CSV
app.get('/api/export/csv', (req, res) => {
  const csv = db.exportCSV();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="sismos_recolectados.csv"');
  res.send(csv);
});

// Descargar dataset completo en JSON
app.get('/api/export/json', (req, res) => {
  const rows = db.getRecentEvents(5000);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="sismos_recolectados.json"');
  res.json(rows);
});

app.get('/api/plates', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'data', 'tectonic_plates.json');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.json({ type: 'FeatureCollection', features: [] });
  }
});

app.get('/api/faults', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'data', 'colombia_faults.json');
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.json({ type: 'FeatureCollection', features: [] });
  }
});

/**
 * Configurar dinámicamente los intervalos de polling
 */
app.post('/api/config/polling', (req, res) => {
  const { sgcIntervalSec, usgsIntervalSec } = req.body;
  if (sgcIntervalSec) sgcService.setIntervalMs(Number(sgcIntervalSec) * 1000);
  if (usgsIntervalSec) usgsService.setIntervalMs(Number(usgsIntervalSec) * 1000);
  
  res.json({
    success: true,
    sgcIntervalSec: sgcService.pollInterval / 1000,
    usgsIntervalSec: usgsService.pollIntervalFast / 1000
  });
});

/**
 * Forzar actualización inmediata manual
 */
app.post('/api/refresh', async (req, res) => {
  console.log('🔄 Refresco manual solicitado...');
  await Promise.allSettled([
    sgcService.fetchLatest(),
    usgsService.fetchFeed(usgsService.URL_HOUR, 'MANUAL_USGS'),
    emscService.fetchRest()
  ]);
  const stats = correlator.getStats();
  const dbStats = db.getDbStats();
  res.json({ success: true, stats: { ...stats, database: dbStats } });
});

// Socket.io conexiones
io.on('connection', (socket) => {
  const initialEvents = correlator.getAllEvents({ limit: 300 });
  const stats = correlator.getStats();
  const dbStats = db.getDbStats();
  socket.emit('init_data', {
    events: initialEvents,
    stats: { ...stats, database: dbStats },
    serverTime: new Date().toISOString()
  });
});

// Arrancar servidor HTTP
server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🌍 DETECCION-SISMO SERVIDOR Y RECOLECTOR EN TIEMPO REAL`);
  console.log(`📍 Acceso Web: http://localhost:${PORT}`);
  console.log(`💾 Base de Datos SQLite: data/sismos.db`);
  console.log(`======================================================\n`);
});
