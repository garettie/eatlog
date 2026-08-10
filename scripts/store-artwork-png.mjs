import { deflateSync, inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paeth(left, up, upperLeft) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  return upDistance <= upperLeftDistance ? up : upperLeft;
}

export function decodePng(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Invalid PNG signature.');
  let offset = 8;
  let header;
  const dataParts = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === 'IDAT') {
      dataParts.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (!header || header.bitDepth !== 8 || ![2, 6].includes(header.colorType)
    || header.compression !== 0 || header.filter !== 0 || header.interlace !== 0) {
    throw new Error('PNG must be non-interlaced 8-bit RGB or RGBA.');
  }
  const channels = header.colorType === 6 ? 4 : 3;
  const stride = header.width * channels;
  const encoded = inflateSync(Buffer.concat(dataParts));
  if (encoded.length !== (stride + 1) * header.height) throw new Error('PNG data length is invalid.');
  const pixels = Buffer.alloc(stride * header.height);
  for (let y = 0; y < header.height; y += 1) {
    const filter = encoded[y * (stride + 1)];
    const sourceOffset = y * (stride + 1) + 1;
    const rowOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = encoded[sourceOffset + x];
      const left = x >= channels ? pixels[rowOffset + x - channels] : 0;
      const up = y > 0 ? pixels[rowOffset + x - stride] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[rowOffset + x - stride - channels] : 0;
      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) value = raw + paeth(left, up, upperLeft);
      else throw new Error(`Unsupported PNG filter ${filter}.`);
      pixels[rowOffset + x] = value & 0xff;
    }
  }
  const rgba = Buffer.alloc(header.width * header.height * 4);
  for (let source = 0, destination = 0; source < pixels.length; source += channels, destination += 4) {
    rgba[destination] = pixels[source];
    rgba[destination + 1] = pixels[source + 1];
    rgba[destination + 2] = pixels[source + 2];
    rgba[destination + 3] = channels === 4 ? pixels[source + 3] : 255;
  }
  return { ...header, rgba };
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  typeBuffer.copy(result, 4);
  data.copy(result, 8);
  result.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), data.length + 8);
  return result;
}

export function encodePng({ width, height, rgba }, colorType) {
  if (![2, 6].includes(colorType) || rgba.length !== width * height * 4) throw new Error('Invalid PNG encoding input.');
  const channels = colorType === 6 ? 4 : 3;
  const rows = Buffer.alloc((width * channels + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * channels + 1);
    rows[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const source = (y * width + x) * 4;
      const destination = rowOffset + 1 + x * channels;
      rgba.copy(rows, destination, source, source + channels);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = colorType;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
