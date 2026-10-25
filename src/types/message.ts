// UI models based on the team blueprint; map future API responses at the service boundary.
export interface MessageAuthor {
  id: string
  full_name: string
}

export interface Message {
  id: string
  channel_id: string
  user_id: string
  content: string
  created_at: string
  author: MessageAuthor
}

export type ChannelMessages = Record<string, Message[]>
