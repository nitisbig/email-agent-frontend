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
const THEME_STORAGE_KEY = "email-agent-theme";

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
  idle: "text-[color:var(--badge-idle)]",
  in_progress: "text-[color:var(--badge-progress)]",
  completed: "text-[color:var(--badge-success)]",
  error: "text-[color:var(--badge-error)]",
};

const STEP_VARIANTS: Record<WorkflowStatus, string> = {
  idle: "border-[color:var(--status-idle-border)] bg-[color:var(--status-idle-bg)] text-[color:var(--status-idle-text)]",
  in_progress: "border-[color:var(--status-progress-border)] bg-[color:var(--status-progress-bg)] text-[color:var(--status-progress-text)]",
  completed: "border-[color:var(--status-success-border)] bg-[color:var(--status-success-bg)] text-[color:var(--status-success-text)]",
  error: "border-[color:var(--status-error-border)] bg-[color:var(--status-error-bg)] text-[color:var(--status-error-text)]",
};

const STEP_ICON_VARIANTS: Record<WorkflowStatus, string> = {
  idle: "border-[color:var(--status-idle-border)] bg-[color:var(--surface-strong)] text-[color:var(--status-idle-text)]",
  in_progress: "border-[color:var(--status-progress-border)] bg-[color:var(--surface-strong)] text-[color:var(--status-progress-text)]",
  completed: "border-[color:var(--status-success-border)] bg-[color:var(--surface-strong)] text-[color:var(--status-success-text)]",
  error: "border-[color:var(--status-error-border)] bg-[color:var(--surface-strong)] text-[color:var(--status-error-text)]",
};

