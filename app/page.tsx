"use client";

import { useEffect, useMemo, useState } from "react";

type WorkflowStatus = "idle" | "in_progress" | "completed" | "error";

type WorkflowStep = {
  name: string;
  status: WorkflowStatus;
  detail?: string;
};

type AgentResponse = {
  status: WorkflowStatus;
  message: string;
  steps: WorkflowStep[];
  generated_email?: {
    recipient_email: string;
    recipient_name?: string | null;
    subject: string;
    body: string;
  } | null;
};

type AuthPayload = {
  email?: string;
  name?: string;
  picture?: string;
  id_token?: string;
  access_token?: string;
  refresh_token?: string | null;
  expires_in?: string | null;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
const AUTH_STORAGE_KEY = "email-agent-auth";

const WORKFLOW_TEMPLATE = [
  {
    key: "Input",
    label: "Input",
    caption: "Instruction",
    icon: MailIcon,
  },
  {
    key: "Processing",
    label: "Processing",
    caption: "AI Planning",
    icon: SparkIcon,
  },
  {
    key: "Sending",
    label: "Sending",
    caption: "SMTP Dispatch",
    icon: PlaneIcon,
  },
  {
    key: "Completed",
    label: "Completed",
    caption: "Success",
    icon: CheckIcon,
  },
] as const;

const STATUS_LABEL: Record<WorkflowStatus, string> = {
  idle: "Idle",
  in_progress: "In progress",
  completed: "Completed",
  error: "Error",
};

const STATUS_BADGE: Record<WorkflowStatus, string> = {
  idle: "text-slate-500",
  in_progress: "text-blue-500",
  completed: "text-emerald-500",
  error: "text-rose-500",
};

export default function Home() {
  const [instruction, setInstruction] = useState("");
  const [serverSteps, setServerSteps] = useState<WorkflowStep[]>([]);
  const [currentStatus, setCurrentStatus] = useState<WorkflowStatus>("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [user, setUser] = useState<AuthPayload | null>(null);
  const [generatedEmail, setGeneratedEmail] = useState<AgentResponse["generated_email"]>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const apiOrigin = new URL(API_BASE_URL).origin;

    const restoreFromStorage = () => {
      try {
        const stored = window.localStorage.getItem(AUTH_STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as AuthPayload;
          if (parsed?.email) {
            setUser(parsed);
          }
        }
      } catch (error) {
        console.warn("Failed to parse stored auth", error);
      }
    };

    restoreFromStorage();

    const messageHandler = (event: MessageEvent<AuthPayload>) => {
      if (event.origin !== apiOrigin || !event.data?.email) {
        return;
      }
      setUser(event.data);
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(event.data));
      setAuthError(null);
    };

    const storageHandler = (event: StorageEvent) => {
      if (event.key === AUTH_STORAGE_KEY && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue) as AuthPayload;
          if (parsed?.email) {
            setUser(parsed);
          }
        } catch (error) {
          console.warn("Failed to parse auth payload from storage", error);
        }
      }
    };

    window.addEventListener("message", messageHandler);
    window.addEventListener("storage", storageHandler);

    return () => {
      window.removeEventListener("message", messageHandler);
      window.removeEventListener("storage", storageHandler);
    };
  }, []);

  const workflowSteps = useMemo(() => {
    return WORKFLOW_TEMPLATE.map((template) => {
      const match = serverSteps.find((step) => step.name === template.key);
      return {
        ...template,
        status: match?.status ?? "idle",
        detail: match?.detail,
      };
    });
  }, [serverSteps]);

  const handleGoogleConnect = () => {
    if (typeof window === "undefined") {
      return;
    }
    const width = 520;
    const height = 640;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      `${API_BASE_URL.replace(/\/$/, "")}/auth/google/login`,
      "google-oauth",
      `width=${width},height=${height},left=${left},top=${top}`,
    );

    if (!popup) {
      setAuthError("Please allow pop-ups to connect your Google account.");
    } else {
      popup.focus();
    }
  };

  const handleSubmit = async () => {
    if (!instruction.trim() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    setGeneratedEmail(null);
    setCurrentStatus("in_progress");
    setServerSteps([
      { name: "Input", status: "completed", detail: "Instruction received." },
      { name: "Processing", status: "in_progress" },
      { name: "Sending", status: "idle" },
      { name: "Completed", status: "idle" },
    ]);

    try {
      const response = await fetch(`${API_BASE_URL.replace(/\/$/, "")}/agent/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          instruction,
          user_email: user?.email,
          user_name: user?.name,
        }),
      });

      const data: AgentResponse = await response.json();
      if (!response.ok) {
        throw new Error(data?.message ?? "Unable to process automation request.");
      }

      setServerSteps(data.steps ?? []);
      setCurrentStatus(data.status ?? "error");
      setGeneratedEmail(data.generated_email ?? null);
      setInstruction("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      setSubmitError(message);
      setCurrentStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleSubmit();
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-3xl space-y-8 text-center">
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
            Email Agent
          </h1>
          <p className="text-base text-slate-500">
            A minimalistic UI for task automation
          </p>
        </div>

        <div className="rounded-3xl border border-white/70 bg-white/90 p-8 shadow-xl shadow-slate-200/40 backdrop-blur">
          <div className="space-y-6">
            <button
              onClick={handleGoogleConnect}
              className="mx-auto flex w-full max-w-sm items-center justify-center gap-3 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:shadow-md"
              type="button"
            >
              <GoogleIcon />
              <span>
                {user?.email ? `Connected as ${user.name ?? user.email}` : "Connect with Google"}
              </span>
            </button>
            {authError && (
              <p className="text-sm text-rose-500">{authError}</p>
            )}

            <div className="mx-auto flex w-full max-w-2xl items-center gap-3 rounded-full border border-slate-200 bg-slate-50 p-2">
              <input
                className="h-11 flex-1 rounded-full border-none bg-transparent px-4 text-sm text-slate-700 outline-none placeholder:text-slate-400"
                placeholder="e.g., 'Send a welcome email to john@example.com'"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || !instruction.trim()}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                type="button"
              >
                <ArrowIcon className={isSubmitting ? "animate-spin" : ""} />
              </button>
            </div>
            {submitError && (
              <p className="text-sm text-rose-500">{submitError}</p>
            )}

            <div className="space-y-4 text-left">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Workflow Automation
                </h2>
                <p className="text-sm text-slate-500">
                  Track each stage as your instruction becomes a delivered email.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-6">
                <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                  {workflowSteps.map((step, index) => {
                    const Icon = step.icon;
                    const isLast = index === workflowSteps.length - 1;
                    return (
                      <div key={step.key} className="flex flex-1 items-center gap-4">
                        <div
                          className={`flex h-14 w-14 items-center justify-center rounded-full border text-lg font-medium transition ${
                            step.status === "completed"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-600"
                              : step.status === "in_progress"
                              ? "border-blue-200 bg-blue-50 text-blue-600"
                              : step.status === "error"
                              ? "border-rose-200 bg-rose-50 text-rose-600"
                              : "border-slate-200 bg-white text-slate-500"
                          }`}
                        >
                          <Icon status={step.status} />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-semibold text-slate-800">
                            {step.label}
                          </p>
                          <p className="text-xs text-slate-500">{step.detail ?? step.caption}</p>
                        </div>
                        {!isLast && (
                          <div className="hidden flex-1 items-center sm:flex">
                            <span className="h-px w-full border-b border-dashed border-slate-200" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-6 text-sm">
                  <span className="text-slate-500">Current status: </span>
                  <span className={`font-medium ${STATUS_BADGE[currentStatus]}`}>
                    {STATUS_LABEL[currentStatus]}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {generatedEmail && (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-left shadow-lg shadow-slate-200/30">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Generated Email Preview
            </h3>
            <div className="mt-4 space-y-3 text-slate-700">
              <p className="text-sm">
                <span className="font-medium text-slate-600">To:</span>{" "}
                {generatedEmail.recipient_name
                  ? `${generatedEmail.recipient_name} <${generatedEmail.recipient_email}>`
                  : generatedEmail.recipient_email}
              </p>
              <p className="text-sm">
                <span className="font-medium text-slate-600">Subject:</span>{" "}
                {generatedEmail.subject}
              </p>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                {generatedEmail.body.split("\n").map((line, index) => (
                  <p key={index} className="mb-2 last:mb-0">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

type IconProps = {
  status: WorkflowStatus;
  className?: string;
};

function MailIcon({ status }: IconProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill={status === "completed" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <rect x="3" y="5" width="18" height="14" rx="2" ry="2" />
      <polyline points="3,7 12,13 21,7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SparkIcon({ status }: IconProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill={status === "completed" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.6}
    >
      <path
        d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function PlaneIcon({ status }: IconProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill={status === "completed" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.6}
    >
      <path
        d="m3 12 18-9-6 9 6 9-18-9z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="m3 12 7 2 2 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon({ status }: IconProps) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill={status === "completed" ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path d="m4 12 6 6 10-12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`h-5 w-5 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="h-5 w-5">
      <path
        d="M17.64 9.2c0-.63-.06-1.25-.17-1.84H9v3.48h4.84c-.21 1.14-.85 2.1-1.82 2.74v2.27h2.94c1.72-1.58 2.68-3.9 2.68-6.65z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.94-2.27c-.82.55-1.86.87-3.02.87-2.32 0-4.28-1.56-4.98-3.66H1v2.3C2.47 15.98 5.48 18 9 18z"
        fill="#34A853"
      />
      <path
        d="M4.02 10.76c-.18-.55-.28-1.14-.28-1.76s.1-1.21.28-1.76V4.94H1A9.004 9.004 0 000 9c0 1.45.35 2.82.98 4.06l3.04-2.3z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.57-2.57C13.46.88 11.42 0 9 0 5.48 0 2.47 2.02 1 4.94l3.04 2.3C4.72 5.84 6.68 4.28 9 4.28z"
        fill="#EA4335"
      />
    </svg>
  );
}
