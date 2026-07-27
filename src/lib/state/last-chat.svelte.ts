import { browser } from '$app/environment';
import { Context } from 'runed';

const STORAGE_KEY = 'last-chat';

class LastChatState {
	#lastChat: string | null;

	constructor(readonly opts: { lastChat: string | null }) {
		this.#lastChat = opts.lastChat;
		if (browser) {
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved) this.#lastChat = saved;
		}
	}

	get current() {
		return this.#lastChat;
	}

	set current(chat: string | null) {
		this.#lastChat = chat;
		if (browser) {
			if (chat) {
				localStorage.setItem(STORAGE_KEY, chat);
			} else {
				localStorage.removeItem(STORAGE_KEY);
			}
		}
	}
}

const ctx = new Context<LastChatState>('last-chat');

export function setupLastChat() {
	return ctx.set(new LastChatState({ lastChat: null }));
}

export function useLastChat() {
	return ctx.get();
}
