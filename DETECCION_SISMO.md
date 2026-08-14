# 🌍 DETECCION-SISMO — Documentación Técnica & Arquitectura del Sistema

**DETECCION-SISMO** es una plataforma centralizada de telemetría, correlación espaciotemporal y alerta sísmica en tiempo real. Integra redes sismológicas nacionales (**SGC** de Colombia) e internacionales (**USGS** y **EMSC**) con cálculo físico de atenuación, modelado de áreas de daño, cálculo de ondas P/S y persistencia continua en base de datos local SQLite.

---

## 1. 🏗️ Arquitectura General del Sistema

El flujo de procesamiento de datos opera bajo un esquema desacoplado y en tiempo real:

```
                          ┌────────────────────────┐
                          │   SGC (Colombia)       │  POST /api/events/search/
                          │   Polling dinámico     │  (15s - 60s)
                          └───────────┬────────────┘
                                      │
 ┌────────────────────────┐           │           ┌────────────────────────┐
 │   USGS (Global)        │           │           │   EMSC / SeismicPortal │
 │   GeoJSON Polling      ├───────────┼───────────┤   WebSocket 24/7       │
 │   (15s - 60s)          │           │           │   + REST Fallback      │
 └───────────┬────────────┘           │           └───────────┬────────────┘
             │                        │                       │
             └────────────────┬───────┴───────────────────────┘
                              │
                              ▼
        ┌────────────────────────────────────────────────────────┐
        │            MOTOR DE CORRELACIÓN SÍSMICA                │
        │  1. Normalización y Limpieza de Esquema                │
        │  2. Clustering Espaciotemporal (Δt ≤ 120s, Δd ≤ 90km)  │
        │  3. Consenso Multifuente y Priorización Regional       │
        │  4. Cálculo de Atenuación (MMI Mercalli & PGA %g)      │
        │  5. Radios Físicos de Daño y Perceptibilidad (km/km²)  │
        └─────────────────────────────┬──────────────────────────┘
                                      │
                     ┌────────────────┴────────────────┐
                     ▼                                 ▼
        ┌────────────────────────┐        ┌────────────────────────┐
        │   SQLite Nativo 24/7   │        │   Servidor Socket.io   │
        │   (node:sqlite)        │        │   Difusión WebSocket   │
        │   `data/sismos.db`     │        │   Payloads en < 50ms   │
        └────────────────────────┘        └───────────┬────────────┘
                                                      │
                                                      ▼
        ┌────────────────────────────────────────────────────────┐
        │                  FRONTEND WEB (LEAFLET)                │
        │  - Renderizado Lazy por Chunks (requestAnimationFrame) │
        │  - Hardware Acceleration GPU (preferCanvas: true)      │
        │  - Popups Lazy construidos bajo demanda (0ms startup)  │
        │  - 4 Capas de Mapa (Oscuro, Satélite Esri, Claro, OSM) │
        │  - Capas Geológicas (Fallas activas y Placas)          │
        │  - Sintetizador de Audio Web Audio API                 │
        │  - Notificaciones Nativas de Escritorio                │
        │  - Panel de Ajustes de Polling y Refresco Manual       │
        └────────────────────────────────────────────────────────┘
```

---

## 2. 📡 Ingestión Multifuente y Protocolos

### A. Servicio Geológico Colombiano (SGC) — `sgcService.js`
* **Endpoint:** `POST https://apicatalogador.sgc.gov.co/api/events/search/`
* **Payload de Consulta:** `{ "limit": 60 }` con headers `Content-Type: application/json` y `User-Agent: Mozilla/5.0`. *(Nota técnica: La API del SGC rechaza peticiones `GET` con HTTP 405 Method Not Allowed; requiere obligatoriamente `POST` con cuerpo JSON).*
* **Campos extraídos:** `id`, `place`, `utc_time`, `local_time`, `magnitude`, `depth`, `latitude`, `longitude`, `closer_towns`, `mag_type`.
* **Frecuencia configurable:** Por defecto 30 segundos (configurable desde la UI entre 15s y 300s).

### B. United States Geological Survey (USGS) — `usgsService.js`
* **Protocolo:** HTTP Polling GeoJSON.
* **Endpoints:**
  - `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson` (Última hora, alta cadencia).
  - `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson` (Últimas 24 horas para sincronización inicial).
* **Campos extraídos:** `geometry.coordinates [lon, lat, depth]`, `properties.mag`, `properties.place`, `properties.time`, `properties.magType`, `properties.code`.

