import { PUBLIC_CONVEX_URL } from '$env/static/public';
import { env } from '$env/dynamic/private';
import { resolveOpenCodeBaseUrl, getGoEndpointType, streamOpenCodeGoAnthropic, OPENCODE_GO_BASE_URL } from '$lib/backend/models/opencode-go';
import { api } from '$lib/backend/convex/_generated/api';

const API_KEY = env.OPENCODE_API_KEY || env.OPENROUTER_FREE_KEY || '';
const TITLE_MODEL = 'minimax-m2.5';
import type { Doc, Id } from '$lib/backend/convex/_generated/dataModel';
import { Provider, type Annotation } from '$lib/types';
import { error, json, type RequestHandler } from '@sveltejs/kit';
import { getSessionCookie } from 'better-auth/cookies';
import { ConvexHttpClient } from 'convex/browser';
import { ResultAsync } from 'neverthrow';
import OpenAI from 'openai';
import { z } from 'zod/v4';
import { generationAbortControllers } from './cache.js';
import { md } from '$lib/utils/markdown-it.js';
import * as array from '$lib/utils/array';
import { parseMessageForRules } from '$lib/utils/rules.js';

// Set to true to enable debug logging
const ENABLE_LOGGING = true;

const reqBodySchema = z
	.object({
		message: z.string().optional(),
		model_id: z.string(),

		session_token: z.string(),
		conversation_id: z.string().optional(),
		web_search_enabled: z.boolean().optional(),
		images: z
			.array(
				z.object({
					url: z.string(),
					storage_id: z.string(),
					fileName: z.string().optional(),
				})
			)
			.optional(),
		reasoning_effort: z.enum(['low', 'medium', 'high']).optional(),
	})
	.refine(
		(data) => {
			if (data.conversation_id === undefined && data.message === undefined) return false;

			return true;
		},
		{
			message: 'You must provide a message when creating a new conversation',
		}
	);

export type GenerateMessageRequestBody = z.infer<typeof reqBodySchema>;

export type GenerateMessageResponse = {
	ok: true;
	conversation_id: string;
};

function response(res: GenerateMessageResponse) {
	return json(res);
}

function log(message: string, startTime: number): void {
	if (!ENABLE_LOGGING) return;
	const elapsed = Date.now() - startTime;
	console.log(`[GenerateMessage] ${message} (${elapsed}ms)`);
}

const client = new ConvexHttpClient(PUBLIC_CONVEX_URL);

