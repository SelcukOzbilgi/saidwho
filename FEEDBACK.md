# Feedback log

Notes on Nebius Token Factory and partner tools, written while building Said Who?.
Each entry: date, what we tried, what happened, what would have helped.

## 2026-10-06: Day 1 smoke tests

Setup: `openai` Node SDK 7.x with `baseURL=https://api.tokenfactory.nebius.com/v1/`. Script: `scripts/smoke/nebius.ts`.

### Token Factory

- **Works well.** All four Nemotron tiers (3.5 Lightning, 3 Nano, 3 Super, 3 Ultra) passed `response_format: json_schema` with `strict: true`, tool calling with `tool_choice: "auto"`, and `chat_template_kwargs.enable_thinking` on/off. Latency for short prompts was 0.2–1 s on every tier. That is fast enough to give each page its own reader call.
- **Model IDs use inconsistent naming.** `models.list` returns `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, `nvidia/Nemotron-3_5-Lightning`, `nvidia/nemotron-3-super-120b-a12b` and `nvidia/Nemotron-3-Ultra-550b-a55b`. The casing and prefix differ from model to model, so we guessed the Nano ID wrong and got a 404. A consistent scheme, or case-insensitive matching, would help.
- **Thinking is on by default.** A request without `chat_template_kwargs` returns reasoning tokens. On Lightning, with `max_tokens: 64`, the whole budget went to reasoning and the answer was empty. A note in the model cards ("reasoning on by default; set `enable_thinking: false` for short structured output") would save time.
- **The reasoning field is not in the OpenAI SDK types,** so it has to be read through a cast. A short note in the docs listing which field carries reasoning would help TypeScript users.

### Tavily (`scripts/smoke/tavily.ts`, 5 credits)

- `exclude_domains` works: none of the 10 results came from the excluded domains.
- Extract works on archive.org (a full-book PDF, 970k characters) and Wikisource. For Google Books it returns only the book's "about" page (1.5–3k characters), with no text from inside the book.
- A single archive.org extract can be about 1M characters, so we cap page size before any model call.

### Partner credits

- Toloka: the promo code from the Nebius builder program page was reported as "not found" after login. The Tendem code worked.
