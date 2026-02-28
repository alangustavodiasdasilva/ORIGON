async function hashPassword(password) {
    if (!password) return "";
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function testHashes() {
    console.log("admin:", await hashPassword("admin"));
    console.log("212472:", await hashPassword("212472"));
}

testHashes();
