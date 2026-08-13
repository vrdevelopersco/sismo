import axios from 'axios';

async function main() {
  try {
    const res = await axios.get('https://www.sgc.gov.co/noticias/sismos', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = res.data;
    console.log(html);
  } catch (e) {
    console.error(e.message);
  }
}
main();
