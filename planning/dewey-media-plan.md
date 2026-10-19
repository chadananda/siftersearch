# Dewey's media collection — the most important lectures on each tradition (draft, 2026-10-19)

Chad (10-18): "Besides the library, we will want to start a media collection with the most important lectures about each
tradition."

## What it is
Lectures, talks, courses and interviews (audio and video) on each tradition, kept as **media items with a transcript**.
The transcript makes a lecture searchable and quotable like a book: paragraphs with timestamps, so a search hit opens
the recording at that moment.

## How it fits what exists
| piece | books (today) | lectures (new) |
|---|---|---|
| list of what matters | scout lists (researched, cited) | the same researched lists: "the most important lectures and courses on X" — university courses (Yale Open Courses, Harvard Divinity, SOAS), named lecture series, the field's leading scholars; for the Bahá'í Faith, Wilmette Institute, ABS conferences, Irfan Colloquia, talks by Hands of the Cause |
| channels | archive.org, Google Books, … | YouTube (channel / playlist / video metadata), archive.org audio and video, university sites, podcasts (RSS), bahai-library lectures |
| held? | text compare | transcript compare (the same 4-gram compare), plus the media's own fingerprint (duration + title) |
| storage | archive on /tank (outside Dropbox) | **media on /tank only** — never in Dropbox (Chad 10-18: no video or audio in the synced folder); the library holds the transcript and a link |
| text | SearchLayerPDF / OCR | transcription: Whisper on boss (local GPU), or an API for volume; speaker turns kept |

## Decisions for Chad
1. **Keep the file, or link plus transcript?** Downloading YouTube lectures has terms-of-service issues. Proposed:
   - **YouTube:** link plus our transcript (from the captions when they exist, otherwise transcribed from the audio).
   - **archive.org, podcasts and university downloads that permit it:** keep the file on /tank.
2. **Transcription engine:** Whisper large-v3 on boss (free, about 10× real time on its GPU) vs an API (about $0.006 a
   minute: around $0.36 for an hour-long lecture).
3. **Where it shows:** a "Lectures" shelf for each tradition in the library, and search hits that link to a timestamp.

## First step once agreed
A `media-scout` built from the book scout (lists → held? → channels → transcript), a `media_items` table (url,
duration, speaker, date, transcript document id) and one tradition as a pilot.
