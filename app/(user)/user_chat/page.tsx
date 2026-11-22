"use client";

import Script from "next/script";
import { useState, useRef, useEffect, Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Scale,
  BookOpen,
  RefreshCw,
  Landmark,
  Layers,
  FileText,
  Send,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Settings,
  Plus,
  Zap,
  Clock,
  Circle,
  Hash,
  AlignLeft,
  ArrowUpRight,
} from "lucide-react";
import { motion } from "framer-motion";

interface Conversation {
  id: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
  isGuest?: boolean;
  guestSessionId?: string;
  _count: { messages: number };
}

interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  _metadata?: Record<string, unknown>;
  isEditing?: boolean;
  parentMessageId?: string;
  branchFrom?: string;
}

/* Guest session management */
const GUEST_SESSION_STORAGE_KEY = "samvi-guest-session-id";

function getGuestSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(GUEST_SESSION_STORAGE_KEY);
}

function setGuestSessionId(id: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(GUEST_SESSION_STORAGE_KEY, id);
}

/* Generate a new stable guest session ID if one doesn't exist */
function initializeGuestSession(): string {
  const existingId = getGuestSessionId();
  if (existingId) return existingId;
  
  const newId = `guest_${Math.random().toString(36).substring(2, 15)}_${Date.now().toString(36)}`;
  setGuestSessionId(newId);
  return newId;
}

interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

interface ConversationDetail extends Conversation {
  messages: StoredMessage[];
}

declare global {
  interface Window {
    puter: {
      ai: {
        chat: (
          messages: unknown,
          options?: {
            model?: string;
          }
        ) => Promise<{
          message?: {
            content?: string;
          };
          content?: string;
        }>;
      };
    };
  }
}

/* Types */

type Role = "user" | "ai";

type Suggestion = string;
interface Message {
  id: string;
  role: Role;
  text: string;
  time: string;
}

/* Suggested prompts */

const suggestions = [
  {
    icon: Hash,
    label: "What is Article 21?",
    sub: "Right to life & liberty",
    color:
      "border-amber-800/40 bg-amber-950/5 text-amber-900 hover:border-amber-800/70 hover:bg-amber-950/10",
    iconColor: "text-amber-800",
  },
  {
    icon: Scale,
    label: "Explain Fundamental Rights",
    sub: "Part III of Constitution",
    color:
      "border-sky-800/40 bg-sky-950/5 text-sky-900 hover:border-sky-800/70 hover:bg-sky-950/10",
    iconColor: "text-sky-800",
  },
  {
    icon: AlignLeft,
    label: "What is the Preamble?",
    sub: "Soul of the Constitution",
    color:
      "border-emerald-800/40 bg-emerald-950/5 text-emerald-900 hover:border-emerald-800/70 hover:bg-emerald-950/10",
    iconColor: "text-emerald-800",
  },
  {
    icon: RefreshCw,
    label: "Latest Constitutional amendment?",
    sub: "Recent legal changes",
    color:
      "border-rose-800/40 bg-rose-950/5 text-rose-900 hover:border-rose-800/70 hover:bg-rose-950/10",
    iconColor: "text-rose-800",
  },
  {
    icon: Landmark,
    label: "What are Directive Principles?",
    sub: "Part IV — DPSP",
    color:
      "border-violet-800/40 bg-violet-950/5 text-violet-900 hover:border-violet-800/70 hover:bg-violet-950/10",
    iconColor: "text-violet-800",
  },
  {
    icon: Layers,
    label: "Federal vs Unitary?",
    sub: "Structure of governance",
    color:
      "border-orange-800/40 bg-orange-950/5 text-orange-900 hover:border-orange-800/70 hover:bg-orange-950/10",
    iconColor: "text-orange-800",
  },
];

function now() {
  return new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function welcomeMessage(): Message {
  return {
    id: "0",
    role: "ai",
    text: "Namaste! I'm **Samvi**, your AI guide to the Constitution of India.\n\nAsk me anything — articles, amendments, fundamental rights, schedules, or any constitutional concept. I'm here to make learning simple and insightful.",
    time: now(),
  };
}

function toUiMessages(storedMessages: StoredMessage[]): Message[] {
  if (storedMessages.length === 0) {
    return [welcomeMessage()];
  }

  return storedMessages.map((msg) => ({
    id: msg.id || `${index}`,
    role: msg.role === "assistant" ? "ai" : "user",
    text: msg.content,
    time: new Date(msg.createdAt).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    isEditing: msg.isEditing || false,
    parentMessageId: msg.parentMessageId,
    branchFrom: msg.branchFrom,
  }));
}

/* Typing indicator */

function TypingDots() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-amber-700 animate-bounce"
          style={{ animationDelay: `${i * 0.18}s`, animationDuration: "0.75s" }}
        />
      ))}
    </div>
  );
}

/* Message bubble */

