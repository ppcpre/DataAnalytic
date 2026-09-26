// สร้างไอคอน PNG ของ PWA (สี่เหลี่ยมมุมมนสีน้ำเงิน + หยดน้ำสีขาว) โดยไม่ต้องพึ่งไลบรารีภายนอก
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function inDrop(x, y) {
  // หยดน้ำ: วงกลมด้านล่าง + สามเหลี่ยมด้านบน (พิกัด 0..1)
  const cx = 0.5, cy = 0.6, r = 0.2;
  if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) return true;
  if (y >= 0.2 && y <= cy) {
    const half = ((y - 0.2) / (cy - 0.2)) * r;
    return Math.abs(x - cx) <= half;
  }
  return false;
}

function png(size, { full = false } = {}) {
  const rows = [];
  const radius = full ? 0 : size * 0.2;
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      const dx = Math.max(radius - x, 0, x - (size - 1 - radius));
      const dy = Math.max(radius - y, 0, y - (size - 1 - radius));
      const inside = dx * dx + dy * dy <= radius * radius;
      const drop = inDrop(x / size, y / size);
      const px = drop ? [255, 255, 255, 255] : inside ? [11, 92, 173, 255] : [0, 0, 0, 0];
      px.forEach((v, i) => (row[1 + x * 4 + i] = v));
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync('public/icon-192.png', png(192));
writeFileSync('public/icon-512.png', png(512, { full: true }));
writeFileSync('public/apple-touch-icon.png', png(180, { full: true }));
console.log('icons written');
