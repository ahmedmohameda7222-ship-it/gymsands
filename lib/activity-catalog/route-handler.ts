import "server-only";

import { NextResponse } from "next/server";
import { ActivityCatalogError } from "@/lib/activity-catalog/errors";
import type { ActivityCatalogSearchParams } from "@/lib/activity-catalog/types";
import { requireEligibleUser } from "@/lib/integrations/env";
import { createActivityCatalogProvider } from "@/services/activity-catalog/server/factory";

const NO_STORE = "private, no-store";
const MAX_QUERY_LENGTH = 100;
const MAX_FILTER_LENGTH = 100;
const MAX_IDENTIFIER_LENGTH = 100;
const MAX_OFFSET = Number.MAX_SAFE_INTEGER;
const MAX_LIMIT = 100;
const MAX_ALTERNATIVES_LIMIT = 20;

const SEARCH_PARAMETERS = new Set([
  "query",
  "sport",
  "sessionType",
  "phase",
  "activityType",
  "difficulty",
  "equipment",
  "goal",
  "limit",
  "offset",
  "locale"
]);
const LOCALE_PARAMETERS = new Set(["locale"]);
const FILTER_PARAMETERS = new Set(["sport", "locale"]);
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const SAFE_SLUG = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const SAFE_LOCALE = /^[a-z]{2}(?:-[A-Z]{2})?$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const DIFFICULTIES = new Set(["beginner", "intermediate", "advanced"]);

type Provider = Awaited<ReturnType<typeof createActivityCatalogProvider>>;

type ErrorDescriptor = {
  status: number;
  code: string;
  message: string;
};

const ERROR_DESCRIPTORS: Record<string, ErrorDescriptor> = {
  invalid_request: {
    status: 400,
    code: "invalid_request",
    message: "The activity catalog request is invalid."
  },
  not_found: {
    status: 404,
    code: "not_found",
    message: "The requested activity catalog item was not found."
  },
  timeout: {
    status: 504,
    code: "timeout",
    message: "The activity catalog did not respond in time."
  },
  unauthorized: {
    status: 502,
    code: "upstream_unauthorized",
    message: "The activity catalog connection could not be authorized."
  },
  upstream_unauthorized: {
    status: 502,
    code: "upstream_unauthorized",
    message: "The activity catalog connection could not be authorized."
  },
  forbidden: {
    status: 502,
    code: "upstream_unauthorized",
    message: "The activity catalog connection could not be authorized."
  },
  upstream_forbidden: {
    status: 502,
    code: "upstream_forbidden",
    message: "The activity catalog rejected the server request."
  },
  invalid_response: {
    status: 502,
    code: "invalid_response",
    message: "The activity catalog returned an invalid response."
  },
  configuration_error: {
    status: 503,
    code: "configuration_error",
    message: "The activity catalog is not configured correctly."
  },
  unavailable: {
    status: 503,
    code: "unavailable",
    message: "The activity catalog is temporarily unavailable."
  },
  rate_limited: {
    status: 503,
    code: "rate_limited",
    message: "The activity catalog is temporarily busy."
  }
};

export class ActivityCatalogRequestError extends Error {
  readonly code = "invalid_request";

  constructor(message: string) {
    super(message);
    this.name = "ActivityCatalogRequestError";
  }
}

function withNoStore<T extends Response>(response: T): T {
  response.headers.set("Cache-Control", NO_STORE);
  return response;
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": NO_STORE }
  });
}

