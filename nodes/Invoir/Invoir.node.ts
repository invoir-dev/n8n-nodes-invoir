import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { eInvoiceFields, eInvoiceOperations } from './EInvoiceDescription';
import {
	compact,
	downloadFiles,
	findings,
	getTemplates,
	invoirRequest,
	multipartFile,
	parseJson,
	toDate,
	toObject,
	today,
} from './GenericFunctions';
import { invoiceFields, invoiceOperations } from './InvoiceDescription';

/**
 * Invoir: generate, validate and read EU e-invoices (Factur-X, ZUGFeRD, XRechnung, Peppol BIS).
 *
 * Programmatic style rather than declarative, because Create and Get make dependent calls
 * (the invoice, then its PDF and XML as binary data) and Validate / Parse / Extract upload a
 * binary file as multipart. Every request goes through invoirRequest (GenericFunctions.ts).
 */
export class Invoir implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Invoir',
		name: 'invoir',
		icon: { light: 'file:../../icons/invoir.svg', dark: 'file:../../icons/invoir.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Generate, validate and read EU e-invoices: Factur-X, ZUGFeRD, XRechnung, Peppol BIS',
		defaults: {
			name: 'Invoir',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'invoirApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Invoice',
						value: 'invoice',
					},
					{
						name: 'E-Invoice File',
						value: 'eInvoice',
					},
				],
				default: 'invoice',
			},
			...invoiceOperations,
			...invoiceFields,
			...eInvoiceOperations,
			...eInvoiceFields,
		],
	};

	methods = {
		loadOptions: {
			getTemplates,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				if (resource === 'invoice' && operation === 'create') {
					returnData.push(await createInvoice(this, i));
				} else if (resource === 'invoice' && operation === 'get') {
					returnData.push(await getInvoice(this, i));
				} else if (resource === 'eInvoice' && operation === 'validate') {
					returnData.push(await validate(this, i, items[i]));
				} else if (resource === 'eInvoice' && operation === 'parse') {
					returnData.push(await parse(this, i, items[i]));
				} else if (resource === 'eInvoice' && operation === 'extractXml') {
					returnData.push(await extractXml(this, i));
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`Unknown operation ${resource}/${operation}`,
						{
							itemIndex: i,
						},
					);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
							details: (error as { description?: string }).description,
						},
						pairedItem: { item: i },
					});
					continue;
				}
				throw asNodeError(this, error, i);
			}
		}

		return [returnData];
	}
}

/** Our own errors already are NodeApiError / NodeOperationError with a readable text; wrap anything else. */
function asNodeError(
	ctx: IExecuteFunctions,
	error: unknown,
	i: number,
): NodeApiError | NodeOperationError {
	if (error instanceof NodeApiError || error instanceof NodeOperationError) return error;
	return new NodeOperationError(ctx.getNode(), error as Error, { itemIndex: i });
}

/** POST /invoices, then download the PDF and XML into binary fields. */
async function createInvoice(ctx: IExecuteFunctions, i: number): Promise<INodeExecutionData> {
	const mode = ctx.getNodeParameter('inputMode', i) as string;
	let body: IDataObject;
	if (mode === 'json') {
		const parsed = parseJson(ctx, ctx.getNodeParameter('invoiceJson', i), 'Invoice JSON', i);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new NodeOperationError(ctx.getNode(), 'Invoice JSON must be a JSON object', {
				itemIndex: i,
			});
		}
		body = parsed as IDataObject;
	} else {
		body = buildInvoice(ctx, i);
	}

	const options = ctx.getNodeParameter('options', i, {}) as IDataObject;
	const headers: IDataObject = {};
	if (options.idempotencyKey) headers['Idempotency-Key'] = String(options.idempotencyKey);

	const doc = toObject(
		await invoirRequest.call(ctx, 'POST', '/invoices', { body, json: true, headers }, i),
	);
	return withFiles(ctx, doc, options, i);
}

/** GET /invoices/{id}, then download the PDF and XML again. */
async function getInvoice(ctx: IExecuteFunctions, i: number): Promise<INodeExecutionData> {
	const id = String(ctx.getNodeParameter('invoiceId', i)).trim();
	const options = ctx.getNodeParameter('options', i, {}) as IDataObject;
	const doc = toObject(
		await invoirRequest.call(ctx, 'GET', `/invoices/${encodeURIComponent(id)}`, { json: true }, i),
	);
	return withFiles(ctx, doc, options, i);
}

async function withFiles(
	ctx: IExecuteFunctions,
	doc: IDataObject,
	options: IDataObject,
	i: number,
): Promise<INodeExecutionData> {
	const item: INodeExecutionData = { json: doc, pairedItem: { item: i } };
	if (options.downloadFiles !== false) {
		item.binary = await downloadFiles.call(
			ctx,
			doc,
			{ pdf: String(options.pdfField || 'pdf'), xml: String(options.xmlField || 'xml') },
			i,
		);
	}
	return item;
}

/** POST /validate with the file from the input item. The file stays on the output item. */
async function validate(
	ctx: IExecuteFunctions,
	i: number,
	input: INodeExecutionData,
): Promise<INodeExecutionData> {
	const report = await upload(ctx, i, '/validate');
	return {
		json: { valid: report.status === 'valid', ...report, findings: findings(report) },
		binary: input.binary,
		pairedItem: { item: i },
	};
}

/**
 * POST /parse: a received e-invoice as the invoice JSON of Create (json.invoice), the totals as the
 * document states them, unmapped values, warnings and the validation report. An invalid invoice is
 * still read; valid and findings are added as in Validate. The file stays on the output item.
 */
