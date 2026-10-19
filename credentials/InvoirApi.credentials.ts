import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

// The Invoir API key, sent as "Authorization: Bearer inv_..." on every request.
// Test keys (inv_test_...) work the same way: watermarked documents that never count.
export class InvoirApi implements ICredentialType {
	name = 'invoirApi';

	displayName = 'Invoir API';

	icon: Icon = { light: 'file:../icons/invoir.svg', dark: 'file:../icons/invoir.dark.svg' };

	documentationUrl = 'https://invoir.dev/integrations#n8n';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'inv_test_...',
			description:
				'From your Invoir dashboard (https://validate.invoir.dev/dashboard). Start with a test key (inv_test_...): same results, watermarked, never counted.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// Listing one document is free (it never counts against the monthly quota).
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://validate.invoir.dev/api/v1',
			url: '/invoices',
			qs: { limit: 1 },
			method: 'GET',
		},
	};
}
