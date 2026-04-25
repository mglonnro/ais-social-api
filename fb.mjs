import { Storage } from "@google-cloud/storage";

const PROJECT_ID = "ais-social";
const BUCKET_URI = "gs://ais-social.appspot.com";
const PUBLIC_BASE = "https://storage.googleapis.com/ais-social.appspot.com/";

const getBucket = () => {
  const storage = new Storage({ projectId: PROJECT_ID });
  return storage.bucket(BUCKET_URI);
};

const uploadToStorage = async (mmsi, fname, bname, contentType) => {
  const bucket = getBucket();
  const res = await bucket.upload(fname, {
    destination: "images/" + bname,
    contentType: contentType,
  });

  console.log(res);
  return res;
};

// Uploads an in-memory buffer to an exact destination path inside the bucket
// (e.g. "images/topdown/123456789.png"). Returns the public HTTPS URL.
const uploadBufferToStorage = async (buffer, destination, contentType) => {
  const bucket = getBucket();
  const file = bucket.file(destination);
  await file.save(buffer, {
    contentType,
    resumable: false,
    metadata: { cacheControl: "public, max-age=3600" },
  });
  return PUBLIC_BASE + destination;
};

// Downloads an object from any bucket using the service-account credentials.
// Needed because user-uploaded media in our bucket is not publicly readable —
// plain `fetch` against the storage.googleapis.com URL returns 403.
const downloadFromStorage = async (bucketName, objectName) => {
  const storage = new Storage({ projectId: PROJECT_ID });
  const [buf] = await storage.bucket(bucketName).file(objectName).download();
  return buf;
};

export { uploadToStorage, uploadBufferToStorage, downloadFromStorage };
