import type { INodeProperties } from 'n8n-workflow';

// The fields of Invoice > Create and Invoice > Get. They map onto the invoice JSON of
// POST /api/v1/invoices (https://invoir.dev/docs#invoice-json); buildInvoice in
// Invoir.node.ts turns them into that JSON.

const forCreate = { resource: ['invoice'], operation: ['create'] };
const forCreateFields = { ...forCreate, inputMode: ['fields'] };

export const invoiceOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['invoice'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Generate a validated e-invoice (PDF/A-3 and XML) from invoice data',
				action: 'Create an invoice',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a generated invoice and its files again (kept for 90 days)',
				action: 'Get an invoice',
			},
		],
		default: 'create',
	},
];

/** Seller and buyer details; the buyer also gets the buyer reference (Leitweg-ID). */
function partyDetails(role: 'seller' | 'buyer'): INodeProperties {
	const options: INodeProperties[] = [
		{
			displayName: 'City',
			name: 'city',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Contact Name',
			name: 'contactName',
			type: 'string',
			default: '',
			description:
				role === 'seller'
					? 'Person to contact about the invoice. XRechnung requires it, with email and phone.'
					: 'Person to contact at the buyer',
		},
		{
			displayName: 'Country Code',
			name: 'country',
			type: 'string',
			default: '',
			placeholder: 'DE',
			description: 'Two-letter ISO code. Required by all e-invoice profiles.',
		},
		{
			displayName: 'Electronic Address',
			name: 'electronicAddress',
			type: 'string',
			default: '',
			placeholder: 'invoices@example.com',
			description:
				'Where e-invoices are delivered (BT-34/BT-49). Required for Peppol BIS. An email address needs no scheme.',
		},
		{
			displayName: 'Electronic Address Scheme',
			name: 'electronicAddressScheme',
			type: 'string',
			default: '',
			placeholder: 'EM',
			description:
				'EAS code of the electronic address: EM email, 0088 GLN, 0204 Leitweg-ID, 9930 German VAT ID, 0208 Belgian enterprise number, 0009 SIRET. Empty means EM for an email address.',
		},
		{
			displayName: 'Email',
			name: 'email',
			type: 'string',
			placeholder: 'name@email.com',
			default: '',
		},
		{
			displayName: 'Legal Form',
			name: 'legalForm',
			type: 'string',
			default: '',
			description: 'Printed and in the XML, e.g. "GmbH, Amtsgericht München HRB 12345"',
		},
		{
			displayName: 'Phone',
			name: 'phone',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Postal Code',
			name: 'postalCode',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Registration ID',
			name: 'registrationId',
			type: 'string',
			default: '',
			description: 'Company register number, e.g. SIREN in France, KBO/BCE number in Belgium',
		},
		{
			displayName: 'Street',
			name: 'street',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Street Line 2',
			name: 'street2',
			type: 'string',
			default: '',
		},
		{
			displayName: 'Tax ID',
			name: 'taxId',
			type: 'string',
			default: '',
			description: 'Local tax number (e.g. German Steuernummer), when there is no VAT ID',
		},
		{
			displayName: 'Trading Name',
			name: 'tradingName',
			type: 'string',
			default: '',
		},
		{
			displayName: 'VAT ID',
			name: 'vatId',
			type: 'string',
			default: '',
			placeholder: 'DE123456789',
		},
	];
	if (role === 'buyer') {
		options.splice(1, 0, {
			displayName: 'Buyer Reference',
			name: 'reference',
			type: 'string',
			default: '',
			description:
				'BT-10: the Leitweg-ID for German public buyers (required for XRechnung), or any reference your customer gave you. Peppol BIS needs this or an order reference.',
		});
	}
	return {
		displayName: role === 'seller' ? 'Seller Details' : 'Buyer Details',
		name: role === 'seller' ? 'sellerDetails' : 'buyerDetails',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: forCreateFields },
		description:
			'The e-invoice profiles need the address with country, and the seller needs a VAT ID or tax ID. A missing field is reported by name.',
		options,
	};
}

