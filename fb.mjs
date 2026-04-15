import { Storage } from "@google-cloud/storage";

const uploadToStorage = async (mmsi, fname, bname, contentType) => {
  const projectId = "ais-social";

  const storage = new Storage({
    projectId,
  });

  const bucket = storage.bucket("gs://ais-social.appspot.com");
  const res = await bucket.upload(fname, {
    destination: "images/" + bname,
    contentType: contentType,
  });

  console.log(res);
  return res;
};

export { uploadToStorage };
