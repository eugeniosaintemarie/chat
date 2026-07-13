/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as betterAuth from "../betterAuth.js";
import type * as chat from "../chat.js";
import type * as conversations from "../conversations.js";
import type * as functions from "../functions.js";
import type * as messages from "../messages.js";
import type * as storage from "../storage.js";
import type * as user_enabled_models from "../user_enabled_models.js";
import type * as user_keys from "../user_keys.js";
import type * as user_rules from "../user_rules.js";
import type * as user_settings from "../user_settings.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  betterAuth: typeof betterAuth;
  chat: typeof chat;
  conversations: typeof conversations;
  functions: typeof functions;
  messages: typeof messages;
  storage: typeof storage;
  user_enabled_models: typeof user_enabled_models;
  user_keys: typeof user_keys;
  user_rules: typeof user_rules;
  user_settings: typeof user_settings;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
