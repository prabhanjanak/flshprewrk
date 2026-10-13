import os from "os";
import dgram from "dgram";

/**
 * Attempts to find the active local network IP address by establishing a dummy UDP connection.
 * Since UDP is connectionless, this does not actually send any packets but queries the OS routing table.
 */
function getIpViaRouting(): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    socket.connect(53, "8.8.8.8", () => {
      const addrInfo = socket.address();
      socket.close();
      resolve(addrInfo.address);
    });
    socket.on("error", () => {
      try {
        socket.close();
      } catch {}
      resolve(null);
    });
  });
}

/**
 * Retrieves the host system's primary active network adapter IPv4 address.
 * Filters out loopback, virtual, VPN, Docker, and bluetooth adapters.
 */
export async function getSystemNetworkIp(): Promise<string> {
  // Try the socket route first to find the primary interface associated with the default gateway
  const routedIp = await getIpViaRouting();
  if (routedIp && routedIp !== "127.0.0.1" && routedIp !== "0.0.0.0") {
    // Validate that this IP belongs to a non-ignored interface just in case
    const interfaces = os.networkInterfaces();
    for (const [name, infos] of Object.entries(interfaces)) {
      if (infos) {
        for (const info of infos) {
          if (info.address === routedIp) {
            const isIgnored = /virtual|vpn|docker|vbox|vmware|wsl|bluetooth|loopback|pseudo|tap|tun|tailscale/i.test(name);
            if (!isIgnored) {
              return routedIp;
            }
          }
        }
      }
    }
  }

  // Fallback: Scan network interfaces and apply filter rules
  const interfaces = os.networkInterfaces();
  const candidates: { name: string; address: string; priority: number }[] = [];

  for (const [name, infos] of Object.entries(interfaces)) {
    if (!infos) continue;

    // Filter ignored adapters by name
    const isVirtual = /virtual|vbox|vmware|wsl|pseudo/i.test(name);
    const isVpn = /vpn|tap|tun|tailscale|wireguard/i.test(name);
    const isDocker = /docker/i.test(name);
    const isBluetooth = /bluetooth|bth/i.test(name);
    const isLoopbackName = /loopback/i.test(name);

    if (isVirtual || isVpn || isDocker || isBluetooth || isLoopbackName) {
      continue;
    }

    for (const info of infos) {
      // Filter out IPv6, internal/loopback, or invalid addresses
      if (info.family !== "IPv4" || info.internal) {
        continue;
      }

      // Assign priority: Wi-Fi and Ethernet preferred
      let priority = 1;
      const lowerName = name.toLowerCase();
      if (lowerName.includes("wi-fi") || lowerName.includes("wifi") || lowerName.includes("wlan")) {
        priority = 10;
      } else if (lowerName.includes("ethernet") || lowerName.includes("eth") || lowerName.includes("lan")) {
        priority = 9;
      }

      candidates.push({ name, address: info.address, priority });
    }
  }

  if (candidates.length > 0) {
    // Sort by priority descending
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0].address;
  }

  return "127.0.0.1";
}
