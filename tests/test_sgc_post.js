import axios from 'axios';

async function main() {
  try {
    const res = await axios.post('https://apicatalogador.sgc.gov.co/api/events/search/', {}, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*'
      },
      timeout: 10000
    });
    console.log('✅ POST SUCCESS:', res.status);
    console.log('Data keys:', Object.keys(res.data));
    console.log('Sample:', JSON.stringify(res.data).substring(0, 500));
  } catch (e) {
    console.error('❌ POST ERROR:', e.response ? `${e.response.status} - ${JSON.stringify(e.response.data)}` : e.message);
  }
}

main();
