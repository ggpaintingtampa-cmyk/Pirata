import { Worker } from 'node:worker_threads';
import { createRequire } from 'node:module';
import { ApiError } from '../core/errors.js';
const require = createRequire(import.meta.url);
export const IMAGE_LIMIT = 20 * 1024 * 1024;
export const PDF_LIMIT = 25 * 1024 * 1024;
const PIXEL_LIMIT = 24_000_000;
export interface ProcessedFile { bytes: Buffer; preview: Buffer | null; mimeType: string; extension: string }
let inFlight = 0;

/** Untrusted decoding is isolated from the API event loop and forcibly time bounded. */
export async function processFile(bytes: Buffer): Promise<ProcessedFile> {
  if (inFlight >= 1) throw new ApiError(429, 'UPLOAD_BUSY', 'Other photos are processing. Retry this upload shortly.');
  if (!bytes.length || bytes.length > PDF_LIMIT) throw new ApiError(413, 'FILE_SIZE', 'Choose a photo up to 20 MiB or a PDF up to 25 MiB.');
  const pdf = bytes.subarray(0, 5).toString() === '%PDF-';
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const webp = bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  const heic = bytes.subarray(4, 8).toString() === 'ftyp' && /^(heic|heix|hevc|hevx|mif1|msf1)$/.test(bytes.subarray(8, 12).toString());
  if (!pdf && !jpeg && !png && !webp && !heic) throw new ApiError(400, 'FILE_TYPE', 'Only JPEG, PNG, WebP, HEIC photos and PDF documents are supported. Videos, SVG and executable files are not accepted.');
  if (!pdf && bytes.length > IMAGE_LIMIT) throw new ApiError(413, 'FILE_SIZE', 'Photos must be 20 MiB or smaller.');
  if (heic) {
    // HEIF stores declared image dimensions in ispe boxes. Reject oversized images before WASM decode.
    let position = 0, seen = false;
    while ((position = bytes.indexOf('ispe', position)) >= 0) {
      if (position + 16 > bytes.length) break;
      const width = bytes.readUInt32BE(position + 8), height = bytes.readUInt32BE(position + 12);
      if (!width || !height || width * height > PIXEL_LIMIT) throw new ApiError(400, 'IMAGE_SIZE', 'Use a photo with at most 24 megapixels.');
      seen = true; position += 4;
    }
    if (!seen) throw new ApiError(400, 'FILE_TYPE', 'This HEIC photo could not be read. Try exporting it as JPEG.');
  }
  inFlight++;
  try {
    return await new Promise<ProcessedFile>((resolve, reject) => {
      const worker = new Worker(`
        const { parentPort, workerData } = require('node:worker_threads');
        const sharp = require(workerData.sharp);
        (async () => {
          let bytes = Buffer.from(workerData.bytes);
          if (workerData.pdf) {
            const { PDFDocument, PDFName, PDFDict } = require(workerData.pdfLib);
            const doc = await PDFDocument.load(bytes, { throwOnInvalidObject: true, updateMetadata: false });
            if (doc.getPageCount() < 1 || doc.getPageCount() > 2000) throw Error('PDF must have 1–2000 pages.');
            const unsafe = ['JS','JavaScript','Launch','EmbeddedFile','EmbeddedFiles','RichMedia','SubmitForm','ImportData','OpenAction','AA'];
            for (const [, object] of doc.context.enumerateIndirectObjects()) {
              if (object instanceof PDFDict && unsafe.some(name => object.has(PDFName.of(name)))) throw Error('Active PDF content is not supported. Export a plain PDF.');
              const text = object.toString();
              if (/\\/(JavaScript|Launch|EmbeddedFile|RichMedia|SubmitForm|ImportData)\\b/.test(text)) throw Error('Active PDF content is not supported. Export a plain PDF.');
            }
            parentPort.postMessage({ bytes, preview: null, mimeType: 'application/pdf', extension: 'pdf' }); return;
          }
          if (workerData.heic) bytes = Buffer.from(await require(workerData.heicConvert)({ buffer: bytes, format: 'JPEG', quality: 0.92 }));
          const options = { limitInputPixels: workerData.pixelLimit, failOn: 'warning', sequentialRead: true };
          const metadata = await sharp(bytes, options).metadata();
          if ((metadata.pages || 1) > 1) throw Error('Choose a still photo instead of an animation.');
          const safe = await sharp(bytes, options).rotate().jpeg({ quality: 92 }).timeout({ seconds: 12 }).toBuffer();
          const preview = await sharp(safe, options).resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).timeout({ seconds: 12 }).toBuffer();
          parentPort.postMessage({ bytes: safe, preview, mimeType: 'image/jpeg', extension: 'jpg' });
        })().catch(() => parentPort.postMessage({ error: 'This file could not be safely read. Choose a valid still photo or a plain, unencrypted PDF.' }));
      `, { eval: true, resourceLimits: { maxOldGenerationSizeMb: 192, maxYoungGenerationSizeMb: 32 }, workerData: { bytes, pdf, heic, pixelLimit: PIXEL_LIMIT, sharp: require.resolve('sharp'), pdfLib: require.resolve('pdf-lib'), heicConvert: require.resolve('heic-convert') } });
      const timer = setTimeout(() => { void worker.terminate(); reject(new ApiError(400, 'FILE_PROCESSING', 'The file took too long to process. Try a smaller photo or PDF.')); }, 20000);
      worker.once('message', (data: ProcessedFile & { error?: string }) => { clearTimeout(timer); void worker.terminate(); if (data.error) reject(new ApiError(400, 'FILE_PROCESSING', data.error)); else resolve({ ...data, bytes: Buffer.from(data.bytes), preview: data.preview ? Buffer.from(data.preview) : null }); });
      worker.once('error', () => { clearTimeout(timer); reject(new ApiError(400, 'FILE_PROCESSING', 'This file could not be processed. Try a smaller photo or PDF.')); });
      worker.once('exit', code => { clearTimeout(timer); if (code !== 0) reject(new ApiError(400, 'FILE_PROCESSING', 'This file could not be processed. Try a smaller photo or PDF.')); });
    });
  } finally { inFlight--; }
}
