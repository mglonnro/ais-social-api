import admin from "./firebase.js";
import { v4 as uuidv4 } from "uuid";

class Auth {
  constructor(db) {
    this.cache = {};
    this.db = db;
  }

  generateApiKey() {
    var str = uuidv4() + uuidv4();
    str = str.replace(/-/g, "");
    return str;
  }

  getToken(header) {
    if (header) {
      var token = header.substring("Bearing ".length);
      return token;
    }
    return "";
  }

  getUserId(header) {
    let token = this.getToken(header);

    return new Promise((resolve, reject) => {
      admin
        .auth()
        .verifyIdToken(token)
        .then((decodedToken) => {
          const uid = decodedToken.uid;
          resolve(uid);
        })
        .catch((error) => {
          resolve(undefined);
        });
    });
  }

  async getUserIdByApiKey(apiKey) {
    let userId = await this.db.getUserIdByApiKey(apiKey);
    return userId;
  }

  async getUserAccess(longId, header, apiKey) {
    try {
      if (header || (!header && !apiKey)) {
        let userId = await this.getUserId(header);
        var access = await this.db.getAuth(userId, longId);
        return access;
      } else if (apiKey) {
        var access = await this.db.getApiAuth(apiKey, longId);
        return access;
      }
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  getAccess(shortId, header) {
    let token = this.getToken(header);
    console.log("Checking access for:", token);

    if (token == "" || token == "undefined") {
      return false;
    }

    return new Promise((resolve, reject) => {
      admin
        .auth()
        .verifyIdToken(token)
        .then((decodedToken) => {
          const uid = decodedToken.uid;
          console.log(JSON.stringify(decodedToken));
        })
        .catch((error) => {
          console.dir(error);
        });
    });
  }
}

export default Auth;
