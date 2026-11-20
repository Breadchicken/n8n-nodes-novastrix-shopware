/**
 * Normalizes the shop URL entered in the credential.
 *
 * Users paste all kinds of variants ("https://shop.example.com/", ".../api",
 * ".../admin"). Every request in this package appends `/api/...` itself, so the
 * base URL must be the plain shop origin plus an optional sub-path.
 */
export function normalizeShopUrl(rawUrl: unknown): string {
	if (typeof rawUrl !== 'string' || rawUrl.trim() === '') {
		throw new Error('The Shopware shop URL is empty. Please set it in the credential.');
	}

	let url = rawUrl.trim();

	if (!/^https?:\/\//i.test(url)) {
		url = `https://${url}`;
	}

	url = url.replace(/\/+$/, '');
	url = url.replace(/\/(api|admin)$/i, '');

	return url.replace(/\/+$/, '');
}
