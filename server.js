import Anthropic from "@anthropic-ai/sdk";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const client = new Anthropic();

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

  try {
    const stream = client.messages.stream({
      model: "claude-opus-4-7",
      max_tokens: 512,
      thinking: { type: "adaptive" },
      system: `You are an enthusiastic workplace efficiency consultant helping employees at a company department meeting. When someone describes a tedious work task, give them a concise, practical, and encouraging response about how AI or automation could help them save time.

Rules:
- 3-4 sentences max — punchy and readable
- Mention specific tools or approaches (e.g., Python scripts, Zapier, ChatGPT, RPA, n8n, Power Automate, Excel macros)
- Flowing prose — no bullet points, no headers
- Warm, energetic, professional tone
- End with a concrete first step they could take`,
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
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    console.error("Claude API error:", error.message);
    res.write(
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
