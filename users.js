import {
  uniqueNamesGenerator,
  adjectives,
  colors,
  animals,
  NumberDictionary,
} from "unique-names-generator";

import DB from "./db.js";

const generateNickName = () => {
  const numberDictionary = NumberDictionary.generate({ min: 100, max: 999 });

  let dictionary =
    Math.random() < 0.5
      ? [adjectives, animals, numberDictionary]
      : [colors, animals, numberDictionary];
  const randomName = uniqueNamesGenerator({
    dictionaries: dictionary,
    style: "capital",
    separator: "",
  });
  return randomName;
};

const getUniqueNickName = async () => {
  const db = new DB();
  await db.connect();

  /* Generate random nickname */
  var nickName;

  while (!nickName) {
    nickName = generateNickName();
    if ((await db.isNickAvailable(nickName)) !== true) {
      nickName = undefined;
    }
  }

  await db.close();
  return nickName;
};

const createUser = async (base) => {
  const db = new DB();
  await db.connect();

  let nickName = await getUniqueNickName();

  const user = db.createUser(Object.assign({}, base, { username: nickName }));
  await db.close();
  return user;
};

export { createUser, getUniqueNickName };