### C. Euro-Mediterranean Seismological Centre (EMSC) — `emscService.js`
* **Protocolo Primario:** WebSocket en tiempo real (`wss://www.seismicportal.eu/standing_order`). Recibe eventos push instantáneos en formato JSON `type: "SEISMO"`.
* **Protocolo Secundario (Fallback):** REST API `https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=50`.

---

## 3. 🧠 Algoritmo de Correlación y Fusión de Eventos (`correlator.js`)

Cuando ocurre un evento sísmico, las diferentes agencias detectan las ondas en sus respectivas redes de sismógrafos y publican sus lecturas de forma independiente. El motor de correlación fusiona estas lecturas en un único registro maestro enriquecido.

### Criterios de Emparejamiento (Spatio-Temporal Closeness)
Dos eventos $E_1$ y $E_2$ se consideran el **mismo sismo físico** si cumplen simultáneamente:
1. **Diferencia Temporal:**
   $$\Delta t = |t_1 - t_2| \le 120\text{ segundos}$$
2. **Distancia Epicentral (Fórmula de Haversine):**
   $$d = 2R \arcsin \left( \sqrt{\sin^2\left(\frac{\Delta \phi}{2}\right) + \cos(\phi_1)\cos(\phi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)} \right) \le 90\text{ km}$$
   *(Donde $R = 6371\text{ km}$, $\phi = \text{latitud}$, $\lambda = \text{longitud}$)*.

### Reglas de Priorización y Fusión
* Si el sismo se ubica en territorio colombiano o zona fronteriza y el **SGC** emite reporte, se priorizan las coordenadas, profundidad y ubicación del SGC por ser la red local de mayor densidad instrumental.
* Se almacenan las magnitudes y profundidades individuales de cada agencia en el diccionario `sourceDetails`, permitiendo visualizar el consenso internacional directamente en el popup del mapa.

---

## 4. 📐 Modelado Físico: Atenuación, Intensidad MMI y Áreas de Daño

Para cada evento se calculan las magnitudes físicas esperadas sobre la superficie:

### A. Aceleración Pico del Suelo (PGA %g) e Intensidad Mercalli Modificada (MMI)
Calculado mediante la relación de atenuación empírica de Joyner-Boore ajustada por profundidad hipocentral:
$$\text{Distancia Hipocentral: } R_{hypo} = \sqrt{R_{epi}^2 + h^2}$$
$$\log_{10}(\text{PGA}) = 0.45 M - \log_{10}(R_{hypo}) - 0.0025 R_{hypo} + 0.15$$
$$\text{MMI} = 3.66 \log_{10}(\text{PGA}) - 1.66 \quad (\text{Limitado entre I y XII})$$

### B. Radios y Áreas de Impacto Físico
* 🔴 **Radio de Daño Potencial ($MMI \ge VII$, $\text{PGA} \ge 12\%g$):**
  $$R_{\text{daño}} = \max\left(0, \sqrt{\max\left(0, (10^{\frac{M - 3.8}{1.3}})^2 - h^2\right)}\right)$$
  $$A_{\text{daño}} = \pi \cdot R_{\text{daño}}^2 \quad (\text{km}^2)$$
* 🟠 **Radio de Sacudida Fuerte ($MMI \ge V$, $\text{PGA} \ge 3.5\%g$):**
  $$R_{\text{fuerte}} = \max\left(0, \sqrt{\max\left(0, (10^{\frac{M - 2.9}{1.1}})^2 - h^2\right)}\right)$$
* 🟡 **Radio Perceptible ($MMI \ge II$, sentido por la población):**
  $$R_{\text{sentido}} = \max\left(0, \sqrt{\max\left(0, (10^{\frac{M - 1.8}{0.95}})^2 - h^2\right)}\right)$$

### C. Tiempos de Llegada de Ondas (ETA Ciudades)
Para cada ciudad principal se calcula la distancia ortodrómica y el tiempo estimado de arribo:
* **Onda Primaria (P-wave, compresional):** $V_P = 6.0\text{ km/s}$
* **Onda Secundaria (S-wave, cizalla / destructiva):** $V_S = 3.5\text{ km/s}$
$$\text{ETA}_{\text{Onda S}} = \frac{R_{hypo}}{V_S} - \Delta t_{\text{transcurrido}}$$

---

## 5. 💾 Persistencia Nativa en SQLite (`data/sismos.db`)

El sistema utiliza el nuevo módulo nativo `node:sqlite` de Node.js (sin dependencias binarias externas):

### Esquema de la Tabla `sismos`:
```sql
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

CREATE INDEX IF NOT EXISTS idx_sismos_utc_time ON sismos(utc_time);
CREATE INDEX IF NOT EXISTS idx_sismos_magnitude ON sismos(magnitude);
CREATE INDEX IF NOT EXISTS idx_sismos_colombia ON sismos(is_colombia);
```

