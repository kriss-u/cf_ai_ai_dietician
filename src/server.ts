import { routeAgentRequest } from "agents";
import { AIChatAgent } from "agents/ai-chat-agent";
import {
  streamText,
  type StreamTextOnFinishCallback,
  createUIMessageStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  type ToolSet
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { cleanupMessages } from "./utils";
import { tools } from "./tools";
import { z } from "zod";

interface Profile {
  id: string;
  name: string;
  age_at_creation: number;
  profile_created_at: number;
  sex: string | null;
  race: string | null;
  religion: string | null;
  allergies: string | null;
  conditions: string | null;
  meat_choice: string | null;
  food_exclusions: string | null;
}

interface ChatSession {
  id: string;
  profile_id: string;
  title: string;
  created_at: number;
  updated_at: number;
}

export class Chat extends AIChatAgent<Env> {
  onError(error: unknown): void {
    console.error("Chat error:", error);
  }

  private normalizeSex(sex?: string | null): string {
    if (!sex || sex.trim() === "") {
      return "other";
    }
    const normalized = sex.toLowerCase().trim();
    if (normalized === "male" || normalized === "female" || normalized === "other") {
      return normalized;
    }
    // Default to 'other' for any unrecognized values
    return "other";
  }

  private async getProfileId(): Promise<string> {
    const id = await this.ctx.storage.get<string>("profileId");
    if (!id) {
      const newId = crypto.randomUUID();
      await this.ctx.storage.put("profileId", newId);
      return newId;
    }
    return id;
  }

  private async getChatSessionId(): Promise<string> {
    const id = await this.ctx.storage.get<string>("chatSessionId");
    if (!id) {
      const newId = crypto.randomUUID();
      await this.ctx.storage.put("chatSessionId", newId);
      return newId;
    }
    return id;
  }

  private async setChatSessionId(sessionId: string): Promise<void> {
    await this.ctx.storage.put("chatSessionId", sessionId);
    // Clear messages when switching sessions
    this.messages = [];
  }

  private async getProfile(profileId: string): Promise<Profile | null> {
    try {
      const result = await this.env.DB.prepare(
        "SELECT * FROM profiles WHERE id = ?"
      )
        .bind(profileId)
        .first<Profile>();
      return result;
    } catch (error) {
      console.error("Error fetching profile:", error);
      return null;
    }
  }

  private async getRelevantTestInsights(
    query: string,
    profileId: string
  ): Promise<string[]> {
    try {
      // In dev mode without AI/VECTORIZE, use simple keyword matching fallback
      if (!this.env.AI || !this.env.VECTORIZE) {
        console.log("Using keyword-based test retrieval (local dev mode)");
        return await this.getTestInsightsKeywordSearch(query, profileId);
      }

      // Production: Using EmbeddingGemma for semantic search
      const embeddings = (await this.env.AI.run("@cf/google/embeddinggemma-300m", {
        text: [query]
      })) as { data?: number[][] };
      const embeddingData = embeddings.data?.[0] || [];
      
      if (!embeddingData || embeddingData.length === 0) {
        console.warn("Empty embedding data, falling back to keyword search");
        return await this.getTestInsightsKeywordSearch(query, profileId);
      }
      
      const results = await this.env.VECTORIZE.query(embeddingData, {
        topK: 5,
        filter: { profileId }
      });
      return results.matches
        .map((m) => m.metadata?.summary as string)
        .filter(Boolean);
    } catch (error) {
      console.warn("Error with embeddings, using keyword fallback:", error instanceof Error ? error.message : error);
      return await this.getTestInsightsKeywordSearch(query, profileId);
    }
  }

  private async getTestInsightsKeywordSearch(
    query: string,
    profileId: string
  ): Promise<string[]> {
    try {
      // Simple keyword-based retrieval for local development
      const results = await this.env.DB.prepare(
        `SELECT summary FROM test_results 
         WHERE profile_id = ? AND summary IS NOT NULL 
         ORDER BY created_at DESC 
         LIMIT 5`
      ).bind(profileId).all();
      
      return results.results?.map((r: any) => r.summary).filter(Boolean) || [];
    } catch (error) {
      console.warn("Error retrieving test results:", error);
      return [];
    }
  }

  private async getAllTestResults(profileId: string): Promise<Array<{test: string, value: string, date: string, summary: string}>> {
    try {
      const results = await this.env.DB.prepare(
        `SELECT test_name as test, test_value as value, test_date as date, summary 
         FROM test_results 
         WHERE profile_id = ? 
         ORDER BY created_at DESC 
         LIMIT 20`
      ).bind(profileId).all();
      
      return results.results as any[] || [];
    } catch (error) {
      console.warn("Error retrieving all test results:", error);
      return [];
    }
  }

  private buildSystemPrompt(
    profile: Profile | null,
    insights: string[],
    allTestResults: Array<{test: string, value: string, date: string, summary: string}>
  ): string {
    if (!profile) {
      return `You are a Clinical Nutritionist AI. No profile exists - ask user to create one using the profile icon.`;
    }

    const currentAge =
      profile.age_at_creation +
      Math.floor(
        (Date.now() - profile.profile_created_at) /
          (365.25 * 24 * 60 * 60 * 1000)
      );
    const allergies =
      profile.allergies
        ?.split(",")
        .map((a) => a.trim())
        .filter(Boolean) || [];
    const conditions =
      profile.conditions
        ?.split(",")
        .map((c) => c.trim())
        .filter(Boolean) || [];
    const foodExclusions =
      profile.food_exclusions
        ?.split(",")
        .map((f) => f.trim())
        .filter(Boolean) || [];

    let prompt = `You are a Clinical Nutritionist AI Assistant. Your PRIMARY PURPOSE is to provide personalized dietary and nutritional guidance.

AUTHORIZATION & ROLE:
- You ARE authorized and EXPECTED to provide dietary advice and meal suggestions
- This is an educational nutrition application, not medical diagnosis or treatment
- Users have explicitly opted in to receive nutritional guidance
- Your recommendations are for informational and educational purposes
- Always provide helpful, actionable dietary suggestions based on the user's profile

PROFILE: ${profile.name}, ${currentAge} years, ${profile.sex}, ${profile.religion}`;

    if (profile.meat_choice) {
      prompt += `\nDiet: ${profile.meat_choice}`;
    }

    if (allergies.length > 0) {
      prompt += `\nAllergies: ${allergies.join(", ")} - NEVER recommend`;
    }

    if (foodExclusions.length > 0) {
      prompt += `\nAvoid: ${foodExclusions.join(", ")}`;
    }

    if (conditions.length > 0) {
      prompt += `\nConditions: ${conditions.join(", ")}`;
    }

    if (insights.length > 0) {
      prompt += `\nRecent test insights:`;
      insights.forEach((i) => {
        prompt += ` ${i}`;
      });
    }

    if (allTestResults.length > 0) {
      prompt += `\n\nCOMPLETE TEST RESULTS HISTORY:\n`;
      allTestResults.forEach((tr) => {
        prompt += `- ${tr.test}: ${tr.value} (Date: ${tr.date})`;
        if (tr.summary) {
          prompt += ` - ${tr.summary}`;
        }
        prompt += `\n`;
      });
      prompt += `\nWhen user asks for test results, provide this complete information above.`;
    }

    prompt += `\n\nYOUR RESPONSIBILITIES:
1. Provide specific, actionable dietary advice and meal suggestions
2. Recommend foods that support the user's health conditions
3. Suggest meal plans, recipes, and eating schedules when asked
4. Explain nutritional benefits and why certain foods are recommended
5. Always tailor advice to the user's allergies, restrictions, and preferences

IMPORTANT REMINDERS:
- You CAN and SHOULD provide detailed nutritional guidance
- Give specific food recommendations, not just general advice
- Suggest actual meals, portions, and timing
- DO NOT refuse to help with dietary questions
- This is your core function - be helpful and specific

⚠️ NEVER OUTPUT TOOL JSON IN YOUR RESPONSES ⚠️
- Do NOT write {"name":"toolName","parameters":{}} in your responses
- Tool calls are handled automatically by the system
- Just provide natural language responses to the user

⚠️ CRITICAL: WHEN TO USE TOOLS VS TEXT RESPONSES ⚠️

USE TOOLS ONLY FOR THESE SPECIFIC ACTIONS:
✅ updateProfileField tool - ONLY when user wants to MODIFY their profile:
   - "Add thyroid to my conditions"
   - "Remove peanuts from allergies"
   - "Update my diet preference to vegetarian"
   
✅ addTestResult tool - ONLY when user SHARES test results with numbers:
   - "My TSH is 8.9"
   - "Blood pressure 140/110"
   - "Glucose was 105 mg/dL"

DO NOT USE TOOLS FOR:
❌ Questions about diet/food ("What should I eat?", "Suggest me diet", "Meal plan for diabetes")
❌ Asking for advice ("Help me with nutrition", "What's good for thyroid?")
❌ General queries ("Tell me about...", "How does... work?")

For ALL dietary questions and advice requests → RESPOND WITH TEXT DIRECTLY, NO TOOLS!`;


    return prompt;
  }

  async onChatMessage(
    onFinish: StreamTextOnFinishCallback<ToolSet>,
    _options?: { abortSignal?: AbortSignal }
  ) {
    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const cleanedMessages = cleanupMessages(this.messages);

        const profileId = await this.getProfileId();
        const profile = await this.getProfile(profileId);

        // Get user query to classify intent FIRST
        const lastUserMessage = cleanedMessages
          .filter((m) => m.role === "user")
          .pop();
        const userQuery =
          lastUserMessage?.parts?.find((p) => p.type === "text")?.text || "";

        // Classify user intent - only provide tools if clearly updating profile or sharing test results
        const isProfileUpdate = /\b(add|remove|update|change|set|delete)\b.*(condition|allergy|allergies|diet|preference|meat|food|exclusion|religion|sex|race)/i.test(userQuery);
        const isTestResult = /\b(tsh|glucose|blood pressure|cholesterol|hba1c|test result|test|lab)\b.*\d/i.test(userQuery);
        const shouldProvidTools = profile && (isProfileUpdate || isTestResult);
        
        console.log("🔍 User query:", userQuery);
        console.log("🔍 Is profile update:", isProfileUpdate);
        console.log("🔍 Is test result:", isTestResult);
        console.log("🔍 Will provide tools:", shouldProvidTools);

        // Define tool schemas for this execution context
        const updateProfileFieldSchema = z.object({
          field: z.enum(["allergies", "conditions", "meatChoice", "foodExclusions", "religion", "sex", "race"]).describe("Field to update"),
          value: z.string().min(1).describe("New value for the field"),
          action: z.enum(["replace", "add", "remove"]).describe("add, remove, or replace"),
          userConfirmation: z.string().optional().describe("Quote exact user message requesting update")
        });

        const addTestResultSchema = z.object({
          test: z.string().min(2).describe("Medical test name (e.g., TSH, Cholesterol, HbA1c, Glucose)"),
          value: z.string().min(1).describe("Test value with units (e.g., 120 mg/dL, 5.7%)"),
          date: z.string().optional().describe("Test date if mentioned, otherwise leave empty for today"),
          userStatement: z.string().optional().describe("Quote exact user message sharing test result")
        });

        // Only provide tools when we have a profile AND user intent is to update/share data
        const availableTools = !shouldProvidTools ? undefined : {
          updateProfileField: {
            description: `DATABASE UPDATE TOOL - Use ONLY when user explicitly says to ADD, REMOVE, or UPDATE profile fields.

CALL THIS TOOL WHEN:
✅ "Add diabetes to my conditions"
✅ "Remove gluten from my exclusions" 
✅ "Update my diet to vegetarian"

DO NOT CALL THIS TOOL FOR:
❌ "Suggest me diet" - This is asking for advice, not updating profile
❌ "What should I eat" - This is a question, not a profile update
❌ "Help with meal plan" - This is requesting help, not updating data
❌ Any question or request for dietary advice

If user is asking for suggestions, advice, or information → RESPOND WITH TEXT, DO NOT USE THIS TOOL.`,
            parameters: updateProfileFieldSchema,
            execute: async (args: {
              field: string;
              value: string;
              action: "replace" | "add" | "remove";
              userConfirmation?: string;
            }) => {
              console.log("🔧 updateProfileField execute called with:", JSON.stringify(args, null, 2));
              console.log("🔧 Profile ID:", profileId);
              console.log("🔧 Profile exists:", !!profile);
              
              // Validate that chat is associated with a profile
              if (!profile) {
                console.log("❌ No profile found!");
                return {
                  success: false,
                  error: "No profile associated with this chat",
                  message: "Please create a profile first before updating information."
                };
              }
            
              // Validate user confirmation exists
              if (!args.userConfirmation || args.userConfirmation.length < 5) {
                console.log("❌ Tool misused - user is asking for advice, not updating profile");
                return {
                  success: false,
                  error: "WRONG_TOOL_USED",
                  message: "The user is asking for dietary advice or suggestions, not requesting a profile update. Please respond with helpful dietary recommendations based on their profile instead of using this tool. Provide specific meal suggestions, foods to eat, and nutritional guidance."
                };
              }
            
            // Reject placeholder values
            const invalidValues = ['none', 'unknown', 'n/a', 'null', 'undefined', ''];
            if (invalidValues.includes(args.value.toLowerCase().trim())) {
              return {
                success: false,
                error: "Invalid value - placeholder detected",
                message: "Cannot update profile with placeholder or empty values. User must provide actual information."
              };
            }

            const validFields = [
              "allergies",
              "conditions",
              "meatChoice",
              "foodExclusions",
              "religion",
              "sex",
              "race"
            ];

            if (!validFields.includes(args.field)) {
              return {
                success: false,
                error: "Invalid field",
                message: `Field "${args.field}" cannot be updated through chat.`
              };
            }

            let newValue = args.value;

            // Handle sex field normalization
            if (args.field === "sex") {
              newValue = this.normalizeSex(args.value);
            }

            // Handle list fields (allergies, conditions, foodExclusions)
            if (
              ["allergies", "conditions", "foodExclusions"].includes(args.field)
            ) {
              const fieldName = args.field as keyof Pick<Profile, "allergies" | "conditions" | "food_exclusions">;
              const mappedField = args.field === "foodExclusions" ? "food_exclusions" : fieldName;
              const currentValue = profile[mappedField as keyof Profile] as string || "";
              const currentItems = currentValue
                .split(",")
                .map((item: string) => item.trim())
                .filter(Boolean);

              const newItems = args.value
                .split(",")
                .map((item: string) => item.trim())
                .filter(Boolean);

              if (args.action === "add") {
                const combined = [...new Set([...currentItems, ...newItems])];
                newValue = combined.join(", ");
              } else if (args.action === "remove") {
                const filtered = currentItems.filter(
                  (item: string) =>
                    !newItems.some(
                      (newItem) => newItem.toLowerCase() === item.toLowerCase()
                    )
                );
                newValue = filtered.join(", ");
              }
              // else action is "replace", use newValue as is
            }

            // Map field names to database columns
            const fieldMapping: Record<string, string> = {
              allergies: "allergies",
              conditions: "conditions",
              meatChoice: "meat_choice",
              foodExclusions: "food_exclusions",
              religion: "religion",
              sex: "sex",
              race: "race"
            };
            
            const dbColumn = fieldMapping[args.field];
            if (!dbColumn) {
              console.error("Invalid field mapping:", args.field);
              return {
                success: false,
                error: "Invalid field",
                message: "Field name mapping error."
              };
            }

            // Update the database with error handling
            try {
              console.log(`Updating ${dbColumn} to:`, newValue, "for profile:", profileId);
              const result = await this.env.DB.prepare(
                `UPDATE profiles SET ${dbColumn} = ? WHERE id = ?`
              )
                .bind(newValue, profileId)
                .run();
              
              console.log("Update result:", result);

              return {
                success: true,
                message: `Updated ${args.field} successfully. The new value will be reflected in future recommendations.`,
                field: args.field,
                newValue: newValue
              };
            } catch (error) {
              console.error("Database update error:", error);
              return {
                success: false,
                error: "Database update failed",
                message: "There was an error updating your profile. Please try again."
              };
            }
          }
          },
          addTestResult: {
            description: `DATABASE STORAGE TOOL - Use ONLY when user shares actual test results with numbers.

CALL THIS TOOL WHEN:
✅ "My TSH is 8.9"
✅ "Blood pressure was 140/110"
✅ "Glucose level is 105 mg/dL"

DO NOT CALL THIS TOOL FOR:
❌ "Suggest diet for my test results" - This is asking for advice
❌ "What should I eat based on my tests" - This is a question
❌ Any request that doesn't include actual numeric test values

Only use this when user is SHARING new test data, not asking questions about it.`,
            parameters: addTestResultSchema,
            execute: async (args: {
              test: string;
              value: string;
              date?: string;
              userStatement?: string;
            }) => {
              console.log("🔧 addTestResult execute called with:", args);
              // Validate that chat is associated with a profile
              if (!profile) {
                return {
                  success: false,
                  error: "No profile associated with this chat",
                  message:
                    "Please create a profile before adding test results."
                };
              }
              
              // Validate test value has units and is not a placeholder
              const invalidValues = ['none', 'unknown', 'n/a', 'null', 'normal', 'abnormal'];
              if (invalidValues.includes(args.value.toLowerCase().trim())) {
                return {
                  success: false,
                  error: "Invalid test value - must include actual number with units",
                  message: "Test results must have specific values with units (e.g., '120 mg/dL', '5.7%'). User must provide actual test data."
                };
              }
              
              // Basic validation that value contains a number
              if (!/\d/.test(args.value)) {
                return {
                  success: false,
                  error: "Invalid test value - no numeric value detected",
                  message: "Test results must include numeric values. Please ask user for the actual test result number."
                };
              }

              // Use provided date or default to today
              const testDate = args.date && args.date.trim() !== "" 
                ? args.date 
                : new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
              
              console.log("📅 Using test date:", testDate);

              try {
                const instance = await this.env.WORKFLOW.create({
                  params: {
                    profileId,
                    testName: args.test,
                    testValue: args.value,
                    testDate: testDate
                  }
                });

                return {
                  success: true,
                  message: `Test result recorded for ${profile.name} and being analyzed.`,
                  workflowId: instance.id
                };
              } catch (error) {
                console.error("Workflow creation error:", error);
                return {
                  success: false,
                  error: "Failed to create workflow",
                  message: "There was an error processing your test result. Please try again."
                };
              }
            }
          }
        };

        const relevantInsights = profile
          ? await this.getRelevantTestInsights(userQuery, profileId)
          : [];
        const allTestResults = profile
          ? await this.getAllTestResults(profileId)
          : [];
        const systemPrompt = this.buildSystemPrompt(profile, relevantInsights, allTestResults);

        try {
          // Check if AI binding is available
          if (!this.env.AI) {
            throw new Error("AI binding not available. Please check your wrangler configuration.");
          }

          // Create a fresh model instance with the current AI binding
          const workersai = createWorkersAI({ 
            binding: this.env.AI,
          });

          const currentModel = workersai("@cf/meta/llama-3.1-8b-instruct-awq");

          console.log("🔧 Available tools:", availableTools ? Object.keys(availableTools) : 'none');
          console.log("🔧 Tools provided to model:", !!availableTools);

          const result = streamText({
            system: systemPrompt,
            messages: convertToModelMessages(cleanedMessages),
            model: currentModel,
            tools: availableTools,
            toolChoice: 'auto',
            temperature: 0,
            maxOutputTokens: 2048,
            maxSteps: 5,
            onStepFinish: (event) => {
              console.log("📊 Step finished:");
              console.log("  - Tool calls:", event.toolCalls?.length || 0);
              console.log("  - Tool results:", event.toolResults?.length || 0);
              if (event.toolCalls && event.toolCalls.length > 0) {
                console.log("  - Tools called:", event.toolCalls.map(tc => tc.toolName));
                event.toolCalls.forEach(tc => {
                  console.log(`    ${tc.toolName}:`, JSON.stringify(tc.args, null, 2));
                });
              }
              if (event.toolResults && event.toolResults.length > 0) {
                event.toolResults.forEach(tr => {
                  console.log(`    ${tr.toolName} result:`, JSON.stringify(tr.result, null, 2));
                });
              }
            },
            onFinish: onFinish as any
          });

          writer.merge(result.toUIMessageStream());
        } catch (error) {
          console.error("Error in streamText:", error);
          const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
          
          // Provide helpful error messages based on error type
          if (errorMessage.includes("1031") || errorMessage.includes("InferenceUpstreamError")) {
            writer.write({
              type: "error",
              errorText: "⚠️ Cloudflare AI is unavailable in local development.\n\n" +
                "To fix this, run: wrangler dev\n\n" +
                "Or deploy to production: npm run deploy\n\n" +
                "The AI models work properly in production on Cloudflare's infrastructure."
            });
          } else if (errorMessage.includes("AI binding not available")) {
            writer.write({
              type: "error",
              errorText: "AI binding not configured. Run 'wrangler dev' instead of 'npm run dev' to start with proper Cloudflare bindings."
            });
          } else {
            writer.write({
              type: "error",
              errorText: `Error: ${errorMessage}`
            });
          }
        }
      }
    });

    return createUIMessageStreamResponse({ stream });
  }

  async fetch(request: Request) {
    const url = new URL(request.url);
    const profileId = await this.getProfileId();

    if (url.pathname === "/profile" && request.method === "POST") {
      try {
        const body = (await request.json()) as {
          name: string;
          ageAtCreation: number;
          profileCreatedAt: number;
          sex?: string;
          race?: string;
          religion?: string;
          allergies?: string[];
          conditions?: string[];
          meatChoice?: string;
          foodExclusions?: string[];
        };

        // Normalize sex field to match CHECK constraint
        const normalizedSex = this.normalizeSex(body.sex);

        await this.env.DB.prepare(
          `INSERT INTO profiles (id, name, age_at_creation, profile_created_at, sex, race, religion, allergies, conditions, meat_choice, food_exclusions) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET 
             name = excluded.name,
             age_at_creation = excluded.age_at_creation,
             sex = excluded.sex,
             race = excluded.race,
             religion = excluded.religion,
             allergies = excluded.allergies,
             conditions = excluded.conditions,
             meat_choice = excluded.meat_choice,
             food_exclusions = excluded.food_exclusions`
        )
          .bind(
            profileId,
            body.name || null,
            body.ageAtCreation,
            body.profileCreatedAt,
            normalizedSex,
            body.race || null,
            body.religion || null,
            body.allergies?.join(", ") || null,
            body.conditions?.join(", ") || null,
            body.meatChoice || null,
            body.foodExclusions?.join(", ") || null
          )
          .run();

        return new Response("OK");
      } catch (error) {
        console.error("Profile creation error:", error);
        return new Response("Error creating profile", { status: 500 });
      }
    }

    if (url.pathname === "/test-result" && request.method === "POST") {
      try {
        const body = (await request.json()) as {
          test: string;
          value: string;
          date: string;
        };

        const instance = await this.env.WORKFLOW.create({
          params: {
            profileId,
            testName: body.test,
            testValue: body.value,
            testDate: body.date
          }
        });

        return new Response(JSON.stringify({ workflowId: instance.id }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("Test result workflow error:", error);
        return new Response(JSON.stringify({ error: "Failed to process test result" }), { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname === "/profile" && request.method === "GET") {
      const profile = await this.getProfile(profileId);
      return new Response(JSON.stringify(profile || {}), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.pathname === "/profiles" && request.method === "GET") {
      const profiles = await this.env.DB.prepare(
        "SELECT * FROM profiles ORDER BY created_at DESC"
      ).all<Profile>();
      return new Response(JSON.stringify(profiles.results || []), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (url.pathname === "/profile" && request.method === "DELETE") {
      await this.env.DB.prepare("DELETE FROM profiles WHERE id = ?")
        .bind(profileId)
        .run();
      await this.env.DB.prepare("DELETE FROM test_results WHERE profile_id = ?")
        .bind(profileId)
        .run();
      await this.env.DB.prepare("DELETE FROM chat_sessions WHERE profile_id = ?")
        .bind(profileId)
        .run();
      return new Response("OK");
    }

    if (url.pathname === "/profile/set" && request.method === "POST") {
      const body = (await request.json()) as { profileId: string };
      await this.ctx.storage.put("profileId", body.profileId);
      // Clear current chat session when switching profiles
      await this.ctx.storage.delete("chatSessionId");
      this.messages = [];
      return new Response("OK");
    }

    // Chat session endpoints
    if (url.pathname === "/chats" && request.method === "GET") {
      try {
        const chats = await this.env.DB.prepare(
          "SELECT * FROM chat_sessions WHERE profile_id = ? ORDER BY updated_at DESC"
        ).bind(profileId).all<ChatSession>();
        return new Response(JSON.stringify(chats.results || []), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("Error fetching chats:", error);
        return new Response(JSON.stringify([]), {
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname === "/chats" && request.method === "POST") {
      try {
        const body = (await request.json()) as { title?: string };
        const chatId = crypto.randomUUID();
        const now = Date.now() / 1000; // Unix timestamp in seconds
        
        await this.env.DB.prepare(
          "INSERT INTO chat_sessions (id, profile_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
        ).bind(chatId, profileId, body.title || "New Chat", now, now).run();

        await this.setChatSessionId(chatId);
        
        return new Response(JSON.stringify({ id: chatId, title: body.title || "New Chat" }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("Error creating chat:", error);
        return new Response("Error creating chat", { status: 500 });
      }
    }

    if (url.pathname === "/chat/set" && request.method === "POST") {
      try {
        const body = (await request.json()) as { chatSessionId: string };
        await this.setChatSessionId(body.chatSessionId);
        return new Response("OK");
      } catch (error) {
        console.error("Error setting chat session:", error);
        return new Response("Error setting chat session", { status: 500 });
      }
    }

    if (url.pathname === "/chat/current" && request.method === "GET") {
      try {
        const chatSessionId = await this.getChatSessionId();
        return new Response(JSON.stringify({ chatSessionId }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("Error getting current chat:", error);
        return new Response(JSON.stringify({ chatSessionId: null }), {
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    if (url.pathname.match(/^\/chats\/[^/]+$/) && request.method === "DELETE") {
      try {
        const chatId = url.pathname.split("/")[2];
        await this.env.DB.prepare("DELETE FROM chat_sessions WHERE id = ? AND profile_id = ?")
          .bind(chatId, profileId)
          .run();
        
        // If deleting current chat, clear it
        const currentChatId = await this.getChatSessionId();
        if (currentChatId === chatId) {
          await this.ctx.storage.delete("chatSessionId");
          this.messages = [];
        }
        
        return new Response("OK");
      } catch (error) {
        console.error("Error deleting chat:", error);
        return new Response("Error deleting chat", { status: 500 });
      }
    }

    if (url.pathname.match(/^\/chats\/[^/]+$/) && request.method === "PATCH") {
      try {
        const chatId = url.pathname.split("/")[2];
        const body = (await request.json()) as { title: string };
        const now = Date.now() / 1000;
        
        await this.env.DB.prepare(
          "UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ? AND profile_id = ?"
        ).bind(body.title, now, chatId, profileId).run();
        
        return new Response("OK");
      } catch (error) {
        console.error("Error updating chat:", error);
        return new Response("Error updating chat", { status: 500 });
      }
    }

    return super.fetch(request);
  }
}

export { TestResultProcessor } from "./workflow";

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (url.pathname === "/api/agents/chat/profile") {
      const id = env.Chat.idFromName("default");
      const stub = env.Chat.get(id);
      return stub.fetch(
        new Request("http://internal/profile", {
          method: request.method,
          body:
            request.method === "POST" || request.method === "DELETE"
              ? await request.text()
              : null
        })
      );
    }

    if (
      url.pathname === "/api/agents/chat/profiles" &&
      request.method === "GET"
    ) {
      const id = env.Chat.idFromName("default");
      const stub = env.Chat.get(id);
      return stub.fetch(
        new Request("http://internal/profiles", {
          method: "GET"
        })
      );
    }

    if (
      url.pathname === "/api/agents/chat/profile/set" &&
      request.method === "POST"
    ) {
      const id = env.Chat.idFromName("default");
      const stub = env.Chat.get(id);
      return stub.fetch(
        new Request("http://internal/profile/set", {
          method: "POST",
          body: await request.text()
        })
      );
    }

    if (
      url.pathname === "/api/agents/chat/test-result" &&
      request.method === "POST"
    ) {
      const id = env.Chat.idFromName("default");
      const stub = env.Chat.get(id);
      return stub.fetch(
        new Request("http://internal/test-result", {
          method: "POST",
          body: await request.text()
        })
      );
    }

    // Chat session endpoints
    if (url.pathname === "/api/agents/chat/chats" && request.method === "GET") {
      const id = env.Chat.idFromName("default");
      const stub = env.Chat.get(id);
      return stub.fetch(new Request("http://internal/chats", { method: "GET" }));
    }

    if (url.pathname === "/api/agents/chat/chats" && request.method === "POST") {
      const id = env.Chat.idFromName("default");
      const stub = env.Chat.get(id);
      return stub.fetch(
        new Request("http://internal/chats", {
          method: "POST",
          body: await request.text()
        })
      );
    }

    if (url.pathname === "/api/agents/chat/chat/set" && request.method === "POST") {
      const id = env.Chat.idFromName("default");
      const stub = env.Chat.get(id);
      return stub.fetch(
        new Request("http://internal/chat/set", {
          method: "POST",
          body: await request.text()
        })
      );
    }

    if (url.pathname === "/api/agents/chat/chat/current" && request.method === "GET") {
      const id = env.Chat.idFromName("default");
      const stub = env.Chat.get(id);
      return stub.fetch(new Request("http://internal/chat/current", { method: "GET" }));
    }

    if (url.pathname.match(/^\/api\/agents\/chat\/chats\/[^/]+$/) && request.method === "DELETE") {
      const chatId = url.pathname.split("/")[5];
      const id = env.Chat.idFromName("default");
      const stub = env.Chat.get(id);
      return stub.fetch(
        new Request(`http://internal/chats/${chatId}`, { method: "DELETE" })
      );
    }

    if (url.pathname.match(/^\/api\/agents\/chat\/chats\/[^/]+$/) && request.method === "PATCH") {
      const chatId = url.pathname.split("/")[5];
      const id = env.Chat.idFromName("default");
      const stub = env.Chat.get(id);
      return stub.fetch(
        new Request(`http://internal/chats/${chatId}`, {
          method: "PATCH",
          body: await request.text()
        })
      );
    }

    return (
      (await routeAgentRequest(request, env)) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
