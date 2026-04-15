import jwt from "jsonwebtoken";
import jwkToPem from "jwk-to-pem";
import appleKeys from "../keys/appleKeys.js";

const verifyToken = (token) => {
  const decoded_unverified = jwt.decode(token, { complete: true });

  /* Which Apple key id to use */
  const {
    header: { kid },
  } = decoded_unverified;

  console.log("decoded", decoded_unverified);
  console.log("appleKeys", appleKeys.keys);

  for (let x = 0; x < appleKeys.keys.length; x++) {
    if (appleKeys.keys[x].kid === kid) {
      return jwt.verify(token, jwkToPem(appleKeys.keys[x]), {
        algorithms: ["RS256", "RS384", "RS512"],
      });
    }
  }

  return null;
};

/* Expects token string from Apple authentication */
const getIdFromToken = (token) => {
  const decoded = verifyToken(token);
  return decoded.sub;
};

export { verifyToken, getIdFromToken };
