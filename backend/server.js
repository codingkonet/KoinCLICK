
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import fs from "fs";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();
const app = express();
app.use(cors());
app.use(bodyParser.json());

const USERS_FILE = "./users.json";
const CHATS_FILE = "./chats.json";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const readJSON = (f, d) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f)) : d;
const writeJSON = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

app.post("/register", (req, res) => {
  const users = readJSON(USERS_FILE, []);
  const { email, password } = req.body;
  if (users.find(u => u.email === email))
    return res.status(400).json({ message: "User exists" });
  users.push({ email, password });
  writeJSON(USERS_FILE, users);
  res.json({ message: "Welcome to KoinCLICK 🎉" });
});

app.post("/login", (req, res) => {
  const users = readJSON(USERS_FILE, []);
  const { email, password } = req.body;
  const user = users.find(u => u.email === email && u.password === password);
  if (!user) return res.status(401).json({ message: "Invalid login" });
  res.json({
    message: "Login successful",
    isAdmin: email === process.env.ADMIN_EMAIL
  });
});

app.post("/chat-stream", async (req, res) => {
  const { email, message } = req.body;
  const chats = readJSON(CHATS_FILE, {});
  chats[email] = chats[email] || [];
  chats[email].push({ role: "user", content: message });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.flushHeaders();

  const stream = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: chats[email],
    stream: true
  });

  let reply = "";

  for await (const part of stream) {
    const token = part.choices[0]?.delta?.content;
    if (token) {
      reply += token;
      res.write(`data: ${token}\n\n`);
    }
  }

  chats[email].push({ role: "assistant", content: reply });
  writeJSON(CHATS_FILE, chats);
  res.end();
});

app.get("/admin/chats", (req, res) => {
  res.json(readJSON(CHATS_FILE, {}));
});

app.listen(3000, () =>
  console.log("🚀 KoinCLICK server running on http://localhost:3000")
);
