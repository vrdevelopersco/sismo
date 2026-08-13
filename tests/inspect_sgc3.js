import axios from 'axios';

async function main() {
  try {
    const res = await axios.get('https://www.sgc.gov.co/static/js/main.20af6da6.js');
    const js = res.data;
    
    // Find all strings containing sismo or event
    const matches = js.match(/["'`][^"'`]*(?:sismo|event|earthquake|catalog)[^"'`]*["'`]/gi) || [];
    const unique = [...new Set(matches.map(m => m.replace(/['"`]/g, '')))].filter(s => s.length < 120 && (s.includes('/') || s.includes('http')));
    console.log('Interesting sismo URLs / paths:');
    console.log(unique);
  } catch (e) {
    console.error(e.message);
  }
}
main();
