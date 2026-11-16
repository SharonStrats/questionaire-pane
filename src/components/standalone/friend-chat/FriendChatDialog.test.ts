// @vitest-environment happy-dom

import { afterEach, expect, it, vi } from 'vitest'
import { FriendChatClient, type FriendConversation } from '../../../service/friendChatClient'
import './FriendChatDialog'
import type FriendChatDialog from './FriendChatDialog'

afterEach(() => {
  document.querySelectorAll('questionaire-friend-chat-dialog').forEach(dialog => dialog.remove())
  vi.restoreAllMocks()
})

it('shows compact participant avatars, only offers adding people, and moves the native dialog', async () => {
  const client = new FriendChatClient('https://chat.example/alice#me', 'Alice', 'http://localhost:5100')
  const conversation: FriendConversation = {
    id: 'test', creatorWebId: client.webId,
    participantWebIds: [client.webId, 'https://chat.example/timmy#me'],
    participantNames: ['Alice', 'Friend'], messages: [], updatedAt: 1
  }
  vi.spyOn(client, 'subscribe').mockImplementation(listener => {
    listener({ connection: 'connected', online: [], messages: [], error: '', conversations: [conversation], unread: {} })
    return () => {}
  })
  vi.spyOn(client, 'openConversation').mockResolvedValue(conversation)
  const dialog = document.createElement('questionaire-friend-chat-dialog') as FriendChatDialog
  dialog.client = client
  dialog.friends = [{ uri: conversation.participantWebIds[1], name: 'Timmy' }]
  dialog.initialConversation = conversation.id
  document.body.append(dialog)
  await vi.waitFor(() => expect(dialog.shadowRoot?.querySelector('.member-avatar[aria-label="Timmy"]')).not.toBeNull())
  expect(dialog.shadowRoot?.querySelectorAll('.member-avatar')).toHaveLength(2)
  expect(dialog.shadowRoot?.querySelector('[aria-label="Remove Timmy"]')).toBeNull()
  expect(dialog.shadowRoot?.textContent).not.toContain('Online means your friend has this app open')
  expect(dialog.shadowRoot?.textContent).not.toContain('identities are not verified')
  expect(dialog.shadowRoot?.textContent).not.toContain('Inbox notifications go to every participant')
  expect(dialog.shadowRoot?.textContent).not.toContain('Offline participants can read recent messages')
  expect(dialog.shadowRoot?.querySelector('.friends')?.classList.contains('friends--collapsed')).toBe(true)
  dialog.shadowRoot?.querySelector<HTMLButtonElement>('.add-member')?.click()
  await vi.waitFor(() => expect(dialog.shadowRoot?.querySelector('.add-member')?.getAttribute('aria-expanded')).toBe('true'))
  expect(dialog.shadowRoot?.querySelector('.friends')?.classList.contains('friends--collapsed')).toBe(false)
  const surface = dialog.shadowRoot!.querySelector('solid-ui-dialog')!.shadowRoot!.querySelector('dialog')!
  vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 100, 400, 300))
  dialog.shadowRoot!.querySelector('.drag-handle')!.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: 120, clientY: 110 }))
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, clientY: 170 }))
  window.dispatchEvent(new PointerEvent('pointerup'))
  expect(surface.style.left).toBe('180px')
  expect(surface.style.top).toBe('160px')
  expect(surface.style.position).toBe('fixed')
  client.disconnect()
})

it('separates recent chats from friend selection and keeps the newest chat per participant group', async () => {
  const client = new FriendChatClient('https://chat.example/alice#me', 'Alice', 'http://localhost:5100')
  const participants = [client.webId, 'https://chat.example/dimitri#me', 'https://chat.example/timmy#me']
  const conversation = (id: string, updatedAt: number): FriendConversation => ({
    id,
    creatorWebId: client.webId,
    participantWebIds: participants,
    participantNames: ['Alice', 'Dimitri', 'Timmy'],
    messages: [],
    updatedAt
  })
  const older = conversation('older', 1)
  const newest = conversation('newest', 2)
  vi.spyOn(client, 'subscribe').mockImplementation(listener => {
    listener({ connection: 'connected', online: [], messages: [], error: '', conversations: [older, newest], unread: {} })
    return () => {}
  })
  const openConversation = vi.spyOn(client, 'openConversation').mockResolvedValue(newest)
  const dialog = document.createElement('questionaire-friend-chat-dialog') as FriendChatDialog
  dialog.client = client
  dialog.friends = [{ uri: participants[1], name: 'Dimitri' }, { uri: participants[2], name: 'Timmy' }]
  document.body.append(dialog)
  await vi.waitFor(() => expect(dialog.shadowRoot?.querySelector('.recent-chats summary')?.textContent).toContain('Recent chats (1)'))
  expect(dialog.shadowRoot?.querySelector('.start')?.textContent).toContain('Start chat (0 selected)')
  expect(dialog.shadowRoot?.querySelectorAll('.group')).toHaveLength(1)
  expect(dialog.shadowRoot?.querySelector('.recent-chats')?.hasAttribute('open')).toBe(false)
  expect(dialog.shadowRoot?.querySelector('.conversation-empty')?.textContent).toContain('Choose friends')
  expect(dialog.shadowRoot?.querySelector('input[aria-label="Message"]')).toBeNull()
  dialog.shadowRoot?.querySelector<HTMLButtonElement>('.group')?.click()
  await vi.waitFor(() => expect(openConversation).toHaveBeenCalledWith('newest'))
  client.disconnect()
})
