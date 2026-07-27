import type { Getter } from 'runed';

let mdPromise: Promise<typeof import('./markdown-it')> | null = null;

function getMd() {
	if (!mdPromise) {
		mdPromise = import('./markdown-it');
	}
	return mdPromise;
}

export class Markdown {
	highlighted = $state<string | null>(null);

	constructor(readonly code: Getter<string>) {
		$effect(() => {
			const text = this.code();
			getMd().then(({ md }) => {
				md.renderAsync(text).then((html) => {
					this.highlighted = html;
				});
			});
		});
	}

	get current() {
		return this.highlighted;
	}
}
