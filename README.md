# Simuul

**Simulate your users before you ship.**

Simuul is a staging environment for product decisions. Instead of shipping a feature and hoping users like it, you describe what you're building and watch 200 AI agents react in real time. They comment, upvote, downvote, and debate exactly like real users would on Reddit or Product Hunt.

The whole simulation takes about 30 seconds.

![Landing](https://img.shields.io/badge/Next.js-16.2-black) ![Python](https://img.shields.io/badge/Python-3.11-blue) ![D3](https://img.shields.io/badge/D3.js-7.9-orange)

## What it actually does

You type something like "We're removing the free tier and going paid-only" and Simuul generates a social graph of 200 synthetic users. Each agent has a backstory: how long they've used the product, what features they love, what frustrates them, whether they're a power user or someone who churned six months ago.

Then it drops your announcement into a Reddit-style forum and lets the agents loose. Power users write detailed feedback about why this breaks their workflow. Casual users ask confused questions. Churned users show up to say "this is exactly why I left." The forum fills up with comments, replies, upvotes, and heated threads.

You watch it happen live. The graph pulses as agents react. The activity feed scrolls with new comments. After 40 rounds of simulation, you have a realistic preview of how your actual user base might respond.

## The technical bits

### Frontend (Next.js 16 + React 19)

The frontend is about 8,000 lines of TypeScript. The interesting parts:

**D3 Force Graph** renders the social network. Agents are nodes colored by segment (purple for power users, green for casual, amber for new users, orange for churned). When an agent reacts, their node pulses and the sentiment indicator updates. The graph uses force simulation for initial layout, then locks positions so it doesn't keep bouncing around while you're trying to read the activity feed.

**Server-Sent Events** stream everything in real time. When you start a simulation, the frontend opens an SSE connection and the backend pushes events as they happen. No polling, no WebSocket complexity, just a clean unidirectional stream of agent reactions.

**The forum UI** is a Reddit clone with nested comments, vote counts, and collapsible threads. Comments stream in live during simulation. Each comment shows which agent wrote it and what segment they belong to.

### Backend (Flask + Gemini)

The backend is about 16,000 lines of Python. The heavy lifting happens in a few key services:

**Forum Simulator** orchestrates the whole thing. For each round, it picks an agent, uses their profile to decide whether they'll comment/upvote/downvote/ignore, then generates appropriate content. The decision and content generation both go through Gemini with carefully crafted prompts that incorporate the agent's personality.

**Synthetic Data Loader** manages the agent pool. Each agent has realistic attributes: days active, session count, patience level, technical proficiency, interests, pain points, and a history of past interactions. The segments have distinct behavioral patterns. Power users write longer comments and care about performance. New users ask basic questions. Churned users bring receipts.

**Ontology Generator** builds knowledge graphs from the feature description. It extracts entities and relationships, converts everything to the right case formats for the Zep API, and handles the complexity of graph memory updates.

**LLM Client** wraps Gemini with retry logic and error handling. Reasoning models sometimes return their thinking process wrapped in tags, so there's cleanup logic to extract just the actual response.

### The SSE streaming architecture

This was one of the trickier parts to get right. The naive approach is to run the simulation synchronously and stream results as they come. But that blocks the Flask worker and doesn't scale.

The solution uses background threading. When you start a simulation, the backend spawns a thread that runs the actual agent loop. The main thread returns immediately with an SSE stream that reads from a shared queue. As the background thread generates events, it pushes them to the queue, and the SSE handler yields them to the client.

The tricky bit is cleanup. If the client disconnects mid-simulation, you need to stop the background thread. If the simulation errors, you need to propagate that to the stream. There's a fair amount of careful exception handling to make sure everything tears down cleanly.

## Challenges we ran into

**React closure bugs.** The simulation completion handler needs to create a forum topic, but by the time it runs, the state variables it references might be stale. We had to capture all the values at the start of the simulation and pass them through explicitly.

**D3 and React fighting over the DOM.** D3 wants to manipulate elements directly. React wants to own the DOM. The solution is to let D3 handle the SVG internals while React manages the container lifecycle. Updates go through D3 selections, not React state.

**Zep API case sensitivity.** Entity names need to be PascalCase. Edge types need to be SCREAMING_SNAKE_CASE. The LLM doesn't always comply, so there's a post-processing layer that normalizes everything before hitting the API.

**Streaming with Flask.** Flask wasn't really designed for SSE. Getting the generators to work properly with background threads required some creative use of queues and careful attention to thread safety.

## Running it locally

You need Node 18+ and Python 3.11+.

**Frontend:**

```bash
cd stockholmhack
npm install
npm run dev
```

**Backend:**

```bash
cd stockholmhack/backend
pip install -r requirements.txt
python run.py
```

Set your `GEMINI_API_KEY` in the environment or a `.env` file.

The frontend runs on port 3000, backend on port 5001. Open localhost:3000 and click "Try Now" to start.

## Project structure

```
stockholmhack/
├── app/                    # Next.js pages
│   ├── page.tsx           # Landing page with avatar grid
│   ├── start/             # Feature input page
│   ├── graph/[graphId]/   # Live simulation view
│   └── forum/[topicId]/   # Reddit-style discussion
├── components/
│   ├── graph/D3ForceGraph.tsx  # Force-directed social network
│   └── TopNav.tsx              # Navigation with activity toggle
├── lib/
│   ├── forum-api.ts       # SSE streaming client
│   └── activity-context.tsx    # Global activity panel state
├── backend/
│   ├── app/api/           # Flask endpoints
│   │   ├── graph.py       # Graph building + reaction streaming
│   │   └── forum.py       # Topic/comment management
│   └── app/services/
│       ├── forum_simulator.py      # Agent decision + content gen
│       ├── synthetic_data_loader.py # Agent profile management
│       └── ontology_generator.py   # Knowledge graph extraction
└── public/avatars/        # 25 agent portrait images
```

## The team

Built at Stockholm Hack 2026.

## License

MIT
