import type {
	IBinaryData,
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodePropertyOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

// Everything the node needs from the Invoir API: https://invoir.dev/docs
export const BASE_URL = 'https://validate.invoir.dev/api/v1';

type Context = IExecuteFunctions | ILoadOptionsFunctions;

interface FullResponse {
	statusCode: number;
	headers: IDataObject;
	body: unknown;
}

/**
 * Calls the Invoir API with the key from the "Invoir API" credential and returns the parsed body.
 * Any 4xx/5xx answer becomes an error whose text says exactly what to fix (see apiError below).
 */
export async function invoirRequest(
	this: Context,
	method: IHttpRequestMethods,
	path: string,
	extra: Partial<IHttpRequestOptions> = {},
	itemIndex = 0,
): Promise<unknown> {
	const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'invoirApi', {
		method,
		url: BASE_URL + path,
		timeout: 120_000, // a large invoice takes a few seconds; the API queues for up to 30 s when busy
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		...extra,
	} as IHttpRequestOptions)) as FullResponse;
	if (response.statusCode >= 400) {
		throw apiError(this, response, itemIndex);
	}
	return response.body;
}

/** Turns a body that may arrive as a Buffer or a string into an object. */
export function toObject(body: unknown): IDataObject {
	if (body === null || body === undefined) return {};
	if (Buffer.isBuffer(body) || body instanceof ArrayBuffer) {
		body = Buffer.from(body as Buffer).toString('utf8');
	}
	if (typeof body === 'string') {
		try {
			return JSON.parse(body) as IDataObject;
		} catch {
			return { message: body };
		}
	}
	return body as IDataObject;
}

/**
 * Builds the error n8n shows. Invoir errors look like {"error": "<code>", "message": "...", ...}:
 * 400 invalid_request lists every bad field in errors[], 422 invoice_invalid carries the
 * validation report, 429 quota_exceeded means the free plan's month is used up.
 */
function apiError(ctx: Context, response: FullResponse, itemIndex: number): NodeApiError {
	const body = toObject(response.body);
	const status = response.statusCode;
	const code = typeof body.error === 'string' ? body.error : `http_${status}`;
	const message = readable(
		typeof body.message === 'string' ? body.message : `Invoir answered HTTP ${status}`,
	);
	const details: string[] = [];

	for (const e of (body.errors as IDataObject[] | undefined) ?? []) {
		details.push(`${e.field}: ${e.message}`);
	}
	if (code === 'invoice_invalid') {
		for (const f of findings(body.validation as IDataObject | undefined)) {
			if (f.severity === 'error') details.push(describeFinding(f));
		}
	}
	if (status === 401) {
		details.push(
			'Check the API key in the Invoir credential. Keys start with inv_ (test keys with inv_test_); a revoked key stops working at once.',
		);
	}
	if (code === 'quota_exceeded') {
		const reset = response.headers['x-quota-reset'];
		details.push(
			`The month's documents are used up${reset ? ` until ${reset}` : ''}. Upgrade at https://validate.invoir.dev/dashboard/billing. While building, use a test key (inv_test_...): its 25 calls a day never count against the month.`,
		);
	}
	if (code === 'busy') {
		const retry = response.headers['retry-after'];
		details.push(
			`Invoir was busy. Retry after ${retry ?? 'a few'} seconds, or turn on "Retry On Fail" in this node's settings.`,
		);
	}

	return new NodeApiError(ctx.getNode(), body as JsonObject, {
		message: `${message} [${code}]`,
		description: details.length ? details.join('\n') : undefined,
		httpCode: String(status),
		itemIndex,
	});
}

/** The API's messages point at JSON paths ("see errors[]"); here the details are listed below them. */
function readable(message: string): string {
	return message
		.replace('; see errors[].', '.')
		.replace(' named in validation.checks[].findings[]', ' listed below');
}

/** All findings of a validation report in one flat list, each with the name of its check. */
export function findings(report: IDataObject | undefined): IDataObject[] {
	const all: IDataObject[] = [];
	for (const check of (report?.checks as IDataObject[] | undefined) ?? []) {
		for (const f of (check.findings as IDataObject[] | undefined) ?? []) {
			all.push({ check: check.name, ...f });
		}
	}
	return all;
}

