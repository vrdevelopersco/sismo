import axios from 'axios';

async function main() {
  try {
    const res = await axios.get('https://www.sgc.gov.co/static/js/main.20af6da6.js');
    const js = res.data;
    
    const feedMatches = js.match(/\/feed\/[^"'\s,)]+/g) || [];
    const apicatalogadorMatches = js.match(/apicatalogador\.sgc\.gov\.co[^"'\s,)]+/g) || [];
    const eventMatches = js.match(/https?:\/\/[a-zA-Z0-9.-]+\.sgc\.gov\.co\/[^"'\s,)]+/g) || [];
    
    console.log('--- Feeds ---');
    console.log([...new Set(feedMatches)]);
    
    console.log('--- Apicatalogador ---');
    console.log([...new Set(apicatalogadorMatches)]);
    
    console.log('--- SGC Endpoints ---');
    console.log([...new Set(eventMatches)].filter(u => u.includes('event') || u.includes('sismo') || u.includes('feed') || u.includes('catalog')));
  } catch (e) {
    console.error('Error:', e.message);
  }
}

main();
