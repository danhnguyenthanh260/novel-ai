import type { Page } from "@playwright/test";

// Story bootstrap form
export const S = {
  storyTitleInput: '[data-testid="story-title-input"]',
  storySlugInput: '[data-testid="story-slug-input"]',
  storyCreateSubmit: '[data-testid="story-create-submit"]',
  storyCreateError: '[data-testid="story-create-error"]',
  storyPickerButton: '[data-testid="story-picker-button"]',
  storyPickerModal: '[data-testid="story-picker-modal"]',
  storyPickerOption: (slug: string) => `[data-testid="story-picker-option-${slug}"]`,

  // Write workspace
  writeWorkspace: '[data-testid="write-workspace"]',
  chatContextBar: '[data-testid="chat-context-bar"]',
  chatTimeline: '[data-testid="chat-timeline"]',
  chatComposerInput: '[data-testid="chat-composer-input"]',
  chatSendBtn: '[data-testid="chat-send-btn"]',
  slashMenu: '[role="menu"][aria-label="Slash commands"]',

  // Chapter navigation
  newChapterBtn: '[data-testid="new-chapter-btn"]',
  chapterItem: (id: string) => `[data-testid="chapter-item-${id}"]`,

  // AutoWriteWizard — no data-testid yet; use role + text
  autoWriteModal: '.autowrite-wizard, [class*="autowrite"]',
  autoWriteInstructionInput: '[data-testid="autowrite-instruction-input"]',

  // Timeline blocks
  timelineStack: '.timeline-stack',
  workflowProgressBlock: '.workflow-progress-block, [data-block-type="workflow_progress"]',
  artifactPreviewBlock: '.artifact-preview-block, [data-block-type="artifact_preview"]',
  approvalGateBlock: '.approval-gate-block, [data-block-type="approval_gate"]',
  artifactDraftReader: '[data-testid="artifact-draft-reader"]',

  // Generic
  primaryAction: '.primary-action',
  alertRole: '[role="alert"]',
};

export function getChapterItem(page: Page, chapterId: string) {
  return page.locator(S.chapterItem(chapterId));
}

export function getChatInput(page: Page) {
  return page.locator(S.chatComposerInput);
}

export function getSendButton(page: Page) {
  return page.locator(S.chatSendBtn);
}

export function getTimeline(page: Page) {
  return page.locator(S.chatTimeline);
}
