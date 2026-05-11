import crypto from "node:crypto";
import http from "node:http";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PORT = Number(process.env.PORT || 3000);

const requiredEnv = [
  "BRIDGE_SECRET",
  "X_API_KEY",
  "X_API_SECRET",
  "X_ACCESS_TOKEN",
  "X_ACCESS_TOKEN_SECRET",
];

function assertEnv() {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

function encode(value) {
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function makeOAuthHeader(method, url, extraParams = {}) {
  const oauthParams = {
    oauth_consumer_key: process.env.X_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000),
    oauth_token: process.env.X_ACCESS_TOKEN,
    oauth_version: "1.0",
  };

  const allParams = { ...extraParams, ...oauthParams };
  const parameterString = Object.keys(allParams)
    .sort()
    .map((key) => `${encode(key)}=${encode(allParams[key])}`)
    .join("&");

  const baseString = [
    method.toUpperCase(),
    encode(url),
    encode(parameterString),
  ].join("&");

  const signingKey = `${encode(process.env.X_API_SECRET)}&${encode(process.env.X_ACCESS_TOKEN_SECRET)}`;
  const oauth_signature = crypto
    .createHmac("sha1", signingKey)
    .update(baseString)
    .digest("base64");

  return "OAuth " + Object.entries({ ...oauthParams, oauth_signature })
    .map(([key, value]) => `${encode(key)}="${encode(value)}"`)
    .join(", ");
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

async function downloadImage(imageUrl) {
  const url = new URL(imageUrl);
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new Error("imageUrl must be an HTTP or HTTPS URL");
  }

  const response = await fetch(url, {
    headers: { "User-Agent": "make-discord-x-bridge/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    throw new Error(`URL did not return an image. Content-Type: ${contentType}`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_IMAGE_BYTES) {
    throw new Error("Image is larger than X image upload limit of 5 MB");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("Image is larger than X image upload limit of 5 MB");
  }

  return { buffer, contentType };
}

async function uploadMedia(buffer, contentType) {
  const url = "https://upload.twitter.com/1.1/media/upload.json";
  const form = new FormData();
  form.append("media_category", "tweet_image");
  form.append("media", new Blob([buffer], { type: contentType }), "image");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: makeOAuthHeader("POST", url),
    },
    body: form,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`X media upload failed: ${response.status} ${JSON.stringify(data)}`);
  }
  if (!data.media_id_string) {
    throw new Error(`X media upload response missing media_id_string: ${JSON.stringify(data)}`);
  }
  return data.media_id_string;
}

async function createPost(mediaId, text) {
  const url = "https://api.x.com/2/tweets";
  const body = text
    ? { text, media: { media_ids: [mediaId] } }
    : { media: { media_ids: [mediaId] } };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: makeOAuthHeader("POST", url),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`X post failed: ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function handlePostImage(req, res) {
  if (req.headers["x-bridge-secret"] !== process.env.BRIDGE_SECRET) {
    sendJson(res, 401, { ok: false, error: "Unauthorized" });
    return;
  }

  const { imageUrl, text = "" } = await readJson(req);
  if (!imageUrl) {
    sendJson(res, 400, { ok: false, error: "Missing imageUrl" });
    return;
  }

  const { buffer, contentType } = await downloadImage(imageUrl);
  const mediaId = await uploadMedia(buffer, contentType);
  const post = await createPost(mediaId, text);
  sendJson(res, 200, { ok: true, mediaId, post });
}

assertEnv();

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && req.url === "/post-image") {
      await handlePostImage(req, res);
      return;
    }

    sendJson(res, 404, { ok: false, error: "Not found" });
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { ok: false, error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`X bridge listening on port ${PORT}`);
});
