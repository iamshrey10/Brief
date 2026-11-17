# Brief demo video: production notes

Final file: `Brief-Project-Demo.mp4` (the same file the landing page plays, `web/public/demo/brief-demo.mp4`). H.264 (High profile) video, 1920 by 1080, 30 frames per second, AAC audio at 48 kHz stereo, 89.6 seconds, about 16 MB.

## What is real in the footage

- The website is the real Brief website, running locally, light theme, at a 1280 by 720 window captured at twice its pixel density (2560 by 1440), so the 1080p picture is not upscaled.
- The API is the real Brief API, with a real Postgres and real Google Gemini calls. The key terms, the "Before you sign" questions and both answers are the model's real output for the sample lease, not canned text.
- The document is the sample lease that ships with the site (`web/public/samples/sample-lease.pdf`). Every name and amount in it is made up. It was read into clauses with the API's own reading code (text extraction, clauses, real embeddings).
- The signed-in account is a test account. Its address is changed to example.com in the pictures, so no real address appears.
- The sharing screens (the Shared page and the invitation) and the two-step verification and Profile screens are the real website screens, but they were captured against the website's stand-in test API, because the local database stopped working while the video was being finished. They show no AI output. The limits on the Profile page were set to Brief's real daily limits (40 questions, 10 reads, 20 overviews), the invitation link was changed to show briefcontracts.com and a made-up token, and the code and the two-step key are test values.

## What is not shown as it really happens

- The upload itself. Local file storage was not connected, so the sample lease was read by the API's reading code directly. The video shows the real upload panel and says a document can be a PDF, a scan or up to five photos, but it does not show a file being uploaded.
- Time. Reading, the key terms and the answer are shown without their waiting time: the key terms took about 45 seconds to build the first time, and the answer about 5 seconds. The video shows the finished screens, and shows the "Reading the document" moment briefly.
- Typing and cursor movement are made by a script, so they are smooth and deliberate. They are not a recording of a person.
- The stack scene and the opening are drawings made for the video, with the real technology names and models. The logos are the official marks from the open simple-icons set, and the names and marks belong to their owners.

## How it was made

1. The running app was driven by a script that took still pictures of each screen (the landing page, the dashboard, the documents page, the overview, the clause view, "Before you sign", and the Ask tab at each stage of typing, waiting, answering and checking the source).
2. One page, built with the landing page's own fonts (Fraunces and Geist) and colours, plays those stills as video: it moves a cursor, zooms the camera, draws the rings, the cards and the captions, and is rendered frame by frame at 30 frames per second.
3. The voice is Kokoro (`am_fenrir`, speed 1.1), one clip per sentence, placed at the moment each sentence is about its picture. A quiet ambient pad made for the video sits under it and lowers while the voice speaks, so there is no third-party music to license. The mix is set to about -16 LUFS.
4. The frames and the sound were joined with H.264 and AAC.

Every spoken sentence is burned into the picture as a caption, from the first line to the last, and the same sentences are in the captions file (`brief-demo.vtt`) for the video window's captions button.

## Checks made on the final file

- Duration 89.6 seconds, which is within 85 to 90 seconds.
- Played in the video window on the landing page in a desktop browser at 1440 by 900, 1280 by 720 and 1280 by 600, and in phone-sized windows (390 by 844 and 844 by 390 sideways): it starts, plays, decodes audio and video, reaches its end, and Escape closes it and returns focus to the button.
- No frame is black or empty, and the last frame fades to the page colour instead of cutting off.

## Limits

- The voice is a synthetic voice. It is clear and steady but not a human recording.
- Fullscreen is the browser's own button. It was not tested on a real phone for this video, only in phone-sized windows.
- Audio was checked by measuring its level and that it decodes, and by playing it in the page. The mix was not listened to on several speakers.
- The text of the video is in English only.

## Rebuilding

The pieces used to make the video are kept in the `Brief-Demo-Video/source-v5` folder on the Desktop (the film page, the capture scripts, the voice script and the audio mix). They need the running app and a Kokoro model file to be run again.