async function parse(
	ctx: IExecuteFunctions,
	i: number,
	input: INodeExecutionData,
): Promise<INodeExecutionData> {
	const result = await upload(ctx, i, '/parse');
	return {
		json: {
			valid: result.status === 'valid',
			...result,
			findings: findings(result.validation as IDataObject | undefined),
		},
		binary: input.binary,
		pairedItem: { item: i },
	};
}

/** POST /extract: the XML inside a Factur-X / ZUGFeRD PDF, as text and as a binary file. */
async function extractXml(ctx: IExecuteFunctions, i: number): Promise<INodeExecutionData> {
	const result = await upload(ctx, i, '/extract');
	const options = ctx.getNodeParameter('options', i, {}) as IDataObject;
	const field = ctx.getNodeParameter('binaryPropertyName', i) as string;
	const source = ctx.helpers.assertBinaryData(i, field);
	const baseName = (source.fileName ?? 'invoice').replace(/\.[^.]*$/, '');
	return {
		json: result,
		binary: {
			[String(options.xmlField || 'xml')]: await ctx.helpers.prepareBinaryData(
				Buffer.from(String(result.xml ?? ''), 'utf8'),
				`${baseName}.xml`,
				'application/xml',
			),
		},
		pairedItem: { item: i },
	};
}

async function upload(ctx: IExecuteFunctions, i: number, path: string): Promise<IDataObject> {
	const field = ctx.getNodeParameter('binaryPropertyName', i) as string;
	const meta = ctx.helpers.assertBinaryData(i, field);
	const data = await ctx.helpers.getBinaryDataBuffer(i, field);
	const { body, contentType } = multipartFile(meta.fileName ?? 'invoice', meta.mimeType, data);
	return toObject(
		await invoirRequest.call(
			ctx,
			'POST',
			path,
			{ body, headers: { 'Content-Type': contentType } },
			i,
		),
	);
}

/**
 * The invoice JSON from the "Fields Below" input mode. Only filled-in fields are sent;
 * the API checks the rest and names any missing field (e.g. "buyer.address.country").
 */
function buildInvoice(ctx: IExecuteFunctions, i: number): IDataObject {
	const add = ctx.getNodeParameter('additionalFields', i, {}) as IDataObject;

	let lines: IDataObject[];
	if (ctx.getNodeParameter('linesSource', i) === 'json') {
		lines = parseJson(
			ctx,
			ctx.getNodeParameter('linesJson', i),
			'Line Items (JSON)',
			i,
		) as IDataObject[];
		if (!Array.isArray(lines)) {
			throw new NodeOperationError(ctx.getNode(), 'Line Items (JSON) must be an array of lines', {
				itemIndex: i,
			});
		}
	} else {
		const rows = ctx.getNodeParameter('lineItems.item', i, []) as IDataObject[];
		lines = rows.map((row) => {
			const category = String(row.vatCategory || 'S');
			return compact({
				description: row.description,
				details: row.details,
				quantity: row.quantity,
				unit: row.unit,
				unitPrice: row.unitPrice,
				vatCategory: category,
				// Only the standard rate has a percentage; the other categories are 0 % by definition.
				vatRate: category === 'S' ? row.vatRate : undefined,
				vatExemptionReason: row.vatExemptionReason,
			}) as IDataObject;
		});
	}

	const notes = String(add.notes ?? '')
		.split('\n')
		.map((note) => note.trim())
		.filter((note) => note);

	return compact({
		profile: ctx.getNodeParameter('profile', i),
		number: ctx.getNodeParameter('invoiceNumber', i),
		issueDate: toDate(ctx.getNodeParameter('issueDate', i, '')) ?? today(ctx.getTimezone()),
		dueDate: toDate(add.dueDate),
		currency: add.currency,
		language: add.language,
		conformance: add.conformance,
		template: add.template,
		pdf: add.pdf,
		seller: party(
			ctx.getNodeParameter('sellerName', i) as string,
			ctx.getNodeParameter('sellerDetails', i, {}) as IDataObject,
		),
		buyer: party(
			ctx.getNodeParameter('buyerName', i) as string,
			ctx.getNodeParameter('buyerDetails', i, {}) as IDataObject,
		),
		lines,
		delivery: compact({ date: toDate(add.deliveryDate) }),
		payment: compact({
			means: add.paymentMeans,
			iban: add.paymentIban,
			bic: add.paymentBic,
			accountName: add.paymentAccountName,
			reference: add.paymentReference,
			terms: add.paymentTerms,
		}),
		references: compact({
			order: add.orderReference,
			contract: add.contractReference,
			project: add.projectReference ? { id: add.projectReference } : undefined,
		}),
		notes,
		prepaidAmount: add.prepaidAmount || undefined,
	}) as IDataObject;
}

/** Seller or buyer in the API's shape (address, contact and electronic address are objects). */
function party(name: string, d: IDataObject): IDataObject | undefined {
	const electronicId = String(d.electronicAddress ?? '').trim();
	const scheme =
		String(d.electronicAddressScheme ?? '').trim() || (electronicId.includes('@') ? 'EM' : '');
	return compact({
		name,
		tradingName: d.tradingName,
		vatId: d.vatId,
		taxId: d.taxId,
		registrationId: d.registrationId,
		legalForm: d.legalForm,
		reference: d.reference,
		email: d.email,
		phone: d.phone,
		address: compact({
			street: d.street,
			street2: d.street2,
			postalCode: d.postalCode,
			city: d.city,
			country: d.country ? String(d.country).trim().toUpperCase() : undefined,
		}),
		// Email and phone sit on the party itself; the API accepts them for the contact rules too.
		contact: compact({ name: d.contactName }),
		electronicAddress: electronicId ? compact({ scheme, id: electronicId }) : undefined,
	});
}
