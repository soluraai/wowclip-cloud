# Capiyo's caption editor inside wowclip

wowclip's reel editor is not a rebuild: it is the editor of **Capiyo** (our caption app, deployed on Cloudflare),
copied file for file. Same editor screen, same caption engine, same styles, same export dialog.

```
capiyo/
├── app/src/        Capiyo's editor: Editor.tsx, the style library, settings panels, word timeline,
│                   Remotion preview, export dialog, My styles, fonts (96 files)
└── captions/src/   Capiyo's caption engine: every Basic, Standard and Premium style, written with Remotion
                    (196 files). The deployed render site the AWS Lambdas open runs this same engine.
```

The folder keeps Capiyo's own layout (`app/src` next to `captions/src`) because some files import each other with
relative paths like `../../../captions/src/...`. The `@caption-...` import names are set in `frontend/tsconfig.json`,
the same names Capiyo uses.

Only the files the editor really uses were copied: the copy started at the editor page and followed every import.
Capiyo's public files (fonts, style previews, style images and videos) are in `frontend/public/`.

## The 5 files that are different

Everything is unchanged except these five, which in Capiyo talk to services wowclip does not have. Each one says
so in its first lines.

| File | In Capiyo | In wowclip |
| --- | --- | --- |
| `app/src/auth/client.ts` | adds the Firebase sign-in token to every request | no sign-in: no token |
| `app/src/auth/AuthGate.tsx` | Google sign-in, credits balance, account menu | lets everyone in; the account menu is a "Render history" link |
| `app/src/projects/live.ts` | listens to Firestore for live status changes | asks the wowclip backend every 2 seconds |
| `app/src/app/api/usage/route.ts` | server route for credits | only the type the editor names |
| `app/src/server/billing.ts` | payments | only the type the editor names |

## Where the editor's requests go

The editor calls the same addresses it calls in Capiyo. In wowclip they are answered like this:

| Address | Answered by |
| --- | --- |
| `/api/projects/<id>` (open, save draft), `/video`, `/language`, `/transcribe` | Python backend, `backend/editor/` |
| `/api/projects/<id>/render` (Export) | `frontend/app/api/projects/[id]/render/route.ts`: Capiyo's render planning, then the Python backend starts the Lambdas |
| `/api/styles` (My styles) | Python backend, saved in S3 |
| `/api/caption-assets/<id>` | Capiyo's own route (fonts) |
| `/api/caption-file/<path>` | redirected to the file in `public/` (`frontend/next.config.ts`) |
| `/api/ai/enhance` (AI emphasis) | answers "not part of wowclip" |

A project id is `<job id>-<clip number>`: one clip that wowclip's AI found.

## What wowclip does not use

Sign-in, credits and payments (every export is free, so Export always says "Free"), uploading your own video,
ElevenLabs transcription (wowclip uses the YouTube video's own captions), caption translation and the AI emphasis
pass.
