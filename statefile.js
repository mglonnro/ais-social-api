import fs from "fs";

class StateFile {
  static readJSON(filename) {
    try {
      var data = fs.readFileSync(filename, "utf8");
      return JSON.parse(data);
    } catch (err) {
      return {};
    }
  }

  static writeJSON(filename, a) {
    try {
      fs.writeFileSync(filename, JSON.stringify(a));
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  }
}

export default StateFile;
