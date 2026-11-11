import axios from 'axios';
import prisma from '../../../../shared/prisma';
import ApiError from '../../../../errors/ApiErrors';
import config from '../../../../config';
import { encryptToken } from './meta.service';

// LinkedIn member posting ("Share on LinkedIn" + "Sign In with LinkedIn using OpenID Connect" products).
// Company Page posting needs LinkedIn's Community Management API approval and is not included.
export const linkedinScopes = ['openid', 'profile', 'w_member_social'];
const apiVersion = () => process.env.LINKEDIN_API_VERSION || '202606';
export const linkedinCallback = () => `${config.app.backendUrl}/api/v1/social/callback/linkedin`;

export function linkedinAuthUrl(state: string) {
  return `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({ response_type: 'code', client_id: config.social.linkedin_client_id as string, redirect_uri: linkedinCallback(), state, scope: linkedinScopes.join(' ') })}`;
}

/** Exchanges the OAuth code and saves (or refreshes) the member's account in the workspace. */
export async function connectLinkedin(code: string, workspaceId: string) {
  const token = (await axios.post('https://www.linkedin.com/oauth/v2/accessToken', new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: linkedinCallback(), client_id: config.social.linkedin_client_id as string, client_secret: config.social.linkedin_client_secret as string }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 })).data;
  const me = (await axios.get('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` }, timeout: 15000 })).data;
  if (!me?.sub) throw new Error('LinkedIn profile unavailable');
  const granted = String(token.scope || '').split(/[\s,]+/);
  const capabilities = { publishing: granted.includes('w_member_social'), messaging: false, comments: false };
  const data = {
    workspaceId, platform: 'LINKEDIN' as const, externalAccountId: me.sub, accountName: me.name || 'LinkedIn profile',
    accessToken: encryptToken(token.access_token), tokenExpiry: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
    settings: { capabilities, authorUrn: `urn:li:person:${me.sub}` }, connectionStatus: capabilities.publishing ? 'CONNECTED' : 'LIMITED_ACCESS',
  };
  const existing = await prisma.socialAccount.findFirst({ where: { workspaceId, platform: 'LINKEDIN', externalAccountId: me.sub } });
  if (existing) await prisma.socialAccount.update({ where: { id: existing.id }, data }); else await prisma.socialAccount.create({ data });
}

// ---- Company Pages (Community Management API, separate app) ----
export const linkedinPageScopes = ['r_organization_admin', 'w_organization_social'];
export const linkedinPagesCallback = () => `${config.app.backendUrl}/api/v1/social/callback/linkedin-pages`;
// Roles allowed to publish organic posts for a Page.
const posterRoles = ['ADMINISTRATOR', 'CONTENT_ADMINISTRATOR'];

export function linkedinPagesAuthUrl(state: string) {
  return `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({ response_type: 'code', client_id: config.social.linkedin_pages_client_id as string, redirect_uri: linkedinPagesCallback(), state, scope: linkedinPageScopes.join(' ') })}`;
}

/** Exchanges the code and lists the Pages this member can post for. The token is returned for the encrypted selection only. */
export async function discoverLinkedinPages(code: string) {
  const token = (await axios.post('https://www.linkedin.com/oauth/v2/accessToken', new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: linkedinPagesCallback(), client_id: config.social.linkedin_pages_client_id as string, client_secret: config.social.linkedin_pages_client_secret as string }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 })).data;
  const headers = { Authorization: `Bearer ${token.access_token}`, 'LinkedIn-Version': apiVersion(), 'X-Restli-Protocol-Version': '2.0.0' };
  const acls = (await axios.get('https://api.linkedin.com/rest/organizationAcls', { params: { q: 'roleAssignee', state: 'APPROVED', count: 100 }, headers, timeout: 15000 })).data.elements || [];
  const urns = [...new Set<string>(acls.filter((a: any) => posterRoles.includes(a.role)).map((a: any) => a.organization))].slice(0, 50);
  const pages = [];
  for (const urn of urns) {
    const id = urn.split(':').pop();
    let name = `LinkedIn Page ${id}`;
    try { name = (await axios.get(`https://api.linkedin.com/rest/organizations/${id}`, { headers, timeout: 15000 })).data.localizedName || name; } catch { /* keep fallback name */ }
    pages.push({ id: urn, name });
  }
  return { pages, accessToken: token.access_token as string, expires: token.expires_in ? Date.now() + token.expires_in * 1000 : null, scope: String(token.scope || '') };
}

