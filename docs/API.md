# SkillUp Chat — API Reference

## Base URL

```
http://<VPS_IP>:3001
```

Replace `<VPS_IP>` with the server's IP address.  
All endpoints return `Content-Type: application/json`.

---

## Authentication

Protected endpoints require a **Bearer token** in the `Authorization` header:

```
Authorization: Bearer <token>
```

Tokens are obtained from `/auth/register` or `/auth/login` and are valid for **30 days**.

---

## Endpoints

### GET /health

Health check. No authentication required.

**Response**
```json
{
  "status": "ok",
  "timestamp": "2026-11-16T10:00:00.000Z"
}
```

---

### POST /auth/register

Create a new user account.

**Request body** (`application/json`)

| Field       | Type   | Required | Description        |
|-------------|--------|----------|--------------------|
| `full_name` | string | ✅       | Your full name     |
| `password`  | string | ✅       | Any password       |

```json
{
  "full_name": "John Doe",
  "password": "mypassword"
}
```

**Response `201`**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "user": {
    "id": 1,
    "full_name": "John Doe"
  }
}
```

**Error responses**
| Status | `error` message                        | Cause                       |
|--------|----------------------------------------|-----------------------------|
| `400`  | `full_name and password are required`  | Missing field               |
| `409`  | `A user with this name already exists` | Name already registered     |

---

### POST /auth/login

Authenticate and receive a token.

**Request body** (`application/json`)

| Field       | Type   | Required |
|-------------|--------|----------|
| `full_name` | string | ✅       |
| `password`  | string | ✅       |

```json
{
  "full_name": "John Doe",
  "password": "mypassword"
}
```

**Response `200`**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "user": {
    "id": 1,
    "full_name": "John Doe"
  }
}
```

**Error responses**
| Status | `error` message               | Cause                 |
|--------|-------------------------------|-----------------------|
| `400`  | `full_name and password are required` | Missing field |
| `404`  | `User not found`              | Name not registered   |
| `401`  | `Incorrect password`          | Wrong password        |

---

### GET /messages

Fetch all messages with their reactions. Poll this every 2–3 seconds to stay updated.  
🔒 **Requires auth token.**

**Query parameters** (all optional)

| Param   | Type    | Default | Description                                              |
|---------|---------|---------|----------------------------------------------------------|
| `since` | integer | —       | Return only messages with `id` greater than this value. Useful for optimization — omit to always get the full history. |
| `limit` | integer | `100`   | Maximum number of messages to return.                    |

**Examples**
```
GET /messages
GET /messages?since=42
GET /messages?limit=50
```

**Response `200`**
```json
{
  "messages": [
    {
      "id": 1,
      "content": "Hello everyone!",
      "type": "text",
      "photo_url": null,
      "created_at": "2026-11-16T10:00:00",
      "user": {
        "id": 1,
        "full_name": "John Doe"
      },
      "reactions": [
        {
          "emoji": "👍",
          "user_id": 2,
          "full_name": "Jane Smith"
        }
      ]
    },
    {
      "id": 2,
      "content": "Check this out",
      "type": "photo",
      "photo_url": "/uploads/1700000000000-abc1234.jpg",
      "created_at": "2026-11-16T10:01:00",
      "user": {
        "id": 2,
        "full_name": "Jane Smith"
      },
      "reactions": []
    }
  ]
}
```

> **Photos**: construct the full image URL as `{BASE_URL}{photo_url}`.  
> Example: `http://<VPS_IP>:3001/uploads/1700000000000-abc1234.jpg`

**Message types**

| `type`  | `content`               | `photo_url`           |
|---------|-------------------------|-----------------------|
| `text`  | The message text        | `null`                |
| `photo` | Caption (may be `null`) | Path to the image     |

---

### POST /messages

Send a text message.  
🔒 **Requires auth token.**

**Request body** (`application/json`)

