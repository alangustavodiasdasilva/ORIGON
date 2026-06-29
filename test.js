const fetch = require('node-fetch');
async function test() {
    const url = 'https://www.myinstants.com/en/instant/auraa-81623/';
    try {
        const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        const match = data.contents.match(/https:\/\/www\.myinstants\.com\/media\/sounds\/[^\"']+\.mp3/i);
        console.log('MATCH:', match ? match[0] : 'Not found');
    } catch (e) {
        console.error(e);
    }
}
test();
