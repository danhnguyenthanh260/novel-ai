"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useStory } from "@/features/story/StoryContext";

type StoryItem = {
  slug: string;
  title: string;
  status: string;
};

const STORY_SURFACES: Array<{ label: string; path: string }> = [
  { label: "Write", path: "write" },
  { label: "Pipelines", path: "pipelines" },
  { label: "Ingest", path: "ingest" },
  { label: "Analysis", path: "analysis" },
  { label: "Memory", path: "memory" },
  { label: "Map", path: "map" },
  { label: "Agents", path: "agents" },
  { label: "Reviews", path: "reviews" },
  { label: "Feedback", path: "feedback" },
  { label: "Settings", path: "settings" },
];

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedSlug: string | null;
  onOpenAssistant: () => void;
};

export default function CommandPalette({
  open,
  onOpenChange,
  selectedSlug,
  onOpenAssistant,
}: CommandPaletteProps) {
  const router = useRouter();
  const { setStorySlug } = useStory();
  const [stories, setStories] = useState<StoryItem[] | null>(null);
  const loading = open && stories === null;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/stories", { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setStories(Array.isArray(json?.items) ? json.items : []);
      })
      .catch(() => {
        if (!cancelled) setStories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command Palette"
      description="Navigate stories and surfaces"
    >
      <CommandInput placeholder="Go to surface, switch story, run action..." />
      <CommandList>
        <CommandEmpty>{loading ? "Loading..." : "No results found."}</CommandEmpty>
        {selectedSlug ? (
          <CommandGroup heading={`Go to — ${selectedSlug}`}>
            {STORY_SURFACES.map((surface) => (
              <CommandItem
                key={surface.path}
                value={`go ${surface.label}`}
                onSelect={() => go(`/stories/${encodeURIComponent(selectedSlug)}/${surface.path}`)}
              >
                {surface.label}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        <CommandSeparator />
        <CommandGroup heading="Stories">
          {(stories ?? []).map((story) => (
            <CommandItem
              key={story.slug}
              value={`story ${story.title} ${story.slug}`}
              onSelect={() => {
                setStorySlug(story.slug);
                go(`/stories/${encodeURIComponent(story.slug)}/write`);
              }}
            >
              <span className="truncate">{story.title || story.slug}</span>
              <CommandShortcut>{story.slug}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            value="action open assistant"
            onSelect={() => {
              onOpenChange(false);
              onOpenAssistant();
            }}
          >
            Open assistant
          </CommandItem>
          <CommandItem
            value="action story library"
            onSelect={() => {
              onOpenChange(false);
              window.dispatchEvent(new Event("novel:open-story-picker"));
            }}
          >
            Open story library
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
