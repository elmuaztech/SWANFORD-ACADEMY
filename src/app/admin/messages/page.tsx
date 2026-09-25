"use client";

import React, { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";

interface MessageItem {
  id: string;
  subject: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  isBroadcast: boolean;
  senderUser: {
    id: string;
    email: string;
    roles: Array<{ role: { code: string; name: string } }>;
  };
  recipientUser?: {
    id: string;
    email: string;
  } | null;
  _count?: { replies: number };
}

interface MessageReply {
  id: string;
  body: string;
  createdAt: string;
  senderUser: {
    id: string;
    email: string;
  };
}

interface ThreadDetail extends MessageItem {
  replies: MessageReply[];
}

interface RecipientOption {
  id: string;
  name: string;
  role?: string;
  category?: string;
}

export default function AdminMessagesPage() {
  const [tab, setTab] = useState<"inbox" | "sent">("inbox");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);

  // Compose Modal State
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [recipients, setRecipients] = useState<RecipientOption[]>([]);
  const [composeRecipientId, setComposeRecipientId] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [isSubmittingMessage, setIsSubmittingMessage] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch messages
  const fetchMessages = async () => {
    try {
      setIsLoading(true);
      const query = new URLSearchParams();
      if (tab === "sent") query.set("folder", "sent");
      if (unreadOnly && tab === "inbox") query.set("unread", "true");
      if (search.trim()) query.set("search", search.trim());

      const res = await fetch(`/api/messages?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {
      // Degrade gracefully
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [tab, unreadOnly]);

  // Fetch recipients for compose modal
  useEffect(() => {
    async function loadRecipients() {
      try {
        const res = await fetch("/api/messages/recipients");
        if (res.ok) {
          const data = await res.json();
          setRecipients(data.recipients || []);
        }
      } catch {
        // Ignore
      }
    }
    loadRecipients();
  }, []);

  // Fetch single thread
  const openThread = async (id: string) => {
    setSelectedMessageId(id);
    setIsLoadingThread(true);
    setThread(null);
    try {
      const res = await fetch(`/api/messages/${id}`);
      if (res.ok) {
        const data = await res.json();
        setThread(data.message);
        // Mark as read in local list
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, isRead: true } : m))
        );
      }
    } catch {
      // Ignore
    } finally {
      setIsLoadingThread(false);
    }
  };

  // Send Reply
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thread || !replyText.trim()) return;

    try {
      setIsSendingReply(true);
      const recipientId =
        thread.senderUser.id === thread.recipientUser?.id
          ? undefined
          : thread.senderUser.id;

      const res = await fetch(`/api/messages/${thread.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: replyText.trim(),
          subject: thread.subject.startsWith("Re:") ? thread.subject : `Re: ${thread.subject}`,
          recipientUserId: recipientId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setThread((prev) =>
          prev ? { ...prev, replies: [...prev.replies, data.reply] } : null
        );
        setReplyText("");
      }
    } catch {
      // Ignore
    } finally {
      setIsSendingReply(false);
    }
  };

  // Send New Message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!composeRecipientId) {
      setErrorMessage("Please select a recipient.");
      return;
    }
    if (!composeSubject.trim()) {
      setErrorMessage("Subject is required.");
      return;
    }
    if (!composeBody.trim()) {
      setErrorMessage("Message body cannot be empty.");
      return;
    }

    try {
      setIsSubmittingMessage(true);
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientUserId: composeRecipientId,
          subject: composeSubject.trim(),
          body: composeBody.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send message.");
      }

      setSuccessMessage("Message dispatched successfully.");
      setComposeRecipientId("");
      setComposeSubject("");
      setComposeBody("");
      setIsComposeOpen(false);
      fetchMessages();
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to send message.");
    } finally {
      setIsSubmittingMessage(false);
    }
  };

  return (
    <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#5B0612] font-display tracking-tight">
              Internal Messaging
            </h1>
            <p className="text-xs sm:text-sm text-stone-500 mt-1">
              Secure administrative correspondence with teachers, operational staff, and guardians.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsComposeOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#800020] text-white text-xs sm:text-sm font-bold shadow-xs hover:bg-[#5B0612] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#800020] min-h-[44px]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            <span>Compose Message</span>
          </button>
        </div>

        {/* Feedback alerts */}
        {successMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-between">
            <span>{successMessage}</span>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-900">&times;</button>
          </div>
        )}

        {/* Messaging Layout: Sidebar list + Detail view */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-white border border-[#EADBDA] rounded-2xl overflow-hidden shadow-xs min-h-[580px]">
          {/* Message List Panel */}
          <div className="lg:col-span-5 border-r border-[#EADBDA] flex flex-col h-full bg-[#FDFCF9]">
            {/* Tabs Header */}
            <div className="p-3 border-b border-[#EADBDA] bg-white flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setTab("inbox");
                    setSelectedMessageId(null);
                    setThread(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    tab === "inbox"
                      ? "bg-[#800020] text-white"
                      : "text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  Inbox
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTab("sent");
                    setSelectedMessageId(null);
                    setThread(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                    tab === "sent"
                      ? "bg-[#800020] text-white"
                      : "text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  Sent
                </button>
              </div>

              {tab === "inbox" && (
                <label className="flex items-center gap-1.5 text-[11px] font-semibold text-stone-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={unreadOnly}
                    onChange={(e) => setUnreadOnly(e.target.checked)}
                    className="rounded text-[#800020] focus:ring-[#800020] w-3.5 h-3.5"
                  />
                  <span>Unread only</span>
                </label>
              )}
            </div>

            {/* Search Input */}
            <div className="p-2.5 border-b border-[#EADBDA]/60 bg-white">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  fetchMessages();
                }}
                className="relative"
              >
                <input
                  type="text"
                  placeholder="Search subject or text..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[#EADBDA] bg-[#FDFCF9] focus:outline-none focus:ring-2 focus:ring-[#800020]"
                />
                <svg
                  className="w-4 h-4 text-stone-400 absolute left-2.5 top-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="2"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
              </form>
            </div>

            {/* List View */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#EADBDA]/60">
              {isLoading ? (
                <div className="p-8 text-center text-xs text-stone-400">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-xs font-semibold text-stone-700">No messages found.</p>
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    {tab === "inbox" ? "Your inbox is clear." : "You have not dispatched any messages."}
                  </p>
                </div>
              ) : (
                messages.map((item) => {
                  const isSelected = selectedMessageId === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => openThread(item.id)}
                      className={`p-3.5 transition-colors cursor-pointer text-left ${
                        isSelected
                          ? "bg-[#FDF2F4] border-l-4 border-[#800020]"
                          : item.isRead || tab === "sent"
                          ? "bg-white hover:bg-stone-50"
                          : "bg-[#FDF2F4]/50 hover:bg-[#FDF2F4]/80 font-bold"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-stone-900 truncate">
                          {tab === "inbox" ? item.senderUser.email : `To: ${item.recipientUser?.email || "Broadcast"}`}
                        </span>
                        <span className="text-[10px] text-stone-400 shrink-0">
                          {new Date(item.createdAt).toLocaleDateString("en-NG", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                      <p className={`text-xs mt-1 truncate ${item.isRead ? "text-stone-700" : "text-stone-900 font-bold"}`}>
                        {item.subject}
                      </p>
                      <p className="text-[11px] text-stone-500 line-clamp-2 mt-0.5 leading-snug">
                        {item.body}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Thread Reader Panel */}
          <div className="lg:col-span-7 flex flex-col h-full bg-white">
            {isLoadingThread ? (
              <div className="flex-1 flex items-center justify-center p-8 text-xs text-stone-400">
                Opening conversation thread...
              </div>
            ) : !thread ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-400 mb-3">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-stone-800">No conversation selected</p>
                <p className="text-xs text-stone-400 mt-1 max-w-sm">
                  Select a message from the list to read the full thread, view past correspondence, and dispatch replies.
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                {/* Thread Header */}
                <div className="p-4 border-b border-[#EADBDA] bg-[#FDFCF9]">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-bold text-[#5B0612] font-display">
                        {thread.subject}
                      </h2>
                      <div className="flex items-center gap-2 mt-1 text-xs text-stone-500">
                        <span>From: <strong>{thread.senderUser.email}</strong></span>
                        <span>&bull;</span>
                        <span>
                          {new Date(thread.createdAt).toLocaleString("en-NG", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                        </span>
                      </div>
                    </div>
                    {thread.isBroadcast && (
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-[#FDF2F4] text-[#800020] border border-[#EADBDA]">
                        Broadcast
                      </span>
                    )}
                  </div>
                </div>

                {/* Messages Stream */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {/* Original Message */}
                  <div className="p-4 rounded-xl bg-stone-50 border border-[#EADBDA] text-xs leading-relaxed text-stone-800 whitespace-pre-wrap">
                    {thread.body}
                  </div>

                  {/* Replies Chain */}
                  {thread.replies && thread.replies.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                        Replies ({thread.replies.length})
                      </div>
                      {thread.replies.map((reply) => (
                        <div
                          key={reply.id}
                          className="p-3.5 rounded-xl bg-white border border-[#EADBDA] text-xs space-y-1.5 shadow-2xs"
                        >
                          <div className="flex items-center justify-between text-[11px] text-stone-500">
                            <span className="font-bold text-stone-800">{reply.senderUser.email}</span>
                            <span>
                              {new Date(reply.createdAt).toLocaleTimeString("en-NG", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <p className="text-stone-700 whitespace-pre-wrap leading-relaxed">
                            {reply.body}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Quick Reply Form */}
                <div className="p-3 border-t border-[#EADBDA] bg-[#FDFCF9]">
                  <form onSubmit={handleSendReply} className="space-y-2">
                    <textarea
                      rows={2}
                      placeholder="Type your reply..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="w-full p-2.5 text-xs rounded-xl border border-[#EADBDA] bg-white focus:outline-none focus:ring-2 focus:ring-[#800020]"
                      required
                    />
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isSendingReply || !replyText.trim()}
                        className="px-4 py-2 bg-[#800020] text-white rounded-lg text-xs font-bold hover:bg-[#5B0612] disabled:opacity-50 transition-colors"
                      >
                        {isSendingReply ? "Sending..." : "Send Reply"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Compose Modal */}
        {isComposeOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl border border-[#EADBDA] max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              <div className="px-5 py-4 border-b border-[#EADBDA] bg-[#FDFCF9] flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#5B0612] font-display">
                  Compose Internal Message
                </h3>
                <button
                  type="button"
                  onClick={() => setIsComposeOpen(false)}
                  className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleSendMessage} className="p-5 space-y-4">
                {errorMessage && (
                  <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs">
                    {errorMessage}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Recipient
                  </label>
                  <select
                    value={composeRecipientId}
                    onChange={(e) => setComposeRecipientId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[#EADBDA] bg-white focus:outline-none focus:ring-2 focus:ring-[#800020]"
                    required
                  >
                    <option value="">-- Select Recipient --</option>
                    {recipients.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} {r.category ? `(${r.category})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Subject
                  </label>
                  <input
                    type="text"
                    value={composeSubject}
                    onChange={(e) => setComposeSubject(e.target.value)}
                    placeholder="Enter message subject..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[#EADBDA] bg-white focus:outline-none focus:ring-2 focus:ring-[#800020]"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1">
                    Message Body
                  </label>
                  <textarea
                    rows={5}
                    value={composeBody}
                    onChange={(e) => setComposeBody(e.target.value)}
                    placeholder="Enter message text..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-[#EADBDA] bg-white focus:outline-none focus:ring-2 focus:ring-[#800020]"
                    required
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setIsComposeOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-stone-600 hover:bg-stone-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingMessage}
                    className="px-5 py-2 rounded-xl text-xs font-bold bg-[#800020] text-white hover:bg-[#5B0612] disabled:opacity-50"
                  >
                    {isSubmittingMessage ? "Sending..." : "Dispatch Message"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
  );
}
