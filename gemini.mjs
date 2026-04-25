import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-3.1-flash-image-preview";

// GoogleGenAI reads GEMINI_API_KEY from env automatically.
const ai = new GoogleGenAI({});

const buildPrompt = (lengthM, beamM) => {
  const ratio = (lengthM / beamM).toFixed(2);
  // V2: chroma-green background instead of "transparent" (which Gemini
  // routinely ignores) — we key the green to alpha in topdown.mjs.
  // Tight-framing language to keep the boat from rendering as a tiny
  // sliver in the middle of the canvas.
  return (
    `Render a clean top-down aerial view of the exact vessel in the reference photo(s). ` +
    `Bow points straight up. ` +
    `The full hull from bow tip to stern must fill the entire image edge-to-edge with no margins or padding — crop tightly. ` +
    `Hull color, deck layout, and superstructure must match the reference(s). ` +
    `Boat dimensions: ${lengthM}m long × ${beamM}m wide (length-to-beam ratio ${ratio}:1). ` +
    `Solid pure chroma-key green background (#00FF00) outside the hull, no shadows, no water, no people, no text, no frame, no border.`
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

  const parts = [
    { text: buildPrompt(lengthM, beamM) },
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
