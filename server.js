import Anthropic from "@anthropic-ai/sdk";
import { google } from "googleapis";
import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

// Google Sheets setup
const SHEET_ID = "1Vgeu0AcIXQGDac_O1T66wd5yySZ01ndfTRjPBHW76A8";

function getGoogleAuth() {
  let credentials;
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
  } else {
    try {
      credentials = JSON.parse(fs.readFileSync("original-mason-496008-i2-925d00bd422b.json", "utf8"));
    } catch {
      return null;
    }
  }
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function logToSheet(task) {
  const auth = getGoogleAuth();
  if (!auth) return;
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "Sheet1!A:B",
    valueInputOption: "RAW",
    requestBody: {
      values: [[new Date().toISOString(), task]],
    },
  });
}

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

app.post("/api/analyze", async (req, res) => {
  const { task } = req.body;

  if (!task || task.trim().length === 0) {
    return res.status(400).json({ error: "Task is required" });
  }

  // Log submission to Google Sheets (fire and forget)
  logToSheet(task.trim()).catch((err) => console.error("Sheets error:", err.message));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const send = (data) => {
    res.write(data);
    if (typeof res.flush === "function") res.flush();
  };

  // DEMO MODE: streams a fake response when no API key is set
  if (!process.env.ANTHROPIC_API_KEY) {
    const mockText = `Great news — this is exactly the kind of task that AI handles brilliantly! You could use Power Automate or Zapier to set up an automated workflow that does this for you in seconds, every time, without you lifting a finger. Tools like ChatGPT or Claude can also draft, summarise, or extract data from documents and emails automatically. As a first step, try opening Power Automate (it's already in your Microsoft 365) and search for a template matching your task — you might be surprised how close a ready-made solution already is.`;
    const words = mockText.split(" ");
    for (const word of words) {
      send(`data: ${JSON.stringify({ text: word + " " })}\n\n`);
      await new Promise(r => setTimeout(r, 40));
    }
    send("data: [DONE]\n\n");
    res.end();
    return;
  }

  try {
    const stream = client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 512,
      system: `You are an enthusiastic workplace efficiency consultant helping Finance employees at a company townhall.

Company context — planning cycles used by this organisation:
- RBU2 = Regular Business Update (planning cycle)
- PhB = Phased Budget (planning cycle)
- MTP = Mid-Term Plan (planning cycle)
If the user mentions any of these, you understand what they mean and can reference them by name in your response.

When someone describes a tedious work task, respond in exactly this structured format:

**🔍 The Problem**
- bullet point 1 describing what makes this task painful
- bullet point 2 describing why it is time-consuming
- bullet point 3 (optional) another pain point

**🤖 How AI Can Help**

***Microsoft Copilot:***
- bullet point on how a specific Copilot feature helps (mention exact app: PowerPoint, Word, Excel, Outlook, Teams)
- bullet point on another Copilot feature
- bullet point on another Copilot feature (optional)

***ChatGPT:***
- bullet point on how ChatGPT helps with this task
- bullet point on another way ChatGPT helps
- bullet point on another way (optional)

**✅ Your First Step**
One single concrete action they can take today — specific app, specific action, specific prompt to type

Rules:
- Always use exactly these sections with these exact headers and emojis
- Always split the AI section into Copilot and ChatGPT subsections
- Bullet points only — no flowing prose
- Keep bullets short and punchy
- Only recommend Microsoft Copilot and ChatGPT — no other tools
- Warm, energetic, professional tone
- Do NOT add --- separators or blank lines between sections
- IMPORTANT: Always respond in the same language the user wrote in. If the user writes in Russian, respond entirely in Russian including all section headers and bullets. If the user writes in English, respond entirely in English.`,
      messages: [
        {
          role: "user",
          content: `I'm tired of doing this task at work: "${task.trim()}"\n\nHow could AI or automation help me with this?`,
        },
      ],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        send(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    send("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    console.error("Claude API error:", error.message);
    send(
      `data: ${JSON.stringify({ error: "Something went wrong. But hey — the Prosecco option below still works." })}\n\n`
    );
    res.end();
  }
});

// Keep-alive ping to prevent Render free tier from sleeping
const RENDER_URL = process.env.RENDER_EXTERNAL_URL;
if (RENDER_URL) {
  setInterval(() => {
    fetch(RENDER_URL).catch(() => {});
  }, 10 * 60 * 1000); // every 10 minutes
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀  Server running at http://localhost:${PORT}\n`);
  console.log(
    "  Make sure ANTHROPIC_API_KEY is set in your environment.\n"
  );
});
