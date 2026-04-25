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
// (e.g. "images/topdown/123456789-<ts>.png"). Returns the public HTTPS URL.
// publicRead so the mobile app can <Image> the result directly — user
// originals at images/<uuid> are private and only their auto-generated
// thumbnails are public; we don't have a thumbnail extension watching
// images/topdown/, and our PNG is already icon-sized.
//
// cacheControl is long+immutable because callers write to a unique
// destination per version. Re-uploading to the same path does NOT
// invalidate Google's edge cache, so we treat every URL as content-
// addressed: new version → new path → new URL.
const uploadBufferToStorage = async (buffer, destination, contentType) => {
  const bucket = getBucket();
  const file = bucket.file(destination);
  await file.save(buffer, {
    contentType,
    resumable: false,
    predefinedAcl: "publicRead",
    metadata: { cacheControl: "public, max-age=31536000, immutable" },
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
