import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const MODEL = "gemini-3.1-flash-image-preview";

// GoogleGenAI reads GEMINI_API_KEY from env automatically.
const ai = new GoogleGenAI({});

const buildPrompt = (lengthM, beamM) => {
  const ratio = (lengthM / beamM).toFixed(2);
  return (
    `Based on the reference photo(s), render a clean top-down (bird's-eye) aerial view of this exact vessel. ` +
    `Flat overhead angle, entire hull visible, bow pointing up. ` +
    `The boat is ${lengthM} metres long and ${beamM} metres wide — the rendered proportions must exactly match ` +
    `this length-to-beam ratio of ${ratio}:1. ` +
    `Match hull color, deck layout, superstructure, and overall proportions from the reference(s) as faithfully as possible. ` +
    `Transparent background. Clean illustration suitable for a small map icon. ` +
    `No shadows, no water, no people, no text.`
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
      imageConfig: { aspectRatio: "1:1", imageSize: "512" },
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
