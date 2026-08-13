import axios from 'axios';

async function verify() {
  console.log('=== VERIFICANDO SERVIDOR LOCAL DETECCION-SISMO ===\n');

  try {
    // 1. Probar que el frontend responde (HTML)
    console.log('1. Probando GET http://localhost:3000/ ...');
    const indexRes = await axios.get('http://localhost:3000/');
    console.log(`✅ Frontend cargado (Status: ${indexRes.status}, Longitud: ${indexRes.data.length} bytes)`);

    // 2. Probar API de sismos
    console.log('\n2. Probando GET http://localhost:3000/api/sismos ...');
    const sismosRes = await axios.get('http://localhost:3000/api/sismos');
    console.log(`✅ Sismos obtenidos: ${sismosRes.data.total}`);
    if (sismosRes.data.events.length > 0) {
      const top = sismosRes.data.events[0];
      console.log(`   Ejemplo sismo: M${top.magnitude} - ${top.place} (Fuente: ${top.sources.join(', ')}, Prof: ${top.depth}km)`);
    }

    // 3. Probar API de stats
    console.log('\n3. Probando GET http://localhost:3000/api/stats ...');
    const statsRes = await axios.get('http://localhost:3000/api/stats');
    console.log('✅ Estadísticas:', JSON.stringify(statsRes.data, null, 2));

    // 4. Probar API de simulación (Disparo de sismo en vivo)
    console.log('\n4. Probando POST http://localhost:3000/api/simulate ...');
    const simRes = await axios.post('http://localhost:3000/api/simulate', {
      latitude: 6.78,
      longitude: -73.12,
      magnitude: 5.8,
      depth: 150,
      place: 'Mesa de los Santos - Santander (Prueba Local Automática)'
    });
    console.log('✅ Simulación inyectada con éxito:', simRes.data.event.id);

    console.log('\n✨ ¡TODAS LAS PRUEBAS LOCALES COMPLETADAS CON ÉXITO! ✨');
  } catch (err) {
    console.error('❌ Error en prueba local:', err.message);
  }
}

verify();
