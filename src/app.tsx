import { useEffect, useState, useRef, useCallback } from "react";
import { useAgent } from "agents/react";
import { isToolUIPart } from "ai";
import { useAgentChat } from "agents/ai-react";
import type { UIMessage } from "@ai-sdk/react";
import { Button } from "@/components/button/Button";
import { Card } from "@/components/card/Card";
import { Avatar } from "@/components/avatar/Avatar";
import { Textarea } from "@/components/textarea/Textarea";
import { MemoizedMarkdown } from "@/components/memoized-markdown";
import { ToolInvocationCard } from "@/components/tool-invocation-card/ToolInvocationCard";
import { ProfileSetup } from "@/components/profile-setup/ProfileSetup";
import {
  MoonIcon,
  RobotIcon,
  SunIcon,
  TrashIcon,
  PaperPlaneTiltIcon,
  StopIcon,
  UserIcon,
  TestTubeIcon,
  PlusIcon,
  ChatCircleDotsIcon,
  XIcon
} from "@phosphor-icons/react";

export default function Chat() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    const savedTheme = localStorage.getItem("theme");
    return (savedTheme as "dark" | "light") || "dark";
  });
  const [textareaHeight, setTextareaHeight] = useState("auto");
  const [showProfile, setShowProfile] = useState(false);
  const [showProfileList, setShowProfileList] = useState(false);
  const [showChatsList, setShowChatsList] = useState(false);
  const [isCreatingNewProfile, setIsCreatingNewProfile] = useState(false);
  const [profileList, setProfileList] = useState<
    {
      id: string;
      name: string;
      age_at_creation: number;
      sex: string | null;
      allergies: string | null;
      conditions: string | null;
    }[]
  >([]);
  const [chatsList, setChatsList] = useState<
    {
      id: string;
      profile_id: string;
      title: string;
      created_at: number;
      updated_at: number;
    }[]
  >([]);
  const [currentProfile, setCurrentProfile] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [currentChatSession, setCurrentChatSession] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [profile, setProfile] = useState({
    name: "",
    age: "",
    sex: "",
    race: "",
    religion: "",
    allergies: "",
    conditions: ""
  });
  const [testResult, setTestResult] = useState({
    test: "",
    value: "",
    date: ""
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
      document.documentElement.classList.remove("light");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    scrollToBottom();
  }, [scrollToBottom]);

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark");

  const agent = useAgent({
    agent: "chat"
  });

  const [agentInput, setAgentInput] = useState("");
  const handleAgentInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setAgentInput(e.target.value);
  };

  const handleAgentSubmit = async (
    e: React.FormEvent,
    extraData: Record<string, unknown> = {}
  ) => {
    e.preventDefault();
    if (!agentInput.trim()) return;

    const message = agentInput;
    setAgentInput("");

    // Send message to agent
    await sendMessage(
      {
        role: "user",
        parts: [{ type: "text", text: message }]
      },
      {
        body: extraData
      }
    );
  };

  const {
    messages: agentMessages,
    addToolResult,
    clearHistory,
    status,
    sendMessage,
    stop
  } = useAgentChat<unknown, UIMessage<{ createdAt: string }>>({ agent });

  useEffect(() => {
    agentMessages.length > 0 && scrollToBottom();
  }, [agentMessages, scrollToBottom]);

  const loadProfiles = useCallback(async () => {
    const response = await fetch("/api/agents/chat/profiles");
    const profiles = (await response.json()) as {
      id: string;
      name: string;
      age_at_creation: number;
      sex: string | null;
      allergies: string | null;
      conditions: string | null;
    }[];
    setProfileList(profiles);
  }, []);

  const loadChats = useCallback(async () => {
    try {
      const response = await fetch("/api/agents/chat/chats");
      const chats = (await response.json()) as {
        id: string;
        profile_id: string;
        title: string;
        created_at: number;
        updated_at: number;
      }[];
      setChatsList(chats);
    } catch (error) {
      console.error("Error loading chats:", error);
      setChatsList([]);
    }
  }, []);

  const createNewChat = async () => {
    try {
      const response = await fetch("/api/agents/chat/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Chat" })
      });
      const newChat = (await response.json()) as { id: string; title: string };
      setCurrentChatSession(newChat);
      clearHistory();
      await loadChats();
      setShowChatsList(false);
    } catch (error) {
      console.error("Error creating chat:", error);
    }
  };

  const switchToChat = async (chatId: string, chatTitle: string) => {
    try {
      await fetch("/api/agents/chat/chat/set", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatSessionId: chatId })
      });
      setCurrentChatSession({ id: chatId, title: chatTitle });
      clearHistory();
      setShowChatsList(false);
    } catch (error) {
      console.error("Error switching chat:", error);
    }
  };

  const deleteChat = async (chatId: string) => {
    try {
      await fetch(`/api/agents/chat/chats/${chatId}`, {
        method: "DELETE"
      });
      
      // If deleting current chat, create a new one
      if (currentChatSession?.id === chatId) {
        await createNewChat();
      }
      
      await loadChats();
    } catch (error) {
      console.error("Error deleting chat:", error);
    }
  };

  const saveProfile = async () => {
    await fetch(`/api/agents/chat/profile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: profile.name,
        ageAtCreation: parseInt(profile.age, 10),
        profileCreatedAt: Date.now(),
        sex: profile.sex,
        race: profile.race,
        religion: profile.religion,
        allergies: profile.allergies
          .split(",")
          .map((a) => a.trim())
          .filter((a) => a),
        conditions: profile.conditions
          .split(",")
          .map((c) => c.trim())
          .filter((c) => c),
        meatChoice: "",
        foodExclusions: []
      })
    });
    setShowProfile(false);
    setIsCreatingNewProfile(false);
    setProfile({
      name: "",
      age: "",
      sex: "",
      race: "",
      religion: "",
      allergies: "",
      conditions: ""
    });
    await loadProfiles();

    // Get the current profile info
    const profileResponse = await fetch("/api/agents/chat/profile");
    const currentProfileData = (await profileResponse.json()) as {
      id: string;
      name: string;
    };
    if (currentProfileData.name) {
      setCurrentProfile({
        id: currentProfileData.id,
        name: currentProfileData.name
      });
    }
  };

  const deleteProfile = async () => {
    await fetch("/api/agents/chat/profile", { method: "DELETE" });
    setShowDeleteConfirm(false);
    setCurrentProfile(null);
    clearHistory();
    await loadProfiles();
  };

  const switchProfile = async (profileId: string, profileName: string) => {
    await fetch("/api/agents/chat/profile/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId })
    });
    setCurrentProfile({ id: profileId, name: profileName });
    setShowProfileList(false);
    clearHistory();
    setCurrentChatSession(null);
    // Load chats for the new profile
    await loadChats();
    // Create a new chat if none exist
    const response = await fetch("/api/agents/chat/chats");
    const chats = await response.json();
    if (chats.length === 0) {
      await createNewChat();
    }
  };

  const saveTestResult = async () => {
    await fetch(`/api/agents/chat/test-result`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testResult)
    });
    setTestResult({ test: "", value: "", date: "" });
    // Show a success message or just clear the form
  };

  const formatTime = (date: Date) =>
    date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const startNewChat = async () => {
    await createNewChat();
  };

  useEffect(() => {
    const initializeProfile = async () => {
      try {
        // Load profiles
        await loadProfiles();

        // Load current profile
        const profileResponse = await fetch("/api/agents/chat/profile");
        const profileData = await profileResponse.json() as { id: string; name: string };
        
        if (profileData.name) {
          setCurrentProfile({ id: profileData.id, name: profileData.name });
          setHasProfile(true);
          
          // Load chats for current profile
          await loadChats();
          
          // Get current chat session
          const chatResponse = await fetch("/api/agents/chat/chat/current");
          const chatData = await chatResponse.json();
          
          if (chatData.chatSessionId) {
            const chatsResponse = await fetch("/api/agents/chat/chats");
            const chats = await chatsResponse.json() as Array<{id: string; title: string}>;
            const currentChat = chats.find((c) => c.id === chatData.chatSessionId);
            if (currentChat) {
              setCurrentChatSession({ id: currentChat.id, title: currentChat.title });
            } else {
              // Create a new chat if current one not found
              const newChatResponse = await fetch("/api/agents/chat/chats", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: "New Chat" })
              });
              const newChat = await newChatResponse.json();
              setCurrentChatSession(newChat);
            }
          } else {
            // Create a new chat if none exist
            const newChatResponse = await fetch("/api/agents/chat/chats", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: "New Chat" })
            });
            const newChat = await newChatResponse.json();
            setCurrentChatSession(newChat);
          }
        } else {
          setHasProfile(false);
        }
      } catch (error) {
        console.error("Error initializing profile:", error);
        setHasProfile(false);
      } finally {
        setIsLoadingProfile(false);
      }
    };

    initializeProfile();
  }, [loadProfiles, loadChats]);

  const handleProfileCreated = async () => {
    // Reload the current profile after creation
    const response = await fetch("/api/agents/chat/profile");
    const profileData = await response.json() as { id: string; name: string };
    if (profileData.name) {
      setCurrentProfile({ id: profileData.id, name: profileData.name });
      setHasProfile(true);
      // Create initial chat for new profile
      await createNewChat();
    }
    await loadProfiles();
  };

  useEffect(() => {
    // Load profile data when showing profile form
    if (showProfile && currentProfile && !isCreatingNewProfile) {
      fetch("/api/agents/chat/profile")
        .then((res) => res.json())
        .then((data) => {
          const profileData = data as {
            name: string;
            age_at_creation: number;
            sex: string;
            race: string;
            religion: string;
            allergies: string;
            conditions: string;
          };
          if (profileData.name) {
            setProfile({
              name: profileData.name || "",
              age: profileData.age_at_creation?.toString() || "",
              sex: profileData.sex || "",
              race: profileData.race || "",
              religion: profileData.religion || "",
              allergies: profileData.allergies || "",
              conditions: profileData.conditions || ""
            });
          }
        });
    } else if (showProfile && isCreatingNewProfile) {
      // Clear form for new profile
      setProfile({
        name: "",
        age: "",
        sex: "",
        race: "",
        religion: "",
        allergies: "",
        conditions: ""
      });
    }
  }, [showProfile, currentProfile, isCreatingNewProfile]);

  // Show profile setup if no profile exists and not loading
  if (!isLoadingProfile && !hasProfile) {
    return <ProfileSetup onProfileCreated={handleProfileCreated} />;
  }

  // Show loading state while checking for profile
  if (isLoadingProfile) {
    return (
      <div className="h-screen w-full flex justify-center items-center">
        <div className="text-center">
          <div className="bg-[#F48120]/10 text-[#F48120] rounded-full p-3 inline-flex mb-4">
            <RobotIcon size={32} weight="bold" />
          </div>
          <p className="text-neutral-600 dark:text-neutral-400">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full p-4 flex justify-center items-center bg-fixed overflow-hidden">
      <div className="h-[calc(100vh-2rem)] w-full mx-auto max-w-lg flex flex-col shadow-xl rounded-md overflow-hidden relative border border-neutral-300 dark:border-neutral-800">
        <div className="px-4 py-3 border-b border-neutral-300 dark:border-neutral-800 flex items-center gap-3 sticky top-0 z-10 bg-white dark:bg-neutral-950">
          <Button
            variant="ghost"
            size="md"
            shape="square"
            className="rounded-full h-9 w-9"
            onClick={() => setShowProfileList(!showProfileList)}
            tooltip="Switch profile"
          >
            <UserIcon size={20} weight="bold" />
          </Button>
          <Button
            variant="ghost"
            size="md"
            shape="square"
            className="rounded-full h-9 w-9"
            onClick={() => setShowChatsList(!showChatsList)}
            tooltip="View chats"
          >
            <ChatCircleDotsIcon size={20} weight="bold" />
          </Button>
          <div className="flex-1">
            <h2 className="font-semibold text-base">AI Dietician</h2>
            {currentProfile && currentChatSession && (
              <p className="text-xs text-neutral-600 dark:text-neutral-400 truncate">
                {currentProfile.name} • {currentChatSession.title}
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="md"
            shape="square"
            className="rounded-full h-9 w-9"
            onClick={startNewChat}
            tooltip="New chat"
          >
            <PlusIcon size={20} weight="bold" />
          </Button>
          <Button
            variant="ghost"
            size="md"
            shape="square"
            className="rounded-full h-9 w-9"
            onClick={() => {
              setIsCreatingNewProfile(false);
              setShowProfile(!showProfile);
            }}
            tooltip="Edit profile"
          >
            <TestTubeIcon size={20} weight="bold" />
          </Button>
          <Button
            variant="ghost"
            size="md"
            shape="square"
            className="rounded-full h-9 w-9"
            onClick={toggleTheme}
          >
            {theme === "dark" ? (
              <SunIcon size={20} weight="bold" />
            ) : (
              <MoonIcon size={20} weight="bold" />
            )}
          </Button>
        </div>

        {showProfileList && (
          <div className="p-4 border-b border-neutral-300 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 max-h-[400px] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Switch Profile</h3>
              <Button
                variant="ghost"
                size="sm"
                shape="square"
                className="rounded-full h-7 w-7"
                onClick={() => setShowProfileList(false)}
              >
                <XIcon size={16} weight="bold" />
              </Button>
            </div>
            {profileList.length === 0 ? (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                No profiles yet.
              </p>
            ) : (
              <div className="space-y-2 mb-3">
                {profileList.map((prof) => (
                  <button
                    key={prof.id}
                    type="button"
                    className={`w-full p-3 rounded-md cursor-pointer transition-colors text-left ${
                      currentProfile?.id === prof.id
                        ? "bg-[#F48120]/10 border border-[#F48120]/30"
                        : "bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-750"
                    }`}
                    onClick={() => switchProfile(prof.id, prof.name)}
                  >
                    <p className="font-semibold text-sm">{prof.name}</p>
                    <p className="text-xs text-neutral-600 dark:text-neutral-400">
                      Age: {prof.age_at_creation}
                      {prof.sex && ` • ${prof.sex}`}
                    </p>
                    {prof.conditions && (
                      <p className="text-xs text-neutral-600 dark:text-neutral-400 truncate">
                        Conditions: {prof.conditions}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
            <Button
              onClick={() => {
                setShowProfileList(false);
                setIsCreatingNewProfile(true);
                // Clear the profile form for new profile creation
                setProfile({
                  name: "",
                  age: "",
                  sex: "",
                  race: "",
                  religion: "",
                  allergies: "",
                  conditions: ""
                });
                setShowProfile(true);
              }}
              className="w-full bg-[#F48120] hover:bg-[#F48120]/90 text-white"
              size="sm"
            >
              <PlusIcon size={16} weight="bold" className="mr-2" />
              Create New Profile
            </Button>
          </div>
        )}

        {showChatsList && (
          <div className="p-4 border-b border-neutral-300 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 max-h-[400px] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Chat History</h3>
              <Button
                variant="ghost"
                size="sm"
                shape="square"
                className="rounded-full h-7 w-7"
                onClick={() => setShowChatsList(false)}
              >
                <XIcon size={16} weight="bold" />
              </Button>
            </div>
            {chatsList.length === 0 ? (
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-3">
                No chats yet. Start a new conversation!
              </p>
            ) : (
              <div className="space-y-2 mb-3">
                {chatsList.map((chat) => (
                  <div
                    key={chat.id}
                    className={`w-full p-3 rounded-md transition-colors ${
                      currentChatSession?.id === chat.id
                        ? "bg-[#F48120]/10 border border-[#F48120]/30"
                        : "bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        className="flex-1 text-left"
                        onClick={() => switchToChat(chat.id, chat.title)}
                      >
                        <p className="font-semibold text-sm truncate">
                          {chat.title}
                        </p>
                        <p className="text-xs text-neutral-600 dark:text-neutral-400">
                          {new Date(chat.updated_at * 1000).toLocaleDateString()}
                        </p>
                      </button>
                      {currentChatSession?.id !== chat.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          shape="square"
                          className="rounded-full h-6 w-6 shrink-0"
                          onClick={() => deleteChat(chat.id)}
                        >
                          <TrashIcon size={14} weight="bold" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Button
              onClick={() => {
                startNewChat();
                setShowChatsList(false);
              }}
              className="w-full bg-[#F48120] hover:bg-[#F48120]/90 text-white"
              size="sm"
            >
              <PlusIcon size={16} weight="bold" className="mr-2" />
              New Chat
            </Button>
          </div>
        )}

        {showProfile && (
          <div className="p-4 border-b border-neutral-300 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 max-h-[500px] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">
                {isCreatingNewProfile ? "Create New Profile" : "Update Profile & Tests"}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                shape="square"
                className="rounded-full h-7 w-7"
                onClick={() => {
                  setShowProfile(false);
                  setIsCreatingNewProfile(false);
                }}
              >
                <XIcon size={16} weight="bold" />
              </Button>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400 mb-3">
              {isCreatingNewProfile ? "Fill in your details to create a new profile." : "Update your profile or add test results. You can also share info via chat!"}
            </p>
            <div className="space-y-2">
              <input
                placeholder="Name (required)"
                className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 rounded-md bg-white dark:bg-neutral-900"
                value={profile.name}
                onChange={(e) =>
                  setProfile({ ...profile, name: e.target.value })
                }
              />
              <input
                placeholder="Age (required)"
                type="number"
                className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 rounded-md bg-white dark:bg-neutral-900"
                value={profile.age}
                onChange={(e) =>
                  setProfile({ ...profile, age: e.target.value })
                }
              />
              <input
                placeholder="Sex (e.g., Male, Female, prefer not to say)"
                className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 rounded-md bg-white dark:bg-neutral-900"
                value={profile.sex}
                onChange={(e) =>
                  setProfile({ ...profile, sex: e.target.value })
                }
              />
              <input
                placeholder="Race (e.g., Indian Asian, prefer not to say)"
                className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 rounded-md bg-white dark:bg-neutral-900"
                value={profile.race}
                onChange={(e) =>
                  setProfile({ ...profile, race: e.target.value })
                }
              />
              <input
                placeholder="Religion (e.g., Hindu, Muslim, prefer not to say)"
                className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 rounded-md bg-white dark:bg-neutral-900"
                value={profile.religion}
                onChange={(e) =>
                  setProfile({ ...profile, religion: e.target.value })
                }
              />
              <input
                placeholder="Allergies (e.g., Peanuts, Shellfish)"
                className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 rounded-md bg-white dark:bg-neutral-900"
                value={profile.allergies}
                onChange={(e) =>
                  setProfile({ ...profile, allergies: e.target.value })
                }
              />
              <input
                placeholder="Conditions (e.g., Thyroid, Diabetes)"
                className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 rounded-md bg-white dark:bg-neutral-900"
                value={profile.conditions}
                onChange={(e) =>
                  setProfile({ ...profile, conditions: e.target.value })
                }
              />
              <Button
                onClick={saveProfile}
                className="w-full"
                disabled={!profile.name || !profile.age}
              >
                {isCreatingNewProfile ? "Create Profile" : "Update Profile"}
              </Button>
              {!isCreatingNewProfile && currentProfile && (
                <>
                  <div className="pt-4 mt-4 border-t border-neutral-300 dark:border-neutral-700">
                    <h4 className="font-semibold text-sm mb-2">Add Test Result</h4>
                    <div className="space-y-2">
                      <input
                        placeholder="Test name (e.g., TSH)"
                        className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 rounded-md bg-white dark:bg-neutral-900"
                        value={testResult.test}
                        onChange={(e) =>
                          setTestResult({ ...testResult, test: e.target.value })
                        }
                      />
                      <input
                        placeholder="Value (e.g., 3.2)"
                        className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 rounded-md bg-white dark:bg-neutral-900"
                        value={testResult.value}
                        onChange={(e) =>
                          setTestResult({ ...testResult, value: e.target.value })
                        }
                      />
                      <input
                        placeholder="Date (e.g., Dec 12, 2023)"
                        className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 rounded-md bg-white dark:bg-neutral-900"
                        value={testResult.date}
                        onChange={(e) =>
                          setTestResult({ ...testResult, date: e.target.value })
                        }
                      />
                      <Button onClick={saveTestResult} className="w-full" size="sm">
                        Add Test Result
                      </Button>
                    </div>
                  </div>
                  <Button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full mt-2"
                    variant="ghost"
                  >
                    Delete Profile
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {showDeleteConfirm && (
          <div className="p-4 border-b border-neutral-300 dark:border-neutral-800 bg-red-50 dark:bg-red-900/20">
            <h3 className="font-semibold mb-3 text-red-800 dark:text-red-300">
              Confirm Delete
            </h3>
            <p className="text-sm text-red-700 dark:text-red-400 mb-3">
              Are you sure you want to delete the profile for{" "}
              {currentProfile?.name}? This will also delete all associated test
              results. This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button
                onClick={deleteProfile}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
              >
                Yes, Delete
              </Button>
              <Button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1"
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24 max-h-[calc(100vh-10rem)]">
          {agentMessages.length === 0 && (
            <div className="h-full flex items-center justify-center">
              <Card className="p-6 max-w-md mx-auto bg-neutral-100 dark:bg-neutral-900">
                <div className="text-center space-y-4">
                  <div className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 rounded-lg p-3 mb-4">
                    <p className="text-xs font-semibold">
                      IMPORTANT DISCLAIMER
                    </p>
                    <p className="text-xs mt-1">
                      This is an AI prototype for demonstration purposes only.
                      Always consult a qualified healthcare professional before
                      making dietary changes.
                    </p>
                  </div>
                  <div className="bg-[#F48120]/10 text-[#F48120] rounded-full p-3 inline-flex">
                    <RobotIcon size={24} weight="bold" />
                  </div>
                  <h3 className="font-semibold text-lg">AI Dietician</h3>
                  <p className="text-muted-foreground text-sm">
                    Get personalized diet recommendations based on your health
                    profile.
                  </p>
                  <ul className="text-sm text-left space-y-2">
                    <li className="flex items-center gap-2">
                      <span className="text-[#F48120]">•</span>
                      <span>Create and manage multiple user profiles</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-[#F48120]">•</span>
                      <span>Share profile info via chat or form</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-[#F48120]">•</span>
                      <span>Add test results through conversation</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-[#F48120]">•</span>
                      <span>Get culturally-sensitive diet advice</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-[#F48120]">•</span>
                      <span>Update or delete profiles anytime</span>
                    </li>
                  </ul>
                </div>
              </Card>
            </div>
          )}

          {agentMessages.map((m, index) => {
            const isUser = m.role === "user";
            const showAvatar =
              index === 0 || agentMessages[index - 1]?.role !== m.role;
            return (
              <div key={m.id}>
                <div
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`flex gap-2 max-w-[85%] ${isUser ? "flex-row-reverse" : "flex-row"}`}
                  >
                    {showAvatar && !isUser ? (
                      <Avatar username={"AI"} className="shrink-0" />
                    ) : (
                      !isUser && <div className="w-8" />
                    )}
                    <div>
                      <div>
                        {m.parts?.map((part, i) => {
                          if (part.type === "text") {
                            return (
                              <div key={`${m.id}-text-${i}`}>
                                <Card
                                  className={`p-3 rounded-md bg-neutral-100 dark:bg-neutral-900 ${isUser ? "rounded-br-none" : "rounded-bl-none border-assistant-border"} relative`}
                                >
                                  <MemoizedMarkdown
                                    id={`${m.id}-${i}`}
                                    content={part.text}
                                  />
                                </Card>
                                <p
                                  className={`text-xs text-muted-foreground mt-1 ${isUser ? "text-right" : "text-left"}`}
                                >
                                  {formatTime(
                                    m.metadata?.createdAt
                                      ? new Date(m.metadata.createdAt)
                                      : new Date()
                                  )}
                                </p>
                              </div>
                            );
                          }
                          if (isToolUIPart(part) && m.role === "assistant") {
                            return (
                              <ToolInvocationCard
                                key={`${part.toolCallId}-${i}`}
                                toolUIPart={part}
                                toolCallId={part.toolCallId}
                                needsConfirmation={false}
                                onSubmit={({ toolCallId, result }) => {
                                  addToolResult({
                                    tool: part.type.replace("tool-", ""),
                                    toolCallId,
                                    output: result
                                  });
                                }}
                                addToolResult={(toolCallId, result) => {
                                  addToolResult({
                                    tool: part.type.replace("tool-", ""),
                                    toolCallId,
                                    output: result
                                  });
                                }}
                              />
                            );
                          }
                          return null;
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAgentSubmit(e, {});
            setTextareaHeight("auto");
          }}
          className="p-3 bg-neutral-50 absolute bottom-0 left-0 right-0 z-10 border-t border-neutral-300 dark:border-neutral-800 dark:bg-neutral-900"
        >
          <div className="flex items-center gap-2">
            <div className="flex-1 relative">
              <Textarea
                placeholder="Ask about diet recommendations..."
                className="flex w-full border border-neutral-200 dark:border-neutral-700 px-3 py-2 ring-offset-background placeholder:text-neutral-500 dark:placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-300 dark:focus-visible:ring-neutral-700 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm min-h-6 max-h-[calc(75dvh)] overflow-hidden resize-none rounded-2xl text-base! pb-10 dark:bg-neutral-900"
                value={agentInput}
                onChange={(e) => {
                  handleAgentInputChange(e);
                  e.target.style.height = "auto";
                  e.target.style.height = `${e.target.scrollHeight}px`;
                  setTextareaHeight(`${e.target.scrollHeight}px`);
                }}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.shiftKey &&
                    !e.nativeEvent.isComposing
                  ) {
                    e.preventDefault();
                    handleAgentSubmit(e as unknown as React.FormEvent);
                    setTextareaHeight("auto");
                  }
                }}
                rows={2}
                style={{ height: textareaHeight }}
              />
              <div className="absolute bottom-0 right-0 p-2 w-fit flex flex-row justify-end">
                {status === "submitted" || status === "streaming" ? (
                  <button
                    type="button"
                    onClick={stop}
                    className="inline-flex items-center cursor-pointer justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-[#F48120] text-white hover:bg-[#F48120]/90 rounded-full p-1.5 h-fit border border-neutral-200 dark:border-neutral-800"
                  >
                    <StopIcon size={16} className="shrink-0" weight="fill" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    className="inline-flex items-center cursor-pointer justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-[#F48120] text-white hover:bg-[#F48120]/90 disabled:bg-neutral-300 disabled:text-neutral-500 rounded-full p-1.5 h-fit border border-neutral-200 dark:border-neutral-800"
                    disabled={!agentInput.trim()}
                  >
                    <PaperPlaneTiltIcon
                      size={16}
                      className="shrink-0"
                      weight="fill"
                    />
                  </button>
                )}
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
