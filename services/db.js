// services/db.js
// Gestor de base de datos persistente SQLite nativo para DETECCION-SISMO

import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'sismos.db');

export class SeismicDatabase {
  constructor() {
    this.db = new DatabaseSync(DB_PATH);
    this.initSchema();
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sismos (
        id TEXT PRIMARY KEY,
        original_id TEXT,
        primary_source TEXT,
        sources_json TEXT,
        magnitude REAL,
        mag_type TEXT,
        depth REAL,
        depth_category TEXT,
        latitude REAL,
        longitude REAL,
        place TEXT,
        region TEXT,
        closer_towns TEXT,
        utc_time TEXT,
        mmi_value REAL,
        mmi_label TEXT,
        mmi_color TEXT,
        is_colombia INTEGER,
        created_at TEXT,
        updated_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_utc_time ON sismos (utc_time DESC);
      CREATE INDEX IF NOT EXISTS idx_magnitude ON sismos (magnitude DESC);
      CREATE INDEX IF NOT EXISTS idx_is_colombia ON sismos (is_colombia);
    `);
  }

  /**
   * Guarda o actualiza un sismo en la base de datos
   */
  saveSismo(event) {
    if (!event || !event.id) return;

    const stmt = this.db.prepare(`
      INSERT INTO sismos (
        id, original_id, primary_source, sources_json, magnitude, mag_type,
        depth, depth_category, latitude, longitude, place, region, closer_towns,
        utc_time, mmi_value, mmi_label, mmi_color, is_colombia, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?
      )
      ON CONFLICT(id) DO UPDATE SET
        primary_source = excluded.primary_source,
        sources_json = excluded.sources_json,
        magnitude = excluded.magnitude,
        depth = excluded.depth,
        place = excluded.place,
        closer_towns = excluded.closer_towns,
        mmi_value = excluded.mmi_value,
        mmi_label = excluded.mmi_label,
        mmi_color = excluded.mmi_color,
        updated_at = excluded.updated_at
    `);

    try {
      stmt.run(
        event.id,
        event.originalId || event.id,
        event.primarySource || 'DESCONOCIDO',
        JSON.stringify(event.sources || []),
        event.magnitude || 0,
        event.magType || 'M',
        event.depth || 0,
        event.depthCategory?.category || 'Normal',
        event.latitude || 0,
        event.longitude || 0,
        event.place || '',
        event.region || 'Global',
        event.closerTowns || '',
        event.time || new Date().toISOString(),
        event.mmi?.value || 1,
        event.mmi?.label || 'I - No sentido',
        event.mmi?.color || '#94a3b8',
        event.isColombia ? 1 : 0,
        event.createdAt || new Date().toISOString(),
        event.updatedAt || new Date().toISOString()
      );
    } catch (err) {
      console.error('Error guardando sismo en SQLite:', err.message);
    }
  }

  /**
   * Carga los sismos más recientes al arrancar el servidor
   */
  getRecentEvents(limit = 500) {
    try {
      const stmt = this.db.prepare(`
        SELECT * FROM sismos ORDER BY datetime(utc_time) DESC LIMIT ?
      `);
      const rows = stmt.all(limit);
      return rows.map(this.rowToEvent);
    } catch (err) {
      console.error('Error leyendo sismos:', err.message);
      return [];
    }
  }

  /**
   * Conteo y métricas de la base de datos persistente
   */
  getDbStats() {
    const now = Date.now();
    if (this._cachedStats && (now - this._cachedStatsTime < 5000)) {
      return this._cachedStats;
    }

    try {
      const totalRow = this.db.prepare('SELECT COUNT(*) as count FROM sismos').get();
      const colRow = this.db.prepare('SELECT COUNT(*) as count FROM sismos WHERE is_colombia = 1').get();
      const firstRow = this.db.prepare('SELECT MIN(utc_time) as minTime, MAX(utc_time) as maxTime FROM sismos').get();
      const fileSize = fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0;

      this._cachedStats = {
        totalRecords: totalRow.count,
        totalColombia: colRow.count,
        oldestRecord: firstRow?.minTime || null,
        newestRecord: firstRow?.maxTime || null,
        dbSizeBytes: fileSize,
        dbSizeFormatted: `${(fileSize / (1024 * 1024)).toFixed(2)} MB`,
        dbPath: DB_PATH
      };
      this._cachedStatsTime = now;
      return this._cachedStats;
    } catch (err) {
      return { totalRecords: 0, totalColombia: 0, error: err.message };
    }
  }

  /**
   * Exporta toda la base de datos a formato CSV
   */
  exportCSV() {
    const rows = this.db.prepare('SELECT * FROM sismos ORDER BY datetime(utc_time) DESC').all();
    if (!rows || rows.length === 0) return 'id,fecha_utc,magnitud,profundidad_km,lugar,latitud,longitud,fuentes\n';

    const headers = [
      'id', 'utc_time', 'magnitude', 'mag_type', 'depth_km', 'depth_category',
      'latitude', 'longitude', 'place', 'closer_towns', 'mmi_value', 'mmi_label', 'sources', 'is_colombia'
    ];

    const lines = [headers.join(',')];
    for (const r of rows) {
      const sources = (JSON.parse(r.sources_json || '[]')).join(';');
      const escape = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;

      lines.push([
        escape(r.id),
        escape(r.utc_time),
        r.magnitude,
        escape(r.mag_type),
        r.depth,
        escape(r.depth_category),
        r.latitude,
        r.longitude,
        escape(r.place),
        escape(r.closer_towns),
        r.mmi_value,
        escape(r.mmi_label),
        escape(sources),
        r.is_colombia
      ].join(','));
    }

    return lines.join('\n');
  }

  rowToEvent(row) {
    let sources = [];
    try {
      sources = JSON.parse(row.sources_json || '[]');
    } catch (e) {
      sources = [row.primary_source];
    }

    return {
      id: row.id,
      originalId: row.original_id,
      sources: sources,
      primarySource: row.primary_source,
      sourceIds: { [row.primary_source]: row.original_id },
      sourceMagnitudes: { [row.primary_source]: row.magnitude },
      magnitude: row.magnitude,
      magType: row.mag_type,
      depth: row.depth,
      latitude: row.latitude,
      longitude: row.longitude,
      place: row.place,
      region: row.region,
      closerTowns: row.closer_towns,
      time: row.utc_time,
      isColombia: Boolean(row.is_colombia),
      mmi: {
        value: row.mmi_value,
        label: row.mmi_label,
        color: row.mmi_color
      },
      depthCategory: {
        category: row.depth_category,
        color: row.depth < 30 ? '#ef4444' : row.depth <= 70 ? '#f59e0b' : '#10b981'
      }
    };
  }
}
