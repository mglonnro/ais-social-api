import { OAuth2Client } from "google-auth-library";

/* All three OAuth clients for this project. The mobile SDK mints an
   idToken whose `aud` is the web client when `webClientId` is set in
   GoogleSignin.configure (current setup), or the platform-native client
   when it isn't. Accepting all three keeps verification resilient to
   either configuration and to per-platform sign-in flows. */
const GOOGLE_WEB_CLIENT_ID = "1020724884438-gtirh499v52s4qlnuik6entvsu98j4rm.apps.googleusercontent.com";
const GOOGLE_IOS_CLIENT_ID = "1020724884438-581773gdjm6l7785l0huedh8b50l75ce.apps.googleusercontent.com";
const GOOGLE_ANDROID_CLIENT_ID = "1020724884438-kff8jh16c8rvsvgo8nkpovn61pn1b7jm.apps.googleusercontent.com";

const GOOGLE_AUDIENCES = [
  GOOGLE_WEB_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_ANDROID_CLIENT_ID,
];

async function googleVerifyToken(idToken) {
  try {
    const oAuth2Client = new OAuth2Client();

    const result = await oAuth2Client.verifyIdToken({
      idToken: idToken,
      audience: GOOGLE_AUDIENCES,
    });

    if (result.payload['sub']) {
      return result.payload;
    }
  } catch (e) {
    console.error(e);
    return null;
  }

  return null;
}

/* Returns the Google `sub` claim, or null if the token is missing or fails
   verification. Callers must handle null (e.g. respond 401). */
const googleGetIdFromToken = async (token) => {
  if (!token) return null;
  const decoded = await googleVerifyToken(token);
  return decoded ? decoded.sub : null;
};

export {
  googleVerifyToken,
  googleGetIdFromToken,
}

