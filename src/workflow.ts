import {
  WorkflowEntrypoint,
  type WorkflowStep,
  type WorkflowEvent
} from "cloudflare:workers";

interface TestResultInput {
  profileId: string;
  testName: string;
  testValue: string;
  testDate: string;
}

interface TestSummary {
  summary: string;
  biomarkers: string[];
  concerns: string[];
}

export class TestResultProcessor extends WorkflowEntrypoint<
  Env,
  TestResultInput
> {
  async run(event: WorkflowEvent<TestResultInput>, step: WorkflowStep) {
    const { profileId, testName, testValue, testDate } = event.payload;

    const summary = await step.do("summarize test result", async () => {
      const workersai = await import("workers-ai-provider").then((m) =>
        m.createWorkersAI({ binding: this.env.AI })
      );
      const model = workersai("@cf/meta/llama-3.1-8b-instruct-fp8");

      const promptMessages = [
        {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: `Analyze this medical test result and provide a brief clinical summary:
Test: ${testName}
Value: ${testValue}
Date: ${testDate}

Provide:
1. A one-sentence summary
2. Key biomarkers mentioned
3. Any health concerns or notable findings

Format as JSON: { "summary": "...", "biomarkers": [...], "concerns": [...] }`
            }
          ]
        }
      ];

      const response = await model.doGenerate({ prompt: promptMessages });

      try {
        const textContent = response.content.find((c) => c.type === "text");
        const text =
          textContent?.type === "text"
            ? textContent.text
            : JSON.stringify(response);
        return JSON.parse(text) as TestSummary;
      } catch {
        return {
          summary: `${testName}: ${testValue} (${testDate})`,
          biomarkers: [testName],
          concerns: []
        };
      }
    });

    const vectorId = await step.do("store embedding", async () => {
      const embeddingText = `Test: ${testName}\nValue: ${testValue}\nDate: ${testDate}\nSummary: ${summary.summary}\nBiomarkers: ${summary.biomarkers.join(", ")}\nConcerns: ${summary.concerns.join(", ")}`;

      const embeddings = (await this.env.AI.run("@cf/baai/bge-base-en-v1.5", {
        text: [embeddingText]
      })) as { data?: number[][] };

      const embeddingData = embeddings.data?.[0] || [];
      const vectorId = `${profileId}-${Date.now()}`;
      await this.env.VECTORIZE.upsert([
        {
          id: vectorId,
          values: embeddingData,
          metadata: { profileId, testName, testDate, summary: summary.summary }
        }
      ]);

      return vectorId;
    });

    await step.do("save to database", async () => {
      await this.env.DB.prepare(
        `INSERT INTO test_results (profile_id, test_name, test_value, test_date, summary, vector_id) 
         VALUES (?, ?, ?, ?, ?, ?)`
      )
        .bind(
          profileId,
          testName,
          testValue,
          testDate,
          summary.summary,
          vectorId
        )
        .run();
    });

    return { success: true, summary: summary.summary, vectorId };
  }
}
