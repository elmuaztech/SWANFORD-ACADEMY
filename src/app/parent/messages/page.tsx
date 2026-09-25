"use client";

import React, { useState, useEffect } from "react";

interface MessageItem {
  id: string;
  subject: string;
  body: string;
  isRead: boolean;
  createdAt: string;
  senderUser: {
    id: string;
    email: string;
  };
}

interface ThreadDetail extends MessageItem {
  replies: Array<{
    id: string;
    body: string;
    createdAt: string;
    senderUser: {
      email: string;
    };
  }>;
}

export default function ParentMessagesPage() {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [isLoadingThread, setIsLoadingThread] = useState(false);

  const fetchMessages = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/messages");
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
  }, []);

  const openThread = async (id: string) => {
    setSelectedMessageId(id);
    setIsLoadingThread(true);
    setThread(null);
    try {
      const res = await fetch(`/api/messages/${id}`);
      if (res.ok) {
        const data = await res.json();
        setThread(data.message);
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

  return (
    <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#5B0612] font-display tracking-tight">
            School Correspondence
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-1">
            Official communications, notices, and updates from Swanford Academy Administration.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-white border border-[#EADBDA] rounded-2xl overflow-hidden shadow-xs min-h-[520px]">
          {/* Messages list */}
          <div className="lg:col-span-5 border-r border-[#EADBDA] flex flex-col h-full bg-[#FDFCF9]">
            <div className="p-3.5 border-b border-[#EADBDA] bg-white font-bold text-xs text-[#5B0612] font-display">
              Received Messages
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[#EADBDA]/60">
              {isLoading ? (
                <div className="p-8 text-center text-xs text-stone-400">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-xs font-semibold text-stone-700">No messages found.</p>
                  <p className="text-[11px] text-stone-400 mt-0.5">
                    You have no new correspondence from the school.
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
                          : item.isRead
                          ? "bg-white hover:bg-stone-50"
                          : "bg-[#FDF2F4]/50 hover:bg-[#FDF2F4]/80 font-bold"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-stone-900 truncate">
                          Swanford Academy Admin
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

          {/* Message Reader */}
          <div className="lg:col-span-7 flex flex-col h-full bg-white">
            {isLoadingThread ? (
              <div className="flex-1 flex items-center justify-center p-8 text-xs text-stone-400">
                Opening message...
              </div>
            ) : !thread ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                <p className="text-sm font-semibold text-stone-800">Select a message</p>
                <p className="text-xs text-stone-400 mt-1">
                  Choose a notice or communication from the list to read the complete text.
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col h-full overflow-hidden">
                <div className="p-4 border-b border-[#EADBDA] bg-[#FDFCF9]">
                  <h2 className="text-base font-bold text-[#5B0612] font-display">
                    {thread.subject}
                  </h2>
                  <p className="text-xs text-stone-500 mt-0.5">
                    From: <strong>Swanford Academy Administration</strong> &bull;{" "}
                    {new Date(thread.createdAt).toLocaleString("en-NG", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div className="p-4 rounded-xl bg-stone-50 border border-[#EADBDA] text-xs leading-relaxed text-stone-800 whitespace-pre-wrap">
                    {thread.body}
                  </div>

                  {thread.replies && thread.replies.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">
                        Updates ({thread.replies.length})
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

                <div className="p-3 border-t border-[#EADBDA] bg-[#FDFCF9] text-center text-xs text-stone-400">
                  To respond to official notices, please visit the administrative office at Plot 212, Dr Nuhu Muhammadu Sanusi Way, Dutse, or call 09068897489 / 08103807498.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
  );
}
