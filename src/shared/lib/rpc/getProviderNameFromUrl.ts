const SELF_EXPLANATORY_HOSTNAMES = ["rpc.canton.example"];

export function getProviderNameFromUrl(rpcUrl: string) {
  try {
    const parsedUrl = new URL(rpcUrl);

    if (SELF_EXPLANATORY_HOSTNAMES.includes(parsedUrl.hostname)) {
      return parsedUrl.hostname;
    } else if (parsedUrl.hostname.endsWith(".alchemy.com")) {
      return parsedUrl.hostname;
    }

    if (parsedUrl.pathname === "/") {
      return parsedUrl.hostname;
    }

    return parsedUrl.hostname + parsedUrl.pathname;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Invalid rpc URL: ${rpcUrl}`);
  }

  return "unknown";
}
