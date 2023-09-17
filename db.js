import pkg from "pg";
const { Client } = pkg;

import geolib from "geolib";
/*
import admin from "./firebase.js";
import loadDB from "./firebase_db.js";
*/
import { SCORE_TYPE_SPOT } from "./constants.js";

class DB {
  constructor() {
    this.client = new Client({
      user: "postgres",
      host: "localhost",
      database: "aissocial",
      password: "Kikku2020",
      port: 5432,
    });

    // this.fb = loadDB();
  }

  async connect() {
    await this.client.connect();
  }

  async close() {
    await this.client.end();
  }

  async getBoatByMMSI(mmsi) {
    const result = await this.client.query(
      "SELECT * FROM boats WHERE mmsi = $1",
      [mmsi],
    );

    if (result.rows.length) {
      return result.rows[0];
    } else {
      // Create it it
      const c = await this.client.query(
        "INSERT INTO boats (mmsi) VALUES ($1) RETURNING *",
        [mmsi],
      );
      return c.rows[0];
    }
  }

  async getUser(userId) {
    var ret;

    const result = await this.client.query(
      "SELECT * from users WHERE user_id = $1",
      [userId],
    );

    if (result.rows.length) {
      return result.rows[0];
    }

    return null;
  }

  async getUserBoatRelation(userId, boatId) {
    console.log("getuserboatrelation", userId, boatId);
    const spotted = await this.client.query(
      "SELECT created_time FROM scores WHERE user_id = $1 AND boat_id = $2 AND type = $3 ORDER BY created_time LIMIT 1",
      [userId, boatId, SCORE_TYPE_SPOT],
    );

    console.log("spotted", spotted.rows);
    return {
      spotted:
        spotted && spotted.rows.length && spotted.rows[0].created_time
          ? true
          : false,
      created_time: spotted.rows.length
        ? new Date(spotted.rows[0].created_time)
        : null,
    };
  }

  async getUserScore(userId) {
    const score = await this.client.query(
      "SELECT CAST(SUM(score) as INTEGER) as score FROM scores WHERE user_id = $1",
      [userId],
    );
    if (score.rows.length) {
      console.log(score.rows[0]);
      return score.rows[0].score;
    }

    return 0;
  }

  async putBoat(data) {
    const boat = await this.getBoatByMMSI(data.MMSI);

    /* Found existing, let's update */
    if (boat) {
      return await this.client.query(
        "UPDATE boats SET make = $1, model = $2, model_year = $3 WHERE boat_id = $4 RETURNING *",
        [data.make, data.model, data.modelYear, boat.boat_id],
      );
    } else {
      return await this.client.query(
        "INSERT INTO boats (mmsi, make, model, model_year) VALUES ($1, $2, $3, $4) RETURNING *",
        [data.MMSI, data.make, data.model, data.modelYear],
      );
    }
  }

  async undoSpot(userId, boatId) {
    const r1 = await this.client.query(
      "SELECT sum(score) as score from scores WHERE user_id = $1 AND boat_id = $2",
      [userId, boatId],
    );
    if (r1.rows && r1.rows.length) {
      let score = r1.rows[0].score;

      console.log("Found score", score);

      const r2 = await this.client.query(
        "DELETE FROM scores WHERE user_id = $1 AND boat_id = $2",
        [userId, boatId],
      );

      /* Add is_spot_media #todo */
      const r3 = await this.client.query(
        "DELETE FROM media WHERE user_id = $1 AND boat_id = $2", 
        [userId, boatId],
      );

      await this.client.query(
        "UPDATE boats SET spot_count = (SELECT COUNT(id) FROM scores WHERE boat_id = $1) WHERE boat_id = $1",
        [boatId],
      );
      const total = await this.client.query(
        "SELECT SUM(score) as score FROM scores WHERE user_id = $1",
        [userId],
      );
      return { score: total.rows[0].score };
    }

    return null;
  }

