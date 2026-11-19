import jwt from "jsonwebtoken";
import { createPublicKey } from "crypto";
import appleKeys from "../keys/appleKeys.js";

/* Sign in with Apple identity tokens for our iOS app carry the bundle id
   as `aud` (ais-social app.json ios.bundleIdentifier). */
const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_AUDIENCE = "com.humeko.aissocial";

const verifyToken = (token) => {
  const decoded_unverified = jwt.decode(token, { complete: true });
  if (!decoded_unverified) {
    return null;
  }

  /* Which Apple key id to use */
  const {
    header: { kid },
  } = decoded_unverified;

  for (let x = 0; x < appleKeys.keys.length; x++) {
    if (appleKeys.keys[x].kid === kid) {
      return jwt.verify(token, createPublicKey({ key: appleKeys.keys[x], format: "jwk" }), {
        algorithms: ["RS256", "RS384", "RS512"],
        issuer: APPLE_ISSUER,
        audience: APPLE_AUDIENCE,
      });
    }
  }

  console.error("Apple token signed with unknown kid", kid, "- run refreshKeys.sh");
  return null;
};

/* Expects token string from Apple authentication. Returns the Apple `sub`,
   or null if the token is missing or unverifiable. Throws if the signature,
   issuer, audience or expiry check fails (the /auth handler answers 401). */
const getIdFromToken = (token) => {
  if (!token) return null;
  const decoded = verifyToken(token);
  return decoded ? decoded.sub : null;
};

export { verifyToken, getIdFromToken };
