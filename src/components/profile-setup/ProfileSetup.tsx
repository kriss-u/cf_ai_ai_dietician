import { useState } from "react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { RobotIcon } from "@phosphor-icons/react";

interface ProfileSetupProps {
  onProfileCreated: () => void;
}

export function ProfileSetup({ onProfileCreated }: ProfileSetupProps) {
  const [profile, setProfile] = useState({
    name: "",
    age: "",
    sex: "",
    race: "",
    religion: "",
    allergies: "",
    meatChoice: "",
    foodExclusions: "",
    conditions: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await fetch(`/api/agents/chat/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name,
          ageAtCreation: parseInt(profile.age, 10),
          profileCreatedAt: Date.now(),
          sex: profile.sex || "Prefer not to say",
          race: profile.race || "Prefer not to say",
          religion: profile.religion || "Prefer not to say",
          allergies: profile.allergies
            .split(",")
            .map((a) => a.trim())
            .filter((a) => a),
          meatChoice: profile.meatChoice || "No preference",
          foodExclusions: profile.foodExclusions
            .split(",")
            .map((f) => f.trim())
            .filter((f) => f),
          conditions: profile.conditions
            .split(",")
            .map((c) => c.trim())
            .filter((c) => c)
        })
      });

      onProfileCreated();
    } catch (error) {
      console.error("Error creating profile:", error);
      alert("Failed to create profile. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = profile.name.trim() && profile.age.trim();

  return (
    <div className="h-screen w-full p-4 flex justify-center items-center bg-fixed overflow-hidden">
      <Card className="w-full max-w-2xl p-6 shadow-xl bg-white dark:bg-neutral-900">
        <div className="text-center mb-6">
          <div className="bg-[#F48120]/10 text-[#F48120] rounded-full p-3 inline-flex mb-4">
            <RobotIcon size={32} weight="bold" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Welcome to AI Dietician</h1>
          <p className="text-neutral-600 dark:text-neutral-400">
            Let's set up your profile to provide personalized dietary recommendations
          </p>
        </div>

        <div className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded-lg p-4 mb-6">
          <p className="text-sm font-semibold mb-1">⚠️ IMPORTANT DISCLAIMER</p>
          <p className="text-sm">
            This is an AI prototype for demonstration purposes only. Always consult
            a qualified healthcare professional before making dietary changes.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Your full name"
                className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 rounded-md bg-white dark:bg-neutral-800"
                value={profile.name}
                onChange={(e) =>
                  setProfile({ ...profile, name: e.target.value })
                }
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Age <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="120"
                placeholder="Your age in years"
                className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 rounded-md bg-white dark:bg-neutral-800"
                value={profile.age}
                onChange={(e) =>
                  setProfile({ ...profile, age: e.target.value })
                }
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Sex</label>
              <select
                className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 rounded-md bg-white dark:bg-neutral-800"
                value={profile.sex}
                onChange={(e) =>
                  setProfile({ ...profile, sex: e.target.value })
                }
              >
                <option value="">Select...</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Race/Ethnicity</label>
              <input
                type="text"
                placeholder="e.g., Asian, Caucasian, etc."
                className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 rounded-md bg-white dark:bg-neutral-800"
                value={profile.race}
                onChange={(e) =>
                  setProfile({ ...profile, race: e.target.value })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Religion</label>
              <input
                type="text"
                placeholder="e.g., Hindu, Muslim, Christian, etc."
                className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 rounded-md bg-white dark:bg-neutral-800"
                value={profile.religion}
                onChange={(e) =>
                  setProfile({ ...profile, religion: e.target.value })
                }
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Meat Choice</label>
              <select
                className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 rounded-md bg-white dark:bg-neutral-800"
                value={profile.meatChoice}
                onChange={(e) =>
                  setProfile({ ...profile, meatChoice: e.target.value })
                }
              >
                <option value="">Select...</option>
                <option value="Vegetarian">Vegetarian</option>
                <option value="Vegan">Vegan</option>
                <option value="Pescatarian">Pescatarian</option>
                <option value="All meats">All meats</option>
                <option value="No red meat">No red meat</option>
                <option value="Halal only">Halal only</option>
                <option value="Kosher only">Kosher only</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Food Allergies
            </label>
            <input
              type="text"
              placeholder="e.g., Peanuts, Shellfish, Dairy (comma-separated)"
              className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 rounded-md bg-white dark:bg-neutral-800"
              value={profile.allergies}
              onChange={(e) =>
                setProfile({ ...profile, allergies: e.target.value })
              }
            />
            <p className="text-xs text-neutral-500 mt-1">
              Critical for safety! List all food allergies separated by commas
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Food Exclusions
            </label>
            <input
              type="text"
              placeholder="e.g., Spicy food, Gluten, Soy (comma-separated)"
              className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 rounded-md bg-white dark:bg-neutral-800"
              value={profile.foodExclusions}
              onChange={(e) =>
                setProfile({ ...profile, foodExclusions: e.target.value })
              }
            />
            <p className="text-xs text-neutral-500 mt-1">
              Foods you prefer to avoid (beyond allergies)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Known Medical Conditions
            </label>
            <input
              type="text"
              placeholder="e.g., Diabetes, Thyroid, Hypertension (comma-separated)"
              className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 rounded-md bg-white dark:bg-neutral-800"
              value={profile.conditions}
              onChange={(e) =>
                setProfile({ ...profile, conditions: e.target.value })
              }
            />
          </div>

          <div className="pt-4">
            <Button
              type="submit"
              className="w-full"
              disabled={!isFormValid || isSubmitting}
            >
              {isSubmitting ? "Creating Profile..." : "Create Profile & Start Chat"}
            </Button>
            <p className="text-xs text-neutral-500 text-center mt-2">
              * Required fields. You can update this information later through chat.
            </p>
          </div>
        </form>
      </Card>
    </div>
  );
}