function Bubble({ msg }: { msg: Message }) {
  const isAI = msg.role === "ai";
  const metadata = msg._metadata || {};
  const verification = metadata.verification;

  // Parse citation and verification info from metadata
  const citationStatus = verification?.status;
  const provenance = verification?.provenance || {};
  const evidencePassages = verification?.evidencePassages || [];
  const explanation = verification?.explanation || "";

  // Edit/regenerate controls show for user's own messages (not the AI welcome message)
  const canEdit = !isAI && msg.id !== "0" && !msg.isEditing;
  const canRegenerate = isAI && msg._metadata?.verification;

  return (
    <div
      className={"flex items-end gap-3 " + (isAI ? "flex-row" : "flex-row-reverse")}
    >
      {/* Avatar */}
      {isAI ? (
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border-[1.5px] border-amber-800/50 bg-amber-950/8 shadow-sm">
          <Zap size={14} strokeWidth={2} className="text-amber-800" />
        </div>
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-slate-300 bg-slate-100 shadow-sm">
          <span className="text-[11px] font-bold text-slate-600 tracking-tight">
            U
          </span>
        </div>
      )}

      {msg.isEditing && !isAI ? (
        /* Edit form for user message */
        <div
          className={"flex max-w-[75%] sm:max-w-[68%] flex-col gap-1 " + (isAI ? "items-start" : "items-end")}
        >
          <div
            className={"relative rounded-2xl px-4 py-3 text-[13.5px] leading-[1.8] " + (isAI ? "rounded-bl-sm bg-white border-[1.5px] border-slate-200 text-slate-800 shadow-sm" : "rounded-br-sm bg-amber-900 text-amber-50 shadow-md")}
          >
            <textarea
              defaultValue={msg.text}
              className={"w-full rounded-blg bg-white border border-slate-300 py-2 px-3 text-[13.5px] leading-[1.8] focus:outline-none focus:border-amber-500"}
              rows={3}
              style={{ minHeight: 50 }}
            />
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setMsgEditing(null)}
                className="flex-1 rounded bg-gray-200 px-3 py-1 text-sm text-slate-600 hover:bg-gray-300 cancel-edit"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="rounded bg-amber-600 px-3 py-1 text-sm text-white hover:bg-amber-500 save-edit"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : canEdit && (
        /* Edit button for user message */
        <div
          className="absolute top-2 right-2 flex items-center gap-2"
        >
          <button
            onClick={() => setMsgEditing(msg.id)}
            className="rounded bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-500 transition-colors"
            title="Edit message"
          >
            <Edit size={12} strokeWidth={1.5} className="text-amber-100" />
          </button>
        </div>
      ) : canRegenerate && (
        /* Regenerate button for AI message */
        <div
          className="absolute top-2 right-2 flex items-center gap-2"
        >
          <button
            onClick={() => handleRegenerate(msg.id)}
            className="rounded bg-amber-600 px-2 py-1 text-xs text-white hover:bg-amber-500 transition-colors"
            title="Regenerate response"
          >
            <RefreshCw size={12} strokeWidth={1.5} className="text-amber-100" />
          </button>
        </div>
      )}

      <div
        className={"flex max-w-[75%] sm:max-w-[68%] flex-col gap-1 " + (isAI ? "items-start" : "items-end")}
      >
        <div
          className={"relative rounded-2xl px-4 py-3 text-[13.5px] leading-[1.8] " + (isAI ? "rounded-bl-sm bg-white border-[1.5px] border-slate-200 text-slate-800 shadow-sm" : "rounded-br-sm bg-amber-900 text-amber-50 shadow-md")}
        >
{/* Display verification status badge for AI messages */}
  {isAI && citationStatus && (
    <div
      className={"absolute top-2 right-2 flex items-center gap-2 px-2 py-1 text-[9px] font-medium rounded border " + (citationStatus === "VERIFIED" ? "bg-green-100 text-green-800 border-green-300" : citationStatus === "PARTIALLY_SUPPORTED" ? "bg-amber-100 text-amber-800 border-amber-300" : citationStatus === "UNSUPPORTED" ? "bg-red-100 text-red-800 border-red-300" : "bg-gray-100 text-gray-800 border-gray-300")}
    >
      {citationStatus}
    </div>
  )}

  {isAI && !msg.isEditing && (
    <div
      className="absolute top-2 right-2 flex items-center gap-2 px-2 py-1 text-[10px] text-slate-400"
      style={{ zIndex: 10 }}
    >
      <button
        onClick={() => setFeedbackState({ msgId: msg.id, rating: 5, comment: "" })}
        className="rounded bg-green-100 px-2 py-1 text-green-800 hover:bg-green-200 transition-colors"
        title="Thumbs up"
      >
        <RotateCw size={12} strokeWidth={1.5} className="text-green-600" />
      </button>
      <button
        onClick={() => setFeedbackState({ msgId: msg.id, rating: 1, comment: "" })}
        className="rounded bg-red-100 px-2 py-1 text-red-800 hover:bg-red-200 transition-colors"
        title="Thumbs down"
      >
        <XMark size={12} strokeWidth={1.5} className="text-red-600" />
      </button>
    </div>
  )}

          {msg.text.split("\n").map((line, i) => (
            <p key={i} className={line === "" ? "h-2" : ""}>
              {line.split(/(\*\*[^*]+\*\*)/g).map((chunk, j) => {
                if (chunk.startsWith("**") && chunk.endsWith("**")) {
                  return (
                    <strong key={j} className={isAI ? "font-semibold text-slate-900" : "font-semibold"}>
                      {chunk.slice(2, -2)}
                    </strong>
                  );
                }
                if (chunk.startsWith("*") && chunk.endsWith("*")) {
                  return (
                    <em key={j} className="italic opacity-80">
                      {chunk.slice(1, -1)}
                    </em>
                  );
                }
                if (
                  citationStatus &&
                  (chunk.includes("Article") ||
                    chunk.includes("article") ||
                    chunk.includes("Amendment") ||
                    chunk.includes("amendment") ||
                    chunk.includes("v.") ||
                    chunk.includes("vs") ||
                    chunk.includes("Judgment") ||
                    chunk.includes("judgment")) &&
                  !chunk.startsWith("<") &&
                  !chunk.startsWith(">")
                ) {
                  return (
                    <span key={j} className="relative inline-block pr-2">
                      {chunk}
                      {isAI && provenance.sourceType && (
                        <span key={`cite-type-${j}`} className="text-[xxs] opacity-40">
                          {provenance.sourceType}
                        </span>
                      )}
                    </span>
                  );
                }
                return chunk;
              })}
            </p>
          ))}

          {/* Evidence passage display - for AI messages with verification */}
          {isAI && evidencePassages.length > 0 && (
            <div
              className={"mt-3 p-3 text-[10px] text-slate-500 rounded-sm border-t-2 " + (citationStatus === "VERIFIED" || citationStatus === "PARTIALLY_SUPPORTED" ? "bg-amber-50 border-amber-200" : citationStatus === "UNSUPPORTED" ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200")}
            >
              {citationStatus === "VERIFIED" ? (
                <div className="flex items-start gap-2">
                  <Landmark size={8} strokeWidth={1.5} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <span className="flex-1">
                    <strong>Supported by constitutional text:</strong> {evidencePassages[0]}
                  </span>
                </div>
              ) : citationStatus === "PARTIALLY_SUPPORTED" ? (
                <div className="flex items-start gap-2">
                  <Layers size={8} strokeWidth={1.5} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <span className="flex-1">
                    <strong>Partial support:</strong> {evidencePassages[0]}
                  </span>
                )
              : citationStatus === "UNSUPPORTED" ? (
                <div className="flex items-start gap-2">
                  <X size={8} strokeWidth={1.5} className="text-rose-600 flex-shrink-0 mt-0.5" />
                  <span className="flex-1">
                    <strong>Not supported:</strong> {evidencePassages[0]}
                  </span>
                )
              : (
                <div className="flex items-start gap-2">
                  <Clock size={8} strokeWidth={1.5} className="text-slate-600 flex-shrink-0 mt-0.5" />
                  <span className="flex-1">
                    <strong>Unverified:</strong> {evidencePassages[0]}
                  </span>
                </div>
              )}
            </div>
          )}
          {/* Citations reference line - for AI messages */}
          {isAI && citationStatus && provenance.articleClauseRef && (
            <div
              className={"mt-2 pt-2 border-t border-slate-200/30 text-[10px] text-slate-400 flex flex-col gap-1"}
            >
              <span>
                {provenance.sourceTitle || "Citation"}
                {provenance.articleClauseRef ? " · " + provenance.articleClauseRef : ""}
                {provenance.court ? " (" + provenance.court + ")" : ""}
                {provenance.judgmentYear ? " (" + provenance.judgmentYear + ")" : ""}
              </span>
              {explanation && (
                <div className="mt-1 text-[xxs] opacity-70">
                  {explanation}
                </div>
              )}
            </div>
          )}
        </div>
        <span className="text-[10px] text-slate-400 px-1">{msg.time}</span>
      </div>
    </div>
  );
}

/* Suggestion chips component */

type SuggestionChipsProps = {
  suggestions: Suggestion[];
  onSelect: (suggestion: Suggestion) => void;
};

const chipVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.3 },
  }),
};