const vatCategories = [
	{ name: 'Exempt (E)', value: 'E' },
	{ name: 'Export Outside the EU (G)', value: 'G' },
	{ name: 'Intra-Community Supply (K)', value: 'K' },
	{ name: 'Not Subject to VAT (O)', value: 'O' },
	{ name: 'Reverse Charge (AE)', value: 'AE' },
	{ name: 'Standard Rate (S)', value: 'S' },
	{ name: 'Zero Rated (Z)', value: 'Z' },
];

export const invoiceFields: INodeProperties[] = [
	// ----------------------------------------------------------------------------- invoice: create
	{
		displayName: 'Input Mode',
		name: 'inputMode',
		type: 'options',
		noDataExpression: true,
		options: [
			{
				name: 'Fields Below',
				value: 'fields',
				description: 'Fill in seller, buyer and lines here',
			},
			{
				name: 'Invoice JSON',
				value: 'json',
				description: 'Send the complete invoice JSON (every field the API knows)',
			},
		],
		default: 'fields',
		displayOptions: { show: forCreate },
	},
	{
		displayName: 'Invoice JSON',
		name: 'invoiceJson',
		type: 'json',
		default:
			'{\n  "profile": "factur-x",\n  "number": "RE-2026-0001",\n  "issueDate": "2026-10-19",\n  "seller": {\n    "name": "Musterbau GmbH", "vatId": "DE123456789",\n    "address": {"street": "Industriestraße 12", "postalCode": "80331", "city": "München", "country": "DE"}\n  },\n  "buyer": {\n    "name": "Beispiel AG",\n    "address": {"street": "Hauptstraße 1", "postalCode": "10115", "city": "Berlin", "country": "DE"}\n  },\n  "lines": [\n    {"description": "Consulting", "quantity": 8, "unit": "HUR", "unitPrice": 120, "vatRate": 19}\n  ]\n}',
		required: true,
		displayOptions: { show: { ...forCreate, inputMode: ['json'] } },
		description:
			'The request body of POST /invoices, documented under "The invoice JSON" at https://invoir.dev/docs. Totals are always computed by Invoir.',
	},
	{
		displayName: 'Profile',
		name: 'profile',
		type: 'options',
		options: [
			{
				name: 'Factur-X (PDF With XML)',
				value: 'factur-x',
				description: 'PDF/A-3 with the CII XML embedded. France, and the usual choice for Germany.',
			},
			{
				name: 'Peppol BIS Billing 3.0 (XML)',
				value: 'peppol-bis',
				description: 'UBL XML for the Peppol network (Belgium 2026, Netherlands, Nordics)',
			},
			{
				name: 'Plain PDF (No XML)',
				value: 'plain',
				description: 'A branded PDF/A-3 without e-invoice data',
			},
			{
				name: 'XRechnung CII (XML)',
				value: 'xrechnung-cii',
				description: 'German public sector, CII syntax',
			},
			{
				name: 'XRechnung UBL (XML)',
				value: 'xrechnung-ubl',
				description: 'German public sector, UBL syntax',
			},
			{
				name: 'ZUGFeRD (PDF With XML)',
				value: 'zugferd',
				description: 'Same as Factur-X, embedded under the ZUGFeRD file name',
			},
		],
		default: 'factur-x',
		displayOptions: { show: forCreateFields },
		description: 'Which e-invoice format to generate',
	},
	{
		displayName: 'Invoice Number',
		name: 'invoiceNumber',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'RE-2026-0042',
		displayOptions: { show: forCreateFields },
	},
	{
		displayName: 'Issue Date',
		name: 'issueDate',
		type: 'dateTime',
		default: '',
		displayOptions: { show: forCreateFields },
		description: "Leave empty for today (in the workflow's time zone)",
	},
	{
		displayName: 'Seller Name',
		name: 'sellerName',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: forCreateFields },
		description: 'Your company, as it appears on the invoice',
	},
	partyDetails('seller'),
	{
		displayName: 'Buyer Name',
		name: 'buyerName',
		type: 'string',
		default: '',
		required: true,
		displayOptions: { show: forCreateFields },
	},
	partyDetails('buyer'),
	{
		displayName: 'Line Items Source',
		name: 'linesSource',
		type: 'options',
		noDataExpression: true,
		options: [
			{
				name: 'Define Below',
				value: 'fields',
				description: 'A fixed list of lines',
			},
			{
				name: 'From JSON',
				value: 'json',
				description: 'An array of lines, e.g. mapped from a shop order with an expression',
			},
		],
		default: 'fields',
		displayOptions: { show: forCreateFields },
	},
	{
		displayName: 'Line Items',
		name: 'lineItems',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true, sortable: true },
		placeholder: 'Add Line Item',
		default: {},
		displayOptions: { show: { ...forCreateFields, linesSource: ['fields'] } },
		options: [
			{
				name: 'item',
				displayName: 'Line Item',
				values: [
					{
						displayName: 'Description',
						name: 'description',
						type: 'string',
						default: '',
						description: 'What was sold',
					},
					{
						displayName: 'Details',
						name: 'details',
						type: 'string',
						default: '',
						description: 'Optional longer text under the description',
					},
					{
						displayName: 'Quantity',
						name: 'quantity',
						type: 'number',
						typeOptions: { numberPrecision: 4 },
						default: 1,
					},
					{
						displayName: 'Unit',
						name: 'unit',
						type: 'options',
						options: [
							{ name: 'Day', value: 'DAY' },
							{ name: 'Hour', value: 'HUR' },
							{ name: 'Kilogram', value: 'KGM' },
							{ name: 'Kilometre', value: 'KMT' },
							{ name: 'Litre', value: 'LTR' },
							{ name: 'Lump Sum', value: 'LS' },
							{ name: 'Metre', value: 'MTR' },
							{ name: 'Month', value: 'MON' },
							{ name: 'Piece', value: 'C62' },
							{ name: 'Square Metre', value: 'MTK' },
							{ name: 'Week', value: 'WEE' },
							{ name: 'Year', value: 'ANN' },
						],
						default: 'C62',
						description: 'UN/ECE Recommendation 20 code. Use an expression for any other code.',
					},
					{
						displayName: 'Unit Price (Net)',
						name: 'unitPrice',
						type: 'number',
						typeOptions: { numberPrecision: 4 },
						default: 0,
						description: 'Price per unit without VAT',
					},
					{
						displayName: 'VAT Category',
						name: 'vatCategory',
						type: 'options',
						options: vatCategories,
						default: 'S',
					},
					{
						displayName: 'VAT Exemption Reason',
						name: 'vatExemptionReason',
						type: 'string',
						default: '',
						description:
							'Why no VAT is charged, for the categories other than S and Z (e.g. "Reverse charge")',
					},
					{
						displayName: 'VAT Rate (%)',
						name: 'vatRate',
						type: 'number',
						typeOptions: { numberPrecision: 2 },
						default: 19,
						description:
							'Used for the standard rate (S) only, e.g. 19 or 7 in Germany, 20 in France, 21 in Belgium',
					},
				],
			},
		],
	},
	{
		displayName: 'Line Items (JSON)',
		name: 'linesJson',
		type: 'json',
		default:
			'[\n  {"description": "Consulting", "quantity": 8, "unit": "HUR", "unitPrice": 120, "vatRate": 19}\n]',
		required: true,
		displayOptions: { show: { ...forCreateFields, linesSource: ['json'] } },
		description:
			'An array of lines with description, quantity, unitPrice, vatRate and optionally unit, vatCategory, details. All fields are documented at https://invoir.dev/docs.',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: forCreateFields },
		options: [
			{
				displayName: 'Conformance Level',
				name: 'conformance',
				type: 'options',
				options: [
					{ name: 'Basic', value: 'basic' },
					{ name: 'Basic WL', value: 'basicwl' },
					{ name: 'EN 16931 (Comfort)', value: 'en16931' },
					{ name: 'Extended', value: 'extended' },
					{ name: 'Minimum', value: 'minimum' },
				],
				default: 'en16931',
				description:
					'Factur-X / ZUGFeRD level. EN 16931 is the default and the right choice in most cases.',
			},
			{
				displayName: 'Contract Reference',
				name: 'contractReference',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Currency',
				name: 'currency',
				type: 'string',
				default: 'EUR',
				description: 'ISO 4217 code',
			},
			{
				displayName: 'Delivery Date',
				name: 'deliveryDate',
				type: 'dateTime',
				default: '',
			},
			{
				displayName: 'Due Date',
				name: 'dueDate',
				type: 'dateTime',
				default: '',
				description: 'E-invoices need a due date or Payment Terms when an amount is due',
			},
			{
				displayName: 'Include PDF',
				name: 'pdf',
				type: 'boolean',
				default: true,
				description:
					'Whether to add a readable PDF to the XML-only profiles (XRechnung, Peppol BIS). Factur-X and ZUGFeRD always are PDFs.',
			},
			{
				displayName: 'Language',
				name: 'language',
				type: 'options',
				options: [
					{ name: 'Dutch', value: 'nl' },
					{ name: 'English', value: 'en' },
					{ name: 'French', value: 'fr' },
					{ name: 'German', value: 'de' },
				],
				default: 'en',
				description: "Labels and number format of the PDF. Defaults to your account's branding.",
			},
			{
				displayName: 'Notes',
				name: 'notes',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'One note per line (up to 10), printed and in the XML',
			},
			{
				displayName: 'Order Reference',
				name: 'orderReference',
				type: 'string',
				default: '',
				description: "The buyer's purchase order number",
			},
			{
				displayName: 'Payment Account Name',
				name: 'paymentAccountName',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Payment BIC',
				name: 'paymentBic',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Payment IBAN',
				name: 'paymentIban',
				type: 'string',
				default: '',
				description: 'Your bank account for credit transfers (checksum-validated)',
			},
			{
				displayName: 'Payment Means',
				name: 'paymentMeans',
				type: 'options',
				options: [
					{ name: 'Card', value: 'card' },
					{ name: 'Cash', value: 'cash' },
					{ name: 'Credit Transfer', value: 'credit_transfer' },
					{ name: 'Direct Debit', value: 'direct_debit' },
					{ name: 'Other', value: 'other' },
				],
				default: 'credit_transfer',
			},
			{
				displayName: 'Payment Reference',
				name: 'paymentReference',
				type: 'string',
				default: '',
				description: 'What the payer should quote with the payment, usually the invoice number',
			},
			{
				displayName: 'Payment Terms',
				name: 'paymentTerms',
				type: 'string',
				default: '',
				placeholder: 'Payable within 30 days',
			},
			{
				displayName: 'Prepaid Amount',
				name: 'prepaidAmount',
				type: 'number',
				typeOptions: { numberPrecision: 2 },
				default: 0,
			},
			{
				displayName: 'Project Reference',
				name: 'projectReference',
				type: 'string',
				default: '',
			},
			{
				displayName: 'Template Name or ID',
				name: 'template',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getTemplates' },
				default: '',
				description:
					'Layout of the PDF: a built-in one or your own. Defaults to your account\'s branding. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: forCreate },
		options: [
			{
				displayName: 'Download Files',
				name: 'downloadFiles',
				type: 'boolean',
				default: true,
				description: 'Whether to download the PDF and XML into binary fields',
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				placeholder: '={{ $json.orderId }}',
				description:
					'Any unique string (up to 100 characters), e.g. the order ID. Re-running with the same key and data returns the first invoice instead of creating a second one.',
			},
			{
				displayName: 'PDF Output Field',
				name: 'pdfField',
				type: 'string',
				default: 'pdf',
				description: 'Name of the binary field for the PDF',
			},
			{
				displayName: 'XML Output Field',
				name: 'xmlField',
				type: 'string',
				default: 'xml',
				description: 'Name of the binary field for the XML',
			},
		],
	},

	// -------------------------------------------------------------------------------- invoice: get
	{
		displayName: 'Invoice ID',
		name: 'invoiceId',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'doc_h3Kq9mZtR2vXb8NpL4wYs1Ac',
		displayOptions: { show: { resource: ['invoice'], operation: ['get'] } },
		description: 'The ID that Create returned',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['invoice'], operation: ['get'] } },
		options: [
			{
				displayName: 'Download Files',
				name: 'downloadFiles',
				type: 'boolean',
				default: true,
				description: 'Whether to download the PDF and XML into binary fields',
			},
			{
				displayName: 'PDF Output Field',
				name: 'pdfField',
				type: 'string',
				default: 'pdf',
				description: 'Name of the binary field for the PDF',
			},
			{
				displayName: 'XML Output Field',
				name: 'xmlField',
				type: 'string',
				default: 'xml',
				description: 'Name of the binary field for the XML',
			},
		],
	},
];
