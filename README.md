# AI Dietician

![npm i agents command](./npm-agents-banner.svg)

<a href="https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/agents-starter"><img src="https://deploy.workers.cloudflare.com/button" alt="Deploy to Cloudflare"/></a>

An AI-powered dietician assistant that provides personalized, culturally-sensitive dietary recommendations based on your health profile and medical test results. Built on Cloudflare's Agent platform with Workers AI.

⚠️ **IMPORTANT**: This is a demonstration AI for educational purposes only. Always consult qualified healthcare professionals before making any dietary changes.

## Features

- 🍎 **Personalized Diet Recommendations** - Get evidence-based dietary advice tailored to your health profile
- 📝 **Profile-First Architecture** - Explicit form-based profile creation ensures data accuracy
- 🧬 **Medical Test Integration** - Upload test results (TSH, glucose, etc.) for more accurate recommendations
- 🌍 **Cultural Sensitivity** - Respects religious dietary restrictions (Halal, Kosher, Hindu vegetarian, etc.)
- 🥩 **Dietary Preferences** - Vegetarian, Vegan, Pescatarian, Halal, Kosher options
- 🏥 **Multi-Condition Support** - Handles multiple medical conditions simultaneously (thyroid, diabetes, etc.)
- 💬 **Interactive Chat Interface** - Natural conversation with AI dietician
- 🔄 **Conversational Updates** - Update profile information through chat after initial setup
- 🌓 **Dark/Light Theme** - Comfortable viewing experience
- ⚡️ **Real-time Streaming** - Fast, responsive AI responses
- 📊 **Vector Search** - RAG-based retrieval of relevant test history
- 🔒 **Profile-Based Security** - Validated workflow ensures data integrity
- 👤 **Multi-Profile Support** - Create and switch between different user profiles

## How It Works

### Profile-First Flow

```
┌─────────────────┐
│   Open App      │
└────────┬────────┘
         │
         ▼
    ┌─────────┐
    │ Profile? │
    └────┬────┘
         │
    ┌────┴─────┐
    │          │
    NO        YES
    │          │
    ▼          ▼
┌────────────┐  ┌───────────────┐
│  Profile   │  │  Chat Interface│
│  Setup     │  │  with AI       │
│  Form      │  │  Dietician     │
└─────┬──────┘  └───────┬────────┘
      │                 │
      │  Submit         │  Update via
      │  Required:      │  - Form (header)
      │  • Name         │  - Chat conversation
      │  • Age          │
      │                 │
      │  Optional:      │
      │  • Sex          │
      │  • Race         │
      │  • Religion     │
      │  • Meat Choice  │
      │  • Allergies    │
      │  • Exclusions   │
      │  • Conditions   │
      │                 │
      └────────┬────────┘
               │
               ▼
      ┌─────────────────┐
      │  Personalized   │
      │  Dietary Advice │
      └─────────────────┘
```

### Key Benefits

1. **No Hallucinations**: User data is collected through forms, not inferred by LLM
2. **Data Certainty**: All critical information (allergies, conditions) is explicit
3. **Better UX**: Users know exactly what information is needed
4. **Safety First**: Allergies and conditions are collected upfront
5. **Flexibility**: Still allows conversational updates after initial setup

## Prerequisites

- Cloudflare account with:
  - Workers AI access
  - D1 Database
  - Vectorize
  - Workflows
- Node.js 18+

## Installation

```bash
npm install
```

## Run Database Migrations

```bash
wrangler d1 migrations apply ai-dietician-db --local
```

## Run the App

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Things to Try

Once you create your profile, try these example prompts:

**Share medical test results:**
```
"My TSH level is 4.2 mIU/L"
"My glucose is 105 mg/dL"
"My HbA1c is 5.7%"
```

**Get dietary recommendations:**
```
"What should I eat for breakfast?"
"Can you suggest a meal plan for diabetes?"
"I need protein-rich vegetarian options"
"Give me a week's meal plan"
```

**Update your profile:**
```
"Add peanut allergy to my profile"
"I'm now following a vegan diet"
"Update my conditions to include hypothyroidism"
```

**Ask about specific foods:**
```
"Is quinoa good for my thyroid?"
"Can I eat bananas with diabetes?"
"What are the best foods for my condition?"
```

## Project Structure

```
├── src/
│   ├── app.tsx        # Chat UI implementation
│   ├── server.ts      # Chat agent logic & tool definitions
│   ├── utils.ts       # Helper functions
│   └── styles.css     # UI styling
```

## Customization Guide

### Adding New Tools

Add new tools in `tools.ts` using the tool builder:

