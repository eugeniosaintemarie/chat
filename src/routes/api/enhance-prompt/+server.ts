import { error, json, type RequestHandler } from '@sveltejs/kit';
import { ResultAsync } from 'neverthrow';
import { z } from 'zod/v4';
import { env } from '$env/dynamic/private';
import { OpenAI } from 'openai';
import { ConvexHttpClient } from 'convex/browser';
import { PUBLIC_CONVEX_URL } from '$env/static/public';
import { api } from '$lib/backend/convex/_generated/api';
import { parseMessageForRules } from '$lib/utils/rules';
import { resolveOpenCodeBaseUrl, getGoEndpointType, OPENCODE_GO_BASE_URL } from '$lib/backend/models/opencode-go';

const API_KEY = env.OPENCODE_API_KEY || env.OPENROUTER_FREE_KEY || '';
const ENHANCE_MODEL = 'minimax-m2.5';

const reqBodySchema = z.object({
	prompt: z.string(),
});

const client = new ConvexHttpClient(PUBLIC_CONVEX_URL);

export type EnhancePromptRequestBody = z.infer<typeof reqBodySchema>;

export type EnhancePromptResponse = {
	ok: true;
	enhanced_prompt: string;
};

function response({ enhanced_prompt }: { enhanced_prompt: string }) {
	return json({
		ok: true,
		enhanced_prompt,
	});
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const bodyResult = await ResultAsync.fromPromise(
		request.json(),
		() => 'Failed to parse request body'
	);

	if (bodyResult.isErr()) {
		return error(400, 'Failed to parse request body');
	}

	const parsed = reqBodySchema.safeParse(bodyResult.value);
	if (!parsed.success) {
		return error(400, parsed.error);
	}
	const args = parsed.data;

	const session = await locals.auth();

	if (!session) {
		return error(401, 'You must be logged in to enhance a prompt');
	}

	const rulesResult = await ResultAsync.fromPromise(
		client.query(api.user_rules.all, {
			session_token: session.session.token,
		}),
		(e) => `Failed to get rules: ${e}`
	);

	if (rulesResult.isErr()) {
		return error(500, 'Failed to get rules');
	}

	const mentionedRules = parseMessageForRules(
		args.prompt,
		rulesResult.value.filter((r) => r.attach === 'manual')
	);

	const endpointType = await getGoEndpointType(ENHANCE_MODEL);

	const enhancePrompt = `
Enhance prompt below (wrapped in <prompt> tags) so that it can be better understood by LLMs You job is not to answer the prompt but simply prepare it to be answered by another LLM. 
You can do this by fixing spelling/grammatical errors, clarifying details, and removing unnecessary wording where possible.
Only return the enhanced prompt, nothing else. Do NOT wrap it in quotes, do NOT use markdown.
Do NOT respond to the prompt only optimize it so that another LLM can understand it better.
Do NOT remove context that may be necessary for the prompt to be understood.

${
	mentionedRules.length > 0
		? `The user has mentioned rules with the @<rule_name> syntax. Make sure to include the rules in the final prompt even if you just add them to the end.
Mentioned rules: ${mentionedRules.map((r) => `@${r.name}`).join(', ')}`
		: ''
}

<prompt>
${args.prompt}
</prompt>
`;

	let enhanced: string | undefined;

	if (endpointType === 'anthropic') {
		const enhanceResult = await ResultAsync.fromPromise(
			fetch(`${OPENCODE_GO_BASE_URL}/messages`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${API_KEY}`,
					'anthropic-version': '2023-06-01',
				},
				body: JSON.stringify({
					model: ENHANCE_MODEL,
					messages: [{ role: 'user', content: enhancePrompt }],
					max_tokens: 1024,
				}),
			}).then(async (r) => {
				if (!r.ok) throw new Error(`status ${r.status}`);
				return (await r.json()) as { content?: Array<{ type: string; text?: string }> | string };
			}),
			(e) => `Enhance prompt API call failed: ${e}`
		);

		if (enhanceResult.isErr()) {
			return error(500, 'error enhancing the prompt');
		}

		const content = enhanceResult.value.content;
		enhanced =
			typeof content === 'string'
				? content
				: content?.map((b) => b.text ?? '').join('');
	} else {
		const openai = new OpenAI({
			baseURL: resolveOpenCodeBaseUrl(ENHANCE_MODEL),
			apiKey: API_KEY,
		});

		const enhancedResult = await ResultAsync.fromPromise(
			openai.chat.completions.create({
				model: ENHANCE_MODEL,
				messages: [{ role: 'user', content: enhancePrompt }],
				temperature: 0.5,
			}),
			(e) => `Enhance prompt API call failed: ${e}`
		);

		if (enhancedResult.isErr()) {
			return error(500, 'error enhancing the prompt');
		}

		enhanced = enhancedResult.value.choices[0]?.message?.content;
	}

	if (!enhanced) {
		return error(500, 'error enhancing the prompt');
	}

	return response({
		enhanced_prompt: enhanced,
	});
};