export default function Home() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
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
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialTheme: "light" | "dark" = stored === "light" || stored === "dark" ? (stored as "light" | "dark") : prefersDark ? "dark" : "light";
    setTheme(initialTheme);
    document.body.dataset.theme = initialTheme;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    document.body.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

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

  const toggleTheme = () => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  };

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
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[color:var(--background)] transition-colors duration-300" />
        <div className="absolute left-[-15%] top-[-20%] h-[420px] w-[420px] rounded-full bg-[color:var(--accent-soft)] blur-[160px]" />
        <div className="absolute right-[-20%] bottom-[-25%] h-[520px] w-[520px] rounded-full bg-[color:var(--accent-soft)] blur-[200px]" />
      </div>

      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 pt-12">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] text-lg text-[color:var(--accent)] shadow-sm shadow-black/5">
            <MailIcon status="completed" />
          </div>
          <div className="text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--badge-idle)]">
              Email Agent
            </p>
            <h1 className="text-3xl font-semibold text-[color:var(--text-primary)] sm:text-4xl">
              Automate your outreach
            </h1>
          </div>
        </div>
        <button
          onClick={toggleTheme}
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-[color:var(--border-soft)] bg-[color:var(--surface-strong)] text-[color:var(--text-primary)] shadow-sm shadow-black/5 transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <SunIcon /> : <MoonIcon />}
        </button>
      </header>

      <section className="mx-auto mt-12 w-full max-w-5xl px-6 pb-16">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-[32px] border border-[color:var(--border-soft)] bg-[color:var(--surface-primary)] p-8 shadow-[0_24px_70px_rgba(15,23,42,0.12)] transition-colors backdrop-blur">
            <div className="flex flex-col gap-8">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-left">
                  <h2 className="text-2xl font-semibold text-[color:var(--text-primary)]">
                    Launch a task
                  </h2>
                  <p className="text-sm text-[color:var(--text-muted)]">
                    Describe the email you want to send and track every stage of the automation.
                  </p>
                </div>
                <button
                  onClick={handleGoogleConnect}
                  className="flex items-center justify-center gap-3 rounded-full border border-[color:var(--border-soft)] bg-[color:var(--surface-strong)] px-5 py-3 text-sm font-medium text-[color:var(--text-primary)] shadow-sm shadow-black/5 transition hover:border-[color:var(--accent)] hover:text-[color:var(--accent)]"
                  type="button"
                >
                  <GoogleIcon />
                  <span>
                    {user?.email ? `Connected as ${user.name ?? user.email}` : "Connect with Google"}
                  </span>
                </button>
              </div>
              {authError && (
                <p className="rounded-2xl border border-[color:var(--status-error-border)] bg-[color:var(--status-error-bg)] px-4 py-3 text-sm text-[color:var(--status-error-text)]">
                  {authError}
                </p>
              )}

              <div className="flex flex-col gap-3">
                <label className="text-left text-sm font-medium text-[color:var(--text-primary)]">
                  Automation instruction
                </label>
                <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--border-strong)] bg-[color:var(--surface-strong)] px-4 py-2 shadow-inner shadow-black/5">
                  <input
                    className="h-12 flex-1 bg-transparent text-sm text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-muted)]"
                    placeholder="e.g., ‘Send a welcome email to john@example.com’"
                    value={instruction}
                    onChange={(event) => setInstruction(event.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !instruction.trim()}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-[color:var(--accent)] text-white transition hover:bg-[color:var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                  >
                    <ArrowIcon className={isSubmitting ? "animate-spin" : ""} />
                  </button>
                </div>
                {submitError && (
                  <p className="text-sm text-[color:var(--status-error-text)]">{submitError}</p>
                )}
              </div>

              <div className="rounded-2xl border border-[color:var(--border-soft)] bg-[color:var(--surface-strong)] p-6">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-[color:var(--text-primary)]">
                      Workflow timeline
                    </h3>
                    <p className="text-sm text-[color:var(--text-muted)]">
                      Each step updates in real time as the automation progresses.
                    </p>
                  </div>
                  <div className="text-sm">
                    <span className="text-[color:var(--text-muted)]">Current status: </span>
                    <span className={`font-medium ${STATUS_BADGE[currentStatus]}`}>
                      {STATUS_LABEL[currentStatus]}
                    </span>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {workflowSteps.map((step) => {
                    const Icon = step.icon;
                    return (
                      <div
                        key={step.key}
                        className={`flex items-start gap-4 rounded-2xl border p-4 transition ${STEP_VARIANTS[step.status]}`}
                      >
                        <div
                          className={`flex h-12 w-12 items-center justify-center rounded-xl border text-lg shadow-sm shadow-black/5 ${STEP_ICON_VARIANTS[step.status]}`}
                        >
                          <Icon status={step.status} />
                        </div>
                        <div className="text-left">
                          <p className="text-sm font-semibold text-[color:var(--text-primary)]">
                            {step.label}
                          </p>
                          <p className="text-xs text-[color:var(--text-muted)]">
                            {step.detail ?? step.caption}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[32px] border border-[color:var(--border-soft)] bg-[color:var(--surface-primary)] p-8 shadow-[0_24px_70px_rgba(15,23,42,0.12)] transition-colors backdrop-blur">
            <div className="flex h-full flex-col">
              <h3 className="text-sm font-semibold uppercase tracking-[0.28em] text-[color:var(--badge-idle)]">
                Email preview
              </h3>
              {generatedEmail ? (
                <div className="mt-6 flex flex-1 flex-col gap-4 text-[color:var(--text-primary)]">
                  <div className="rounded-2xl border border-[color:var(--border-soft)] bg-[color:var(--surface-strong)] px-4 py-3 text-sm">
                    <p>
                      <span className="font-semibold text-[color:var(--text-muted)]">To:</span>{" "}
                      {generatedEmail.recipient_name
                        ? `${generatedEmail.recipient_name} <${generatedEmail.recipient_email}>`
                        : generatedEmail.recipient_email}
                    </p>
                    <p className="mt-2">
                      <span className="font-semibold text-[color:var(--text-muted)]">Subject:</span>{" "}
                      {generatedEmail.subject}
                    </p>
                  </div>
                  <div className="flex-1 overflow-hidden rounded-2xl border border-[color:var(--border-soft)] bg-[color:var(--surface-strong)] px-4 py-5 text-sm leading-6 text-[color:var(--text-primary)] shadow-inner shadow-black/5">
                    <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
                      {generatedEmail.body.split("\n").map((line, index) => (
                        <p key={`${index}-${line.slice(0, 8)}`} className="text-[color:var(--text-primary)]">
                          {line}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-6 flex flex-1 flex-col items-center justify-center gap-4 text-center text-[color:var(--text-muted)]">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[color:var(--border-soft)] bg-[color:var(--surface-elevated)] text-[color:var(--accent)] shadow-sm shadow-black/5">
                    <PreviewPlaceholderIcon />
                  </div>
                  <div className="space-y-2">
                    <p className="text-base font-medium text-[color:var(--text-primary)]">
                      Your AI-crafted email will appear here
                    </p>
                    <p className="text-sm">
                      Connect your inbox, describe the task, and the agent will draft and send the message for you.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
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

function SunIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M5.64 5.64l1.41 1.41M16.95 16.95l1.41 1.41M3 12h2M19 12h2M5.64 18.36l1.41-1.41M16.95 7.05l1.41-1.41" strokeLinecap="round" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8}>
      <path
        d="M21 12.79A9 9 0 0 1 11.21 3 7 7 0 1 0 21 12.79Z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PreviewPlaceholderIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.6}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M7 8h10M7 12h6M7 16h4" strokeLinecap="round" />
    </svg>
  );
}