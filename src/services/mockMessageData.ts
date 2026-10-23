import type { ChannelMessages, Message, MessageAuthor } from '../types/message'

export const mockCurrentUser: MessageAuthor = { id: 'demo-user', full_name: 'You' }

const authors: MessageAuthor[] = [
  { id: 'maya', full_name: 'Maya Chen' },
  { id: 'alex', full_name: 'Alex Rivera' },
]

const generalHistory = [
  'Welcome to the team! This is our place to share updates and keep everyone in the loop.',
  'The workspace and channel navigation is ready for review.',
  'Thanks! I can switch between the team and design workspaces.',
  'Let’s keep general for team updates and frontend for UI discussions.',
  'The next milestone is the chat interface. We are using local examples for now.',
  'A small reminder: include the sender and time with each message.',
  'We should also check the layout on a phone and a tablet.',
  'Agreed. The message composer should stay within reach while reading the conversation.',
  'Long messages need to wrap, and line breaks should stay visible.\nThis is an example of a second line.',
  'There is a new design discussion in the Design Studio workspace.',
  'You can scroll up here to catch up on the earlier conversation.',
  'Ready when you are. Send a message below to try the chat!',
]

function example(channelId: string, content: string, index: number): Message {
  const author = authors[index % authors.length]
  return {
    id: `mock-${channelId}-${index}`,
    channel_id: channelId,
    user_id: author.id,
    author,
    content,
    created_at: new Date(Date.UTC(2026, 9, 23, 2, index * 5)).toISOString(),
  }
}

// Return fresh collections for each mounted workspace. No network or persistent storage.
export function createMockMessages(): ChannelMessages {
  return {
    general: generalHistory.map((content, index) => example('general', content, index)),
    frontend: [example('frontend', 'Welcome to frontend! Share UI updates and feedback here.', 0)],
    reviews: [example('reviews', 'Let’s review the latest layouts together.', 0)],
    planning: [],
    inspiration: [],
  }
}

export function createMockMessage(channelId: string, content: string): Message {
  return {
    id: crypto.randomUUID(),
    channel_id: channelId,
    user_id: mockCurrentUser.id,
    author: mockCurrentUser,
    content,
    created_at: new Date().toISOString(),
  }
}
