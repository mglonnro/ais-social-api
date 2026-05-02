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

  const user = await db.createUser(
    Object.assign({}, base, { username: nickName }),
  );
  await db.close();
  return user;
};

/* Look up an existing user by deviceId or create a fresh anonymous one.
   The returned user is indistinguishable from any other — same shape, same
   downstream code paths (scores, media, getUserSpotted). */
const getOrCreateAnonymousUser = async (deviceId) => {
  const db = new DB();
  await db.connect();
  try {
    let user = await db.getUserByDeviceId(deviceId);
    if (!user) {
      let nickName = await getUniqueNickName();
      user = await db.createUser({ username: nickName, deviceId });
    }
    return user;
  } finally {
    await db.close();
  }
};

export { createUser, getUniqueNickName, getOrCreateAnonymousUser };