function SuggestionChips({ suggestions, onSelect }: SuggestionChipsProps) {
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {suggestions.map((s, i) => (
        <motion.button
          key={s}
          custom={i}
          variants={chipVariants}
          initial="hidden"
          animate="visible"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className="rounded-full border border-amber-800/30 bg-amber-100 px-3 py-1 text-sm text-amber-900"
          onClick={() => onSelect(s)}
        >
          {s}
        </motion.button>
      ))}
    </div>
  );
}

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

const SYSTEM_PROMPT = `
  You are Samvi, an expert AI guide to the Constitution of India.

  Rules:
  - Answer only Constitution-related questions.
  - Explain articles, amendments, rights, duties, judiciary, parliament and constitutional law.
  - If the question is unrelated, politely redirect the user.
  - Use concise and accurate answers.
  - Use markdown formatting.
`;

/* ---- Suggestion generation helpers ---- */

function parseSuggestions(raw: string): Suggestion[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((s) => String(s));
    }
    if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).questions)) {
      return (parsed as any).questions.map((s: any) => String(s));
    }
  } catch {
    // ignore errors
  }
  return [];
}

/** Generate 7 follow-up suggestions */
async function generateSuggestions(userQuestion: string, aiAnswer: string): Promise<Suggestion[]> {
  const systemPrompt = `
You are creating follow-up learning questions for students studying the Constitution of India.

Generate exactly 7 short follow-up questions.

Requirements:
* Directly related to the previous answer.
* Encourage deeper understanding.
* Less than 8 words each.
* No numbering.
* No explanations.
* No duplicates.

Return ONLY valid JSON:
[
  "Question 1",
  "Question 2",
  "Question 3",
  "Question 4",
  "Question 5",
  "Question 6",
  "Question 7"
]
`;

  try {
    const response = await window.puter.ai.chat(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: `User question:\n${userQuestion}\n\nAI answer:\n${aiAnswer}` },
      ],
      { model: "gpt-5.4-nano" }
    );

    const raw = typeof response?.message?.content === "string"
      ? response.message.content
      : typeof response?.content === "string"
        ? response.content
        : "";

    return parseSuggestions(raw).slice(0, 7);
  } catch (e) {
    console.error("Suggestion generation failed:", e);
    return [];
  }
}