/** Saves the chosen Pages as LINKEDIN accounts that publish with the Page as author. */
export async function saveLinkedinPages(session: any, pageIds: string[]) {
  const granted = session.scope.split(/[\s,]+/);
  const capabilities = { publishing: granted.includes('w_organization_social'), messaging: false, comments: false };
  for (const page of session.pages.filter((p: any) => pageIds.includes(p.id))) {
    const data = {
      workspaceId: session.workspaceId, platform: 'LINKEDIN' as const, externalAccountId: page.id, accountName: `${page.name} (Page)`,
      accessToken: encryptToken(session.accessToken), tokenExpiry: session.expires ? new Date(session.expires) : null,
      settings: { capabilities, authorUrn: page.id, kind: 'page' }, connectionStatus: capabilities.publishing ? 'CONNECTED' : 'LIMITED_ACCESS',
    };
    const existing = await prisma.socialAccount.findFirst({ where: { workspaceId: session.workspaceId, platform: 'LINKEDIN', externalAccountId: page.id } });
    if (existing) await prisma.socialAccount.update({ where: { id: existing.id }, data }); else await prisma.socialAccount.create({ data });
  }
}

async function linkedinRequest(account: any, request: any) {
  try {
    return await axios.request({ timeout: 20000, ...request, headers: { Authorization: `Bearer ${account.token}`, 'LinkedIn-Version': apiVersion(), 'X-Restli-Protocol-Version': '2.0.0', ...request.headers } });
  } catch (error: any) {
    if (error.response?.status === 401) await prisma.socialAccount.update({ where: { id: account.id }, data: { connectionStatus: 'EXPIRED' } });
    const apiError: any = new ApiError(502, 'The platform could not complete this request. Check your connection and try again.');
    const body = error.response?.data;
    // Same shape as Meta errors so the worker can tell a definite rejection from an ambiguous failure. Never includes the token.
    if (error.response) apiError.metaError = { status: error.response.status, code: body?.serviceErrorCode ?? body?.code ?? error.response.status, message: body?.message };
    console.error('LinkedIn request failed:', JSON.stringify({ url: String(request.url).split('?')[0], ...(apiError.metaError || { network: error.code || 'no response' }) }));
    throw apiError;
  }
}

// Post text uses LinkedIn's "little text format": reserved characters must be escaped or the text is cut off/rejected.
export const escapeLinkedinText = (text: string) => text.replace(/[\\|{}@\[\]()<>#*_~]/g, '\\$&');

/** Publishes a text post, optionally with one image, as the connected member. Returns the post URN. */
export async function publishLinkedin(account: any, content: string, imageUrl?: string) {
  const author = account.settings?.authorUrn || `urn:li:person:${account.externalAccountId}`;
  let media: any;
  if (imageUrl) {
    const init = (await linkedinRequest(account, { method: 'POST', url: 'https://api.linkedin.com/rest/images?action=initializeUpload', data: { initializeUploadRequest: { owner: author } } })).data.value;
    const image = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 20000, maxContentLength: 8 * 1024 * 1024 });
    await linkedinRequest(account, { method: 'PUT', url: init.uploadUrl, data: image.data, headers: { 'Content-Type': 'application/octet-stream' } });
    media = { media: { id: init.image } };
  }
  const response = await linkedinRequest(account, { method: 'POST', url: 'https://api.linkedin.com/rest/posts', data: {
    author, commentary: escapeLinkedinText(content), visibility: 'PUBLIC', lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false,
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] }, ...(media ? { content: media } : {}),
  } });
  return { id: response.headers['x-restli-id'] || response.data?.id };
}
