import pkg from "pg";
const { Client } = pkg;

import geolib from "geolib";
import admin from "./firebase.js";

/*
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

  async deleteUser(userId) {
    try {
      await this.client.query("DELETE FROM scores WHERE user_id = $1", [
        userId,
      ]);
      await this.client.query("DELETE FROM media WHERE user_id = $1", [userId]);
      await this.client.query("DELETE FROM users WHERE user_id = $1", [userId]);
      return true;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  async deleteClaim(userId, claimId) {
    const res = await this.client.query(
      "UPDATE claims SET released_time = NOW() WHERE user_id = $1 AND id = $2 AND released_time IS NULL",
      [userId, claimId],
    );

    console.log("deleteClaim", res);
    return res.rowCount === 1 ? res : null;
  }

  async insertMessage(userId, m) {
    console.log("m", m);

    const res = await this.client.query(
      "INSERT INTO messages (fromuserid, touserid, fromboatid, fromboatname, fromboatmmsi, toboatid, toboatname, toboatmmsi, msgid, message, created_at, sent_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP) RETURNING *",
      [
        m.fromuserid,
        m.touserid,
        m.fromboatid,
        m.fromboatname,
        m.fromboatmmsi,
        m.toboatid,
        m.toboatname,
        m.toboatmmsi,
        m.msgid,
        m.message,
        m.created_at,
      ],
    );

    const ret = res.rows[0];
    /* Let's update unread count */
    if (m.toboatid) {
      await this.updateUnreadCount(m.toboatid);
    }
    return ret;
  }

  async updateUnreadCount(boatId) {
    return await this.client.query(
      "UPDATE boats SET inbox_unread_count = (SELECT COUNT(msgid) FROM messages WHERE read_at IS NULL AND toboatid = $1) WHERE boat_id = $1",
      [boatId],
    );
  }

  async getUserMessages(userId, after) {
    const before = new Date();

    if (!after) after = new Date(2000, 1, 1); // forever ago

    const res = await this.client.query(
      "select messages.*, users.username as fromusername from messages join users on messages.fromuserid = users.user_id WHERE (fromuserid = $1 OR touserid = $1) AND created_at >= $2 AND created_at < $3 ORDER BY created_at DESC LIMIT 100",
      [userId, after, before],
    );

    return {
      after: after,
      before: before,
      messages: res.rows,
    };
  }

  async getUserBoatRelation(userId, boatId) {
    console.log("getuserboatrelation", userId, boatId);
    const spotted = await this.client.query(
      "SELECT created_time FROM scores WHERE user_id = $1 AND boat_id = $2 AND type = $3 ORDER BY created_time LIMIT 1",
      [userId, boatId, SCORE_TYPE_SPOT],
    );

    const claim = await this.client.query(
      "SELECT * FROM claims WHERE user_id = $1 AND boat_id = $2 AND released_time is null ORDER BY created_time LIMIT 1",
      [userId, boatId],
    );

    return {
      claimed:
        claim && claim.rows.length && claim.rows[0].created_time
          ? claim.rows[0]
          : null,
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
      return score.rows[0].score !== null ? score.rows[0].score : 0;
    }

    return 0;
  }

  async getUserSpotted(userId, boatId) {
    let sql =
      "SELECT b.boat_id, b.mmsi, b.name, b.owner_user_id, b.make, b.model, b.model_year, b.spot_count, b.inbox_unread_count, m.id as media_id, m.user_id as media_user_id, m.created_time as media_created_time, m.uri, sum(s.score) as score, u.username, max(s.created_time) as score_created_time " +
      "FROM " +
      "  boats b JOIN media m ON m.boat_id = b.boat_id JOIN scores s on s.boat_id = b.boat_id AND m.user_id = $1 JOIN users u ON u.user_id = m.user_id ";

    if (boatId) {
      sql += "WHERE (b.boat_id = $2) ";
    }

    sql +=
      "GROUP BY b.boat_id, b.mmsi, b.owner_user_id, b.make, b.model, b.model_year, b.spot_count, b.inbox_unread_count, m.id, m.user_id, m.created_time, m.uri, u.username ORDER BY score_created_time DESC ";

    var result;

    if (boatId) {
      result = await this.client.query(sql, [userId, boatId]);
    } else {
      result = await this.client.query(sql, [userId]);
    }

    console.log(sql, userId, boatId);
    if (result.rows && result.rows.length) {
      const ret = {};

      for (const r of result.rows) {
        if (!ret[r.mmsi]) {
          ret[r.mmsi] = {
            boat_id: r.boat_id,
            MMSI: r.mmsi,
            ShipName: r.name,
            owner_user_id: r.owner_user_id,
            make: r.make,
            model: r.model,
            model_year: r.model_year,
            spot_count: r.spot_count,
            inbox_unread_count: r.inbox_unread_count,
            user: {
              spotted: true,
              score: r.score,
            },
            media: [],
            score_created_time: r.score_created_time,
          };
        }

        ret[r.mmsi].media.push({
          id: r.media_id,
          user_id: r.user_id,
          username: r.username,
          created_time: r.media_created_time,
          uri: r.uri,
        });
      }

      /* retarr */
      const retarr = [];
      for (const b in ret) {
        retarr.push(ret[b]);
      }

      /* Sort according to score_created_time */
      retarr.sort((a, b) => {
        const a_time = a.score_created_time.getTime(),
          b_time = b.score_created_time.getTime();

        return a_time > b_time ? -1 : a_time < b_time ? 1 : 0;
      });

      return retarr;
    } else {
      return null;
    }
  }

  async getHallOfFame(userId) {
    const result = await this.client.query(
      "select s.user_id, sum(s.score) as score, u.username from scores s join users u on u.user_id = s.user_id group by s.user_id, u.username order by score desc",
    );

    for (let x = 0; x < result.rows.length; x++) {
      result.rows[x].rowNo = x + 1;
    }

    // todo: add logic to take x positions from the top AND include given user
    return result.rows;
  }

  async insertClaim(userId, boatId) {
    return await this.client.query(
      "INSERT INTO claims (user_id, boat_id, created_time) VALUES ($1, $2, $3) RETURNING *",
      [userId, boatId, new Date()],
    );
  }

  async getClaim(boatId) {
    const ret = await this.client.query(
      "SELECT user_id FROM claims WHERE boat_id = $1 AND released_time IS NULL ORDER BY created_time DESC LIMIT 1",
      [boatId],
    );

    try {
      if (ret && ret.rows && ret.rows.length) {
        return ret.rows[0].user_id;
      } else {
        return null;
      }
    } catch (e) {
      return null;
    }
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
      return { score: total.rows[0].score !== null ? total.rows[0].score : 0 };
    }

    return null;
  }

  async postScore(data) {
    const result = await this.client.query(
      "INSERT INTO scores (user_id, score, boat_id, type, description, created_time, user_position, boat_position) " +
        "VALUES ($1, $2, $3, $4, $5, NOW(), POINT($6, $7), POINT($8, $9))",
      [
        data.userId,
        data.score,
        data.boatId,
        data.type,
        data.description,
        data.userPosition.longitude,
        data.userPosition.latitude,
        data.boatPosition.longitude,
        data.boatPosition.latitude,
      ],
    );

    // update boat name
    if (
      data.boat &&
      data.boat.ShipName !== undefined &&
      data.boat.ShipName.length
    ) {
      await this.client.query("UPDATE boats SET name = $1 WHERE boat_id = $2", [
        data.boat.ShipName,
        data.boatId,
      ]);
    }

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
    return { score: total.rows[0].score, addedScore: data.score };
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

  async getUserByGoogleId(googleId) {
    const result = await this.client.query(
      "SELECT user_id, username, google_id, apple_id FROM users WHERE google_id = $1",
      [googleId],
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