  async postScore(data) {
    const result = await this.client.query(
      "INSERT INTO scores (user_id, score, boat_id, type, description, created_time) " +
        "VALUES ($1, $2, $3, $4, $5, NOW())",
      [data.userId, data.score, data.boatId, data.type, data.description],
    );

    // Update boat total
    if (data.boatId) {
      await this.client.query(
        "UPDATE boats SET spot_count = (SELECT COUNT(id) FROM scores WHERE boat_id = $1) WHERE boat_id = $1",
        [data.boatId],
      );
    }

    // Update and return total
    const total = await this.client.query(
      "SELECT SUM(score) as score FROM scores WHERE user_id = $1",
      [data.userId],
    );
    return { score: total.rows[0].score };
  }

  async postBoatMedia(userId, boatId, uri) {
    const result = await this.client.query(
      "INSERT INTO media (boat_id, user_id, uri, created_time) " +
        "VALUES ($1, $2, $3, NOW()) RETURNING *",
      [boatId, userId, uri],
    );

    if (result && result.rows.length) {
      return result.rows[0];
    } else {
      return null;
    }
  }

  async getBoatMedia(boatId) {
    console.log("boatId", boatId);
    const result = await this.client.query(
      "SELECT m.id, m.boat_id, m.user_id, m.created_time, m.uri, u.username from media m JOIN users u on u.user_id = m.user_id WHERE m.boat_id = $1 ORDER BY m.created_time",
      [boatId],
    );
    console.log(result);
    if (result && result.rows.length) {
      return result.rows;
    } else {
      return null;
    }
  }

  async getUserByAppleId(appleId) {
    const result = await this.client.query(
      "SELECT user_id, username, google_id, apple_id FROM users WHERE apple_id = $1",
      [appleId],
    );

    if (!result.rows.length) {
      return null;
    } else {
      return result.rows[0];
    }
  }

  async isNickAvailable(nick) {
    const result = await this.client.query(
      "SELECT user_id FROM users WHERE lower(username) = lower($1)",
      [nick],
    );

    return result.rows.length === 0;
  }

  async createUser(user) {
    const result = await this.client.query(
      "INSERT INTO users (username, email, created_time, apple_id, google_id) VALUES ($1, $2, NOW(), $3, $4) RETURNING *",
      [user.username, user.email, user.appleId, user.googleId],
    );
    if (result.rows.length) {
      return result.rows[0];
    } else {
      return null;
    }
  }

