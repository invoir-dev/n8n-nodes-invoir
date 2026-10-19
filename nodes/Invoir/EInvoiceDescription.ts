import type { INodeProperties } from 'n8n-workflow';

// E-Invoice > Validate (POST /api/v1/validate) and E-Invoice > Extract XML (POST /api/v1/extract).
// Both upload one file from a binary field of the incoming item.

export const eInvoiceOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['eInvoice'] } },
		options: [
			{
				name: 'Extract XML',
				value: 'extractXml',
				description: 'Get the XML embedded in a Factur-X / ZUGFeRD PDF',
				action: 'Extract the embedded invoice',
			},
			{
				name: 'Validate',
				value: 'validate',
				description:
					'Check a PDF or XML e-invoice against the official rules (Factur-X, ZUGFeRD, XRechnung, Peppol BIS)',
				action: 'Validate an invoice file',
			},
		],
		default: 'validate',
	},
];

export const eInvoiceFields: INodeProperties[] = [
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		displayOptions: { show: { resource: ['eInvoice'] } },
		hint: 'The name of the input binary field containing the file',
		description:
			'A PDF or XML invoice up to 10 MB. The format is detected from the content, not the file name.',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['eInvoice'], operation: ['extractXml'] } },
		options: [
			{
				displayName: 'XML Output Field',
				name: 'xmlField',
				type: 'string',
				default: 'xml',
				description: 'Name of the binary field for the extracted XML',
			},
		],
	},
];
