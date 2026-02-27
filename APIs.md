# APIs

## Media API Schema (DIY)

MCV does not ship with a hosted media API. You need to implement this endpoint on your own website/backend as either a static JSON file or a dynamically generated JSON response. For downloading Youtube videos, I recommend using [yt-dlp](https://github.com/yt-dlp/yt-dlp) which can run as both a compiled CLI and a Python library which can be installed with `pip install yt-dlp`, then make them available through your media API. Remember to include the `youtube_id` field in the response for videos when applicable so that you can paste YouTube links into the selector and have them automatically resolve to the corresponding video from your API and seek to the `&t=` timestamp.

Expected endpoint:

- `GET {media_api}`

Example of an expected JSON response:

```json
{
  "videos": {
    "mcc11-dream-parkour": {
      "name": "Dream MCC 11 Parkour",
      "url": "https://example.com/videos/mcc11-dream-parkour.mp4",
      "youtube_id": "dQw4w9WgXcQ"
    }
  },
  "images": {
    "reference-frame-001": {
      "name": "Reference Frame 001",
      "url": "https://example.com/images/reference-frame-001.png"
    }
  }
}
```

Schema notes:

- `videos`: optional object
- each key in `videos` is your custom stable video ID
- each `videos` value:
  - `name` (required string): display name
  - `url` (required string): direct playable video URL (raw file URL, not a YouTube/Vimeo/etc. page)
  - `youtube_id` (optional string): source YouTube ID when applicable
- `images`: optional object
- each key in `images` is your custom stable image ID
- each `images` value:
  - `name` (required string): display name
  - `url` (required string): direct image URL

This API is intentionally simple and provider-agnostic. You can back it with R2, S3, local files, or any other storage, as long as the returned `url` is accessible to your MCV target.

Naming plan:

- This schema is the **Media API**.
- A separate **Data API** schema can be added later for database writes/reads.