```ts
// Example of a tool that requires confirmation
const searchDatabase = tool({
  description: "Search the database for user records",
  parameters: z.object({
    query: z.string(),
    limit: z.number().optional()
  })
  // No execute function = requires confirmation
});

// Example of an auto-executing tool
const getCurrentTime = tool({
  description: "Get current server time",
  parameters: z.object({}),
  execute: async () => new Date().toISOString()
});

// Scheduling tool implementation
const scheduleTask = tool({
  description:
    "schedule a task to be executed at a later time. 'when' can be a date, a delay in seconds, or a cron pattern.",
  parameters: z.object({
    type: z.enum(["scheduled", "delayed", "cron"]),
    when: z.union([z.number(), z.string()]),
    payload: z.string()
  }),
  execute: async ({ type, when, payload }) => {
    // ... see the implementation in tools.ts
  }
});
```

To handle tool confirmations, add execution functions to the `executions` object:

```typescript
export const executions = {
  searchDatabase: async ({
    query,
    limit
  }: {
    query: string;
    limit?: number;
  }) => {
    // Implementation for when the tool is confirmed
    const results = await db.search(query, limit);
    return results;
  }
  // Add more execution handlers for other tools that require confirmation
};
```

Tools can be configured in two ways:

1. With an `execute` function for automatic execution
2. Without an `execute` function, requiring confirmation and using the `executions` object to handle the confirmed action. NOTE: The keys in `executions` should match `toolsRequiringConfirmation` in `app.tsx`.

### Use a different AI model provider

The starting [`server.ts`](https://github.com/cloudflare/agents-starter/blob/main/src/server.ts) implementation uses the [`ai-sdk`](https://sdk.vercel.ai/docs/introduction) and the [OpenAI provider](https://sdk.vercel.ai/providers/ai-sdk-providers/openai), but you can use any AI model provider by:

1. Installing an alternative AI provider for the `ai-sdk`, such as the [`workers-ai-provider`](https://sdk.vercel.ai/providers/community-providers/cloudflare-workers-ai) or [`anthropic`](https://sdk.vercel.ai/providers/ai-sdk-providers/anthropic) provider:
2. Replacing the AI SDK with the [OpenAI SDK](https://github.com/openai/openai-node)
3. Using the Cloudflare [Workers AI + AI Gateway](https://developers.cloudflare.com/ai-gateway/providers/workersai/#workers-binding) binding API directly

For example, to use the [`workers-ai-provider`](https://sdk.vercel.ai/providers/community-providers/cloudflare-workers-ai), install the package:

```sh
npm install workers-ai-provider
```

Add an `ai` binding to `wrangler.jsonc`:

```jsonc
// rest of file
  "ai": {
    "binding": "AI"
  }
// rest of file
```

Replace the `@ai-sdk/openai` import and usage with the `workers-ai-provider`:

```diff
// server.ts
// Change the imports
- import { openai } from "@ai-sdk/openai";
+ import { createWorkersAI } from 'workers-ai-provider';

// Create a Workers AI instance
+ const workersai = createWorkersAI({ binding: env.AI });

// Use it when calling the streamText method (or other methods)
// from the ai-sdk
- const model = openai("gpt-4o-2024-11-20");
+ const model = workersai("@cf/deepseek-ai/deepseek-r1-distill-qwen-32b")
```

Commit your changes and then run the `agents-starter` as per the rest of this README.

### Modifying the UI

The chat interface is built with React and can be customized in `app.tsx`:

- Modify the theme colors in `styles.css`
- Add new UI components in the chat container
- Customize message rendering and tool confirmation dialogs
- Add new controls to the header

### Example Use Cases

1. **Customer Support Agent**
   - Add tools for:
     - Ticket creation/lookup
     - Order status checking
     - Product recommendations
     - FAQ database search

2. **Development Assistant**
   - Integrate tools for:
     - Code linting
     - Git operations
     - Documentation search
     - Dependency checking

3. **Data Analysis Assistant**
   - Build tools for:
     - Database querying
     - Data visualization
     - Statistical analysis
     - Report generation

4. **Personal Productivity Assistant**
   - Implement tools for:
     - Task scheduling with flexible timing options
     - One-time, delayed, and recurring task management
     - Task tracking with reminders
     - Email drafting
     - Note taking

5. **Scheduling Assistant**
   - Build tools for:
     - One-time event scheduling using specific dates
     - Delayed task execution (e.g., "remind me in 30 minutes")
     - Recurring tasks using cron patterns
     - Task payload management
     - Flexible scheduling patterns

Each use case can be implemented by:

1. Adding relevant tools in `tools.ts`
2. Customizing the UI for specific interactions
3. Extending the agent's capabilities in `server.ts`
4. Adding any necessary external API integrations

## Learn More

- [`agents`](https://github.com/cloudflare/agents/blob/main/packages/agents/README.md)
- [Cloudflare Agents Documentation](https://developers.cloudflare.com/agents/)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)

## License

MIT
