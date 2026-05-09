import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

app.post("/api/analyze", async (req, res) => {
  const { task } = req.body;

  if (!task || task.trim().length === 0) {
    return res.status(400).json({ error: "Task is required" });
  }

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
      model: "claude-opus-4-7",
      max_tokens: 512,
      thinking: { type: "adaptive" },
      system: `You are an enthusiastic workplace efficiency consultant helping Finance employees at a company townhall.

Company context — planning cycles used by this organisation:
- RBU2 = Regular Business Update (planning cycle)
- PhB = Phased Budget (planning cycle)
- MTP = Mid-Term Plan (planning cycle)
If the user mentions any of these, you understand what they mean and can reference them by name in your response.

When someone describes a tedious work task, respond in exactly this structured format:

**🔍 The Problem**
- 2-3 bullet points describing what makes this task painful and time-consuming

**🤖 How AI Can Help**

*Microsoft Copilot:*
- 2-3 bullet points on how specific Copilot features help (mention the exact app: PowerPoint, Word, Excel, Outlook, Teams)

*ChatGPT:*
- 2-3 bullet points on how ChatGPT can help with this specific task

**✅ Your First Step**
One single concrete action they can take today — specific app, specific action, specific prompt to type

Rules:
- Always use exactly these sections with these exact headers and emojis
- Always split the AI section into Copilot and ChatGPT subsections
- Bullet points only — no flowing prose
- Keep bullets short and punchy
- Only recommend Microsoft Copilot and ChatGPT — no other tools
- Warm, energetic, professional tone
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀  Server running at http://localhost:${PORT}\n`);
  console.log(
    "  Make sure ANTHROPIC_API_KEY is set in your environment.\n"
  );
});
