const express = require("express");

const app = express();
app.use(express.json());

// Change this if OpenAI retires the model (see platform.openai.com/docs/models)
const MODEL = "gpt-4o-mini";

// ---------- The website (HTML + CSS + browser JavaScript) ----------
const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Animal Facts Chatbot</title>
  <style>
    body { margin: 0; background: #fafafa; font-family: sans-serif; color: #111; }
    main { max-width: 640px; margin: 0 auto; padding: 24px; }
    #chat { margin: 16px 0; min-height: 300px; }
    .msg { padding: 10px; border-radius: 8px; white-space: pre-wrap; margin: 8px 0; }
    .user { background: #e8f0fe; }
    .bot { background: #f1f8e9; }
    #slider { width: 100%; }
    #input { width: 75%; padding: 8px; }
    button { padding: 8px; margin-left: 8px; }
  </style>
</head>
<body>
<main>
  <h1>🐾 Animal Facts Chatbot</h1>

  <label>
    Creativity: <span id="tempLabel">0.5 (balanced)</span>
    <input id="slider" type="range" min="0" max="1" step="0.1" value="0.5">
  </label>

  <div id="chat"></div>

  <input id="input" placeholder="Ask about any animal…">
  <button id="send">Send</button>
</main>

<script>
  var messages = [];
  var loading = false;
  var slider = document.getElementById("slider");
  var tempLabel = document.getElementById("tempLabel");
  var chat = document.getElementById("chat");
  var input = document.getElementById("input");

  function labelFor(t) { return t < 0.3 ? "basic" : t < 0.7 ? "balanced" : "rich"; }

  slider.addEventListener("input", function () {
    var t = Number(slider.value);
    tempLabel.textContent = t.toFixed(1) + " (" + labelFor(t) + ")";
  });

  function addMessage(role, text) {
    var div = document.createElement("div");
    div.className = "msg " + (role === "user" ? "user" : "bot");
    var b = document.createElement("b");
    b.textContent = (role === "user" ? "You" : "Bot") + ": ";
    div.appendChild(b);
    div.appendChild(document.createTextNode(text));
    chat.appendChild(div);
    return div;
  }

  async function send() {
    var text = input.value.trim();
    if (!text || loading) return;
    messages.push({ role: "user", content: text });
    addMessage("user", text);
    input.value = "";
    loading = true;
    var thinking = addMessage("assistant", "Thinking…");
    try {
      var res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messages, temperature: Number(slider.value) })
      });
      var data = await res.json();
      var reply = data.reply || data.error || "Something went wrong.";
      thinking.remove();
      addMessage("assistant", reply);
      if (data.reply) messages.push({ role: "assistant", content: reply });
    } catch (e) {
      thinking.remove();
      addMessage("assistant", "Network error, please try again.");
    }
    loading = false;
  }

  document.getElementById("send").addEventListener("click", send);
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") send(); });
</script>
</body>
</html>`;

// ---------- Serve the website ----------
app.get("/", (req, res) => {
  res.type("html").send(PAGE);
});

// ---------- Chat backend (calls OpenAI, key stays on the server) ----------
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, temperature } = req.body;
    const t = Math.min(1, Math.max(0, Number(temperature) || 0));

    const style =
      t < 0.3
        ? "Give only basic facts in 2-3 short, plain sentences."
        : t < 0.7
        ? "Give a friendly answer with a few interesting facts."
        : "Be rich, vivid and creative: surprising facts, vivid comparisons, storytelling.";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + process.env.OPENAI_API_KEY,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: t * 1.2, // slider 0-1 becomes OpenAI temperature 0-1.2
        max_completion_tokens: 700,
        messages: [
          {
            role: "system",
            content:
              "You are an animal expert chatbot. Only discuss animals; politely redirect other topics. " +
              style,
          },
          ...(Array.isArray(messages) ? messages.slice(-10) : []),
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("OpenAI error:", JSON.stringify(data));
      return res.status(500).json({
        error: "The chatbot had a problem (OpenAI error " + response.status + "). Check the Vercel logs.",
      });
    }
    res.json({ reply: data.choices[0].message.content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "The chatbot had a problem. Please try again." });
  }
});

// Vercel uses the exported app; locally you can run "node server.js"
module.exports = app;
if (require.main === module) {
  app.listen(3000, () => console.log("Running on http://localhost:3000"));
}
