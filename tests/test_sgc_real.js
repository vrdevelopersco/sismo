import axios from 'axios';

async function main() {
  const urls = [
    'https://apicatalogador.sgc.gov.co/api/events/search/',
    'https://apicatalogador.sgc.gov.co/biweekly/biweekly_earthquakes',
    'https://apicatalogador.sgc.gov.co/biweeklycount/biweekly_earthquakes',
    'https://apicatalogador.sgc.gov.co/api/events/search/?page=1',
    'https://sismo.sgc.gov.co:8443/events'
  ];

  for (const u of urls) {
    try {
      const res = await axios.get(u, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*'
        },
        timeout: 10000
      });
      console.log('✅ ÉXITO:', u);
      console.log('   Status:', res.status);
      console.log('   Data sample:', typeof res.data === 'object' ? JSON.stringify(res.data).substring(0, 300) : res.data.substring(0, 200));
    } catch (e) {
      console.log('❌ FALLÓ:', u, e.message);
    }
  }
}

main();
