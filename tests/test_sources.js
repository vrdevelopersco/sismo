import axios from 'axios';
import WebSocket from 'ws';

console.log('=== PROBANDO CONEXIÓN CON LAS 3 FUENTES DE DATOS SÍSMICOS ===\n');

// 1. Probar USGS
async function testUSGS() {
  console.log('1. [USGS] Consultando API GeoJSON...');
  try {
    const res = await axios.get('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson', {
      timeout: 10000
    });
    console.log(`✅ [USGS] Éxito! Sismos en la última hora: ${res.data.features?.length || 0}`);
    if (res.data.features && res.data.features.length > 0) {
      const first = res.data.features[0];
      console.log(`   Último sismo USGS: M${first.properties.mag} - ${first.properties.place} (Prof: ${first.geometry.coordinates[2]}km)`);
    }
  } catch (err) {
    console.error('❌ [USGS] Error:', err.message);
  }
}

// 2. Probar EMSC REST y WebSocket
async function testEMSC() {
  console.log('\n2. [EMSC] Consultando API REST...');
  try {
    const res = await axios.get('https://www.seismicportal.eu/fdsnws/event/1/query?format=json&limit=5', {
      timeout: 10000
    });
    console.log(`✅ [EMSC REST] Éxito! Sismos recibidos: ${res.data.features?.length || 0}`);
    if (res.data.features && res.data.features.length > 0) {
      const first = res.data.features[0];
      console.log(`   Último sismo EMSC: M${first.properties.mag} - ${first.properties.flynn_region || first.properties.place}`);
    }
  } catch (err) {
    console.error('❌ [EMSC REST] Error:', err.message);
  }

  console.log('\n2b. [EMSC] Conectando a WebSocket en vivo (wss://www.seismicportal.eu/standing_order)...');
  try {
    const ws = new WebSocket('wss://www.seismicportal.eu/standing_order');
    ws.on('open', () => {
      console.log('✅ [EMSC WebSocket] Conexión abierta exitosamente!');
      setTimeout(() => ws.close(), 3000);
    });
    ws.on('message', (data) => {
      console.log('⚡ [EMSC WebSocket] Mensaje recibido en vivo:', data.toString().substring(0, 100) + '...');
    });
    ws.on('error', (err) => {
      console.error('❌ [EMSC WebSocket] Error:', err.message);
    });
  } catch (err) {
    console.error('❌ [EMSC WebSocket] Fallo al iniciar WS:', err.message);
  }
}

// 3. Probar SGC (Servicio Geológico Colombiano)
async function testSGC() {
  console.log('\n3. [SGC] Probando fuentes del Servicio Geológico Colombiano...');
  const sgcUrls = [
    'https://sismos.sgc.gov.co/api/v1/sismos',
    'https://sismos.sgc.gov.co/rss/sismos.xml',
    'https://sgc.gov.co/noticias/sismos',
    'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minmagnitude=2.0&minlatitude=-4.5&maxlatitude=13.5&minlongitude=-82.0&maxlongitude=-66.0&limit=10' // Colombia bounding box
  ];

  for (const url of sgcUrls) {
    try {
      const res = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
      console.log(`✅ [SGC/Región URL] Éxito en ${url} (Status: ${res.status}, Type: ${typeof res.data})`);
    } catch (err) {
      console.log(`⚠️ [SGC/Región URL] ${url} -> ${err.message}`);
    }
  }
}

async function run() {
  await testUSGS();
  await testEMSC();
  await testSGC();
}

run();
