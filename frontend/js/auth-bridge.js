(function exposeMarketplaceAuthBridge(root) {
  async function getAccessToken() {
    const provider = root.MarketplaceAuth;
    if (!provider || typeof provider.getAccessToken !== 'function') return null;
    const token = await provider.getAccessToken();
    return typeof token === 'string' && token.trim() ? token.trim() : null;
  }

  async function withAuthHeaders(headers = {}) {
    const token = await getAccessToken();
    return token ? { ...headers, Authorization: `Bearer ${token}` } : { ...headers };
  }

  root.MarketplaceAuthBridge = { getAccessToken, withAuthHeaders };
}(window));