| Field     | Type   | Required | Description   |
|-----------|--------|----------|---------------|
| `content` | string | ✅       | Message text  |

```json
{
  "content": "Hey folks!"
}
```

**Response `201`** — the created message object (same shape as one item in `GET /messages`)
```json
{
  "id": 3,
  "content": "Hey folks!",
  "type": "text",
  "photo_url": null,
  "created_at": "2026-11-16T10:02:00",
  "user": {
    "id": 1,
    "full_name": "John Doe"
  },
  "reactions": []
}
```

**Error responses**
| Status | `error` message         | Cause             |
|--------|-------------------------|-------------------|
| `400`  | `content is required`   | Empty body/field  |

---

### POST /messages/photo

Upload and send a photo. Use `multipart/form-data`.  
🔒 **Requires auth token.**

**Form fields**

| Field     | Type | Required | Description                    |
|-----------|------|----------|--------------------------------|
| `photo`   | file | ✅       | Image file (max 10 MB)         |
| `caption` | text | ❌       | Optional caption text          |

**Example using fetch**
```js
const formData = new FormData();
formData.append('photo', fileInput.files[0]);
formData.append('caption', 'Look at this!'); // optional

fetch('http://<VPS_IP>:3001/messages/photo', {
  method: 'POST',
  headers: { 'Authorization': 'Bearer <token>' },
  body: formData
});
```

**Response `201`**
```json
{
  "id": 4,
  "content": "Look at this!",
  "type": "photo",
  "photo_url": "/uploads/1700000000001-xyz5678.jpg",
  "created_at": "2026-11-16T10:03:00",
  "user": {
    "id": 1,
    "full_name": "John Doe"
  },
  "reactions": []
}
```

**Error responses**
| Status | `error` message              | Cause              |
|--------|------------------------------|--------------------|
| `400`  | `photo file is required`     | No file attached   |
| `400`  | `Only image files are allowed` | Non-image file   |
| `400`  | _(multer size error)_        | File exceeds 10 MB |

---

### POST /messages/:id/react

Add or remove an emoji reaction on a message. Calling the same endpoint with the same emoji **twice toggles it off**.  
🔒 **Requires auth token.**

**URL parameter**

| Param | Type    | Description |
|-------|---------|-------------|
| `id`  | integer | Message ID  |

**Request body** (`application/json`)

| Field   | Type   | Required | Description        |
|---------|--------|----------|--------------------|
| `emoji` | string | ✅       | Any emoji character |

```json
{
  "emoji": "👍"
}
```

**Response `200`**
```json
{
  "action": "added",
  "emoji": "👍",
  "message_id": 3
}
```

or, if the reaction already existed (toggled off):
```json
{
  "action": "removed",
  "emoji": "👍",
  "message_id": 3
}
```

**Error responses**
| Status | `error` message         | Cause                   |
|--------|-------------------------|-------------------------|
| `400`  | `emoji is required`     | Missing field           |
| `404`  | `Message not found`     | Invalid message ID      |

---

## Polling pattern (recommended)

Call `GET /messages` every 2–3 seconds. No WebSocket needed.

```js
// Initial load
await fetchMessages();

// Poll
setInterval(fetchMessages, 2500);

async function fetchMessages() {
  const res = await fetch('http://<VPS_IP>:3001/messages', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const { messages } = await res.json();
  renderMessages(messages); // update your UI
}
```

> **Optimization**: pass `?since=<lastId>` to only receive new messages. Keep in mind that this will miss reactions added to old messages, so use it only if you re-fetch the full list periodically or handle reactions separately.

---

## Error format

Every error response has this shape:

```json
{
  "error": "Human-readable description"
}
```

---

## Photo URL construction

The `photo_url` field is a path like `/uploads/filename.jpg`.  
Prepend the base URL to get the full link:

```
http://<VPS_IP>:3001/uploads/filename.jpg
```

Images are served publicly — no auth header needed to display them in `<img>` tags.
