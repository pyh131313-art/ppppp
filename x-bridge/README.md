# Discord Image to X Bridge

Small HTTP bridge for Make.com.

Flow:

1. Make receives a Discord message attachment URL.
2. Make calls `POST /post-image`.
3. This service downloads the image.
4. This service uploads the image to X.
5. This service creates an X post with the uploaded media.

## Environment variables

Copy `.env.example` values into your deployment environment:

- `BRIDGE_SECRET`: a long random password used by Make in the `x-bridge-secret` header
- `X_API_KEY`: X Developer App Consumer/API Key
- `X_API_SECRET`: X Developer App Consumer/API Secret
- `X_ACCESS_TOKEN`: X OAuth 1.0a Access Token
- `X_ACCESS_TOKEN_SECRET`: X OAuth 1.0a Access Token Secret

## API

Health check:

```http
GET /health
```

Post an image to X:

```http
POST /post-image
x-bridge-secret: your-bridge-secret
content-type: application/json

{
  "imageUrl": "https://cdn.discordapp.com/...",
  "text": ""
}
```

The `text` field is optional. Leave it empty for image-only posts.

## Make module

Add an HTTP `Make a request` module after the image filter:

- Method: `POST`
- URL: `https://your-render-service.onrender.com/post-image`
- Headers:
  - `x-bridge-secret`: your `BRIDGE_SECRET`
  - `content-type`: `application/json`
- Body type: raw JSON

```json
{
  "imageUrl": "{{Discord Attachments[].URL}}",
  "text": ""
}
```
