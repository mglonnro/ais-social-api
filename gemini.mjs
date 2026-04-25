import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-3.1-flash-image-preview";

// GoogleGenAI reads GEMINI_API_KEY from env automatically.
const ai = new GoogleGenAI({});

const buildPrompt = (lengthM, beamM) => {
  const ratio = (lengthM / beamM).toFixed(2);
  // We tell Gemini the boat's real proportions; topdown.mjs stretches the
  // result to the exact aspect afterwards if Gemini misjudges, so prose
  // accuracy matters less than getting a clean top-down hull.
  return (
    `Photorealistic overhead photograph of the vessel from the reference photo(s), as if captured by a drone hovering directly above. ` +
    `Render with the visual quality of a real high-resolution aerial photo: actual materials (paint, fiberglass, varnished wood, metal, fabric, glass) with accurate textures and realistic lighting. ` +
    `DO NOT produce an illustration, line drawing, technical sketch, schematic, blueprint, cartoon, cel-shaded image, or any stylized art. The output must look like a photo, not artwork. ` +
    `Bow points to the top of the canvas. ` +
    `The vessel is exactly ${lengthM} metres long (bow to stern) and ${beamM} metres wide (port to starboard). ` +
    `Render the boat with this EXACT length-to-beam ratio of ${ratio}:1 — do not distort, stretch, or alter the proportions to fit the canvas. ` +
    `Match hull color, deck layout, mast(s), and superstructure from the reference(s) as faithfully as possible. ` +
    `Place the boat so it fills the full canvas HEIGHT (bow at top edge, stern at bottom edge), centered horizontally. ` +
    `The boat's actual width will occupy whatever fraction of canvas width its real beam-to-length ratio dictates — that is correct. ` +
    `Fill the rest of the canvas with pure flat chroma-key green (#00FF00). ` +
    `Self-shadows on the deck and superstructure are fine and expected for realism, but the boat must NOT cast a shadow onto the green background. ` +
    `No water, no people, no text, no frame, no border.`
  );
};

const sniffMimeType = (buf) => {
  // Minimal magic-byte sniff — enough for the four formats Firebase Storage
  // accepts from the mobile client (JPEG/PNG/WebP/GIF). Fail loudly for
  // anything else so we don't silently mislabel an image to Gemini.
  if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49) return "image/gif";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";
  throw new Error("Unrecognized image format in reference photo");
};

export const generateTopdown = async (photoBuffers, lengthM, beamM) => {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  if (!photoBuffers?.length) {
    throw new Error("At least one reference photo is required");
  }

  const prompt = buildPrompt(lengthM, beamM);
  console.log("[gemini] prompt:\n" + prompt);
  const parts = [
    { text: prompt },
    ...photoBuffers.map((buf) => ({
      inlineData: {
        mimeType: sniffMimeType(buf),
        data: buf.toString("base64"),
      },
    })),
  ];

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: parts,
    config: {
      responseModalities: ["TEXT", "IMAGE"],
      // 9:16 (taller than wide) better matches typical bow-up boat
      // proportions than 1:1 — the model uses the full height of the
      // canvas instead of a thin centered sliver.
      imageConfig: { aspectRatio: "9:16", imageSize: "512" },
    },
  });

  const candidate = response?.candidates?.[0];
  const outParts = candidate?.content?.parts || [];
  for (const p of outParts) {
    if (p.inlineData?.data) {
      return Buffer.from(p.inlineData.data, "base64");
    }
  }
  throw new Error(
    "Gemini returned no image part: " + JSON.stringify(response).slice(0, 500),
  );
};