* **Operación Upsert:** Las actualizaciones de magnitud o inclusión de nuevas fuentes aplican `ON CONFLICT(id) DO UPDATE`.
* **Caché en Memoria de Estadísticas:** `getDbStats()` almacena en RAM los conteos de registros durante 5 segundos para evitar lecturas continuas a disco.
* **Endpoints de Exportación:**
  - `GET /api/export/csv`: Exporta el histórico completo en CSV compatible con Excel y QGIS.
  - `GET /api/export/json`: Exporta el dataset completo en JSON estándar.

---

## 6. 🎨 Arquitectura Frontend y Optimizaciones de Rendimiento

Para garantizar 60 FPS estables y cero retrasos visuales con cientos de eventos simultáneos:

1. **Punto de Entrada ES Module Seguro:**
   * Se evalúa `document.readyState`. Si el documento ya fue procesado, se instancia la aplicación de inmediato sin depender de `DOMContentLoaded`.
2. **Prioridad Absoluta a la Interfaz (`setupUIListeners` primero):**
   * Todos los controles interactivos (**`⚙️ Ajustes`**, **`Estilo de Mapa`**, **`🔄 Actualizar`**, **`🔊 Sonido`**, **`🔔 Notificaciones`**) se conectan en la primera línea de ejecución.
3. **Renderizado Lazy por Chunks (`requestAnimationFrame`):**
   * Los marcadores se dibujan en lotes de 40 en 40 sincronizados con la tasa de refresco del monitor, eliminando los bloqueos del hilo principal.
4. **Popups 100% Lazy:**
   * `marker.bindPopup(() => this.createPopupContent(ev))` genera el HTML del popup **únicamente cuando el usuario hace clic**, evitando instanciar 400 objetos de popup en el arranque.
5. **Aceleración por GPU en Leaflet:**
   * Mapa inicializado con `preferCanvas: true` para renderizar marcadores circulares directamente sobre HTML5 Canvas.
6. **Delegación de Eventos en el Feed Lateral:**
   * Un único listener en el contenedor padre gestiona los clics de toda la lista de actividad reciente.
7. **Persistencia de Preferencias en `localStorage`:**
   * El estilo de mapa seleccionado (Oscuro, Satélite, Claro, Calles), el estado del audio y los intervalos de sondeo se preservan entre recargas.
8. **Arquitectura PWA y Liquid Glass Navigation Bar (Móvil):**
   * **Manifiesto y Service Worker:** `manifest.json` y `sw.js` para instalación como app nativa independiente (*standalone*), caché offline *stale-while-revalidate* y soporte de Web Push.
   * **Liquid Glass Navigation Bar:** Barra de navegación flotante con *backdrop-filter: blur(28px) saturate(190%)*, píldora indicadora activa deslizante con aceleración *spring cubic-bezier*, reflejos especulares de cristal y respuesta háptica táctil (`navigator.vibrate`).
   * **Bottom Sheets Modales:** Navegación en móvil optimizada con hojas inferiores deslizables para Feed, Ondas/ETA, Métricas 24h y Ajustes, manteniendo el mapa en pantalla completa debajo.

---

## 7. 🔌 Resumen de Endpoints API REST

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/api/sismos` | Lista de sismos filtrados (`limit`, `country`, `minMag`, `hours`, `source`) |
| `GET` | `/api/stats` | Métricas globales, Colombia 24h, evento más fuerte y estado de servicios |
| `GET` | `/api/db/stats` | Estadísticas del archivo SQLite local (`data/sismos.db`) |
| `GET` | `/api/export/csv` | Descarga de base de datos en archivo `.csv` |
| `GET` | `/api/export/json` | Descarga de base de datos en archivo `.json` |
| `GET` | `/api/plates` | GeoJSON con las placas tectónicas globales |
| `GET` | `/api/faults` | GeoJSON con las fallas geológicas activas de Colombia |
| `POST` | `/api/refresh` | Fuerza sincronización inmediata manual contra SGC, USGS y EMSC |
| `POST` | `/api/config/polling` | Ajusta los intervalos de consulta de SGC y USGS dinámicamente |

---

## 8. 🚀 Instrucciones de Despliegue Local

```bash
# 1. Clonar el repositorio
git clone <url-del-repositorio>
cd sismo

# 2. Instalar dependencias
npm install

# 3. Iniciar el servidor en vivo
npm start

# 4. Abrir en el navegador
http://localhost:3000
```
