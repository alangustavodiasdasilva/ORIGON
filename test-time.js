const testStr = "test_123_time";
let tHash = 0;
for (let i = 0; i < testStr.length; i++) {
    tHash = (tHash << 5) - tHash + testStr.charCodeAt(i);
    tHash |= 0;
}
let tSeed = Math.abs(tHash) || 1;
const tRand = () => {
    tSeed ^= tSeed << 13;
    tSeed ^= tSeed >>> 17;
    tSeed ^= tSeed << 5;
    return (Math.abs(tSeed) % 1000000) / 1000000;
};
const offsets = [0];
let currentOffset = 0;
for (let j = 1; j < 6; j++) {
    const r = tRand();
    const val = Math.floor(r * 2);
    currentOffset += val;
    offsets.push(currentOffset);
    console.log(`rand: ${r}, val: ${val}, offset: ${currentOffset}`);
}
console.log(offsets);