async function generateConversationTitle({
	conversationId,
	sessionToken,
	startTime,
	keyResultPromise,
	userMessage,
}: {
	conversationId: string;
	sessionToken: string;
	startTime: number;
	keyResultPromise: ResultAsync<string | null, string>;
	userMessage: string;
}) {
	log('Starting conversation title generation', startTime);

	const actualKey = API_KEY;

	// Only generate title if conversation currently has default title
	const conversationResult = await ResultAsync.fromPromise(
		client.query(api.conversations.get, {
			session_token: sessionToken,
		}),
		(e) => `Failed to get conversations: ${e}`
	);

	if (conversationResult.isErr()) {
		log(`Title generation: Failed to get conversation: ${conversationResult.error}`, startTime);
		return;
	}

	const conversations = conversationResult.value;
	const conversation = conversations.find((c) => c._id === conversationId);

	if (!conversation) {
		log('Title generation: Conversation not found or already has custom title', startTime);
		return;
	}

	// Create a prompt for title generation using only the first user message
	const titlePrompt = `Based on this message:
"""${userMessage}"""

Generate a concise, specific title (max 4-5 words).
Generate only the title based on the message, nothing else. Don't name the title 'Generate Title' or anything stupid like that, otherwise its obvious we're generating a title with AI.

Also, do not interact with the message directly or answer it. Just generate the title based on the message.

If its a simple hi, just name it "Greeting" or something like that.
`;

	const titleEndpointType = await getGoEndpointType(TITLE_MODEL);
	let rawTitle: string | undefined;

	if (titleEndpointType === 'anthropic') {
		const remoteTitle = await ResultAsync.fromPromise(
			fetch(`${OPENCODE_GO_BASE_URL}/messages`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${actualKey}`,
					'anthropic-version': '2023-06-01',
				},
				body: JSON.stringify({
					model: TITLE_MODEL,
					messages: [{ role: 'user', content: titlePrompt }],
					max_tokens: 64,
				}),
			}).then(async (r) => {
				if (!r.ok) throw new Error(`status ${r.status}`);
				return (await r.json()) as { content?: Array<{ type: string; text?: string }> | string };
			}),
			(e) => `Title generation API call failed: ${e}`
		);

		if (remoteTitle.isErr()) {
			log(`Title generation: Anthropic call failed: ${remoteTitle.error}`, startTime);
			return;
		}

		const content = remoteTitle.value.content;
		rawTitle =
			typeof content === 'string' ? content : content?.map((b) => b.text ?? '').join('');
	} else {
		const openai = new OpenAI({
			baseURL: resolveOpenCodeBaseUrl(TITLE_MODEL),
			apiKey: actualKey,
		});

		const titleResult = await ResultAsync.fromPromise(
			openai.chat.completions.create({
				model: TITLE_MODEL,
				messages: [{ role: 'user', content: titlePrompt }],
				max_tokens: 20,
				temperature: 0.5,
			}),
			(e) => `Title generation API call failed: ${e}`
		);

		if (titleResult.isErr()) {
			log(`Title generation: OpenAI call failed: ${titleResult.error}`, startTime);
			return;
		}

		rawTitle = titleResult.value.choices[0]?.message?.content?.trim();
	}

	if (!rawTitle) {
		log('Title generation: No title generated', startTime);
		return;
	}

	// Strip surrounding quotes if present
	const generatedTitle = rawTitle.replace(/^["']|["']$/g, '');

	// Update the conversation title
	const updateResult = await ResultAsync.fromPromise(
		client.mutation(api.conversations.updateTitle, {
			conversation_id: conversationId as Id<'conversations'>,
			title: generatedTitle,
			session_token: sessionToken,
		}),
		(e) => `Failed to update conversation title: ${e}`
	);

	if (updateResult.isErr()) {
		log(`Title generation: Failed to update title: ${updateResult.error}`, startTime);
		return;
	}

	log(`Title generation: Successfully updated title to "${generatedTitle}"`, startTime);
}

async function generateAIResponse({
	conversationId,
	sessionToken,
	startTime,
	modelResultPromise,
	keyResultPromise,
	rulesResultPromise,
	userSettingsPromise,
	abortSignal,
	reasoningEffort,
}: {
	conversationId: string;
	sessionToken: string;
	startTime: number;
	keyResultPromise: ResultAsync<string | null, string>;
	modelResultPromise: ResultAsync<Doc<'user_enabled_models'> | null, string>;
	rulesResultPromise: ResultAsync<Doc<'user_rules'>[], string>;
	userSettingsPromise: ResultAsync<Doc<'user_settings'> | null, string>;
	abortSignal?: AbortSignal;
	reasoningEffort?: 'low' | 'medium' | 'high';
}) {
	log('Starting AI response generation in background', startTime);

	if (abortSignal?.aborted) {
		log('AI response generation aborted before starting', startTime);
		return;
	}

	const [modelResult, keyResult, messagesQueryResult, rulesResult, userSettingsResult] =
		await Promise.all([
			modelResultPromise,
			keyResultPromise,
			ResultAsync.fromPromise(
				client.query(api.messages.getAllFromConversation, {
					conversation_id: conversationId as Id<'conversations'>,
					session_token: sessionToken,
				}),
				(e) => `Failed to get messages: ${e}`
			),
			rulesResultPromise,
			userSettingsPromise,
		]);

	if (modelResult.isErr()) {
		handleGenerationError({
			error: modelResult.error,
			conversationId,
			messageId: undefined,
			sessionToken,
			startTime,
		});
		return;
	}

	const model = modelResult.value;
	if (!model) {
		handleGenerationError({
			error: 'Model not found or not enabled',
			conversationId,
			messageId: undefined,
			sessionToken,
			startTime,
		});
		return;
	}

	log('Background: Model found and enabled', startTime);

	if (messagesQueryResult.isErr()) {
		handleGenerationError({
			error: `messages query failed: ${messagesQueryResult.error}`,
			conversationId,
			messageId: undefined,
			sessionToken,
			startTime,
		});
		return;
	}

	const messages = messagesQueryResult.value;
	log(`Background: Retrieved ${messages.length} messages from conversation`, startTime);

	// Check if web search is enabled for the last user message
	const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
	const webSearchEnabled = lastUserMessage?.web_search_enabled ?? false;

	const modelId = model.model_id;

	// Create assistant message
	const messageCreationResult = await ResultAsync.fromPromise(
		client.mutation(api.messages.create, {
			conversation_id: conversationId,
			model_id: model.model_id,
			provider: Provider.OpenRouter,
			content: '',
			role: 'assistant',
			session_token: sessionToken,
			web_search_enabled: webSearchEnabled,
		}),
		(e) => `Failed to create assistant message: ${e}`
	);

	if (messageCreationResult.isErr()) {
		handleGenerationError({
			error: `assistant message creation failed: ${messageCreationResult.error}`,
			conversationId,
			messageId: undefined,
			sessionToken,
			startTime,
		});
		return;
	}

	const mid = messageCreationResult.value;
	log('Background: Assistant message created', startTime);

	if (keyResult.isErr()) {
		handleGenerationError({
			error: `API key query failed: ${keyResult.error}`,
			conversationId,
			messageId: mid,
			sessionToken,
			startTime,
		});
		return;
	}

	if (userSettingsResult.isErr()) {
		handleGenerationError({
			error: `User settings query failed: ${userSettingsResult.error}`,
			conversationId,
			messageId: mid,
			sessionToken,
			startTime,
		});
		return;
	}

	const actualKey = API_KEY;

	if (rulesResult.isErr()) {
		handleGenerationError({
			error: `rules query failed: ${rulesResult.error}`,
			conversationId,
			messageId: mid,
			sessionToken,
			startTime,
		});
		return;
	}

	const userMessage = messages[messages.length - 1];

	if (!userMessage) {
		handleGenerationError({
			error: 'No user message found',
			conversationId,
			messageId: mid,
			sessionToken,
			startTime,
		});
		return;
	}

	let attachedRules = rulesResult.value.filter((r) => r.attach === 'always');

	for (const message of messages) {
		const parsedRules = parseMessageForRules(
			message.content,
			rulesResult.value.filter((r) => r.attach === 'manual')
		);

		attachedRules.push(...parsedRules);
	}

	// remove duplicates
	attachedRules = array.fromMap(
		array.toMap(attachedRules, (r) => [r._id, r]),
		(_k, v) => v
	);

	log(`Background: ${attachedRules.length} rules attached`, startTime);

	const formattedMessages = messages.map((m) => {
		if (m.images && m.images.length > 0 && m.role === 'user') {
			return {
				role: 'user' as const,
				content: [
					{ type: 'text' as const, text: m.content },
					...m.images.map((img) => ({
						type: 'image_url' as const,
						image_url: { url: img.url },
					})),
				],
			};
		}
		return {
			role: m.role as 'user' | 'assistant' | 'system',
			content: m.content,
		};
	});

	// Only include system message if there are rules to follow
	const messagesToSend =
		attachedRules.length > 0
			? [
					...formattedMessages,
					{
						role: 'system' as const,
						content: `The user has mentioned one or more rules to follow with the @<rule_name> syntax. Please follow these rules as they apply.
Rules to follow:
${attachedRules.map((r) => `- ${r.name}: ${r.rule}`).join('\n')}`,
					},
				]
			: formattedMessages;

	if (abortSignal?.aborted) {
		handleGenerationError({
			error: 'Cancelled by user',
			conversationId,
			messageId: mid,
			sessionToken,
			startTime,
		});
		return;
	}

	const endpointType = await getGoEndpointType(modelId);

	let content = '';
	let reasoning = '';
	let chunkCount = 0;
	let generationId: string | null = null;
	const annotations: Annotation[] = [];

	try {
		if (endpointType === 'anthropic') {
			await streamOpenCodeGoAnthropic({
				baseURL: OPENCODE_GO_BASE_URL,
				apiKey: actualKey,
				modelId,
				messages: messagesToSend,
				signal: abortSignal,
				onChunk: async (d) => {
					if (abortSignal?.aborted) return;
					chunkCount++;
					content = d.content;
					reasoning = d.reasoning;
					generationId = d.generationId;
					if (!content && !reasoning) return;

					const updateResult = await ResultAsync.fromPromise(
						client.mutation(api.messages.updateContent, {
							message_id: mid,
							content,
							reasoning: reasoning.length > 0 ? reasoning : undefined,
							session_token: sessionToken,
							generation_id: generationId,
							annotations,
							reasoning_effort: reasoningEffort,
						}),
						(e) => `Failed to update message content: ${e}`
					);

					if (updateResult.isErr()) {
						log(
							`Background message update failed on chunk ${chunkCount}: ${updateResult.error}`,
							startTime
						);
					}
				},
			});

			log(
				`Background Anthropic stream completed. Processed ${chunkCount} chunks, final content length: ${content.length}`,
				startTime
			);
		} else {
			const openai = new OpenAI({
				baseURL: resolveOpenCodeBaseUrl(modelId),
				apiKey: actualKey,
			});

			const streamResult = await ResultAsync.fromPromise(
				openai.chat.completions.create(
					{
						model: modelId,
						messages: messagesToSend,
						temperature: 0.7,
						stream: true,
						reasoning_effort: reasoningEffort,
					},
					{
						signal: abortSignal,
					}
				),
				(e) => `OpenAI API call failed: ${e}`
			);

			if (streamResult.isErr()) {
				handleGenerationError({
					error: `Failed to create stream: ${streamResult.error}`,
					conversationId,
					messageId: mid,
					sessionToken,
					startTime,
				});
				return;
			}

			const stream = streamResult.value;
			log('Background: OpenAI stream created successfully', startTime);

			for await (const chunk of stream) {
				if (abortSignal?.aborted) {
					log('AI response generation aborted during streaming', startTime);
					break;
				}

				chunkCount++;

				// @ts-expect-error you're wrong
				reasoning += chunk.choices[0]?.delta?.reasoning || '';
				content += chunk.choices[0]?.delta?.content || '';
				// @ts-expect-error you're wrong
				annotations.push(...(chunk.choices[0]?.delta?.annotations ?? []));

				if (!content && !reasoning) continue;

				generationId = chunk.id;

				const updateResult = await ResultAsync.fromPromise(
					client.mutation(api.messages.updateContent, {
						message_id: mid,
						content,
						reasoning: reasoning.length > 0 ? reasoning : undefined,
						session_token: sessionToken,
						generation_id: generationId,
						annotations,
						reasoning_effort: reasoningEffort,
					}),
					(e) => `Failed to update message content: ${e}`
				);

				if (updateResult.isErr()) {
					log(
						`Background message update failed on chunk ${chunkCount}: ${updateResult.error}`,
						startTime
					);
				}
			}

			log(
				`Background stream processing completed. Processed ${chunkCount} chunks, final content length: ${content.length}`,
				startTime
			);
		}

		if (!generationId) {
			log('Background: No generation id found', startTime);
			return;
		}

		const contentHtmlResultPromise = ResultAsync.fromPromise(
			md.renderAsync(content),
			(e) => `Failed to render HTML: ${e}`
		);

		// OpenCode Go does not expose an OpenRouter-style generation stats endpoint.
		const generationStats: { tokens_completion: number | undefined; total_cost: number | undefined } =
			{
				tokens_completion: undefined,
				total_cost: undefined,
			};

		const contentHtmlResult = await contentHtmlResultPromise;

		if (contentHtmlResult.isErr()) {
			log(`Background: Failed to render HTML: ${contentHtmlResult.error}`, startTime);
		}

		const [updateMessageResult, updateGeneratingResult, updateCostUsdResult] = await Promise.all([
			ResultAsync.fromPromise(
				client.mutation(api.messages.updateMessage, {
					message_id: mid,
					token_count: generationStats.tokens_completion,
					cost_usd: generationStats.total_cost,
					generation_id: generationId,
					session_token: sessionToken,
					content_html: contentHtmlResult.unwrapOr(undefined),
				}),
				(e) => `Failed to update message: ${e}`
			),
			ResultAsync.fromPromise(
				client.mutation(api.conversations.updateGenerating, {
					conversation_id: conversationId as Id<'conversations'>,
					generating: false,
					session_token: sessionToken,
				}),
				(e) => `Failed to update generating status: ${e}`
			),
			ResultAsync.fromPromise(
				client.mutation(api.conversations.updateCostUsd, {
					conversation_id: conversationId as Id<'conversations'>,
					cost_usd: generationStats.total_cost ?? 0,
					session_token: sessionToken,
				}),
				(e) => `Failed to update cost usd: ${e}`
			),
		]);

		if (updateGeneratingResult.isErr()) {
			log(`Background generating status update failed: ${updateGeneratingResult.error}`, startTime);
			return;
		}

		log('Background: Generating status updated to false', startTime);

		if (updateMessageResult.isErr()) {
			log(`Background message update failed: ${updateMessageResult.error}`, startTime);
			return;
		}

		log('Background: Message updated', startTime);

		if (updateCostUsdResult.isErr()) {
			log(`Background cost usd update failed: ${updateCostUsdResult.error}`, startTime);
			return;
		}

		log('Background: Cost usd updated', startTime);
	} catch (error) {
		handleGenerationError({
			error: `Stream processing error: ${error}`,
			conversationId,
			messageId: mid,
			sessionToken,
			startTime,
		});
	} finally {
		// Clean up the cached AbortController
		generationAbortControllers.delete(conversationId);
		log('Background: Cleaned up abort controller', startTime);
	}
}

export const POST: RequestHandler = async ({ request }) => {
	const startTime = Date.now();
	log('Starting message generation request', startTime);

	const bodyResult = await ResultAsync.fromPromise(
		request.json(),
		() => 'Failed to parse request body'
	);

	if (bodyResult.isErr()) {
		log(`Request body parsing failed: ${bodyResult.error}`, startTime);
		return error(400, 'Failed to parse request body');
	}

	log('Request body parsed successfully', startTime);

	const parsed = reqBodySchema.safeParse(bodyResult.value);
	if (!parsed.success) {
		log(`Schema validation failed: ${parsed.error}`, startTime);
		return error(400, parsed.error);
	}
	const args = parsed.data;

	log('Schema validation passed', startTime);

	const cookie = getSessionCookie(request.headers);

	const sessionToken = cookie?.split('.')[0] ?? null;

	if (!sessionToken) {
		log(`No session token found`, startTime);
		return error(401, 'Unauthorized');
	}

	const modelResultPromise = ResultAsync.fromPromise(
		client.query(api.user_enabled_models.get, {
			provider: Provider.OpenRouter,
			model_id: args.model_id,
			session_token: sessionToken,
		}),
		(e) => `Failed to get model: ${e}`
	);

	const keyResultPromise = ResultAsync.fromPromise(
		client.query(api.user_keys.get, {
			provider: Provider.OpenRouter,
			session_token: sessionToken,
		}),
		(e) => `Failed to get API key: ${e}`
	);

	const userSettingsPromise = ResultAsync.fromPromise(
		client.query(api.user_settings.get, {
			session_token: sessionToken,
		}),
		(e) => `Failed to get user settings: ${e}`
	);

	const rulesResultPromise = ResultAsync.fromPromise(
		client.query(api.user_rules.all, {
			session_token: sessionToken,
		}),
		(e) => `Failed to get rules: ${e}`
	);

	log('Session authenticated successfully', startTime);

	let conversationId = args.conversation_id;
	if (!conversationId) {
		// technically zod should catch this but just in case
		if (args.message === undefined) {
			return error(400, 'You must provide a message when creating a new conversation');
		}

		const convMessageResult = await ResultAsync.fromPromise(
			client.mutation(api.conversations.createAndAddMessage, {
				content: args.message,
				content_html: '',
				role: 'user',
				images: args.images,
				web_search_enabled: args.web_search_enabled,
				session_token: sessionToken,
			}),
			(e) => `Failed to create conversation: ${e}`
		);

		if (convMessageResult.isErr()) {
			log(`Conversation creation failed: ${convMessageResult.error}`, startTime);
			return error(500, 'Failed to create conversation');
		}

		conversationId = convMessageResult.value.conversationId;
		log('New conversation and message created', startTime);

		// Generate title for new conversation in background
		generateConversationTitle({
			conversationId,
			sessionToken,
			startTime,
			keyResultPromise,
			userMessage: args.message,
		}).catch((error) => {
			log(`Background title generation error: ${error}`, startTime);
		});
	} else {
		log('Using existing conversation', startTime);

		if (args.message) {
			const userMessageResult = await ResultAsync.fromPromise(
				client.mutation(api.messages.create, {
					conversation_id: conversationId as Id<'conversations'>,
					content: args.message,
					session_token: args.session_token,
					model_id: args.model_id,
					reasoning_effort: args.reasoning_effort,
					role: 'user',
					images: args.images,
					web_search_enabled: args.web_search_enabled,
				}),
				(e) => `Failed to create user message: ${e}`
			);

			if (userMessageResult.isErr()) {
				log(`User message creation failed: ${userMessageResult.error}`, startTime);
				return error(500, 'Failed to create user message');
			}

			log('User message created', startTime);
		}
	}

	// Set generating status to true before starting background generation
	const setGeneratingResult = await ResultAsync.fromPromise(
		client.mutation(api.conversations.updateGenerating, {
			conversation_id: conversationId as Id<'conversations'>,
			generating: true,
			session_token: sessionToken,
		}),
		(e) => `Failed to set generating status: ${e}`
	);

	if (setGeneratingResult.isErr()) {
		log(`Failed to set generating status: ${setGeneratingResult.error}`, startTime);
		return error(500, 'Failed to set generating status');
	}

	// Create and cache AbortController for this generation
	const abortController = new AbortController();
	generationAbortControllers.set(conversationId, abortController);

	// Start AI response generation in background - don't await
	generateAIResponse({
		conversationId,
		sessionToken,
		startTime,
		modelResultPromise,
		keyResultPromise,
		rulesResultPromise,
		userSettingsPromise,
		abortSignal: abortController.signal,
		reasoningEffort: args.reasoning_effort,
	})
		.catch(async (error) => {
			log(`Background AI response generation error: ${error}`, startTime);
			// Reset generating status on error
			try {
				await client.mutation(api.conversations.updateGenerating, {
					conversation_id: conversationId as Id<'conversations'>,
					generating: false,
					session_token: sessionToken,
				});
			} catch (e) {
				log(`Failed to reset generating status after error: ${e}`, startTime);
			}
		})
		.finally(() => {
			// Clean up the cached AbortController
			generationAbortControllers.delete(conversationId);
		});

	log('Response sent, AI generation started in background', startTime);
	return response({ ok: true, conversation_id: conversationId });
};

async function handleGenerationError({
	error,
	conversationId,
	messageId,
	sessionToken,
	startTime,
}: {
	error: string;
	conversationId: string;
	messageId: string | undefined;
	sessionToken: string;
	startTime: number;
}) {
	log(`Background: ${error}`, startTime);

	const updateErrorResult = await ResultAsync.fromPromise(
		client.mutation(api.messages.updateError, {
			conversation_id: conversationId as Id<'conversations'>,
			message_id: messageId,
			error,
			session_token: sessionToken,
		}),
		(e) => `Error updating error: ${e}`
	);

	if (updateErrorResult.isErr()) {
		log(`Error updating error: ${updateErrorResult.error}`, startTime);
	}

	// Always stop the "generating" spinner when an error occurs, otherwise the
	// conversation is stuck in a perpetual "thinking" state on the client.
	const updateGeneratingResult = await ResultAsync.fromPromise(
		client.mutation(api.conversations.updateGenerating, {
			conversation_id: conversationId as Id<'conversations'>,
			generating: false,
			session_token: sessionToken,
		}),
		(e) => `Error resetting generating status: ${e}`
	);

	if (updateGeneratingResult.isErr()) {
		log(`Error resetting generating status: ${updateGeneratingResult.error}`, startTime);
		return;
	}

	log('Error updated', startTime);
}