function describeFinding(f: IDataObject): string {
	return `${f.rule ?? 'rule'}: ${f.message}${f.location ? ` (at ${f.location})` : ''}`;
}

/**
 * Downloads the PDF and XML of a generated invoice into n8n binary fields.
 * Uses /invoices/{id}/pdf and /xml (the same URLs as in the response), with the same key.
 */
export async function downloadFiles(
	this: IExecuteFunctions,
	doc: IDataObject,
	fields: { pdf: string; xml: string },
	itemIndex: number,
): Promise<Record<string, IBinaryData>> {
	const binary: Record<string, IBinaryData> = {};
	for (const kind of ['pdf', 'xml'] as const) {
		const file = doc[kind] as IDataObject | null | undefined;
		if (!file) continue; // plain has no XML; the UBL profiles have no PDF unless asked for
		const data = (await invoirRequest.call(
			this,
			'GET',
			`/invoices/${encodeURIComponent(String(doc.id))}/${kind}`,
			{ encoding: 'arraybuffer', json: false },
			itemIndex,
		)) as Buffer;
		binary[fields[kind]] = await this.helpers.prepareBinaryData(
			Buffer.from(data),
			String(file.filename ?? `${doc.number ?? doc.id}.${kind}`),
			String(file.contentType ?? (kind === 'pdf' ? 'application/pdf' : 'application/xml')),
		);
	}
	return binary;
}

/**
 * A multipart/form-data body with one field named "file", which is what /validate and /extract
 * take. Built by hand because verified community nodes may not have dependencies.
 */
export function multipartFile(
	fileName: string,
	mimeType: string,
	data: Buffer,
): { body: Buffer; contentType: string } {
	const boundary = `----invoir${Date.now().toString(16)}${Math.floor(Math.random() * 1e9).toString(16)}`;
	const safeName = fileName.replace(/["\r\n\\]/g, '_');
	const head = Buffer.from(
		`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeName}"\r\n` +
			`Content-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`,
		'utf8',
	);
	const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
	return {
		body: Buffer.concat([head, data, tail]),
		contentType: `multipart/form-data; boundary=${boundary}`,
	};
}

/** A date for the API (yyyy-MM-dd) from a date picker value, an ISO string or a Luxon DateTime. */
export function toDate(value: unknown): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const text = String(value).trim();
	const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
	return match ? match[1] : text; // anything else goes through as typed; the API names the field
}

/** Today in the workflow's time zone, as yyyy-MM-dd. */
export function today(timeZone: string): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(new Date());
}

/** Drops empty values ('' / undefined / null / {} / []) so the JSON only carries what was filled in. */
export function compact(object: IDataObject): IDataObject | undefined {
	const out: IDataObject = {};
	for (const [key, value] of Object.entries(object)) {
		if (value === undefined || value === null || value === '') continue;
		if (Array.isArray(value) && value.length === 0) continue;
		if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
			continue;
		}
		out[key] = value;
	}
	return Object.keys(out).length ? out : undefined;
}

/** A JSON parameter can arrive as text or as an already parsed value (from an expression). */
export function parseJson(
	ctx: IExecuteFunctions,
	value: unknown,
	what: string,
	itemIndex: number,
): unknown {
	if (typeof value !== 'string') return value;
	try {
		return JSON.parse(value);
	} catch (error) {
		throw new NodeOperationError(
			ctx.getNode(),
			`${what} is not valid JSON: ${(error as Error).message}`,
			{
				itemIndex,
			},
		);
	}
}

/** Template names for the dropdown: the five built-in ones and the account's own. */
export async function getTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const body = toObject(await invoirRequest.call(this, 'GET', '/templates'));
	const options: INodePropertyOptions[] = [];
	for (const name of (body.builtIn as string[] | undefined) ?? []) {
		options.push({ name: `${name} (built-in)`, value: name });
	}
	for (const own of (body.own as IDataObject[] | undefined) ?? []) {
		options.push({ name: String(own.name), value: String(own.name) });
	}
	return options;
}