function normalizedErrorCode(error: unknown): string | null {
  if (!(error instanceof ActivityCatalogError) && (!error || typeof error !== "object")) return null;
  const code = "code" in error ? (error as { code?: unknown }).code : null;
  if (typeof code !== "string") return null;
  return code.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function safeErrorResponse(error: unknown) {
  if (error instanceof ActivityCatalogRequestError) {
    return json({ error: { message: error.message, code: error.code } }, 400);
  }

  const normalizedCode = normalizedErrorCode(error);
  const descriptor = normalizedCode ? ERROR_DESCRIPTORS[normalizedCode] : null;
  if (descriptor) {
    return json({ error: { message: descriptor.message, code: descriptor.code } }, descriptor.status);
  }

  return json(
    {
      error: {
        message: "The activity catalog is temporarily unavailable.",
        code: "unavailable"
      }
    },
    503
  );
}

export async function handleActivityCatalogRoute<Input>(
  request: Request,
  parse: (request: Request) => Input | Promise<Input>,
  execute: (provider: Provider, input: Input) => Promise<unknown>
) {
  const context = await requireEligibleUser(request);
  if (context instanceof NextResponse) return withNoStore(context);

  try {
    const input = await parse(request);
    const provider = await createActivityCatalogProvider({ supabase: context.supabase });
    return json(await execute(provider, input));
  } catch (error) {
    return safeErrorResponse(error);
  }
}

function assertAllowedParameters(searchParams: URLSearchParams, allowed: ReadonlySet<string>) {
  for (const key of searchParams.keys()) {
    if (!allowed.has(key)) throw new ActivityCatalogRequestError("The request contains an unsupported query parameter.");
    if (searchParams.getAll(key).length !== 1) {
      throw new ActivityCatalogRequestError(`Query parameter ${key} may be supplied only once.`);
    }
  }
}

function optionalValue(searchParams: URLSearchParams, key: string) {
  if (!searchParams.has(key)) return undefined;
  const value = searchParams.get(key)?.trim() ?? "";
  if (!value) throw new ActivityCatalogRequestError(`Query parameter ${key} cannot be empty.`);
  return value;
}

function slugValue(searchParams: URLSearchParams, key: string) {
  const value = optionalValue(searchParams, key);
  if (value === undefined) return undefined;
  if (value.length > MAX_FILTER_LENGTH || !SAFE_SLUG.test(value)) {
    throw new ActivityCatalogRequestError(`Query parameter ${key} is invalid.`);
  }
  return value;
}

function localeValue(searchParams: URLSearchParams) {
  const locale = optionalValue(searchParams, "locale");
  if (locale === undefined) return undefined;
  if (locale.length > 35 || !SAFE_LOCALE.test(locale)) {
    throw new ActivityCatalogRequestError("Query parameter locale is invalid.");
  }
  return locale;
}

function difficultyValue(searchParams: URLSearchParams): ActivityCatalogSearchParams["difficulty"] | undefined {
  const difficulty = optionalValue(searchParams, "difficulty");
  if (difficulty === undefined) return undefined;
  if (!DIFFICULTIES.has(difficulty)) {
    throw new ActivityCatalogRequestError("Query parameter difficulty is invalid.");
  }
  return difficulty as ActivityCatalogSearchParams["difficulty"];
}

function equipmentValues(searchParams: URLSearchParams) {
  const equipment = optionalValue(searchParams, "equipment");
  if (equipment === undefined) return undefined;
  const values = equipment.split(",").map((item) => item.trim());
  if (
    values.length === 0 ||
    values.length > 20 ||
    values.some((value) => !value || value.length > MAX_FILTER_LENGTH || !SAFE_SLUG.test(value))
  ) {
    throw new ActivityCatalogRequestError("Query parameter equipment is invalid.");
  }
  return Array.from(new Set(values));
}

function integerValue(searchParams: URLSearchParams, key: "limit" | "offset", minimum: number, maximum: number) {
  const value = optionalValue(searchParams, key);
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new ActivityCatalogRequestError(`Query parameter ${key} must be an integer.`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new ActivityCatalogRequestError(`Query parameter ${key} is outside the supported range.`);
  }
  return number;
}

export function parseLocaleOptions(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  assertAllowedParameters(searchParams, LOCALE_PARAMETERS);
  const locale = localeValue(searchParams);
  return locale ? { locale } : undefined;
}

export function parseFilterOptions(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  assertAllowedParameters(searchParams, FILTER_PARAMETERS);
  const sport = slugValue(searchParams, "sport");
  const locale = localeValue(searchParams);
  if (!sport && !locale) return undefined;
  return {
    ...(sport ? { sport } : {}),
    ...(locale ? { locale } : {})
  };
}

export function parseAlternativesOptions(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  assertAllowedParameters(searchParams, new Set(["locale", "limit"]));
  const locale = localeValue(searchParams);
  const limit = integerValue(searchParams, "limit", 1, MAX_ALTERNATIVES_LIMIT);
  if (!locale && limit === undefined) return undefined;
  return {
    ...(locale ? { locale } : {}),
    ...(limit !== undefined ? { limit } : {})
  };
}

export function parseActivitySearch(request: Request): ActivityCatalogSearchParams {
  const searchParams = new URL(request.url).searchParams;
  assertAllowedParameters(searchParams, SEARCH_PARAMETERS);

  const query = optionalValue(searchParams, "query");
  if (query !== undefined && (query.length > MAX_QUERY_LENGTH || CONTROL_CHARACTERS.test(query))) {
    throw new ActivityCatalogRequestError("Query parameter query is invalid.");
  }

  const sport = slugValue(searchParams, "sport");
  const sessionType = slugValue(searchParams, "sessionType");
  const phase = slugValue(searchParams, "phase");
  const activityType = slugValue(searchParams, "activityType");
  const difficulty = difficultyValue(searchParams);
  const equipment = equipmentValues(searchParams);
  const goal = slugValue(searchParams, "goal");
  const limit = integerValue(searchParams, "limit", 1, MAX_LIMIT);
  const offset = integerValue(searchParams, "offset", 0, MAX_OFFSET);
  const locale = localeValue(searchParams);

  return {
    ...(query ? { query } : {}),
    ...(sport ? { sport } : {}),
    ...(sessionType ? { sessionType } : {}),
    ...(phase ? { phase } : {}),
    ...(activityType ? { activityType } : {}),
    ...(difficulty ? { difficulty } : {}),
    ...(equipment ? { equipment } : {}),
    ...(goal ? { goal } : {}),
    ...(limit !== undefined ? { limit } : {}),
    ...(offset !== undefined ? { offset } : {}),
    ...(locale ? { locale } : {})
  };
}

export function validateActivityIdentifier(identifier: string) {
  const value = identifier.trim();
  if (!value || value.length > MAX_IDENTIFIER_LENGTH || !SAFE_IDENTIFIER.test(value)) {
    throw new ActivityCatalogRequestError("Activity identifier is invalid.");
  }
  return value;
}

export function validateSportSlug(sportSlug: string) {
  const value = sportSlug.trim();
  if (!value || value.length > MAX_FILTER_LENGTH || !SAFE_SLUG.test(value)) {
    throw new ActivityCatalogRequestError("Sport slug is invalid.");
  }
  return value;
}
