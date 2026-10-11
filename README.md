# Issue Spotter (Vercel)

## Files
- `index.html`: the app
- `api/chat.js`: server function that holds your API key and forwards requests to Anthropic
- `vercel.json`: gives that function up to 300 seconds (long answers with all nine thinkers can take 1 to 2 minutes) per request

## Setup
1. Replace the files in your existing Vercel project with these three (keep the `api` folder).
2. In Vercel: Project > Settings > Environment Variables, add:
   - `ANTHROPIC_API_KEY` = your key (required)
   - `ACCESS_CODE` = a short passcode of your choosing (recommended)
   - `ANTHROPIC_WORKSPACE_ID` = only if your key isn't tied to a workspace
3. Redeploy (Deployments > ... > Redeploy). Environment variables only apply to new deployments.
4. Open the site. If you set `ACCESS_CODE`, the first question on each device asks for it once.

## How it answers
- First answer to a new situation uses only each thinker's core paragraph and vocabulary list (no reading search), so it stays focused.
- Follow-up questions add the class notes, study-guide examples, and a search over the full readings.
- Tap a thinker's ⓘ for their core idea, or any highlighted term for its definition. "Open the full study guide" in the thinkers menu shows every core paragraph and vocabulary list, and can be printed or saved as a PDF.
- To edit the core paragraphs or vocabulary, change the GUIDE data near the top of the script in index.html.
