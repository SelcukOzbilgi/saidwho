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

## 2026-10-07: First end-to-end investigation

Setup: `scripts/investigate.ts`. Super plans the search and judges, Tavily searches, and Lightning reads each page. Plain code then checks every snippet against the page it came from. Quote Investigator, Wikiquote, Wikipedia and the eval case's own reference sites are excluded.

Results on three eval cases:

| Case | Verdict | Earliest found | Cost |
|---|---|---|---|
| Einstein "insanity" | misattributed (right) | 1983, Rita Mae Brown (the known answer is 1981) | $0.004, 5 credits, 23 s |
| "Gel, gel, ne olursan ol" | contested (right) | none dated | $0.004, 5 credits, 29 s |
| Churchill "so much owed" | correct (right) | 1940-08-20 (exact) | $0.003, 5 credits, 22 s |

### Tavily

- **Search operators fail without warning.** Queries such as `site:nytimes.com before:1990` or `1980..1990` returned 0 results, with no error and no warning. A model writing queries reaches for these first. With plain queries, five searches returned 14–25 unique pages. One line in the docs saying operators aren't supported (use `include_domains` and `start_date` instead) would have saved a debugging round. Returning a warning would help even more.
- `include_raw_content: "text"` on search returns the page text with each result, so no separate extract call is needed. That makes it 1 credit per query for up to 5 pages.

### Token Factory

- Super with thinking on took 3–8 s to plan and 5–10 s to judge. That's much faster than the 29 s in the agent cost benchmark, which makes Super practical inside the loop.
- In one run, Super returned a valid planner output with empty `queries` and `variants` arrays. Strict JSON schema guarantees the shape, not useful content, so the script always adds the exact-phrase query itself.
- Lightning (thinking off, strict schema) returned valid JSON on all 54 pages. In one case it "tidied" a snippet into the well-known wording instead of copying the page, and the code check caught it. That one rejected snippet carried the 1981 lead. This is why snippets are checked against the page rather than trusted.
