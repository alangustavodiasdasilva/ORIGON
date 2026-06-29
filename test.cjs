async function test() {
    const url = 'https://www.myinstants.com/en/instant/auraa-81623/';
    try {
        const res = await fetch(`https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`);
        const text = await res.text();
        require('fs').writeFileSync('test.html', text);
        console.log('Saved to test.html');
    } catch (e) {
        console.error(e);
    }
}
test();
