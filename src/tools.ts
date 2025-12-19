import { tool } from "ai";
import { z } from "zod";
import type { ToolSet } from "ai";

// Schema for updating specific profile fields through conversation
const updateProfileFieldSchema = z.object({
  field: z
    .enum([
      "allergies",
      "conditions",
      "meatChoice",
      "foodExclusions",
      "religion",
      "sex",
      "race"
    ])
    .describe("Field to update"),
  value: z
    .string()
    .min(1)
    .describe("New value for the field"),
  action: z
    .enum(["replace", "add", "remove"])
    .describe("add, remove, or replace"),
  userConfirmation: z
    .string()
    .min(5)
    .describe("Quote exact user message requesting update")
});

// Schema for adding test results
const addTestResultSchema = z.object({
  test: z
    .string()
    .min(2)
    .describe("Medical test name (e.g., TSH, Cholesterol, HbA1c, Glucose)"),
  value: z
    .string()
    .min(1)
    .describe("Test value with units (e.g., 120 mg/dL, 5.7%)"),
  date: z
    .string()
    .describe("Test date if mentioned, otherwise use empty string for today"),
  userStatement: z
    .string()
    .min(10)
    .describe("Quote exact user message sharing test result")
});

export const tools = {
  updateProfileField: tool({
    description: `STORAGE ONLY: Call this when user explicitly asks to update/add profile info (e.g., "add peanut allergy to my profile"). Extract exact field, value, and quote user's message. Do NOT use for diet advice.`,
    inputSchema: updateProfileFieldSchema
  }),

  addTestResult: tool({
    description: `STORAGE ONLY: Call this when user shares medical test results with specific numbers and units (e.g., "My glucose was 105 mg/dL", "TSH is 4.2 mIU/L"). Extract test name, value with units, date, and quote user's exact statement. ALWAYS use this when user mentions test results. Do NOT use for diet advice.`,
    inputSchema: addTestResultSchema
  })
} satisfies ToolSet;
