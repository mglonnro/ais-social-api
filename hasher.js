import crypto from "crypto";
import fs from "fs";

class Hasher {
  getHash(f) {
    return new Promise((resolve, reject) => {
      var hash = crypto.createHash("md5");

      try {
        var stream = fs.createReadStream(f);

        stream.on("data", function (data) {
          hash.update(data);
        });

        stream.on("end", function () {
          resolve(hash.digest("hex")); // 34f7a3113803f8ed3b8fd7ce5656ebec
        });
      } catch (err) {
        reject(err);
      }
    });
  }
}

export default Hasher;
