import "dotenv/config";
import jwt from "jsonwebtoken";

const SECRET = process.env.JSON_SECRET;
if (!SECRET) {
  throw new Error("JSON_SECRET environment variable must be set (shared with msg-server)");
}

const hasToken = (headers) => {
  if (headers && headers["authorization"]) {
    return true;
  } else {
    return false;
  }
}

const getUserIdFromHeaders = (headers) => {
  if (headers && headers["authorization"]) {
    const h = headers["authorization"];

    let token = h.substring("Bearing ".length);
    return getUserId(token);
  }

  return null;
}

export const getTokenFromHeaders = (headers) => {
  if (headers && headers["authorization"]) {
    const h = headers["authorization"];

    let token = h.substring("Bearing ".length);
    return token;
  }

  return null;
}

const makeToken = (data) => {
  const token = jwt.sign({ data: data }, SECRET, { expiresIn: '24h' });
  return token;
}

const verifyToken = (token) => {
  const decoded = jwt.verify(token, SECRET);
  return decoded;
}

const getUserId = (token) => {
  try {
  const decoded = verifyToken(token);
  return decoded.data.user_id;
  }
  catch (e) {
    console.error(e);
    return null;
  }
}

export {
  hasToken,
  makeToken,
  verifyToken,
  getUserId,
  getUserIdFromHeaders,
}
