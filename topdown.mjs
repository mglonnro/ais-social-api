import sharp from "sharp";
import fs from "fs/promises";
import path from "path";
import { getBoatAIS } from "./ais.js";
import { generateTopdown } from "./gemini.mjs";
import { uploadBufferToStorage, downloadFromStorage } from "./fb.mjs";

const MAX_REF_PHOTOS = 4;
const ICON_LONG_EDGE_PX = 384;
const TRIM_THRESHOLD = 40;   // out of 255 — tolerant of JPEG artifacts

// Two URL formats appear in `media.uri`:
// - storage.googleapis.com/<bucket>/<obj>  — raw GCS, private, needs auth
// - firebasestorage.googleapis.com/...?token=... — has a download token
// The first 403s on plain fetch; route those through the Storage SDK so
// our service-account creds are applied.
const fetchBuffer = async (uri) => {
  const u = new URL(uri);
  if (u.hostname === "storage.googleapis.com") {
    const path = u.pathname.replace(/^\//, "");
    const slash = path.indexOf("/");
    const bucketName = path.slice(0, slash);
    const objectName = decodeURIComponent(path.slice(slash + 1));
    return await downloadFromStorage(bucketName, objectName);
  }
  const r = await fetch(uri);
  if (!r.ok) {
    throw new Error(`Failed to fetch ${uri}: ${r.status} ${r.statusText}`);
  }
  return Buffer.from(await r.arrayBuffer());
};

// Replaces the chroma-green (#00FF00) background Gemini paints with proper
// alpha=0 so subsequent .trim()/.extend() steps work in alpha space and
// the final PNG composes correctly over the map. Soft 60..120 ramp on the
// "greenness" score keeps anti-aliased edges from leaving a hard halo.
const chromaKeyGreen = async (pngBuffer) => {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    const greenness = Math.max(0, Math.min(g - r, g - b));
    let mult;
    if (greenness >= 120) mult = 0;
    else if (greenness <= 60) mult = 1;
    else mult = (120 - greenness) / 60;
    out[i + 3] = Math.round(out[i + 3] * mult);
  }
  return await sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
};

const writeDebug = async (debugDir, name, buf) => {
  if (!debugDir) return;
  await fs.mkdir(debugDir, { recursive: true });
  await fs.writeFile(path.join(debugDir, name + ".png"), buf);
};

// Stretches/squeezes the trimmed Gemini output to exactly the boat's real
// beam:length aspect at ICON_LONG_EDGE_PX on the long side. Trust the prompt
// to get the shape right; sharp's fit:'fill' is a no-op when Gemini honours
// it and a small distortion otherwise. No transparent padding.
const finalizeIcon = async (rawPng, lengthM, beamM, debugDir) => {
  await writeDebug(debugDir, "0_raw", rawPng);

  const keyed = await chromaKeyGreen(rawPng);
  await writeDebug(debugDir, "1_keyed", keyed);

  const trimmed = await sharp(keyed).trim({ threshold: TRIM_THRESHOLD }).toBuffer();
  await writeDebug(debugDir, "2_trimmed", trimmed);

  // Output is bow-up: height = length, width = beam.
  const targetH = ICON_LONG_EDGE_PX;
  const targetW = Math.max(1, Math.round(targetH * (beamM / lengthM)));
  const final = await sharp(trimmed)
    .resize(targetW, targetH, { fit: "fill" })
    .png()
    .toBuffer();
  await writeDebug(debugDir, "3_final", final);
  return final;
};

export const generateBoatTopdown = async (db, mmsi, { photoIds, debugDir } = {}) => {
  const boat = await db.getBoatByMMSI(mmsi);
  if (!boat) {
    return { status: 404, error: "boat_not_found" };
  }

  // AIS dimensions are the gate — refuse generation if we can't size the icon.
  const ais = await getBoatAIS(mmsi);
  const dim = ais?.Dimension;
  const lengthM = dim ? (dim.A || 0) + (dim.B || 0) : 0;
  const beamM = dim ? (dim.C || 0) + (dim.D || 0) : 0;
  if (!lengthM || !beamM) {
    return { status: 422, error: "no_ais_dimensions" };
  }

  const allMedia = await db.getBoatMedia(boat.boat_id);
  if (!allMedia || !allMedia.length) {
    return { status: 404, error: "no_media" };
  }

  let chosen = allMedia;
  if (photoIds?.length) {
    const idSet = new Set(photoIds);
    chosen = allMedia.filter((m) => idSet.has(m.id));
    if (!chosen.length) {
      return { status: 404, error: "no_matching_media" };
    }
  }
  chosen = chosen.slice(0, MAX_REF_PHOTOS);

  const buffers = await Promise.all(chosen.map((m) => fetchBuffer(m.uri)));

  const rawPng = await generateTopdown(buffers, lengthM, beamM);
  const finalized = await finalizeIcon(rawPng, lengthM, beamM, debugDir);

  // Timestamp the path so each regeneration produces a unique URL —
  // Google's edge cache is keyed on path, so re-uploading to the same
  // name would serve the stale bytes for the cacheControl TTL.
  const destination = `images/topdown/${mmsi}-${Date.now()}.png`;
  const uri = await uploadBufferToStorage(finalized, destination, "image/png");

  await db.updateBoatTopdown(mmsi, uri, lengthM, beamM);

  return {
    status: 200,
    body: {
      topdown_uri: uri,
      topdown_length_m: lengthM,
      topdown_beam_m: beamM,
      reference_photo_count: chosen.length,
    },
  };
};