  /*
  async deleteMedia(boatId, mediaId) {
    let ref = this.fb
      .firestore()
      .collection("boats")
      .doc(boatId)
      .collection("media")
      .doc(mediaId);

    let res = await ref.delete();
    console.log("deleted", res);
    return res;
  }

  async updateMedia(boatId, mediaId, data) {
    if (data.id) {
      delete data.id;
    }

    let ref = this.fb
      .firestore()
      .collection("boats")
      .doc(boatId)
      .collection("media")
      .doc(mediaId);

    let reso = await ref.get();
    let d = reso.data();

    if (!d.datetime_original) {
      data.datetime_original = new Date(d.datetime.toDate());
    }

    let dt_orig = d.datetime_original
      ? d.datetime_original.toDate()
      : data.datetime_original;

    if (data.location && !d.location_original) {
      data.location_original = Object.assign({}, d.location);
    }

    if (data.datetime) {
      data.datetime = new Date(data.datetime);
    }

    // If the datetime has changed AND we're not already overriding the location, find new data
    //
    console.log("Evaluating", data);

    if (
      data.datetime &&
      data.datetime.getTime() != dt_orig.getTime() &&
      !data.location
    ) {
      if (!d.location_override) {
        console.log("Looking for new navdata");

        try {
          var shortId = await this.getShortId(boatId);
          const navdata = await this.getLastData(
            shortId,
            "DESC",
            "0",
            undefined,
            data.datetime
          );
          if (
            navdata &&
            Math.abs(data.datetime - navdata.minTime) < 5 * 60 * 1000
          ) {
            data.navdata = Object.assign({}, navdata);

            console.log("Found navdata", data.navdata);

            if (!d.location_original) {
              data.location_original = Object.assign({}, d.location);
              console.log("Setting original location to", d.location);
            }

            data.location = { latitude: navdata.lat, longitude: navdata.lng };
            console.log("Setting new location to", data.location);
          }
        } catch (e) {
          console.error(e);
        }
      }
    }

    await ref.update(data);
    let res = await ref.get();
    return Object.assign({}, res.data(), {
      id: res.id,
      datetime: res.data().datetime.toDate(),
      datetime_original: res.data().datetime_original.toDate(),
    });
  }

  async getMedia(boatId, after, before) {
    console.log("getMedia", boatId, after, before);
    try {
      let ref = this.fb
        .firestore()
        .collection("boats")
        .doc(boatId)
        .collection("media");

      if (after) {
        ref = ref.where("datetime", ">=", after);
      }

      if (before) {
        ref = ref.where("datetime", "<", before);
      }

      let snap = await ref.get();

      var ret = [];
      var update = [];

      await snap.forEach(async (doc) => {
        if (doc.data()) {
          var o = Object.assign({}, doc.data(), {
            id: doc.id,
            datetime: doc.data().datetime.toDate(),
            epoch: doc.data().datetime.toDate().getTime(),
          });

          if (o.datetime_original) {
            o.datetime_original = o.datetime_original.toDate();
          }

          // Replace old style firebase paths
          if (o.thumbUrl && o.thumbUrl.indexOf("firebasestorage") != -1) {
            delete o.thumb1024Url;
            delete o.thumbUrl;
          }

          // Assure we have urls
          if (!o.thumbUrl || !o.thumb1024Url) {
            o = Object.assign({}, this.getImageUrls(boatId, o));

            if (o.thumbUrl && o.thumb1024Url) {
              update.push(Object.assign({}, o));
            }
          }

          ret.push(Object.assign({}, o));
        }
      });

      console.log("update len", update.length);
      for (let x = 0; x < update.length; x++) {
        let save = Object.assign({}, update[x]);
        let id = save.id;
        delete save.id;

        await this.fb
          .firestore()
          .collection("boats")
          .doc(boatId)
          .collection("media")
          .doc(id)
          .update({ thumbUrl: save.thumbUrl, thumb1024Url: save.thumb1024Url });
      }

      return ret;
    } catch (e) {
      console.error(e);
    }
  }

  makeUrl(fname) {
    return "https://storage.googleapis.com/naked-sailor.appspot.com/" + fname;
  }

  getImageUrls(boatId, data) {
    var ret = Object.assign({}, data);

    if (data.thumb && !data.thumbUrl) {
      ret.thumbUrl = this.makeUrl(data.thumb);
    }

    if (data.thumb1024 && !data.thumb1024Url) {
      ret.thumb1024Url = this.makeUrl(data.thumb1024);
    }

    return ret;
  }

  async setBoatPhoto(boatId, photoURL) {
    await this.fb
      .firestore()
      .collection("boats")
      .doc(boatId)
      .update({ profileUrl: photoURL });
  }

  async getFileStatus(longId, fileId) {
    let res = await this.fb
      .firestore()
      .collection("data")
      .doc(longId)
      .collection("files")
      .doc(fileId)
      .get();

    var data = res.data();
    if (data) {
      for (var k in data) {
        if (data[k].toDate) {
          data[k] = data[k].toDate();
        }
      }

      if (data.data) {
        for (var k in data.data) {
          if (data.data[k].toDate) {
            data.data[k] = data.data[k].toDate();
          }
        }
      }
    }

    return data;
  }

  async updateBoat(userid, longId, data) {
    if (!userid) {
      return null;
    }

    var copy = Object.assign({}, data);
    delete copy.id;

    return await this.fb
      .firestore()
      .collection("boats")
      .doc(longId)
      .update(copy);
  }
  */
}

export default DB;
