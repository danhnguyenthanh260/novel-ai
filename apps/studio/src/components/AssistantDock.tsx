"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type ContextDigest = {
  title: string;
  characters: string[];
  arcs: string[];
  tags: string[];
  styleNotes: string[];
  missing: string[];
  degraded: string[];
  conflicts: string[];
};

type ConversationItem = {
  id: string;
  title: string | null;
  summary: string | null;
  last_message_preview: string | null;
  updated_at: string;
};

type AssistantDockProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedSlug: string | null;
};

type DockData = {
  digest: ContextDigest | null;
  conversations: ConversationItem[];
};

export default function AssistantDock({ open, onOpenChange, selectedSlug }: AssistantDockProps) {
  const [data, setData] = useState<DockData | null>(null);
  const loading = open && Boolean(selectedSlug) && data === null;
  const digest = data?.digest ?? null;
  const conversations = data?.conversations ?? [];

  useEffect(() => {
    if (!open || !selectedSlug) return;
    let cancelled = false;
    const base = `/api/stories/${encodeURIComponent(selectedSlug)}/assistant`;
    Promise.all([
      fetch(`${base}/context?scope=story`, { cache: "no-store" })
        .then((res) => res.json())
        .catch(() => null),
      fetch(`${base}/conversations`, { cache: "no-store" })
        .then((res) => res.json())
        .catch(() => null),
    ]).then(([contextJson, conversationsJson]) => {
      if (cancelled) return;
      setData({
        digest: contextJson?.ok ? (contextJson.item as ContextDigest) : null,
        conversations: Array.isArray(conversationsJson?.items) ? conversationsJson.items : [],
      });
    });
    return () => {
      cancelled = true;
    };
  }, [open, selectedSlug]);

  const writeHref = selectedSlug ? `/stories/${encodeURIComponent(selectedSlug)}/write` : "/";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Assistant</SheetTitle>
          <SheetDescription>
            {selectedSlug
              ? `Story context and recent conversations for ${selectedSlug}.`
              : "Select a story to see assistant context."}
          </SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1 px-4">
          <div className="flex flex-col gap-4 pb-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading context...</p>
            ) : null}
            {digest ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Context in use</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3 text-sm">
                  <ContextRow label="Characters" values={digest.characters} />
                  <ContextRow label="Arcs" values={digest.arcs} />
                  <ContextRow label="Tags" values={digest.tags} />
                  <ContextRow label="Style notes" values={digest.styleNotes} />
                  {digest.missing.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Missing: {digest.missing.join(", ")}
                    </p>
                  ) : null}
                  {digest.conflicts.length > 0 ? (
                    <p className="text-xs text-destructive">
                      Conflicts: {digest.conflicts.join(", ")}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ) : null}
            <Separator />
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Recent conversations
              </p>
              {!loading && conversations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No conversations yet. Start one in the Write workspace.
                </p>
              ) : null}
              {conversations.map((conversation) => (
                <Card key={conversation.id}>
                  <CardContent className="flex flex-col gap-1 py-3 text-sm">
                    <span className="font-medium">
                      {conversation.title || "Untitled conversation"}
                    </span>
                    {conversation.summary || conversation.last_message_preview ? (
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {conversation.summary || conversation.last_message_preview}
                      </span>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </ScrollArea>
        <div className="border-t p-4">
          <Button asChild className="w-full" disabled={!selectedSlug}>
            <Link href={writeHref} onClick={() => onOpenChange(false)}>
              Continue in Write workspace
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ContextRow({ label, values }: { label: string; values: string[] }) {
  if (!values || values.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex flex-wrap gap-1">
        {values.slice(0, 8).map((value) => (
          <Badge key={value} variant="secondary" className="font-normal">
            {value}
          </Badge>
        ))}
        {values.length > 8 ? (
          <Badge variant="outline" className="font-normal">
            +{values.length - 8} more
          </Badge>
        ) : null}
      </div>
    </div>
  );
}
