import { OAuth2Client } from "google-auth-library";

// const GOOGLE_ID = "1020724884438-kff8jh16c8rvsvgo8nkpovn61pn1b7jm.apps.googleusercontent.com";
const GOOGLE_ID = "1020724884438-581773gdjm6l7785l0huedh8b50l75ce.apps.googleusercontent.com";

  async function googleVerifyToken(idToken) {
    try {
    const oAuth2Client = new OAuth2Client();

      console.log("idToken", idToken);

    const result = await oAuth2Client.verifyIdToken({
      idToken: idToken,
      audience: GOOGLE_ID,
    });

    // Verify that the token contains subject and email claims.
    // Get the User id.
    if (result.payload['sub']) {
      return result.payload;
    }

    // Optionally, if "includeEmail" was set in the token options, check if the
    // email was verified
    /* 
    if (result.payload['email_verified']) {
      console.log(`Email verified: ${result.payload['email_verified']}`);
    }
    */
    } catch (e) {
      console.error(e);
      return null;
    }

    return null;
  }

/* Expects token string from Apple authentication */
const googleGetIdFromToken = async (token) => {
    const decoded = await googleVerifyToken(token);
    return decoded.sub;
};

export {
  googleVerifyToken,
  googleGetIdFromToken,
}

