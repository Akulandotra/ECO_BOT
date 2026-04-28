// ╔══════════════════════════════════════════════════╗
// ║         EcoBot - Recycling AI Chatbot            ║
// ║         Backend Server (Node.js + Express)       ║
// ╚══════════════════════════════════════════════════╝


require("dotenv").config();
const express   = require("express");
const cors      = require("cors");
const multer    = require("multer");
const path      = require("path");
// Removed Gemini/GoogleGenerativeAI


const axios = require('axios');


const app  = express();
const PORT = process.env.PORT || 3000;




// Removed Gemini initialization


// OpenRouter API Key
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;




// OpenRouter API call function (supports vision model)
async function callOpenRouter(messages, imageDataUrl = null, userText = '') {
  const url = 'https://openrouter.ai/api/v1/chat/completions';
  const headers = {
    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
  };
  let model = 'openai/gpt-3.5-turbo';
  let payloadMessages = messages;
  if (imageDataUrl) {
    model = 'openrouter/auto';
    payloadMessages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: imageDataUrl }
          },
          {
            type: "text",
            text: `Analyze the provided image. Identify any objects or materials that are recyclable. Respond with specific recycling tips and resources relevant to what you see. Do not give generic responses; tailor recycling advice to the actual content of the image. ${userText ? "User says: " + userText : ''}`
          }
        ]
      }
    ];
  }
  const payload = {
    model,
    messages: payloadMessages,
    max_tokens: 500
  };
  try {
    const response = await axios.post(url, payload, { headers });
    return response.data.choices[0].message.content;
  } catch (err) {
    console.error('OpenRouter API error:', err.message);
    return null;
  }
}


app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.static(path.join(__dirname, "public")));


const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    ["image/jpeg","image/png","image/gif","image/webp"].includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error("Only image files allowed (JPG, PNG, GIF, WEBP)"));
  },
});


// ══════════════════════════════════════════════════════════════
//  OFFLINE KNOWLEDGE BASE — used when API is unavailable
// ══════════════════════════════════════════════════════════════
const KB = [
  {
    keys: ["plastic","bottle","pet","hdpe","pvc","ldpe","pp","ps","polystyrene","container","jug"],
    res: `♻️ **Plastic Recycling Guide**\n\n**✅ Usually Recyclable:**\n• **#1 PET** – Water/soda bottles\n• **#2 HDPE** – Milk jugs\n• **#5 PP** – Yogurt cups\n\n**❌ Often NOT Recyclable:**\n• **#3 PVC**\n• **#6 PS (Styrofoam)**\n\n**💡 Tips:** Rinse containers and crush bottles.`
  },
  {
    keys: ["paper","cardboard","newspaper","box"],
    res: `♻️ **Paper & Cardboard Guide**\n\n**✅ Recyclable:** Cardboard boxes, newspapers, envelopes.\n**❌ NOT Recyclable:** Greasy pizza boxes, paper towels.`
  },
  {
    keys: ["glass","jar"],
    res: `♻️ **Glass Recycling Guide**\n\n**✅ Recyclable:** Food jars and beverage bottles.\n**❌ NOT Recyclable:** Mirrors, light bulbs, Pyrex.`
  },
  {
    keys: ["metal","can","tin","foil"],
    res: `♻️ **Metal Recycling Guide**\n\n**✅ Recyclable:** Aluminium soda cans, steel food cans, clean foil.`
  },
  {
    keys: ["electronics","battery","ewaste","phone"],
    res: `♻️ **E-Waste Guide**\n\n**⚠️ NEVER put in regular bin!** Take to local e-waste collection centers or manufacturer take-back programs.`
  },
  {
    keys: ["compost","food","organic"],
    res: `🌱 **Composting Guide**\n\n**✅ Green:** Veggie scraps, coffee grounds.\n**✅ Brown:** Dry leaves, cardboard.\n**❌ No:** Meat, dairy, pet waste.`
  },
  {
    keys: ["reduce","reuse","zero waste","tips"],
    res: `🌍 **Sustainability Tips**\n\nUse reusable bags, bottles, and cloth napkins. Plan meals to avoid food waste. Repair items before replacing.`
  }
];


function fallback(msg) {
  const m = (msg || "").toLowerCase();
  const offTopic = ["weather","sport","movie","music","code","politics","stock","crypto"];
  if (offTopic.some(w => m.includes(w))) {
    return "I'm EcoBot, your recycling specialist! 🌿 I only answer questions about recycling and sustainability.";
  }
  const match = KB.find(k => k.keys.some(kw => m.includes(kw)));
  return (match?.res || `♻️ **EcoBot — Quick Guide**\n\n• Rinse containers\n• Flatten boxes\n• Batteries = hazardous waste!`) + "\n\n---\n*📡 Offline mode active.*";
}


const SYSTEM_PROMPT = `You are EcoBot, a specialized AI assistant dedicated to recycling and sustainability.
STRICT RULE: Only answer questions about recycling, composting, and eco-friendly living.
If asked anything else, politely decline. Use bullet points and bold text.`;


// ── Health check ───────────────────────────────────────────────


// Health check (OpenRouter only)
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    hasOpenRouterKey: !!(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.length > 10),
  });
});


// Test OpenRouter and image upload
app.post("/api/test-openrouter", upload.array("images", 4), async (req, res) => {
  try {
    const { message } = req.body;
    const files = req.files || [];
    if (!OPENROUTER_API_KEY) return res.json({ error: "No OpenRouter API key set." });
    const messages = [
      { role: "system", content: "You are EcoBot, a recycling and sustainability expert. Only answer recycling-related questions." },
      { role: "user", content: message || "What is this item?" }
    ];
    // Note: OpenRouter GPT-3.5-turbo does not support image input, so just test text
    const reply = await callOpenRouter(messages);
    res.json({ reply, imagesReceived: files.length });
  } catch (err) {
    console.error("API Error:", err.message, err.response?.data);
    res.json({ reply: fallback(req.body?.message || ""), source: "error-fallback", error: err.message, details: err.response?.data });
  }
});


// ── Chat endpoint (OpenRouter only) ───────────────────────────


app.post("/api/chat", upload.array("images", 4), async (req, res) => {
  try {
    const { message } = req.body;
    const files = req.files || [];
    if (!OPENROUTER_API_KEY) return res.json({ reply: fallback(message), source: "no-api-key" });


    let reply;
    if (files.length > 0) {
      // Only use the first image for now
      const file = files[0];
      const base64 = file.buffer.toString('base64');
      const dataUrl = `data:${file.mimetype};base64,${base64}`;
      reply = await callOpenRouter([], dataUrl, message || '');
    } else {
      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message || '' }
      ];
      reply = await callOpenRouter(messages);
    }


    res.json({ reply, imagesReceived: files.length, source: "openrouter-api" });
  } catch (err) {
    console.error("API Error:", err.message);
    res.json({ reply: fallback(req.body?.message || ""), source: "error-fallback" });
  }
});


app.use((err, req, res, next) => {
  res.status(400).json({ error: err.message });
});


app.listen(PORT, () => {
  const hasKey = process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.length > 10;
  console.log(`\n🌿 EcoBot running → http://localhost:${PORT}`);
  console.log(`   API Key: ${hasKey ? "✅ OpenRouter Set" : "❌ Not set (offline mode will be used)"}`);
  console.log(`   Fallback: ✅ Offline KB Ready\n`);
});
