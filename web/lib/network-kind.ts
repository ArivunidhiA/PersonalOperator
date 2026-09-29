/**
 * Is a network a consumer ISP, a cloud/VPN, or possibly the visitor's company?
 * Pure and computed when data is read (not only when stored), so a better
 * list fixes old rows and cached lookups too (F-04).
 */
export type NetworkKind = "isp" | "hosting" | "org";

// Consumer ISPs and mobile carriers: the network says nothing about the visitor's employer.
// Small regional ISPs rarely have famous names, so generic ISP words count too (F-04).
const ISP =
  /cable|broadband|telecom|telephone|wireless|cellular|fiber|fibre|\bdsl\b|satellite|internet service|comcast|charter|spectrum|at&t|\bat ?& ?t\b|verizon|cellco|t-mobile|tmobile|sprint|cox comm|frontier|centurylink|lumen|windstream|altice|optimum|mediacom|suddenlink|\brcn\b|wideopenwest|google fiber|starlink|space exploration|us cellular|brightspeed|ziply|astound|bell canada|rogers|telus|shaw|vodafone|british telecom|\bbt\b|virgin media|sky uk|reliance jio|jio|bharti|airtel|bsnl|act fibernet|hathway|claro|telmex|movistar|telefonica|orange|deutsche telekom|telstra|optus|singtel|kddi|softbank|ntt|korea telecom|sk broadband|lg (uplus|powercomm)|chinanet|china (telecom|unicom|mobile)/i;
// Clouds, proxies and VPNs: likely not where the person works (Zscaler & co. front many companies).
const HOSTING =
  /digitalocean|linode|akamai|cloudflare|ovh|hetzner|vultr|choopa|contabo|leaseweb|m247|datacamp|packethub|zscaler|netskope|palo alto|forcepoint|nordvpn|expressvpn|mullvad|proton ?(ag|vpn)|private internet access|hostinger|scaleway|oracle cloud|alibaba|tencent/i;

export function networkKind(org: string | null | undefined): NetworkKind {
  if (!org) return "isp";
  if (ISP.test(org)) return "isp";
  if (HOSTING.test(org)) return "hosting";
  return "org";
}

