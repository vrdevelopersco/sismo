# 🌍 DETECCION-SISMO — Detector y Monitor Sísmico en Vivo

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-green.svg)
![SQLite](https://img.shields.io/badge/sqlite-native-003B57.svg)
![Leaflet](https://img.shields.io/badge/leaflet-1.9.4-199900.svg)
![Socket.io](https://img.shields.io/badge/socket.io-4.8.1-black.svg)
![License](https://img.shields.io/badge/license-MIT-purple.svg)

**Plataforma de detección, correlación espaciotemporal y visualización sísmica en tiempo real con modelado de ondas P/S y persistencia continua 24/7.**

[Características](#-características-principales) • [Arquitectura](#-arquitectura) • [Instalación](#-instalación-rápida) • [API REST](#-api-rest) • [Documentación Técnica](DETECCION_SISMO.md)

</div>

---

## 🌟 Características Principales

* 📡 **Ingestión Multifuente en Tiempo Real**:
  * 🇨🇴 **SGC (Servicio Geológico Colombiano)**: Consulta directa de eventos locales de alta precisión.
  * 🌐 **USGS (US Geological Survey)**: Cobertura global inmediata.
  * ⚡ **EMSC (Euro-Mediterranean Seismological Centre)**: Conexión WebSocket 24/7 permanente.
* 🧠 **Motor de Correlación y Consenso**:
  * Fusión inteligente de reportes ($\Delta t \le 120\text{s}$, $\Delta d \le 90\text{km}$) con comparativa de magnitud y profundidad entre agencias.
* 📐 **Cálculo de Impacto Físico & Atenuación**:
  * Estimación de Intensidad de Mercalli Modificada (**MMI**) y Aceleración Pico del Suelo (**PGA %g**).
  * Radios y áreas de afectación: **Daño Potencial** (🔴 $MMI \ge VII$), **Sacudida Fuerte** (🟠 $MMI \ge V$) y **Radio Perceptible** (🟡).
* 🌊 **Simulación de Frentes de Onda y ETA**:
  * Propagación de **Onda P** (6.0 km/s) y **Onda S** (3.5 km/s) con tabla de tiempos de arribo por ciudades principales.
* 🗺️ **Centro de Comando Cartográfico**:
  * 4 estilos de mapa (🌙 Oscuro, 🛰️ Satélite Esri, ☀️ Claro Positron, 🗺️ OpenStreetMap).
  * Capas geológicas de **Fallas Activas de Colombia** y **Placas Tectónicas Globales**.
* 🔊 **Alertas Sonoras y Notificaciones de Escritorio**:
  * Sintetizador acústico procedural nativo (**Web Audio API**) sin archivos MP3 externos.
  * Notificaciones emergentes nativas de Windows y navegadores.
* 💾 **Base de Datos Persistente SQLite 24/7**:
  * Motor nativo `node:sqlite` con herramientas de exportación directa a **CSV** y **JSON**.
* ⚙️ **Panel de Ajustes en Vivo**:
  * Personalización de intervalos de sondeo (15s a 300s) y botón de refresco manual forzado.

---

## 🏛️ Arquitectura

```
  [SGC Colombia]        [USGS Global]        [EMSC WebSocket]
        │                     │                     │
        └──────────────┬──────┴─────────────────────┘
                       ▼
         [Motor de Correlación Sísmica]
         - Deduplicación Espaciotemporal
         - Fusión Multifuente y Consenso
         - MMI, PGA y Radios de Impacto
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
  [SQLite 24/7]             [Socket.io Server]
  `data/sismos.db`                   │
                                     ▼
                      [Frontend Web Leaflet / Canvas]
                      - Lazy Rendering por Chunks (60 FPS)
                      - GPU Canvas Acceleration
                      - Web Audio & Desktop Alerts
```

---

## 🚀 Instalación Rápida

### Requisitos
* [Node.js](https://nodejs.org/) `>= 20.0.0`
* NPM `>= 10.0.0`

### Pasos
```bash
# 1. Clonar el repositorio
git clone https://github.com/tu-usuario/deteccion-sismo.git
cd deteccion-sismo

# 2. Instalar dependencias
npm install

# 3. Iniciar el servidor
npm start
```

Abre tu navegador en [**http://localhost:3000**](http://localhost:3000).

---

## 🔌 API REST

| Método | Endpoint | Descripción |
|---|---|---|
| `GET` | `/api/sismos` | Lista de sismos filtrados (`limit`, `country`, `minMag`, `hours`) |
| `GET` | `/api/stats` | Estadísticas globales, de Colombia y estado de los ingestores |
| `GET` | `/api/db/stats` | Estadísticas del almacenamiento SQLite |
| `GET` | `/api/export/csv` | Descarga de base de datos completa en formato CSV |
| `GET` | `/api/export/json` | Descarga de base de datos completa en formato JSON |
| `POST` | `/api/refresh` | Fuerza actualización inmediata contra las 3 redes |
| `POST` | `/api/config/polling` | Modifica intervalos de polling (`sgcIntervalSec`, `usgsIntervalSec`) |

---

## 📖 Documentación Detallada

Para consultar las fórmulas sismológicas, el esquema completo de base de datos y detalles de diseño, revisa [**DETECCION_SISMO.md**](DETECCION_SISMO.md).

---

## 📄 Licencia

Distribuido bajo la Licencia **MIT**. Consulta `LICENSE` para más información.