/* Main PAGE */

export default function ChatPage() {
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "0",
      role: "ai",
      text: "Namaste! I'm **Samvi**, your AI guide to the Constitution of India.\n\nAsk me anything — articles, amendments, fundamental rights, schedules, or any constitutional concept. I'm here to make learning simple and insightful.",
      time: now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; name?: string; email: string } | null>(null);
  const [followUpSuggestions, setFollowUpSuggestions] = useState<Suggestion[]>([]);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [feedbackState, setFeedbackState] = useState<{ msgId: string; rating: number; comment: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [editingMsgId, setMsgEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  useEffect(() => {
    const initializeAndLoad = async () => {
      // Initialize stable guest session ID (survives page reloads)
      initializeGuestSession();

      try {
        const profileRes = await fetch("/api/auth/profile");
        if (profileRes.ok) {
          const profile = await profileRes.json();
          setUser(profile.user);
        }

        const conversationsRes = await fetch("/api/conversations");
        if (conversationsRes.ok) {
          const conversationsData = await conversationsRes.json();
          setConversations(conversationsData);
          
          if (conversationsData.length > 0) {
            setActiveConversationId(conversationsData[0].id);
          }
        }
      } catch (error) {
        console.error("Failed to load profile/conversations:", error);
      }
    };

    initializeAndLoad();
  }, []);

  // Trigger guest-to-account migration when user logs in
  useEffect(() => {
    if (user) {
      migrateGuestConversations();
    }
  }, [user]);

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([{
        id: "0",
        role: "ai",
        text: "Namaste! I'm **Samvi**, your AI guide to the Constitution of India.\n\nAsk me anything — articles, amendments, fundamental rights, schedules, or any constitutional concept. I'm here to make learning simple and insightful.",
        time: now(),
      }]);
      return;
    }

    // Try to fetch messages from the backend DB first (includes verification metadata)
    fetch("/api/conversations/" + activeConversationId)
      .then((res) => res.json())
      .then((conv) => {
        if (conv && conv.messages && conv.messages.length > 0) {
          // DB messages include metadata - use those
          const converted: Message[] = conv.messages.map((msg: any, index: number) => ({
            id: msg.id || `${index}`,
            role: msg.role === "assistant" ? "ai" : "user",
            text: msg.content,
            time: new Date(msg.createdAt).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
            }),
            isEditing: false,
            parentMessageId: msg.parentMessageId,
            branchFrom: msg.branchFrom,
            _metadata: msg.metadata || {},
          }));
          setMessages(converted);
        } else {
          // Fall back to localStorage
          const saved = localStorage.getItem(`samvi-chat-${activeConversationId}`);
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              const converted: Message[] = parsed.map((msg: { role: string; content: string }, index: number) => ({
                id: `${index}`,
                role: msg.role === "assistant" ? "ai" : "user",
                text: msg.content,
                time: now(),
                isEditing: false,
                parentMessageId: msg.parentMessageId,
                branchFrom: msg.branchFrom,
                _metadata: {}, // no metadata in old localStorage format
              }));
              setMessages(converted);
            } catch (error) {
              console.error("Failed to parse saved messages:", error);
              setMessages([{
                id: "0",
                role: "ai",
                text: "Namaste! I'm **Samvi**, your AI guide to the Constitution of India.\n\nAsk me anything — articles, amendments, fundamental rights, schedules, or any constitutional concept. I'm here to make learning simple and insightful.",
                time: now(),
              }]);
            }
          } else {
            setMessages([{
              id: "0",
              role: "ai",
              text: "Namaste! I'm **Samvi**, your AI guide to the Constitution of India.\n\nAsk me anything — articles, amendments, fundamental rights, schedules, or any constitutional concept. I'm here to make learning simple and insightful.",
              time: now(),
            }]);
          }
        }
      })
      .catch((err) => {
        console.error("Failed to fetch conversation from DB, falling back to localStorage:", err);
        // Fall back to localStorage
        const saved = localStorage.getItem(`samvi-chat-${activeConversationId}`);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            const converted: Message[] = parsed.map((msg: { role: string; content: string }, index: number) => ({
              id: `${index}`,
              role: msg.role === "assistant" ? "ai" : "user",
              text: msg.content,
              time: now(),
              isEditing: false,
              parentMessageId: msg.parentMessageId,
              branchFrom: msg.branchFrom,
              _metadata: {}, // no metadata in old localStorage format
            }));
            setMessages(converted);
          } catch (error) {
            console.error("Failed to parse saved messages:", error);
            setMessages([{
              id: "0",
              role: "ai",
              text: "Namaste! I'm **Samvi**, your AI guide to the Constitution of India.\n\nAsk me anything — articles, amendments, fundamental rights, schedules, or any constitutional concept. I'm here to make learning simple and insightful.",
              time: now(),
            }]);
          }
        } else {
          setMessages([{
            id: "0",
            role: "ai",
            text: "Namaste! I'm **Samvi**, your AI guide to the Constitution of India.\n\nAsk me anything — articles, amendments, fundamental rights, schedules, or any constitutional concept. I'm here to make learning simple and insightful.",
            time: now(),
          }]);
        }
      });
  }, [activeConversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  useEffect(() => {
    if (activeConversationId) {
      const storageMessages = messages.map((msg) => ({
        role: msg.role === "ai" ? "assistant" : "user",
        content: msg.text,
        isEditing: msg.isEditing || false,
        parentMessageId: msg.parentMessageId,
        branchFrom: msg.branchFrom,
        _metadata: msg._metadata || {},
      }));
      localStorage.setItem(`samvi-chat-${activeConversationId}`, JSON.stringify(storageMessages));
    }
  }, [messages, activeConversationId]);

  // ANTROPIC ARCHITECTURAL SEND FUNCTION
  // const send = (text: string) => {
  //   if (!text.trim()) return;
  //   const userMsg: Message = {
  //     id: Date.now().toString(),
  //     role: "user",
  //     text: text.trim(),
  //     time: now(),
  //   };
  //   setMessages((prev) => [...prev, userMsg]);
  //   setInput("");
  //   setTyping(true);
  //   setTimeout(
  //     () => {
  //       setTyping(false);
  //       const aiMsg: Message = {
  //         id: (Date.now() + 1).toString(),
  //         role: "ai",
  //         text: getAIResponse(text),
  //         time: now(),
  //       };
  //       setMessages((prev) => [...prev, aiMsg]);
  //     },
  //     1400 + Math.random() * 800,
  //   );
  // };

  const send = async (text: string) => {
    if (!text.trim() || loading) return;

    // Reset previous follow-up suggestions for a new turn
    setFollowUpSuggestions([]);
    setShowAllSuggestions(false);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text: text.trim(),
      time: now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setTyping(true);
    setLoading(true);

    try {
      if (!window.puter?.ai) {
        throw new Error("Puter AI not loaded yet");
      }

      const conversation: ChatMessage[] = [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },

        ...messages.map(
          (msg): ChatMessage => ({
            role: msg.role === "ai"
              ? "assistant"
              : "user",
            content: msg.text,
          })
        ),

        {
          role: "user",
          content: text.trim(),
        },
      ];

      const response = await window.puter.ai.chat(conversation, {
        model: "gpt-5.4-nano",
      });

      const aiText =
        typeof response?.message?.content === "string"
          ? response.message.content
          : typeof response?.content === "string"
            ? response.content
            : "No response";

      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        text: aiText,
        time: now(),
      };

      setMessages((prev) => [...prev, aiMsg]);

      // Generate follow-up suggestions based on the latest exchange
      try {
        console.log("AI response:", aiText);
        const suggestions = await generateSuggestions(text.trim(), aiText);
        console.log("Suggestions response:", suggestions);
        setFollowUpSuggestions(suggestions);
      } catch (sErr) {
        console.error("Failed to generate suggestions:", sErr);
      }

      // Sync messages to database
      // If user is logged in, sync to their authenticated conversation
      // If user is guest, sync to the guest conversation (created in DB with isGuest flag)
      // If no user and no guest session, only persist to localStorage
      const syncConversationId = user ? activeConversationId : getGuestSessionId();

      if (syncConversationId) {
        // User message
        await fetch(`/api/conversations/${syncConversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "user", content: text.trim() }),
        });
        const assistantResp = await fetch(`/api/conversations/${syncConversationId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: "assistant", content: aiText }),
        });
        const assistantData = await assistantResp.json();
        
        // Store verification metadata in localStorage if available
        if (assistantData?.metadata?.verification) {
          const storageMessages = messages.map((msg) => ({
            role: msg.role === "ai" ? "assistant" : "user",
            content: msg.text,
            _metadata: msg._metadata || {},
          }));
          // Update the last message (assistant) with verification metadata
          storageMessages[storageMessages.length - 1]._metadata =
            assistantData.metadata.verification;
          localStorage.setItem(
            `samvi-chat-${syncConversationId}`,
            JSON.stringify(storageMessages)
          );
        }
      } else {
        // Persist only to localStorage for new guest conversations
        const storageMessages = messages.map((msg) => ({
          role: msg.role === "ai" ? "assistant" : "user",
          content: msg.text,
          _metadata: msg._metadata || {},
        }));
        localStorage.setItem(
          `samvi-chat-${Date.now()}`,
          JSON.stringify(storageMessages)
        );
      }
    } catch (error) {
      const errorMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        text: error instanceof Error ? error.message : "Unknown error",
        time: now(),
      };

      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setTyping(false);
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  // Guest-to-account migration function
  async function migrateGuestConversations() {
    const guestSessionId = getGuestSessionId();
    if (!guestSessionId) return;
  
    try {
      const migrationRes = await fetch(`/api/conversations/migrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestSessionId }),
      });
  
      const result = await migrationRes.json();
  
      if (result.alreadyMigrated) {
        // Conversations already migrated - refresh UI
        const conversationsRes = await fetch("/api/conversations");
        if (conversationsRes.ok) {
          const data = await conversationsRes.json();
          setConversations(data);
          if (data.length > 0 && activeConversationId === null) {
            setActiveConversationId(data[0].id);
          }
        }
        return;
      }
  
      if (result.success && result.migratedConversations > 0) {
        // Refresh conversation list to include migrated conversations
        const conversationsRes = await fetch("/api/conversations");
        if (conversationsRes.ok) {
          const data = await conversationsRes.json();
          setConversations(data);
          if (data.length > 0 && activeConversationId === null) {
            setActiveConversationId(data[0].id);
          }
        }
      }
    } catch (error) {
      console.error("Guest migration failed:", error);
    }
  }

const clearChat = async () => {
    // If there's an active conversation, show confirmation and archive/delete
    if (activeConversationId) {
      const shouldClear = user
        ? window.confirm("Clear this conversation and start a new one?")
        : window.confirm("Archive this conversation and start a new one?");
      
      if (shouldClear) {
        if (user) {
          // Authenticated user: soft-delete conversation (isArchived)
          await fetch(`/api/conversations/${activeConversationId}`, {
            method: "DELETE",
          });
        } else {
          // Guest user: archive the guest conversation in DB
          await fetch(`/api/conversations/${activeConversationId}`, {
            method: "DELETE",
          });
        }
        
        // Remove from conversations list
        setConversations(prev => prev.filter(conv => conv.id !== activeConversationId));
      }
    }
    
    // Create new conversation
    if (user) {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Conversation" }),
      });
      
      if (response.ok) {
        const newConversation = await response.json();
        setActiveConversationId(newConversation.id);
        setConversations(prev => [newConversation, ...prev]);
      }
    } else if (!user && getGuestSessionId()) {
      // Guest user: create new guest conversation in DB
      const guestSessionId = getGuestSessionId();
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Conversation", guestSessionId }),
      });
      
      if (response.ok) {
        const newConversation = await response.json();
        // Archive the old conversation if it exists
        if (activeConversationId) {
          await fetch(`/api/conversations/${activeConversationId}`, {
            method: "DELETE",
          });
        }
        setActiveConversationId(newConversation.id);
        setConversations(prev => [newConversation, ...prev]);
      }
    } else {
      setActiveConversationId(null);
    }

setMessages([
  {
    id: "reset",
    role: "ai",
    text: "Chat cleared. Ready for your next constitutional question.",
    time: now(),
  },
]);

// Reset suggestions after chat clear
setFollowUpSuggestions([]);
setShowAllSuggestions(false);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#f7f5f2] font-[system-ui]">
      {/* Sidebar */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/25 backdrop-blur-[2px] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`
          fixed left-0 top-0 z-40 flex h-full w-68 flex-col
          bg-white
          border-r-[1.5px] border-slate-300
          shadow-[6px_0_32px_rgba(0,0,0,0.08)]
          transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]
          lg:relative lg:translate-x-0 lg:shadow-none
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-amber-800" />

        {/* Brand */}
        <div className="flex items-center justify-between border-b-[1.5px] border-slate-200 px-5 py-4">
          <Link
            href="/"
            className="flex items-center gap-2.5 no-underline group"
          >
            <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-[1.5px] border-amber-800/40 bg-amber-950/5 shadow-sm">
              <Image
                src="/image/logo.png"
                alt="Logo"
                width={36}
                height={36}
                className="object-cover"
                style={{ width: "auto", height: "auto" }}
              />
            </div>
            <div>
              <div className="text-[14px] font-black text-slate-900 tracking-tight">
                Know<span className="text-amber-800">Samvidhan</span>
              </div>
              <div className="text-[8.5px] tracking-[0.22em] text-slate-400 uppercase font-medium">
                AI Assistant
              </div>
            </div>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-lg border-[1.5px] border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600 transition-colors lg:hidden"
          >
            <X size={13} strokeWidth={2.5} />
          </button>
        </div>

        {/* New chat */}
        <div className="px-4 py-4">
          <button
            onClick={clearChat}
            className="
              group flex w-full items-center justify-center gap-2
              rounded-xl border-[1.5px] border-amber-800/35
              bg-amber-950/5 py-2.5
              text-[12.5px] font-semibold text-amber-900
              transition-all duration-200
              hover:border-amber-800/60 hover:bg-amber-950/8
              active:scale-[0.98]
            "
          >
            <Plus size={14} strokeWidth={2.5} />
            New Conversation
          </button>
        </div>

        {/* History */}
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <p className="mb-2 px-2 text-[9px] font-bold uppercase tracking-[2px] text-slate-400">
            Recent Chats
          </p>
          <div className="flex flex-col gap-0.5">
            {conversations.map((conv) => {
              const isActive = conv.id === activeConversationId;
              const title = conv.title || `Chat ${new Date(conv.updatedAt).toLocaleDateString()}`;
              const date = new Date(conv.updatedAt);
              const timeStr = date.toLocaleDateString() === new Date().toLocaleDateString()
                ? "Today"
                : date.toLocaleDateString() === new Date(Date.now() - 86400000).toLocaleDateString()
                ? "Yesterday"
                : `${Math.floor((Date.now() - date.getTime()) / 86400000)} days ago`;
              const isArchived = conv.isArchived;

              // Menu items for archived conversations
              const archivedMenu = isArchived ? (
                <div className="absolute right-0 w-48 mt-2 origin-top-left bg-white rounded-sm shadow-lg py-1 z-50 border border-slate-200">
                  <div className="rounded-sm px-2 py-1 text-sm text-slate-500">
                    <RefreshCw>
                      size={10} strokeWidth={1.5} className="text-slate-400"
                    /> Restored
                  </div>
                  <hr className="my-1 border-b border-slate-100" />
                  <div className="rounded-sm px-2 py-1 text-sm text-slate-500">
                    <Trash2>
                      size={10} strokeWidth={1.5} className="text-red-500"
                    /> Permanently delete
                  </div>
                </div>
              ) : null;

              return (
                <button
                  key={conv.id}
                  onClick={() => setActiveConversationId(conv.id)}
                  className={`
                    group flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left
                    transition-all duration-150
                    {
                      isActive
                        ? "bg-amber-950/6 border-[1.5px] border-amber-800/25"
                        : "hover:bg-slate-50 border-[1.5px] border-transparent"
                    }
                  `}
                >
                  <Hash
                    size={13}
                    strokeWidth={2}
                    className={
                      isActive
                        ? "text-amber-800 shrink-0"
                        : "text-slate-400 shrink-0 group-hover:text-slate-600"
                    }
                  />
                  <div className="flex-1 min-w-0">
                    <span
                      className={`block text-[12px] font-medium leading-snug truncate {
                        isActive
                          ? "text-amber-900"
                          : "text-slate-700 group-hover:text-slate-900"
                      }`}
                    >
                      {title}
                    </span>
                    {isArchived && (
                      <span className="text-[10px] text-amber-400">
                        <Clock size={9} strokeWidth={2} /> Archived
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                      <Clock size={9} strokeWidth={2} />
                      {timeStr} · {conv._count.messages} messages
                    </span>
                  </div>
                  <ChevronRight
                    size={12}
                    strokeWidth={2}
                    className="text-slate-300 group-hover:text-slate-500 shrink-0 transition-colors"
                  />
                  {archivedMenu}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sidebar footer */}
        <div className="border-t-[1.5px] border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2.5 rounded-xl border-[1.5px] border-transparent p-2 hover:border-slate-200 hover:bg-slate-50 transition-all cursor-pointer">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-900 border-[1.5px] border-amber-800 text-[11px] font-bold text-amber-100 shadow-sm shrink-0">
              {user ? user.name?.[0]?.toUpperCase() || "U" : "G"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] font-semibold text-slate-800 truncate">
                {user ? user.name || user.email : "Guest User"}
              </p>
              <p className="text-[10px] text-slate-400">
                {user ? "Paid plan" : "Free plan"}
              </p>
            </div>
            <Settings
              size={13}
              strokeWidth={2}
              className="text-slate-400 shrink-0"
            />
          </div>
        </div>
      </aside>

      <Script src="https://js.puter.com/v2/" strategy="afterInteractive" />

      {/* Main chat area */}
      <div className="relative flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Subtle dot grid background */}
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle, #92400e18 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />

        {/* Top header */}
        <header className="relative z-10 flex items-center justify-between border-b-[1.5px] border-slate-200 bg-white/85 px-4 py-3 backdrop-blur-xl sm:px-6">
          {/* Accent line */}
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-amber-800" />

          <div className="flex items-center gap-3">
            {/* Sidebar toggle */}
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl border-[1.5px] border-slate-300 bg-white text-slate-500 transition-all duration-200 hover:border-amber-800/50 hover:text-amber-800 lg:hidden"
            >
              <Menu size={16} strokeWidth={2} />
            </button>

            {/* Samvi identity */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border-[1.5px] border-amber-800/50 bg-amber-950/6 shadow-sm">
                  <Scale
                    size={17}
                    strokeWidth={1.8}
                    className="text-amber-800"
                  />
                </div>
                {/* Online dot */}
                <span className="absolute bottom-0 right-0 flex h-3 w-3 items-center justify-center rounded-full border-2 border-white bg-emerald-600">
                  <span className="h-1 w-1 animate-ping rounded-full bg-emerald-400" />
                </span>
              </div>
              <div>
                <p className="text-[14px] font-black text-slate-900 tracking-tight leading-none">
                  Samvi <span className="text-amber-800">AI</span>
                </p>
                <p className="text-[10px] text-emerald-700 font-medium mt-0.5 flex items-center gap-1">
                  <Circle
                    size={6}
                    fill="currentColor"
                    className="text-emerald-500"
                  />
                  Online Â· Constitutional Expert
                </p>
              </div>
            </div>
          </div>

          {/* Header actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={clearChat}
              title="Clear chat"
              className="flex h-8 w-8 items-center justify-center rounded-lg border-[1.5px] border-slate-200 bg-white text-slate-400 transition-all duration-150 hover:border-rose-400 hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 size={13} strokeWidth={2} />
            </button>
            <Link
              href="/"
              className="flex h-8 items-center gap-1.5 rounded-lg border-[1.5px] border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-600 no-underline transition-all duration-150 hover:border-amber-800/40 hover:text-amber-800"
            >
              <ChevronLeft size={13} strokeWidth={2.5} />
              <span className="hidden sm:inline">Back</span>
            </Link>
          </div>
        </header>

        {/* Messages */}
        <div className="relative flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10">
          {/* Empty state suggestions */}
          {messages.length === 1 && (
            <div className="mb-8">
              <div className="mb-7 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border-[1.5px] border-amber-800/35 bg-white shadow-sm">
                  <BookOpen
                    size={22}
                    strokeWidth={1.6}
                    className="text-amber-800"
                  />
                </div>
                <h2 className="text-[20px] sm:text-[23px] font-black text-slate-900 tracking-tight leading-tight">
                  What shall we explore{" "}
                  <span className="text-amber-800">today?</span>
                </h2>
                <p className="mt-1.5 text-[13px] text-slate-500">
                  Ask Samvi anything about the Constitution of India
                </p>
              </div>

              {/* Suggestion grid */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {suggestions.map((s) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.label}
                      onClick={() => send(s.label)}
                      className={`
                        group flex items-center gap-3 rounded-xl border-[1.5px]
                        px-4 py-3.5 text-left
                        transition-all duration-200
                        hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]
                        ${s.color}
                      `}
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-[1.5px] border-current/20 bg-white/60 shadow-sm">
                        <Icon
                          size={15}
                          strokeWidth={2}
                          className={s.iconColor}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="block text-[12.5px] font-semibold leading-tight">
                          {s.label}
                        </span>
                        <span className="block text-[10.5px] opacity-60 mt-0.5">
                          {s.sub}
                        </span>
                      </div>
                      <ArrowUpRight
                        size={13}
                        strokeWidth={2}
                        className="shrink-0 opacity-30 transition-all duration-200 group-hover:opacity-70 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

  {/* Messages */}
  <div className="flex flex-col gap-5">
    {messages.map((msg, idx) => (
      <Fragment key={msg.id}>
        <Bubble msg={msg} />
        {msg.role === "ai" && idx === messages.length - 1 && followUpSuggestions.length > 0 && (
          <div className="pl-12">
            <SuggestionChips
              suggestions={showAllSuggestions ? followUpSuggestions : followUpSuggestions.slice(0, 4)}
              onSelect={send}
            />
            {!showAllSuggestions && followUpSuggestions.length > 4 && (
              <button
                onClick={() => setShowAllSuggestions(true)}
                className="mt-1 text-sm text-amber-800 underline"
              >
                Show More
              </button>
            )}
          </div>
        )}
      </Fragment>
    ))}
  }

  {/* Typing indicator */}
  {typing && (
    <div className="flex items-end gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-[1.5px] border-amber-800/50 bg-amber-950/6">
        <Zap size={14} strokeWidth={2} className="text-amber-800" />
      </div>
      <div className="rounded-2xl rounded-bl-sm border-[1.5px] border-slate-200 bg-white shadow-sm">
        <TypingDots />
      </div>
    </div>
  )}
  <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="relative border-t-[1.5px] border-slate-200 bg-white/90 px-4 py-3 backdrop-blur-xl sm:px-6">
          <div className="absolute top-0 left-0 right-0 h-px `bg-gradient-to-r` from-transparent via-amber-800/20 to-transparent" />

          <div className="mx-auto max-w-4xl">
            <div
              className="
                flex items-end gap-2.5 rounded-2xl
                bg-white/80
                backdrop-blur-sm
                px-4
                py-3
              "
            >
              <textarea
                className="
                  flex-1 rounded-lg border border-slate-300 focus:outline-none focus:border-amber-500 py-2 px-3 text-[13px] leading-relaxed resize-none
                  min-h-[48px]
                "
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask Samvi about the Constitution..."
                rows={1}
              />
              <button
                className="
                  rounded-lg bg-amber-600 px-4 py-2 text-white hover:bg-amber-500 transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
                disabled={loading}
                type="submit"
              >
                Send
              </button>
            </div>
          </div>
        </div>
  );
}