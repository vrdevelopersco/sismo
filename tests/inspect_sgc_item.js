import axios from 'axios';

async function main() {
  const res = await axios.post('https://apicatalogador.sgc.gov.co/api/events/search/', {}, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Content-Type': 'application/json'
    }
  });
  console.log('Total SGC earthquakes count:', res.data.count);
  console.log('First 3 SGC earthquakes:');
  console.log(JSON.stringify(res.data.results.results.slice(0, 3), null, 2));
}

main();
